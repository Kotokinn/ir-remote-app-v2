// Single entry point for sending a command to a device: picks MQTT, BLE, or RS485.
// UI code calls sendDeviceCommand(deviceId, method, params) and never cares which path is used.
import { t } from "@/lib/i18n";
import { runsInApp } from "@/lib/platform";
import { sendCommand as sendCommandOverMqtt } from "@/lib/api/mqtt";
import { sendCommandOverBle } from "@/lib/device/ble-transport";
import { sendCommandOverSerial } from "@/lib/device/serial-transport";
import { useConnectionStore, type CommandRoute } from "@/lib/store/connection-store";
import { mqttHealth } from "@/lib/store/device-state-store";
import { getPhysicalDeviceByDeviceId, useHubsStore } from "@/lib/store/hubs-store";

/**
 * The user can pin a hub to exactly one path (hubs-store.ts's preferredTransport) — that is tried
 * and only that one, no silent fallback, so picking by hand always tells you for sure which path
 * just ran (or clearly failed) instead of the app quietly trying something else.
 */
async function sendPinned(
  route: "mqtt" | "ble" | "rs485",
  deviceId: string,
  serialPort: string | undefined,
  method: string,
  params: unknown
): Promise<CommandRoute> {
  if (route === "mqtt") {
    await sendCommandOverMqtt(deviceId, method, params);
    return "mqtt";
  }
  if (route === "ble") {
    await sendCommandOverBle(deviceId, method, params);
    return "ble";
  }
  if (!serialPort) {
    throw new Error(t("errors.noComPort"));
  }
  await sendCommandOverSerial(serialPort, deviceId, method, params);
  return "serial";
}

/**
 * Auto mode. RS485 first if a port is assigned — a wired cable beats guessing over MQTT/BLE health
 * when it's actually plugged in, and failing to open it (unplugged, wrong port) is cheap and falls
 * straight through to the wireless paths below.
 *
 * Between MQTT and BLE: the REST call to mqtt-service returns 200 as soon as it *publishes*, even
 * if the broker or the device is unreachable, so a successful response proves nothing about
 * delivery — the real signal is the SSE stream's health: the device's presence (`state` topic,
 * retained + LWT), the server's broker link, and the server's ping (see mqttHealthOf). Telemetry
 * cadence is irrelevant here (it can be minutes apart).
 *
 *  - health "alive"/"unknown" → MQTT first; BLE only if the REST call itself fails.
 *  - health "silent"          → BLE first; MQTT as last resort if the device isn't in BLE range.
 */
async function routeAuto(
  deviceId: string,
  serialPort: string | undefined,
  method: string,
  params?: unknown
): Promise<CommandRoute> {
  if (serialPort) {
    try {
      await sendCommandOverSerial(serialPort, deviceId, method, params);
      return "serial";
    } catch (serialError) {
      console.warn("[commands] RS485 send failed, falling back to MQTT/BLE", serialError);
    }
  }

  if (mqttHealth(deviceId) !== "silent") {
    try {
      await sendCommandOverMqtt(deviceId, method, params);
      return "mqtt";
    } catch (mqttError) {
      console.warn("[commands] MQTT send failed, trying BLE", mqttError);
      try {
        await sendCommandOverBle(deviceId, method, params);
        return "ble";
      } catch (bleError) {
        console.warn("[commands] BLE fallback failed too", bleError);
        throw mqttError;
      }
    }
  }

  try {
    await sendCommandOverBle(deviceId, method, params);
    return "ble";
  } catch (bleError) {
    console.warn("[commands] device silent on MQTT and BLE failed, trying MQTT anyway", bleError);
    await sendCommandOverMqtt(deviceId, method, params);
    return "mqtt";
  }
}

/** Sends a command and records how it went out (or that it failed) for the connection-status UI. */
export async function sendDeviceCommand(
  deviceId: string,
  method: string,
  params?: unknown
): Promise<CommandRoute> {
  const { recordCommand } = useConnectionStore.getState();
  const hub = getPhysicalDeviceByDeviceId(useHubsStore.getState().physicalDevices, deviceId);
  const preferred = hub?.preferredTransport ?? "auto";

  try {
    if (!runsInApp()) {
      // A browser has no Bluetooth link or serial port to use: everything goes through the server (MQTT).
      if (preferred === "ble" || preferred === "rs485") throw new Error(t("errors.notInBrowser"));
      await sendCommandOverMqtt(deviceId, method, params);
      recordCommand(deviceId, { route: "mqtt", ok: true, at: Date.now() });
      return "mqtt";
    }
    const route =
      preferred === "auto"
        ? await routeAuto(deviceId, hub?.serialPort, method, params)
        : await sendPinned(preferred, deviceId, hub?.serialPort, method, params);
    recordCommand(deviceId, { route, ok: true, at: Date.now() });
    return route;
  } catch (error) {
    recordCommand(deviceId, { route: null, ok: false, at: Date.now() });
    throw error;
  }
}
