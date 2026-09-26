import { useAuthStore } from "@/lib/store/auth-store";
import { useOutboxStore, type NewOp } from "@/lib/sync/outbox-store";

/**
 * Records a change that has to reach the server. Returns once it is on disk; the sync engine (which
 * watches the queue) takes it from there — the caller never waits for, or depends on, the network.
 */
export function enqueueSync(op: NewOp): void {
  useOutboxStore.getState().enqueue(op, useAuthStore.getState().account?.id ?? null);
}
