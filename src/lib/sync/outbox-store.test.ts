// @vitest-environment node
import { describe, expect, it } from "vitest";
import { coalesce, type NewOp, type OutboxOp } from "./outbox-store";
import { applyWirePatch, reconcile } from "./reconcile";
import { newClientId } from "./ids";
import { firmwareScheduleId } from "@/lib/device/schedule-sync";

const NOW = 1_000;

function op(partial: Partial<NewOp> & Pick<NewOp, "entity" | "kind" | "key">): NewOp {
  return { label: partial.key, ...partial };
}

function apply(ops: OutboxOp[], ...incoming: NewOp[]): OutboxOp[] {
  return incoming.reduce((queue, next) => coalesce(queue, next, NOW), ops);
}

describe("coalesce", () => {
  it("adds a change to an empty queue as a pending op", () => {
    const [queued] = apply([], op({ entity: "scene", kind: "upsert", key: "a", payload: { name: "x" } }));
    expect(queued).toMatchObject({ entity: "scene", kind: "upsert", key: "a", status: "pending", attempts: 0, rev: 1 });
  });

  it("keeps one op per thing: a later upsert replaces the earlier body and bumps rev", () => {
    const queue = apply(
      [],
      op({ entity: "scene", kind: "upsert", key: "a", payload: { name: "first" } }),
      op({ entity: "scene", kind: "upsert", key: "a", payload: { name: "second" } })
    );
    expect(queue).toHaveLength(1);
    expect(queue[0].payload).toEqual({ name: "second" });
    expect(queue[0].rev).toBe(2);
  });

  it("merges patches, newer fields winning, and keeps explicit nulls (clear this field)", () => {
    const queue = apply(
      [],
      op({ entity: "device", kind: "patch", key: "7", payload: { isOn: true, intensity: 10 } }),
      op({ entity: "device", kind: "patch", key: "7", payload: { intensity: 80, brand: null } })
    );
    expect(queue).toHaveLength(1);
    expect(queue[0].kind).toBe("patch");
    expect(queue[0].payload).toEqual({ isOn: true, intensity: 80, brand: null });
  });

  it("turns anything followed by a delete into just the delete", () => {
    const queue = apply(
      [],
      op({ entity: "schedule", kind: "upsert", key: "s", payload: { name: "x" } }),
      op({ entity: "schedule", kind: "delete", key: "s" })
    );
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ kind: "delete", payload: undefined });
  });

  it("ignores changes to something that is already queued for deletion", () => {
    const queue = apply(
      [],
      op({ entity: "device", kind: "delete", key: "7" }),
      op({ entity: "device", kind: "patch", key: "7", payload: { isOn: true } })
    );
    expect(queue).toHaveLength(1);
    expect(queue[0].kind).toBe("delete");
  });

  it("resets the retry state of an op that is replaced, so fresh content goes out at once", () => {
    const backedOff = apply([], op({ entity: "scene", kind: "upsert", key: "a", payload: { name: "1" } })).map(
      (queued) => ({ ...queued, attempts: 4, nextAttemptAt: NOW + 60_000, error: "Offline" })
    );
    const [replaced] = apply(backedOff, op({ entity: "scene", kind: "upsert", key: "a", payload: { name: "2" } }));
    expect(replaced).toMatchObject({ attempts: 0, nextAttemptAt: NOW, error: undefined });
  });

  it("replaces a failed op with the user's new attempt (at the back of the queue)", () => {
    const failed = apply(
      [],
      op({ entity: "scene", kind: "upsert", key: "a", payload: { name: "1" } }),
      op({ entity: "scene", kind: "upsert", key: "b", payload: { name: "b" } })
    ).map((queued) => (queued.key === "a" ? { ...queued, status: "failed" as const, error: "refused" } : queued));

    const queue = apply(failed, op({ entity: "scene", kind: "upsert", key: "a", payload: { name: "fixed" } }));

    expect(queue.map((queued) => queued.key)).toEqual(["b", "a"]);
    expect(queue[1]).toMatchObject({ status: "pending", payload: { name: "fixed" } });
  });

  it("keeps different things separate, even with the same key in another entity", () => {
    const queue = apply(
      [],
      op({ entity: "scene", kind: "upsert", key: "1" }),
      op({ entity: "schedule", kind: "upsert", key: "1" })
    );
    expect(queue).toHaveLength(2);
  });
});

describe("reconcile", () => {
  interface Item {
    id: string;
    name: string;
    isOn?: boolean;
  }
  const pendingOf = (...ops: Array<Pick<OutboxOp, "key" | "kind"> & { payload?: Record<string, unknown> }>) =>
    new Map(ops.map((queued) => [queued.key, queued as OutboxOp]));
  const never = () => undefined;

  it("takes the server list as is when nothing is waiting", () => {
    const server: Item[] = [{ id: "1", name: "s1" }];
    expect(reconcile(server, [{ id: "2", name: "stale" }], new Map(), never)).toEqual(server);
  });

  it("keeps the local version of a thing with a pending change (the server has not seen it yet)", () => {
    const result = reconcile<Item>(
      [{ id: "1", name: "old" }],
      [{ id: "1", name: "edited offline" }],
      pendingOf({ key: "1", kind: "upsert" }),
      never
    );
    expect(result).toEqual([{ id: "1", name: "edited offline" }]);
  });

  it("keeps a thing created offline that the server does not have yet", () => {
    const result = reconcile<Item>([], [{ id: "new", name: "offline" }], pendingOf({ key: "new", kind: "upsert" }), never);
    expect(result).toEqual([{ id: "new", name: "offline" }]);
  });

  it("does not bring back something deleted offline that the server still lists", () => {
    const result = reconcile<Item>([{ id: "1", name: "x" }], [], pendingOf({ key: "1", kind: "delete" }), never);
    expect(result).toEqual([]);
  });

  it("lets the server win for a thing whose op failed (that is what reverts a refused change)", () => {
    // A failed op is not in the pending map.
    const result = reconcile<Item>([{ id: "1", name: "server" }], [{ id: "1", name: "refused edit" }], new Map(), never);
    expect(result).toEqual([{ id: "1", name: "server" }]);
  });

  it("drops a local-only thing once nothing is pending for it (it never made it and was dropped)", () => {
    expect(reconcile<Item>([], [{ id: "ghost", name: "x" }], new Map(), never)).toEqual([]);
  });

  it("trusts a change the server accepted moments ago over a list that may predate it", () => {
    const recent = (key: string) => (key === "1" ? ("upsert" as const) : key === "2" ? ("delete" as const) : undefined);
    const result = reconcile<Item>(
      [{ id: "2", name: "just deleted" }],
      [{ id: "1", name: "just created" }],
      new Map(),
      recent
    );
    expect(result).toEqual([{ id: "1", name: "just created" }]);
  });

  it("applies a pending patch on top of the server's item when there is no local copy", () => {
    const result = reconcile<Item>(
      [{ id: "1", name: "n", isOn: false }],
      [],
      pendingOf({ key: "1", kind: "patch", payload: { isOn: true } }),
      never,
      applyWirePatch
    );
    expect(result).toEqual([{ id: "1", name: "n", isOn: true }]);
  });
});

describe("applyWirePatch", () => {
  it("sets fields and clears the ones patched to null, like the server does", () => {
    expect(applyWirePatch({ a: 1, b: 2, c: 3 }, { b: null, c: 30, d: 4 })).toEqual({ a: 1, c: 30, d: 4 });
  });
});

describe("newClientId / firmwareScheduleId", () => {
  it("generates distinct v4 UUIDs the server's id check accepts", () => {
    const first = newClientId();
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(first).toMatch(/^[A-Za-z0-9_-]{1,36}$/);
    expect(newClientId()).not.toBe(first);
  });

  it("derives a stable firmware id that fits the hub's 24-byte buffer", () => {
    const id = "97a10b09-3b4a-4ee5-80fc-4f565c6fd9e8";
    expect(firmwareScheduleId(id)).toBe("s97a10b093b4a");
    expect(firmwareScheduleId(id)).toBe(firmwareScheduleId(id));
    expect(firmwareScheduleId(id).length).toBeLessThan(24);
  });

  it("keeps the id a pre-existing schedule already has on the hubs", () => {
    expect(firmwareScheduleId("legacy-12")).toBe("s12");
  });
});
