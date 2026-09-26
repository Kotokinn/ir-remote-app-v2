import { devicesApi, hubsApi, scenesApi, schedulesApi, type SceneBody, type ScheduleBody } from "@/lib/api/smart";
import type { OutboxOp } from "@/lib/sync/outbox-store";
import { PermanentSyncError } from "@/lib/sync/sync-engine";

/** Devices/hubs are addressed by the server's numeric id; anything else is a stale local id with nothing on the server. */
function serverId(op: OutboxOp): number | null {
  const id = Number(op.key);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Sends one op to the server. Resolves when the server has accepted it; rejects with the request's failure. */
export async function executeOp(op: OutboxOp): Promise<void> {
  const payload = op.payload ?? {};
  switch (`${op.entity}:${op.kind}`) {
    case "scene:upsert":
      await scenesApi.upsert(op.key, payload as unknown as SceneBody);
      return;
    case "scene:delete":
      await scenesApi.remove(op.key);
      return;
    case "schedule:upsert":
      await schedulesApi.upsert(op.key, payload as unknown as ScheduleBody);
      return;
    case "schedule:delete":
      await schedulesApi.remove(op.key);
      return;
    case "device:patch": {
      const id = serverId(op);
      if (id !== null) await devicesApi.patch(id, payload);
      return;
    }
    case "device:delete": {
      const id = serverId(op);
      if (id !== null) await devicesApi.remove(id);
      return;
    }
    case "hub:patch": {
      const id = serverId(op);
      if (id !== null) await hubsApi.patch(id, payload);
      return;
    }
    case "hub:delete": {
      const id = serverId(op);
      if (id !== null) await hubsApi.remove(id);
      return;
    }
    default:
      throw new PermanentSyncError(`Unsupported sync operation ${op.entity}:${op.kind}`);
  }
}
