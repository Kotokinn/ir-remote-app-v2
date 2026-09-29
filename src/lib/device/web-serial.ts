// Web Serial — the browser build's RS485 path. Same frame shape as the native app (see
// serial-transport.ts's header comment: "<topic>|<payload_json>\n" at 9600 8N1, one request/response
// round trip), but a different permission model:
//
//  - Unlike Rust's serialport::available_ports() (sees every COM port on the machine freely), a
//    browser can only ever see ports it has been explicitly granted for this origin
//    (navigator.serial.getPorts()). Granting a NEW port always opens the browser's own chooser
//    (navigator.serial.requestPort()), which — like any powerful-feature prompt — only works from
//    inside a direct user gesture (a click handler).
//  - Once granted, though, a port stays usable with NO further gesture, forever (until the user revokes
//    it in the browser's site settings) — getPorts() and port.open() both work silently. That makes
//    RS485 command-sending on the web fully automatic after the one-time grant, unlike Web Bluetooth's
//    reconnect story.
//  - A granted SerialPort object has no stable string name the way Rust's "COM3" is one. What IS stable
//    across reloads for a given physical USB-serial adapter is its USB vendor/product id
//    (port.getInfo()) — formatted below as this port's id, which doubles as its label since Web Serial
//    exposes nothing more descriptive (no product name string). hubs-store's `serialPort` field is
//    already a plain, opaque, local-only string, so nothing about the store schema changes.
//  - Support: Chrome/Edge desktop only. No Android, no Firefox, no Safari. Check
//    isWebSerialSupported() before offering this path in the UI.
import { t } from "@/lib/i18n";

export function isWebSerialSupported(): boolean {
  return typeof navigator !== "undefined" && "serial" in navigator;
}

const portsById = new Map<string, SerialPort>();

function idFor(port: SerialPort, fallbackIndex: number): string {
  const { usbVendorId, usbProductId } = port.getInfo();
  if (usbVendorId === undefined || usbProductId === undefined) {
    // Not a USB-serial adapter (rare) — nothing stable to key it by.
    return `Port ${fallbackIndex + 1}`;
  }
  const hex = (n: number) => n.toString(16).padStart(4, "0");
  return `USB ${hex(usbVendorId)}:${hex(usbProductId)}`;
}

async function refresh(): Promise<void> {
  portsById.clear();
  const ports = await navigator.serial.getPorts();
  ports.forEach((port, index) => {
    portsById.set(idFor(port, index), port);
  });
}

/** Already-granted ports — what the app can use without asking again. Empty until requestNewPort() has granted at least one. */
export async function listGrantedPorts(): Promise<string[]> {
  if (!isWebSerialSupported()) return [];
  await refresh();
  return Array.from(portsById.keys());
}

/** Opens the browser's native port chooser. Call this directly from a click handler (e.g. "Rescan"). */
export async function requestNewPort(): Promise<string> {
  if (!isWebSerialSupported()) throw new Error(t("errors.webSerialUnsupported"));
  const port = await navigator.serial.requestPort();
  await refresh();
  for (const [id, granted] of portsById) {
    if (granted === port) return id;
  }
  return idFor(port, portsById.size); // shouldn't happen — refresh() just listed it — but don't crash if it does
}

async function getPort(id: string): Promise<SerialPort> {
  if (!portsById.has(id)) await refresh();
  const port = portsById.get(id);
  if (!port) throw new Error(t("errors.serialPortGone", { id }));
  return port;
}

/** Reads up to the first '\n', cancelling the read (not just abandoning it) on timeout so the reader can be released cleanly. */
async function readLine(port: SerialPort, timeoutMs: number): Promise<string> {
  if (!port.readable) throw new Error(t("errors.serialNoResponse", { timeoutMs }));
  const reader = port.readable.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const timer = setTimeout(() => {
    reader.cancel(new Error("timeout")).catch(() => undefined);
  }, timeoutMs);
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) throw new Error(t("errors.serialNoResponse", { timeoutMs }));
      buffer += decoder.decode(value, { stream: true });
      const newline = buffer.indexOf("\n");
      if (newline !== -1) return buffer.slice(0, newline).replace(/\r$/, "");
    }
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}

/** One request/response round trip: open (if not already), write the frame + '\n', read one line, close if we opened it. */
export async function sendCommandOverWebSerial(
  portId: string,
  frame: string,
  baudRate: number,
  timeoutMs: number
): Promise<string> {
  const port = await getPort(portId);
  const openedHere = !port.readable;
  if (openedHere) {
    await port.open({ baudRate }).catch((error: unknown) => {
      throw new Error(t("errors.serialOpenFailed", { port: portId, error: error instanceof Error ? error.message : String(error) }));
    });
  }
  // A port that failed to open above never gets here (the .catch rethrew), so writable/readable exist.
  try {
    const writer = port.writable!.getWriter();
    try {
      await writer.write(new TextEncoder().encode(frame + "\n"));
    } finally {
      writer.releaseLock();
    }
    return await readLine(port, timeoutMs);
  } finally {
    if (openedHere) await port.close().catch(() => undefined);
  }
}
