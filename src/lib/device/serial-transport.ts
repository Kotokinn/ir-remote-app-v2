// RS485 (desktop only): a cable connection to a smart-control device (currently: the "relay8"
// SmartSwitch module). Same command vocabulary and frame shape as BLE/MQTT — the firmware routes
// it through the same dispatchTopicPayload() — except the frame ends in '\n' because UART is a
// continuous stream, unlike a single BLE GATT write (docs, smart-control repo, "RS485 chi tiết").
//
// The actual serial I/O happens in Rust (src-tauri/src/serial_transport.rs): opened per command,
// one request/response round trip, then closed — see that file for why. This module only builds
// the frame and invokes it.
//
// V1 firmware is a single, unaddressed slave per docs ("Chưa có addressing"): one COM port must be
// exactly one device. The user assigns that port to a specific hub by hand (hubs-store.ts's
// serialPort field) — nothing here can discover it automatically.
import { invoke } from "@tauri-apps/api/core";
import { commandRequestTopic } from "@/lib/device/device-profile";

// Fixed by the firmware (Serial2.begin(baud, SERIAL_8N1, ...)), not user-configurable.
const BAUD_RATE = 9600;
const RESPONSE_TIMEOUT_MS = 3000;

function newRequestId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export async function sendCommandOverSerial(
  portName: string,
  deviceId: string,
  method: string,
  params?: unknown
): Promise<void> {
  const topic = commandRequestTopic(deviceId, newRequestId());
  const payload = JSON.stringify({ method, params });
  await invoke("serial_send_command", {
    portName,
    baud: BAUD_RATE,
    frame: `${topic}|${payload}`,
    timeoutMs: RESPONSE_TIMEOUT_MS,
  });
}

/** COM ports the OS currently sees, for the "assign a port" picker in settings. */
export function listSerialPorts(): Promise<string[]> {
  return invoke("list_serial_ports");
}
