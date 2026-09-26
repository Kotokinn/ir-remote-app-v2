"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { newClientId } from "@/lib/sync/ids";

// The outbox is the app's promise that a change made here reaches the server eventually: every write is
// recorded on disk *before* the caller is told it worked, and stays there until the server has accepted
// it (or refused it for good, in which case it stays visible as "failed" instead of disappearing).

export type OutboxEntity = "scene" | "schedule" | "device" | "hub";
/** upsert = create-or-replace by id; patch = merge the given fields; delete = remove (already gone counts as done). */
export type OutboxKind = "upsert" | "patch" | "delete";

export interface OutboxDependency {
  entity: OutboxEntity;
  key: string;
}

export interface OutboxOp {
  id: string;
  entity: OutboxEntity;
  kind: OutboxKind;
  /** The client id (scene/schedule) or server id (device/hub) of the thing this op is about. */
  key: string;
  /** What to show if this op fails (a scene's name…). */
  label: string;
  payload?: Record<string, unknown>;
  /** Must reach the server first (a schedule needs its scene to exist). */
  dependsOn?: OutboxDependency;
  /** Bumped whenever coalescing changes the op, so the engine can tell it changed while a send was in flight. */
  rev: number;
  createdAt: number;
  attempts: number;
  nextAttemptAt: number;
  status: "pending" | "failed";
  error?: string;
}

export interface NewOp {
  entity: OutboxEntity;
  kind: OutboxKind;
  key: string;
  label: string;
  payload?: Record<string, unknown>;
  dependsOn?: OutboxDependency;
}

function makeOp(incoming: NewOp, now: number): OutboxOp {
  return { ...incoming, id: newClientId(), rev: 1, createdAt: now, attempts: 0, nextAttemptAt: now, status: "pending" };
}

/**
 * Folds a new change into the queue. There is only ever one op per thing: the server only needs to end
 * up in the final state, and fewer, later requests are less to lose and less to retry.
 *  - upsert over upsert: the newer body replaces the older one;
 *  - patch over patch: the fields merge, newer values win;
 *  - anything then delete: it is just a delete (deleting something that never reached the server is a
 *    harmless no-op there);
 *  - a delete already queued swallows later changes to the same thing;
 *  - a failed op is replaced by the new one — the user has changed their mind, and the new attempt is theirs.
 */
export function coalesce(ops: OutboxOp[], incoming: NewOp, now: number): OutboxOp[] {
  const index = ops.findIndex((op) => op.entity === incoming.entity && op.key === incoming.key);
  if (index === -1) return [...ops, makeOp(incoming, now)];

  const existing = ops[index];
  if (existing.status === "failed") {
    return [...ops.slice(0, index), ...ops.slice(index + 1), makeOp(incoming, now)];
  }
  if (existing.kind === "delete") return ops;

  const merged: OutboxOp = {
    ...existing,
    kind: incoming.kind === "delete" ? "delete" : existing.kind === "patch" && incoming.kind === "patch" ? "patch" : incoming.kind,
    label: incoming.label,
    payload:
      incoming.kind === "delete"
        ? undefined
        : existing.kind === "patch" && incoming.kind === "patch"
          ? { ...existing.payload, ...incoming.payload }
          : incoming.payload,
    dependsOn: incoming.kind === "delete" ? undefined : incoming.dependsOn,
    rev: existing.rev + 1,
    // Fresh content: send it now rather than waiting out the backoff of the version it replaces.
    attempts: 0,
    nextAttemptAt: now,
    error: undefined,
  };
  return [...ops.slice(0, index), merged, ...ops.slice(index + 1)];
}

interface OutboxState {
  ops: OutboxOp[];
  /** The account whose changes these are; the queue is never replayed under a different one. */
  accountId: number | null;
  enqueue: (op: NewOp, accountId: number | null) => void;
  update: (id: string, patch: Partial<OutboxOp>) => void;
  remove: (id: string) => void;
  /** Failed ops go back to pending and are tried again at once. */
  retryFailed: (id?: string) => void;
  /** Drops the op (or every failed op) for good. */
  discard: (id?: string) => void;
  discardAll: () => void;
}

export const useOutboxStore = create<OutboxState>()(
  persist(
    (set) => ({
      ops: [],
      accountId: null,
      enqueue: (op, accountId) => {
        set((state) => ({
          ops: coalesce(state.ops, op, Date.now()),
          accountId: state.accountId ?? accountId,
        }));
      },
      update: (id, patch) => {
        set((state) => ({ ops: state.ops.map((op) => (op.id === id ? { ...op, ...patch } : op)) }));
      },
      remove: (id) => {
        set((state) => ({ ops: state.ops.filter((op) => op.id !== id) }));
      },
      retryFailed: (id) => {
        const now = Date.now();
        set((state) => ({
          ops: state.ops.map((op) =>
            op.status === "failed" && (id === undefined || op.id === id)
              ? { ...op, status: "pending", error: undefined, attempts: 0, nextAttemptAt: now, rev: op.rev + 1 }
              : op
          ),
        }));
      },
      discard: (id) => {
        set((state) => ({
          ops: state.ops.filter((op) => !(op.status === "failed" && (id === undefined || op.id === id))),
        }));
      },
      discardAll: () => {
        set({ ops: [], accountId: null });
      },
    }),
    {
      name: "smart-home-outbox",
      storage: createJSONStorage(() => window.localStorage),
      skipHydration: true,
      partialize: (state) => ({ ops: state.ops, accountId: state.accountId }),
    }
  )
);

/** Ops still waiting to reach the server, by key — what a fetch must not overwrite. */
export function pendingByKey(entity: OutboxEntity): Map<string, OutboxOp> {
  const map = new Map<string, OutboxOp>();
  for (const op of useOutboxStore.getState().ops) {
    if (op.entity === entity && op.status === "pending") map.set(op.key, op);
  }
  return map;
}

export interface OutboxSummary {
  pending: number;
  failed: number;
}

export function useOutboxSummary(): OutboxSummary {
  const ops = useOutboxStore((state) => state.ops);
  return {
    pending: ops.filter((op) => op.status === "pending").length,
    failed: ops.filter((op) => op.status === "failed").length,
  };
}

// What was accepted by the server moments ago. A fetch that was already in flight when an op finished
// carries a server snapshot from *before* it, and must not undo it (bring back a thing just deleted,
// drop a thing just created). Longer than the request timeout, so any such fetch is covered.
const RECENT_MS = 30_000;
const recentlySynced = new Map<string, { kind: OutboxKind; at: number }>();

export function markSynced(op: Pick<OutboxOp, "entity" | "key" | "kind">): void {
  recentlySynced.set(`${op.entity}:${op.key}`, { kind: op.kind, at: Date.now() });
}

export function recentlySyncedKind(entity: OutboxEntity, key: string): OutboxKind | undefined {
  const entry = recentlySynced.get(`${entity}:${key}`);
  if (!entry) return undefined;
  if (Date.now() - entry.at > RECENT_MS) {
    recentlySynced.delete(`${entity}:${key}`);
    return undefined;
  }
  return entry.kind;
}
