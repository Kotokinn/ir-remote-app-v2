import { useAuthStore } from "@/lib/store/auth-store";
import { useDevicesStore } from "@/lib/store/devices-store";
import { useHubsStore } from "@/lib/store/hubs-store";
import { useScenesStore } from "@/lib/store/scenes-store";
import { useSchedulesStore } from "@/lib/store/schedules-store";
import { executeOp } from "@/lib/sync/executors";
import { markSynced, type OutboxEntity } from "@/lib/sync/outbox-store";
import { createSyncEngine, type SyncEngine } from "@/lib/sync/sync-engine";

/** Re-reads a store from the server — used when an op was refused, so the local copy stops showing what the server rejected. */
function refetch(entity: OutboxEntity) {
  switch (entity) {
    case "scene":
      void useScenesStore.getState().fetchScenes();
      break;
    case "schedule":
      void useSchedulesStore.getState().fetchSchedules();
      break;
    case "device":
      void useDevicesStore.getState().fetchDevices();
      break;
    case "hub":
      void useHubsStore.getState().fetchHubs();
      break;
  }
}

export const syncEngine: SyncEngine = createSyncEngine({
  execute: executeOp,
  now: () => Date.now(),
  random: Math.random,
  isSignedIn: () => useAuthStore.getState().accessToken !== null,
  currentAccountId: () => useAuthStore.getState().account?.id ?? null,
  onPermanentFailure: (op) => {
    console.error(`[sync] ${op.entity}:${op.kind} ${op.key} refused`, op.error);
    refetch(op.entity);
  },
  // The server now equals the local copy. Remember that briefly so a fetch already in flight can't undo it;
  // no refetch here (after a long offline spell that would be one request per op).
  onSynced: markSynced,
});
