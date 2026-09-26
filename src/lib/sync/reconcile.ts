import type { OutboxKind, OutboxOp } from "@/lib/sync/outbox-store";

/**
 * The server list, corrected for what this device has changed but the server may not have yet (or had not
 * when the list was read). A plain "replace the local list with the server's" would silently undo every
 * change still waiting in the outbox — exactly what happens after coming back online.
 *
 *  - pending delete → gone, whatever the server says;
 *  - pending upsert/patch → the local version wins (it has the change); if there is none, a patch is
 *    applied on top of the server's;
 *  - recently accepted by the server → same: the list may predate it, so trust the local version;
 *  - a failed op is in neither map: the server's version wins, which is what reverts a refused change;
 *  - local-only items survive only while they are pending or were just created (never reached the list yet).
 */
export function reconcile<T extends { id: string }>(
  server: T[],
  local: T[],
  pending: Map<string, OutboxOp>,
  recent: (key: string) => OutboxKind | undefined,
  applyPatch?: (serverItem: T, payload: Record<string, unknown>) => T
): T[] {
  const localById = new Map(local.map((item) => [item.id, item]));
  const seen = new Set<string>();
  const result: T[] = [];

  for (const item of server) {
    seen.add(item.id);
    const op = pending.get(item.id);
    const kind = op?.kind ?? recent(item.id);
    if (kind === undefined) {
      result.push(item);
    } else if (kind === "delete") {
      continue;
    } else {
      const mine = localById.get(item.id);
      if (mine) result.push(mine);
      else if (op?.kind === "patch" && applyPatch) result.push(applyPatch(item, op.payload ?? {}));
      else result.push(item);
    }
  }

  for (const item of local) {
    if (seen.has(item.id)) continue;
    const kind = pending.get(item.id)?.kind ?? recent(item.id);
    if (kind === "upsert") result.push(item);
  }
  return result;
}

/** Applies a wire patch (null = clear the field) to an item — the same merge the server does. */
export function applyWirePatch<T extends object>(item: T, payload: Record<string, unknown>): T {
  const fields = new Map<string, unknown>(Object.entries(item));
  for (const [key, value] of Object.entries(payload)) {
    if (value === null) fields.delete(key);
    else fields.set(key, value);
  }
  return Object.fromEntries(fields) as T;
}
