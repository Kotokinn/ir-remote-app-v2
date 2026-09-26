import { ApiError } from "@/lib/api/auth";
import { errorMessage } from "@/lib/i18n/errors";
import { t } from "@/lib/i18n";
import { useOutboxStore, type OutboxKind, type OutboxOp } from "@/lib/sync/outbox-store";

/** Thrown by an executor for an op that can never succeed as written — the engine marks it failed instead of retrying. */
export class PermanentSyncError extends Error {}

export type ErrorClass =
  /** Couldn't reach the server (offline, DNS, refused, timed out): retry with backoff, forever. */
  | "network"
  /** The server answered "not now" (5xx, 408, 429): retry with backoff, and eventually surface it. */
  | "retry"
  /** Signed out / token refused: keep the op, wait for a session. */
  | "auth"
  /** The server refused this request and will keep refusing (400/403/409/…): mark failed, tell the user. */
  | "permanent"
  /** Deleting/patching something that no longer exists: the outcome the user wanted is already true. */
  | "gone";

export function classifyError(error: unknown, kind: OutboxKind): ErrorClass {
  if (error instanceof PermanentSyncError) return "permanent";
  if (error instanceof ApiError) {
    const status = error.status;
    if (status === 401) return "auth";
    if (status === 404 && kind !== "upsert") return "gone";
    if (status === 408 || status === 425 || status === 429 || status >= 500) return "retry";
    if (status >= 400) return "permanent";
  }
  // Not an HTTP answer at all: the request never completed (offline, timeout, connection dropped).
  return "network";
}

const BASE_BACKOFF_MS = 2_000;
const MAX_BACKOFF_MS = 5 * 60_000;
/** After this many server-side errors in a row an op stops retrying by itself and waits for the user (never dropped). */
export const MAX_SERVER_ERROR_ATTEMPTS = 10;
const AUTH_RETRY_MS = 30_000;
/** Even with nothing scheduled sooner, look at the queue this often while anything is waiting. */
const HEARTBEAT_MS = 30_000;

/** 2s, 4s, 8s … capped at 5 minutes, ±20% so a fleet of clients doesn't retry in lockstep. */
export function backoffMs(attempts: number, random: () => number = Math.random): number {
  const base = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** Math.max(0, attempts));
  return Math.round(base * (0.8 + 0.4 * random()));
}

export interface EngineDeps {
  /** Performs one op against the server; rejects with whatever the request failed with. */
  execute: (op: OutboxOp) => Promise<void>;
  now: () => number;
  random: () => number;
  isSignedIn: () => boolean;
  currentAccountId: () => number | null;
  /** An op was refused for good (or its dependency was): the local copy of that thing is now wrong. */
  onPermanentFailure: (op: OutboxOp) => void;
  onSynced: (op: OutboxOp) => void;
}

export interface SyncEngine {
  /** Sends everything that is due, in order. Safe to call any time, any number of times. */
  drain: () => Promise<void>;
  /** Like drain, but first forgets any "network is down, wait" pause — for when connectivity is known to be back. */
  resume: () => Promise<void>;
  /** Wires the triggers (queue changes, back online, app foregrounded, heartbeat). Returns the unsubscribe. */
  start: () => () => void;
}

function describe(error: unknown): string {
  return errorMessage(error);
}

export function createSyncEngine(deps: EngineDeps): SyncEngine {
  const outbox = useOutboxStore;
  let draining = false;
  let requestedAgain = false;
  let wakeTimer: ReturnType<typeof setTimeout> | undefined;
  // After a network error the whole queue waits (every op would fail the same way, each costing a request
  // timeout): nothing is attempted before this moment unless connectivity is reported back (resume()).
  let pausedUntil = 0;

  function fail(op: OutboxOp, message: string) {
    outbox.getState().update(op.id, { status: "failed", error: message });
    deps.onPermanentFailure(op);
  }

  /** A dependent whose dependency failed, or was deleted, can never succeed: fail it too, transitively. */
  function failBrokenDependents() {
    for (;;) {
      const ops = outbox.getState().ops;
      const broken = ops.find((op) => {
        if (op.status !== "pending" || !op.dependsOn) return false;
        const { entity, key } = op.dependsOn;
        const dependency = ops.find((other) => other.id !== op.id && other.entity === entity && other.key === key);
        return dependency !== undefined && (dependency.status === "failed" || dependency.kind === "delete");
      });
      if (!broken) return;
      const dependency = ops.find(
        (other) => other.entity === broken.dependsOn?.entity && other.key === broken.dependsOn.key
      );
      fail(
        broken,
        dependency?.status === "failed"
          ? t("sync.err.dependencyFailed", { label: dependency.label })
          : t("sync.err.dependencyDeleted", { label: dependency?.label ?? "?" })
      );
    }
  }

  function isBlocked(op: OutboxOp, ops: OutboxOp[]): boolean {
    if (!op.dependsOn) return false;
    const { entity, key } = op.dependsOn;
    return ops.some((other) => other.id !== op.id && other.entity === entity && other.key === key && other.status === "pending");
  }

  function finished(op: OutboxOp, revSent: number) {
    const current = outbox.getState().ops.find((other) => other.id === op.id);
    if (!current) return; // discarded while it was being sent
    if (current.rev !== revSent) {
      // Changed while in flight: what the server just got is stale, so the newer version still has to go.
      outbox.getState().update(op.id, { attempts: 0, nextAttemptAt: deps.now(), error: undefined });
      return;
    }
    outbox.getState().remove(op.id);
    deps.onSynced(op);
  }

  /** Returns false when the rest of the queue should wait too (the problem isn't specific to this op). */
  async function attempt(op: OutboxOp): Promise<boolean> {
    const revSent = op.rev;
    try {
      await deps.execute(op);
      finished(op, revSent);
      return true;
    } catch (error) {
      const now = deps.now();
      const current = outbox.getState().ops.find((other) => other.id === op.id);
      if (!current) return true;
      switch (classifyError(error, op.kind)) {
        case "gone":
          finished(op, revSent);
          return true;
        case "permanent":
          fail(current, describe(error));
          return true;
        case "auth":
          outbox.getState().update(op.id, { nextAttemptAt: now + AUTH_RETRY_MS, error: t("sync.err.needSignIn") });
          return false;
        case "network": {
          // The server is unreachable, so everything behind this op would fail the same way: pause them all.
          const delay = backoffMs(current.attempts, deps.random);
          pausedUntil = now + delay;
          outbox.getState().update(op.id, {
            attempts: current.attempts + 1,
            nextAttemptAt: now + delay,
            error: t("sync.err.offline"),
          });
          return false;
        }
        case "retry": {
          const attempts = current.attempts + 1;
          if (attempts >= MAX_SERVER_ERROR_ATTEMPTS) {
            fail({ ...current, attempts }, t("sync.err.serverKeepsFailing", { reason: describe(error) }));
          } else {
            outbox.getState().update(op.id, {
              attempts,
              nextAttemptAt: now + backoffMs(current.attempts, deps.random),
              error: t("sync.err.serverError", { reason: describe(error) }),
            });
          }
          // Might be specific to this request: let the others have their turn.
          return true;
        }
      }
    }
  }

  async function pass() {
    if (!deps.isSignedIn()) return;
    if (deps.now() < pausedUntil) return;

    const state = outbox.getState();
    const account = deps.currentAccountId();
    if (state.accountId !== null && account !== null && state.accountId !== account) {
      // Someone else signed in on this machine: their queue must never be replayed under this account.
      console.warn("[sync] discarding an outbox that belongs to another account");
      state.discardAll();
      return;
    }

    for (;;) {
      failBrokenDependents();
      const ops = outbox.getState().ops;
      const now = deps.now();
      const next = ops.find((op) => op.status === "pending" && op.nextAttemptAt <= now && !isBlocked(op, ops));
      if (!next) return;
      if (!(await attempt(next))) return;
    }
  }

  function scheduleWake() {
    if (wakeTimer !== undefined) clearTimeout(wakeTimer);
    wakeTimer = undefined;
    const pending = outbox.getState().ops.filter((op) => op.status === "pending");
    if (pending.length === 0) return;
    const soonest = Math.max(pausedUntil, Math.min(...pending.map((op) => op.nextAttemptAt)));
    const delay = Math.max(1_000, Math.min(soonest - deps.now(), HEARTBEAT_MS));
    wakeTimer = setTimeout(() => {
      void drain();
    }, delay);
  }

  // A function, not the variable: pass() awaits, and a drain() call during it sets the flag — control-flow
  // analysis can't see that and would treat the loop condition as always false.
  const wasRequestedAgain = () => requestedAgain;

  async function drain(): Promise<void> {
    if (draining) {
      requestedAgain = true;
      return;
    }
    draining = true;
    try {
      do {
        requestedAgain = false;
        await pass();
      } while (wasRequestedAgain());
    } catch (error) {
      // pass() classifies request errors itself; anything reaching here is a bug — don't kill the loop.
      console.error("[sync] drain crashed", error);
    } finally {
      draining = false;
      scheduleWake();
    }
  }

  function resume(): Promise<void> {
    pausedUntil = 0;
    return drain();
  }

  function start(): () => void {
    const onQueueChange = (ops: OutboxOp[], previous: OutboxOp[]) => {
      if (ops === previous) return;
      const now = deps.now();
      if (ops.some((op) => op.status === "pending" && op.nextAttemptAt <= now)) void drain();
    };
    const unsubscribe = outbox.subscribe((state, previous) => {
      onQueueChange(state.ops, previous.ops);
    });
    const onOnline = () => {
      void resume();
    };
    const onVisible = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") void resume();
    };
    if (typeof window !== "undefined") {
      window.addEventListener("online", onOnline);
      window.addEventListener("focus", onOnline);
    }
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible);

    void drain();

    return () => {
      unsubscribe();
      if (wakeTimer !== undefined) clearTimeout(wakeTimer);
      wakeTimer = undefined;
      if (typeof window !== "undefined") {
        window.removeEventListener("online", onOnline);
        window.removeEventListener("focus", onOnline);
      }
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible);
    };
  }

  return { drain, resume, start };
}
