// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/auth";
import { useOutboxStore, type NewOp, type OutboxOp } from "./outbox-store";
import {
  backoffMs,
  classifyError,
  createSyncEngine,
  MAX_SERVER_ERROR_ATTEMPTS,
  PermanentSyncError,
  type EngineDeps,
} from "./sync-engine";

const outbox = () => useOutboxStore.getState();
const ops = () => useOutboxStore.getState().ops;
const byKey = (key: string) => ops().find((op) => op.key === key);

// enqueue() stamps ops with the real Date.now(); the fake clock starts a little ahead of it so every fresh op
// is already due, and only ever moves forward from there.
let clock = Date.now() + 10_000;

function enqueue(op: Partial<NewOp> & Pick<NewOp, "entity" | "kind" | "key">) {
  outbox().enqueue({ label: op.key, ...op }, 1);
}

function makeEngine(overrides: Partial<EngineDeps> = {}) {
  // Wrapped, so the returned spy sees every call whether or not the test supplied its own behaviour.
  const execute = vi.fn<(op: OutboxOp) => Promise<void>>(overrides.execute ?? (() => Promise.resolve()));
  const onPermanentFailure = vi.fn();
  const onSynced = vi.fn();
  const engine = createSyncEngine({
    now: () => clock,
    random: () => 0.5, // no jitter: backoffMs(n) = 2s * 2^n exactly
    isSignedIn: () => true,
    currentAccountId: () => 1,
    onPermanentFailure,
    onSynced,
    ...overrides,
    execute,
  });
  return { engine, execute, onPermanentFailure, onSynced };
}

beforeEach(() => {
  clock = Date.now() + 10_000;
  useOutboxStore.setState({ ops: [], accountId: null });
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("classifyError", () => {
  it.each([
    [new ApiError(401), "upsert", "auth"],
    [new ApiError(404), "delete", "gone"],
    [new ApiError(404), "patch", "gone"],
    [new ApiError(404), "upsert", "permanent"],
    [new ApiError(400), "upsert", "permanent"],
    [new ApiError(403), "patch", "permanent"],
    [new ApiError(409), "upsert", "permanent"],
    [new ApiError(408), "upsert", "retry"],
    [new ApiError(429), "upsert", "retry"],
    [new ApiError(500), "upsert", "retry"],
    [new ApiError(503), "delete", "retry"],
    [new TypeError("Failed to fetch"), "upsert", "network"],
    [new DOMException("timed out", "TimeoutError"), "upsert", "network"],
    ["connection refused", "upsert", "network"],
    [new PermanentSyncError("nope"), "upsert", "permanent"],
  ] as const)("%o on %s → %s", (error, kind, expected) => {
    expect(classifyError(error, kind)).toBe(expected);
  });
});

describe("backoffMs", () => {
  it("doubles from 2s and is capped at 5 minutes", () => {
    const mid = () => 0.5;
    expect([0, 1, 2, 3].map((attempts) => backoffMs(attempts, mid))).toEqual([2_000, 4_000, 8_000, 16_000]);
    expect(backoffMs(30, mid)).toBe(300_000);
  });

  it("jitters by at most ±20%", () => {
    expect(backoffMs(3, () => 0)).toBe(12_800);
    expect(backoffMs(3, () => 1)).toBe(19_200);
  });
});

describe("draining the outbox", () => {
  it("sends every op in order and removes what the server accepted", async () => {
    enqueue({ entity: "scene", kind: "upsert", key: "a", payload: { name: "A" } });
    enqueue({ entity: "device", kind: "patch", key: "7", payload: { isOn: true } });
    const { engine, execute, onSynced } = makeEngine();

    await engine.drain();

    expect(execute.mock.calls.map(([op]) => `${op.entity}:${op.key}`)).toEqual(["scene:a", "device:7"]);
    expect(ops()).toEqual([]);
    expect(onSynced).toHaveBeenCalledTimes(2);
  });

  it("does nothing while signed out, and keeps everything queued", async () => {
    enqueue({ entity: "scene", kind: "upsert", key: "a" });
    const { engine, execute } = makeEngine({ isSignedIn: () => false });
    await engine.drain();
    expect(execute).not.toHaveBeenCalled();
    expect(ops()).toHaveLength(1);
  });

  it("never replays another account's queue: it is discarded", async () => {
    outbox().enqueue({ entity: "scene", kind: "upsert", key: "a", label: "a" }, 99);
    const { engine, execute } = makeEngine({ currentAccountId: () => 1 });
    await engine.drain();
    expect(execute).not.toHaveBeenCalled();
    expect(ops()).toEqual([]);
  });

  it("sends the same op again after a lost response: the op stays queued until the server confirms", async () => {
    enqueue({ entity: "scene", kind: "upsert", key: "a" });
    const first = makeEngine({ execute: vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))) });
    await first.engine.drain();
    expect(ops()).toHaveLength(1); // "lost": the app could have died right here

    clock += 60_000;
    const second = makeEngine();
    await second.engine.drain();

    expect(second.execute).toHaveBeenCalledTimes(1);
    expect(ops()).toEqual([]);
  });

  describe("network errors", () => {
    it("keep the op, back off, and hold the rest of the queue (it would fail the same way)", async () => {
      enqueue({ entity: "scene", kind: "upsert", key: "a" });
      enqueue({ entity: "scene", kind: "upsert", key: "b" });
      const execute = vi.fn(() => Promise.reject(new TypeError("Failed to fetch")));
      const { engine } = makeEngine({ execute });

      await engine.drain();

      expect(execute).toHaveBeenCalledTimes(1);
      expect(byKey("a")).toMatchObject({ status: "pending", attempts: 1, nextAttemptAt: clock + 2_000 });
      expect(byKey("b")).toMatchObject({ status: "pending", attempts: 0 });
    });

    it("are retried once the backoff has passed, and the queue then drains fully", async () => {
      enqueue({ entity: "scene", kind: "upsert", key: "a" });
      enqueue({ entity: "scene", kind: "upsert", key: "b" });
      let online = false;
      const execute = vi.fn(() => (online ? Promise.resolve() : Promise.reject(new TypeError("Failed to fetch"))));
      const { engine } = makeEngine({ execute });

      await engine.drain();
      await engine.drain(); // too soon: still backing off, nothing is sent
      expect(execute).toHaveBeenCalledTimes(1);

      online = true;
      clock += 2_500;
      await engine.drain();

      expect(ops()).toEqual([]);
    });

    it("pause the whole queue: no op is attempted until the backoff has passed", async () => {
      enqueue({ entity: "scene", kind: "upsert", key: "a" });
      enqueue({ entity: "scene", kind: "upsert", key: "b" });
      const execute = vi.fn(() => Promise.reject(new TypeError("Failed to fetch")));
      const { engine } = makeEngine({ execute });

      await engine.drain();
      await engine.drain();
      await engine.drain();

      expect(execute).toHaveBeenCalledTimes(1); // not one request per op per pass
    });

    it("resume() (connectivity reported back) skips the wait and sends at once", async () => {
      enqueue({ entity: "scene", kind: "upsert", key: "a" });
      let online = false;
      const execute = vi.fn(() => (online ? Promise.resolve() : Promise.reject(new TypeError("Failed to fetch"))));
      const { engine } = makeEngine({ execute });

      await engine.drain();
      expect(ops()).toHaveLength(1);
      online = true;
      // The op's own backoff still applies, but the engine-wide pause does not: time has barely moved.
      clock += 2_100;
      await engine.resume();

      expect(ops()).toEqual([]);
    });

    it("never give up: a long outage only lengthens the backoff, the op is never dropped or failed", async () => {
      enqueue({ entity: "scene", kind: "upsert", key: "a" });
      const { engine } = makeEngine({ execute: vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))) });

      for (let round = 0; round < 40; round++) {
        clock += 10 * 60_000;
        await engine.drain();
      }

      expect(byKey("a")).toMatchObject({ status: "pending", attempts: 40 });
    });
  });

  describe("server errors", () => {
    it("back off but let the other ops have their turn", async () => {
      enqueue({ entity: "scene", kind: "upsert", key: "poison" });
      enqueue({ entity: "scene", kind: "upsert", key: "fine" });
      const execute = vi.fn((op: OutboxOp) => (op.key === "poison" ? Promise.reject(new ApiError(500)) : Promise.resolve()));
      const { engine } = makeEngine({ execute });

      await engine.drain();

      expect(byKey("fine")).toBeUndefined();
      expect(byKey("poison")).toMatchObject({ status: "pending", attempts: 1, nextAttemptAt: clock + 2_000 });
    });

    it("stop retrying by themselves after a while and wait for the user — but are never dropped", async () => {
      enqueue({ entity: "scene", kind: "upsert", key: "a" });
      const { engine, onPermanentFailure } = makeEngine({ execute: vi.fn(() => Promise.reject(new ApiError(503))) });

      for (let round = 0; round < MAX_SERVER_ERROR_ATTEMPTS; round++) {
        clock += 10 * 60_000;
        await engine.drain();
      }

      expect(byKey("a")).toMatchObject({ status: "failed" });
      expect(byKey("a")?.error).toMatch(/keeps failing/i);
      expect(onPermanentFailure).toHaveBeenCalledTimes(1);
    });

    it("429 and 408 are treated as 'try again later', not as refusals", async () => {
      enqueue({ entity: "scene", kind: "upsert", key: "a" });
      const { engine } = makeEngine({ execute: vi.fn(() => Promise.reject(new ApiError(429))) });
      await engine.drain();
      expect(byKey("a")).toMatchObject({ status: "pending", attempts: 1 });
    });
  });

  describe("refusals (4xx)", () => {
    it("mark that op failed with the reason, tell the app to revert, and carry on with the rest", async () => {
      enqueue({ entity: "device", kind: "patch", key: "7", payload: { name: "x" } });
      enqueue({ entity: "scene", kind: "upsert", key: "ok" });
      const execute = vi.fn((op: OutboxOp) =>
        op.key === "7" ? Promise.reject(new ApiError(403, { message: "You can't edit this device" } as never)) : Promise.resolve()
      );
      const { engine, onPermanentFailure } = makeEngine({ execute });

      await engine.drain();

      expect(byKey("7")).toMatchObject({ status: "failed", error: "You can't edit this device" });
      expect(onPermanentFailure).toHaveBeenCalledWith(expect.objectContaining({ key: "7" }));
      expect(byKey("ok")).toBeUndefined();
    });

    it("do not block the queue forever and are not retried on their own", async () => {
      enqueue({ entity: "scene", kind: "upsert", key: "a" });
      const { engine, execute } = makeEngine({ execute: vi.fn(() => Promise.reject(new ApiError(400))) });
      await engine.drain();
      clock += 60 * 60_000;
      await engine.drain();
      expect(execute).toHaveBeenCalledTimes(1);
    });

    it("treat 404 on a delete or a patch as done: the thing is already gone", async () => {
      enqueue({ entity: "device", kind: "delete", key: "7" });
      enqueue({ entity: "hub", kind: "patch", key: "3", payload: { name: "n" } });
      const { engine, onPermanentFailure } = makeEngine({ execute: vi.fn(() => Promise.reject(new ApiError(404))) });

      await engine.drain();

      expect(ops()).toEqual([]);
      expect(onPermanentFailure).not.toHaveBeenCalled();
    });

    it("treat 404 on an upsert as a refusal", async () => {
      enqueue({ entity: "scene", kind: "upsert", key: "a" });
      const { engine } = makeEngine({ execute: vi.fn(() => Promise.reject(new ApiError(404))) });
      await engine.drain();
      expect(byKey("a")?.status).toBe("failed");
    });
  });

  describe("auth", () => {
    it("keeps the op and stops without burning retries while there is no valid session", async () => {
      enqueue({ entity: "scene", kind: "upsert", key: "a" });
      enqueue({ entity: "scene", kind: "upsert", key: "b" });
      const execute = vi.fn(() => Promise.reject(new ApiError(401)));
      const { engine } = makeEngine({ execute });

      await engine.drain();

      expect(execute).toHaveBeenCalledTimes(1);
      expect(byKey("a")).toMatchObject({ status: "pending", attempts: 0 });
      expect(byKey("a")?.nextAttemptAt).toBeGreaterThan(clock);
    });
  });

  describe("dependencies", () => {
    const schedule = (sceneKey: string): Partial<NewOp> & Pick<NewOp, "entity" | "kind" | "key"> => ({
      entity: "schedule",
      kind: "upsert",
      key: "sch",
      dependsOn: { entity: "scene", key: sceneKey },
    });

    it("sends a scene before the schedule that needs it, whatever the queue order", async () => {
      enqueue(schedule("scn")); // queued first…
      enqueue({ entity: "scene", kind: "upsert", key: "scn" }); // …but its scene was created after
      const { engine, execute } = makeEngine();

      await engine.drain();

      expect(execute.mock.calls.map(([op]) => op.entity)).toEqual(["scene", "schedule"]);
    });

    it("waits for a scene that is backing off instead of sending the schedule into a 400", async () => {
      enqueue({ entity: "scene", kind: "upsert", key: "scn" });
      enqueue(schedule("scn"));
      const { engine, execute } = makeEngine({ execute: () => Promise.reject(new TypeError("Failed to fetch")) });

      await engine.drain();
      clock += 3_000;
      await engine.drain();

      expect(execute.mock.calls.every(([op]) => op.entity === "scene")).toBe(true);
      expect(byKey("sch")?.status).toBe("pending");
    });

    it("fails a schedule whose scene failed, with a reason that names it", async () => {
      enqueue({ entity: "scene", kind: "upsert", key: "scn", label: "Movie night" });
      enqueue(schedule("scn"));
      const execute = vi.fn((op: OutboxOp) => (op.entity === "scene" ? Promise.reject(new ApiError(400)) : Promise.resolve()));
      const { engine } = makeEngine({ execute });

      await engine.drain();

      expect(byKey("sch")).toMatchObject({ status: "failed" });
      expect(byKey("sch")?.error).toMatch(/Movie night/);
      expect(execute.mock.calls.some(([op]) => op.entity === "schedule")).toBe(false);
    });

    it("fails a schedule whose scene was deleted in the meantime", async () => {
      enqueue(schedule("scn"));
      enqueue({ entity: "scene", kind: "delete", key: "scn", label: "Old scene" });
      const { engine, execute } = makeEngine();

      await engine.drain();

      expect(byKey("sch")?.status).toBe("failed");
      expect(execute.mock.calls.map(([op]) => `${op.entity}:${op.kind}`)).toEqual(["scene:delete"]);
    });
  });

  describe("changes made while a send is in flight", () => {
    it("are not lost: the newer version is still sent after the older one is accepted", async () => {
      enqueue({ entity: "scene", kind: "upsert", key: "a", payload: { name: "v1" } });
      const sent: unknown[] = [];
      let release: () => void = () => undefined;
      const execute = vi.fn((op: OutboxOp) => {
        sent.push(op.payload);
        return op.payload?.name === "v1" ? new Promise<void>((resolve) => (release = resolve)) : Promise.resolve();
      });
      const { engine } = makeEngine({ execute });

      const draining = engine.drain();
      await Promise.resolve();
      enqueue({ entity: "scene", kind: "upsert", key: "a", payload: { name: "v2" } }); // edited mid-flight
      release();
      await draining;
      await engine.drain();

      expect(sent).toEqual([{ name: "v1" }, { name: "v2" }]);
      expect(ops()).toEqual([]);
    });

    it("a delete queued mid-flight still goes out after the create that was in flight", async () => {
      enqueue({ entity: "scene", kind: "upsert", key: "a", payload: { name: "v1" } });
      let release: () => void = () => undefined;
      const execute = vi.fn((op: OutboxOp) =>
        op.kind === "upsert" ? new Promise<void>((resolve) => (release = resolve)) : Promise.resolve()
      );
      const { engine } = makeEngine({ execute });

      const draining = engine.drain();
      await Promise.resolve();
      enqueue({ entity: "scene", kind: "delete", key: "a" });
      release();
      await draining;
      await engine.drain();

      expect(execute.mock.calls.map(([op]) => op.kind)).toEqual(["upsert", "delete"]);
      expect(ops()).toEqual([]);
    });
  });

  it("is single-flight: overlapping drains never send the same op twice at once", async () => {
    enqueue({ entity: "scene", kind: "upsert", key: "a" });
    enqueue({ entity: "scene", kind: "upsert", key: "b" });
    const { engine, execute } = makeEngine();

    await Promise.all([engine.drain(), engine.drain(), engine.drain()]);

    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("keeps draining after an executor blows up unexpectedly", async () => {
    enqueue({ entity: "scene", kind: "upsert", key: "a" });
    const execute = vi.fn(() => {
      throw new Error("bug in an executor");
    });
    const { engine } = makeEngine({ execute });

    await expect(engine.drain()).resolves.toBeUndefined();
    await expect(engine.drain()).resolves.toBeUndefined();
  });
});

describe("the outbox actions the UI uses", () => {
  it("retryFailed puts a failed op back to pending, due now", () => {
    enqueue({ entity: "scene", kind: "upsert", key: "a" });
    outbox().update(byKey("a")!.id, { status: "failed", error: "refused", attempts: 5 });

    outbox().retryFailed();

    expect(byKey("a")).toMatchObject({ status: "pending", attempts: 0, error: undefined });
  });

  it("discard removes only failed ops, never pending ones", () => {
    enqueue({ entity: "scene", kind: "upsert", key: "failed" });
    enqueue({ entity: "scene", kind: "upsert", key: "pending" });
    outbox().update(byKey("failed")!.id, { status: "failed" });

    outbox().discard();

    expect(ops().map((op) => op.key)).toEqual(["pending"]);
  });
});
