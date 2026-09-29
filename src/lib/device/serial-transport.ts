// RS485: a cable connection to a smart-control device (currently: the "relay8" SmartSwitch module).
// Same command vocabulary and frame shape as BLE/MQTT — the firmware routes it through the same
// dispatchTopicPayload() — except the frame ends in '\n' because UART is a continuous stream, unlike a
// single BLE GATT write (docs, smart-control repo, "RS485 chi tiết").
//
// Two transports share this frame format:
//  - App (desktop only — no serial ports on mobile): the actual I/O happens in Rust
//    (src-tauri/src/serial_transport.rs), opened per command, one request/response round trip, then
//    closed — see that file for why. This module just builds the frame and invokes it.
//  - Browser (desktop Chrome/Edge only): Web Serial (lib/device/web-serial.ts), same framing, same
//    per-command open/close — see that file for the different, gesture-gated permission model.
//
// V1 firmware is a single, unaddressed slave per docs ("Chưa có addressing"): one port must be exactly
// one device. The user assigns that port to a specific hub by hand (hubs-store.ts's serialPort field) —
// nothing here can discover it automatically.
import { invoke } from "@tauri-apps/api/core";
import { runsInApp } from "@/lib/platform";
import { commandRequestTopic } from "@/lib/device/device-profile";
import { listGrantedPorts, requestNewPort, sendCommandOverWebSerial } from "@/lib/device/web-serial";

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
  const frame = `${topic}|${payload}`;

  if (!runsInApp()) {
    await sendCommandOverWebSerial(portName, frame, BAUD_RATE, RESPONSE_TIMEOUT_MS);
    return;
  }

  await invoke("serial_send_command", {
    portName,
    baud: BAUD_RATE,
    frame,
    timeoutMs: RESPONSE_TIMEOUT_MS,
  });
}

/** Ports available for the "assign a port" picker: every COM port in the app; only already-granted ones on the web. */
export function listSerialPorts(): Promise<string[]> {
  return runsInApp() ? invoke("list_serial_ports") : listGrantedPorts();
}

/**
 * "Rescan": in the app, that just means re-listing (the OS always shows every port). In the browser,
 * seeing a NEW port at all requires asking for it — this opens that native chooser, so call it directly
 * from a click handler (e.g. the transport picker's "Rescan" button).
 */
export async function requestSerialPortAccess(): Promise<string[]> {
  if (!runsInApp()) await requestNewPort();
  return listSerialPorts();
}
