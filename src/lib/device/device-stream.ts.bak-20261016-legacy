import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { API_BASE_URL } from "@/lib/api/config";
import { startClaim } from "@/lib/api/mqtt";
import { runsInApp } from "@/lib/platform";
import { startSse } from "@/lib/sse";
import { useAuthStore } from "@/lib/store/auth-store";
import { useDeviceStateStore } from "@/lib/store/device-state-store";
import { useHubsStore } from "@/lib/store/hubs-store";
import { type OtaEventType, useOtaStore } from "@/lib/store/ota-store";

const OTA_EVENT_TYPES: readonly OtaEventType[] = [
  "firmwareAvailable",
  "otaStarted",
  "otaSuccess",
  "otaFailed",
];

/**
 * hub-ir sends camelCase ("firmwareAvailable", "otaStarted"), smart-control dotted ("firmware.available",
 * "ota.started"): both mean the same four events.
 */
function toOtaEventType(value: unknown): OtaEventType | null {
  if (typeof value !== "string") return null;
  const camel = value
    .trim()
    .replace(/[._-]+([a-zA-Z0-9])/g, (_, letter: string) =>
      letter.toUpperCase(),
    );
  return (OTA_EVENT_TYPES as readonly string[]).includes(camel)
    ? (camel as OtaEventType)
    : null;
}

/**
 * Firmware that updates itself (updatingFirmwareVersion: the version being installed, "" otherwise): nothing to
 * confirm, the banner only shows progress. The retained attributes cover what a live event would have said when
 * the app wasn't watching: still installing, or (after the reboot) now running the new version.
 */
function syncAutoUpdateFromAttributes(
  deviceId: string,
  attributes: Record<string, unknown>,
): void {
  const ota = useOtaStore.getState();
  const updating =
    typeof attributes.updatingFirmwareVersion === "string"
      ? attributes.updatingFirmwareVersion.trim()
      : "";
  const current =
    typeof attributes.firmwareVersion === "string"
      ? attributes.firmwareVersion
      : "";
  const existing = ota.events[deviceId];

  if (updating && updating !== current) {
    if (existing?.type === "otaStarted" && existing.newVersion === updating)
      return;
    ota.setEvent(deviceId, {
      type: "otaStarted",
      currentVersion: current,
      newVersion: updating,
      title: existing?.title ?? "",
    });
    return;
  }
  if (existing?.type !== "otaStarted") return;
  if (current === existing.newVersion) {
    ota.setEvent(deviceId, { ...existing, type: "otaSuccess" });
  } else {
    // No longer installing and not on the new version: the otaFailed event was missed.
    ota.setEvent(deviceId, { ...existing, type: "otaFailed" });
  }
}

/**
 * Older firmware that asks first. The offer to update, from the retained attributes (pendingFirmwareVersion):
 * mqtt-service replays those to every new stream, whereas the firmwareAvailable event is only seen by an app
 * watching at that moment (and the firmware repeats it only every few hours). So the prompt is there whenever the
 * app opens while an update is pending, and goes away once nothing is pending any more. A version the user closed
 * stays closed.
 */
function syncOfferFromAttributes(
  deviceId: string,
  attributes: Record<string, unknown>,
): void {
  if ("updatingFirmwareVersion" in attributes) {
    syncAutoUpdateFromAttributes(deviceId, attributes);
    return;
  }
  if (!("pendingFirmwareVersion" in attributes)) return;
  const ota = useOtaStore.getState();
  const pending =
    typeof attributes.pendingFirmwareVersion === "string"
      ? attributes.pendingFirmwareVersion.trim()
      : "";
  const current =
    typeof attributes.firmwareVersion === "string"
      ? attributes.firmwareVersion
      : "";
  const existing = ota.events[deviceId];

  if (!pending || pending === current) {
    if (existing?.type === "firmwareAvailable") ota.dismiss(deviceId);
    return;
  }
  if (ota.dismissedVersions[deviceId] === pending) return;
  // Already offered, or a live progress state for this version (installing / done / failed) says more.
  if (existing && existing.newVersion === pending) return;
  ota.setEvent(deviceId, {
    type: "firmwareAvailable",
    currentVersion: current,
    newVersion: pending,
    title: existing?.title ?? "",
  });
}

interface DeviceEventPayload {
  event: string;
  data: string;
}

const activeUnlisten = new Map<string, UnlistenFn>();
// The browser build reads the stream itself (see lib/sse.ts) instead of through the Rust side.
const webStops = new Map<string, () => void>();

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

  const hub = useHubsStore
    .getState()
    .physicalDevices.find((device) => device.deviceId === deviceId);
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
      syncOfferFromAttributes(deviceId, parsed as Record<string, unknown>);
      break;
    case "command-response":
      store.pushCommandResponse(deviceId, parsed as Record<string, unknown>);
      break;
    case "broker":
      store.setBroker(
        deviceId,
        (parsed as Record<string, unknown>).connected === true,
      );
      break;
    case "events": {
      // publishOtaEvent() in both firmwares (main.cpp): {type, currentVersion, newVersion, title}.
      const event = parsed as Record<string, unknown>;
      const type = toOtaEventType(event.type);
      if (
        type &&
        typeof event.currentVersion === "string" &&
        typeof event.newVersion === "string"
      ) {
        const ota = useOtaStore.getState();
        // An offer the user already closed isn't pushed at them again when the firmware repeats it.
        if (
          type !== "firmwareAvailable" ||
          ota.dismissedVersions[deviceId] !== event.newVersion
        ) {
          ota.setEvent(deviceId, {
            type,
            currentVersion: event.currentVersion,
            newVersion: event.newVersion,
            title: typeof event.title === "string" ? event.title : "",
          });
        }
      }
      break;
    }
    default:
      break;
  }
}

/**
 * Starts the live stream for one device and wires it into device-state-store: the Rust-side SSE listener in
 * the installed app, a fetch-based reader in the browser.
 */
export async function startDeviceStream(deviceId: string): Promise<void> {
  await stopDeviceStream(deviceId);

  const token = useAuthStore.getState().accessToken;
  if (!token) throw new Error("Not signed in");

  if (!runsInApp()) {
    webStops.set(
      deviceId,
      startSse(
        `${API_BASE_URL}/api/mqtt/devices/${deviceId}/stream`,
        () => useAuthStore.getState().accessToken,
        (event) => {
          applyEvent(deviceId, event);
        },
      ),
    );
    return;
  }

  const eventName = `device-event:${deviceId}`;
  const unlisten = await listen<DeviceEventPayload>(eventName, (event) => {
    applyEvent(deviceId, event.payload);
  });
  activeUnlisten.set(deviceId, unlisten);

  await invoke("device_stream_start", {
    deviceId,
    baseUrl: API_BASE_URL,
    token,
  });
}

export async function stopDeviceStream(deviceId: string): Promise<void> {
  webStops.get(deviceId)?.();
  webStops.delete(deviceId);
  if (!runsInApp()) return;
  const unlisten = activeUnlisten.get(deviceId);
  if (unlisten) {
    unlisten();
    activeUnlisten.delete(deviceId);
  }
  await invoke("device_stream_stop", { deviceId });
}
