import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { startClaim } from "@/lib/api/mqtt";
import { API_BASE_URL } from "@/lib/api/config";
import { useAuthStore } from "@/lib/store/auth-store";
import { useDeviceStateStore } from "@/lib/store/device-state-store";
import { useHubsStore } from "@/lib/store/hubs-store";
import { useOtaStore, type OtaEventType } from "@/lib/store/ota-store";

const OTA_EVENT_TYPES: readonly OtaEventType[] = ["firmwareAvailable", "otaStarted", "otaSuccess", "otaFailed"];

function isOtaEventType(value: unknown): value is OtaEventType {
  return typeof value === "string" && (OTA_EVENT_TYPES as readonly string[]).includes(value);
}

interface DeviceEventPayload {
  event: string;
  data: string;
}

const activeUnlisten = new Map<string, UnlistenFn>();

const RECLAIM_COOLDOWN_MS = 60_000;
const lastReclaimAt = new Map<string, number>();

/**
 * The server keeps device ownership in its own database. If that record is gone (server reset /
 * redeploy) the stream answers 404 "Device not claimed" although the hub is still ours and still
 * answers the claim command — so claim it again once and reconnect instead of leaving the user
 * with a hub that looks permanently unreachable.
 */
function reclaimAndReconnect(deviceId: string): void {
  const now = Date.now();
  if (now - (lastReclaimAt.get(deviceId) ?? 0) < RECLAIM_COOLDOWN_MS) return;
  lastReclaimAt.set(deviceId, now);

  const hub = useHubsStore.getState().physicalDevices.find((device) => device.deviceId === deviceId);
  startClaim(deviceId, hub?.name ?? deviceId)
    .then(() => startDeviceStream(deviceId))
    .catch((error: unknown) => {
      console.warn(`[device-stream] re-claim of ${deviceId} failed`, error);
    });
}

function applyEvent(deviceId: string, payload: DeviceEventPayload) {
  const store = useDeviceStateStore.getState();

  // Stream-level events come from the Rust side ("open"/"error") and mqtt-service ("ping").
  if (payload.event === "error") {
    console.error(`[device-stream] ${deviceId}:`, payload.data);
    store.markStreamError(deviceId);
    // reqwest-eventsource reports a rejected stream as "Invalid status code: 404 Not Found".
    if (payload.data.includes("404")) reclaimAndReconnect(deviceId);
    return;
  }
  if (payload.event === "open" || payload.event === "ping") {
    store.touchStream(deviceId);
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload.data);
  } catch {
    return;
  }

  switch (payload.event) {
    case "telemetry":
      store.setTelemetry(deviceId, parsed as Record<string, unknown>);
      break;
    case "state":
      store.setState(deviceId, parsed as Record<string, unknown>);
      break;
    case "attributes":
      store.setAttributes(deviceId, parsed as Record<string, unknown>);
      break;
    case "command-response":
      store.pushCommandResponse(deviceId, parsed as Record<string, unknown>);
      break;
    case "broker":
      store.setBroker(deviceId, (parsed as Record<string, unknown>).connected === true);
      break;
    case "events": {
      // smart-control's publishOtaEvent() (main.cpp): {type, currentVersion, newVersion, title}.
      const event = parsed as Record<string, unknown>;
      if (
        isOtaEventType(event.type) &&
        typeof event.currentVersion === "string" &&
        typeof event.newVersion === "string" &&
        typeof event.title === "string"
      ) {
        useOtaStore.getState().setEvent(deviceId, {
          type: event.type,
          currentVersion: event.currentVersion,
          newVersion: event.newVersion,
          title: event.title,
        });
      }
      break;
    }
    default:
      break;
  }
}

/** Starts the Rust-side SSE listener for one device and wires it into device-state-store. */
export async function startDeviceStream(deviceId: string): Promise<void> {
  await stopDeviceStream(deviceId);

  const token = useAuthStore.getState().accessToken;
  if (!token) throw new Error("Not signed in");

  const eventName = `device-event:${deviceId}`;
  const unlisten = await listen<DeviceEventPayload>(eventName, (event) => {
    applyEvent(deviceId, event.payload);
  });
  activeUnlisten.set(deviceId, unlisten);

  await invoke("device_stream_start", { deviceId, baseUrl: API_BASE_URL, token });
}

export async function stopDeviceStream(deviceId: string): Promise<void> {
  const unlisten = activeUnlisten.get(deviceId);
  if (unlisten) {
    unlisten();
    activeUnlisten.delete(deviceId);
  }
  await invoke("device_stream_stop", { deviceId });
}
