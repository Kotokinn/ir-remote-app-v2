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
import { useConnectionStore } from "@/lib/store/connection-store";
import {
  HUB_CHARACTERISTIC_UUID,
  HUB_SERVICE_UUID,
  connectToHub,
  disconnectFromHub,
  scanForHubs,
} from "@/lib/device/ble-provisioning";

// Must match the firmware constants (docs/MQTT_API.md "Định danh thiết bị") and mqtt-service's
// mqtt.device.* defaults.
const TENANT_ID = "tenant-001";
const DEVICE_PROFILE = "SmartIrHub";
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

  // The hub advertises its deviceId as its BLE name.
  const hubs = await scanForHubs(SCAN_MS);
  const hub = hubs.find((candidate) => candidate.name === deviceId);
  if (!hub) {
    throw new Error(`Device ${deviceId} not found over Bluetooth (out of range?)`);
  }

  await connectToHub(hub.address, () => {
    if (connectedDeviceId === deviceId) setConnected(null);
  });
  setConnected(deviceId);
}

export function sendCommandOverBle(
  deviceId: string,
  method: string,
  params?: Record<string, unknown>
): Promise<void> {
  return serialized(async () => {
    const attempt = async () => {
      await ensureConnected(deviceId);
      const topic = `v1/tenants/${TENANT_ID}/devices/${DEVICE_PROFILE}/${deviceId}/commands/request/${newRequestId()}`;
      const payload = JSON.stringify({ method, params });
      await sendString(HUB_CHARACTERISTIC_UUID, `${topic}|${payload}`, "withoutResponse", HUB_SERVICE_UUID);
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
