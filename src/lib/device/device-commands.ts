// Single entry point for sending a command to a device: picks MQTT (via mqtt-service) or BLE.
// UI code calls sendDeviceCommand(deviceId, method, params) and never cares which path is used.
import { sendCommand as sendCommandOverMqtt } from "@/lib/api/mqtt";
import { sendCommandOverBle } from "@/lib/device/ble-transport";
import { useConnectionStore, type CommandRoute } from "@/lib/store/connection-store";
import { mqttHealth } from "@/lib/store/device-state-store";

/**
 * MQTT is preferred. The REST call to mqtt-service returns 200 as soon as it *publishes*, even
 * if the broker or the device is unreachable, so a successful response proves nothing about
 * delivery — the real signal is the SSE stream's health: the device's presence (`state` topic,
 * retained + LWT), the server's broker link, and the server's ping (see mqttHealthOf). Telemetry
 * cadence is irrelevant here (it can be minutes apart).
 *
 *  - health "alive"/"unknown" → MQTT first; BLE only if the REST call itself fails.
 *  - health "silent"          → BLE first; MQTT as last resort if the device isn't in BLE range.
 */
async function routeCommand(
  deviceId: string,
  method: string,
  params?: Record<string, unknown>
): Promise<CommandRoute> {
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
  params?: Record<string, unknown>
): Promise<CommandRoute> {
  const { recordCommand } = useConnectionStore.getState();
  try {
    const route = await routeCommand(deviceId, method, params);
    recordCommand(deviceId, { route, ok: true, at: Date.now() });
    return route;
  } catch (error) {
    recordCommand(deviceId, { route: null, ok: false, at: Date.now() });
    throw error;
  }
}
