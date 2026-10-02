// BLE fallback for sending commands when the MQTT path to a device is down (no LAN / broker
// unreachable). Same command vocabulary as MQTT: the firmware routes BLE frames through the
// same dispatchTopicPayload as MQTT (docs/MQTT_API.md, "BLE chi tiết"), so a command is just
//   <commands/request topic>|{"method": ..., "params": ...}
// written to the hub characteristic.
//
// Constraints this module encodes:
//  - The blec plugin holds ONE BLE connection app-wide, so we track which device it is on and
//    switch (disconnect → scan → connect) when a different device needs a command.
//  - Windows GATT can't take overlapping operations, so every BLE operation is serialized.
//  - Fire-and-forget: notifications from the device are unreliable on Windows (see
//    provisionWifi), so we never wait for a command response over BLE.
import { sendString } from "@mnlphlp/plugin-blec";
import {
  connectToHub,
  disconnectFromHub,
  HUB_CHARACTERISTIC_UUID,
  HUB_SERVICE_UUID,
  readDeviceId,
  scanForHubs,
} from "@/lib/device/ble-provisioning";
import { commandRequestTopic } from "@/lib/device/device-profile";
import { writeString as webWriteString } from "@/lib/device/web-bluetooth";
import { t } from "@/lib/i18n";
import { runsInApp } from "@/lib/platform";
import { useConnectionStore } from "@/lib/store/connection-store";

const SCAN_MS = 4000;

let connectedDeviceId: string | null = null;
let queue: Promise<unknown> = Promise.resolve();

function setConnected(deviceId: string | null): void {
  connectedDeviceId = deviceId;
  useConnectionStore.getState().setBleDeviceId(deviceId);
}

function serialized<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task);
  queue = run.catch(() => undefined);
  return run;
}

function newRequestId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

async function ensureConnected(deviceId: string): Promise<void> {
  if (connectedDeviceId === deviceId) return;

  if (connectedDeviceId !== null) {
    await disconnectFromHub().catch(() => undefined);
    setConnected(null);
  }

  if (!runsInApp()) {
    // No fresh chooser dialog here — a command can fire long after whatever click last granted this
    // device, and Web Bluetooth's requestDevice() needs one (see web-bluetooth.ts). connectToHub()
    // reconnects silently if the browser still knows this device; otherwise it throws, which is the
    // honest outcome — the user has to pick it again (e.g. from the transport picker) first.
    await connectToHub(deviceId, () => {
      if (connectedDeviceId === deviceId) setConnected(null);
    });
    setConnected(deviceId);
    return;
  }

  const hubs = await scanForHubs(SCAN_MS);
  if (hubs.length === 0) {
    throw new Error(t("errors.bleNotFound", { id: deviceId }));
  }

  const onDisconnect = () => {
    if (connectedDeviceId === deviceId) setConnected(null);
  };

  if (hubs.length === 1) {
    // Only one hub nearby advertising this product's service UUID — assume it's the one we want
    // and skip the GATT identity read below. That read is only safe right after a FRESH connect
    // during pairing, with nothing else published yet (BLEMQTT.h's setDeviceId doc comment) — on
    // an already-running, already-claimed hub, its own periodic telemetry/state publish can race
    // and overwrite the characteristic mid-probe, making the read fail or mismatch on every try
    // (that's what caused the endless connect/read/disconnect loop here).
    await connectToHub(hubs[0].address, onDisconnect);
    setConnected(deviceId);
    return;
  }

  // More than one hub of the same product nearby — the advertised name is just the shared
  // product label (e.g. "SmartIrHub"), never the real deviceId, so there's no way to tell them
  // apart without connecting and reading each one's deviceId characteristic. This still carries
  // the race described above and can occasionally miss; callers already treat a BLE failure as
  // non-fatal (MQTT fallback, or a clear error to the user).
  for (const candidate of hubs) {
    try {
      await connectToHub(candidate.address, onDisconnect);
      const realDeviceId = await readDeviceId();
      if (realDeviceId === deviceId) {
        setConnected(deviceId);
        return;
      }
      await disconnectFromHub().catch(() => undefined);
    } catch (error) {
      console.warn(
        "[ble-transport] probe failed for candidate",
        candidate.address,
        error,
      );
      await disconnectFromHub().catch(() => undefined);
    }
  }
  throw new Error(t("errors.bleNotFound", { id: deviceId }));
}

export function sendCommandOverBle(
  deviceId: string,
  method: string,
  params?: unknown,
): Promise<void> {
  return serialized(async () => {
    const attempt = async () => {
      await ensureConnected(deviceId);
      const topic = commandRequestTopic(deviceId, newRequestId());
      const payload = JSON.stringify({ method, params });
      const frame = `${topic}|${payload}`;
      if (runsInApp()) {
        await sendString(
          HUB_CHARACTERISTIC_UUID,
          frame,
          "withoutResponse",
          HUB_SERVICE_UUID,
        );
      } else {
        await webWriteString(frame);
      }
    };

    try {
      await attempt();
    } catch (error) {
      // Stale connection state (link dropped without the disconnect callback) — reconnect once.
      console.warn("[ble-transport] send failed, reconnecting once", error);
      setConnected(null);
      await disconnectFromHub().catch(() => undefined);
      await attempt();
    }
  });
}
