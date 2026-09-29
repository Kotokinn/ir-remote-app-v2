// Real BLE pairing per docs/MQTT_API.md "BLE chi tiết": one characteristic used for both
// write and notify, frame format `<topic>|<payload_json>` as plain UTF-8 text. The device's
// advertised name IS its real deviceId (12 hex from eFuse MAC) — that's how we learn the
// deviceId to hand off to mqtt-service's claim flow afterward.
import { t } from "@/lib/i18n";
import { connect, disconnect, getScanningUpdates, listServices, sendString, startScan, subscribeString, unsubscribe } from "@mnlphlp/plugin-blec";
import { HUB_CHARACTERISTIC_UUID, HUB_SERVICE_UUID } from "@/lib/device/ble-constants";
import { runsInApp } from "@/lib/platform";
import {
  connect as webConnect,
  disconnect as webDisconnect,
  requestHub,
  subscribeString as webSubscribeString,
  unsubscribeString as webUnsubscribeString,
  writeString as webWriteString,
} from "@/lib/device/web-bluetooth";

export { HUB_SERVICE_UUID, HUB_CHARACTERISTIC_UUID } from "@/lib/device/ble-constants";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * tauri-plugin-blec rejects `invoke()` with plain strings/objects (btleplug error text), not
 * `Error` instances — so `error instanceof Error ? error.message : fallback` throws the real
 * cause away. Use this instead wherever a BLE call's failure is shown to the user.
 */
export function describeBleError(error: unknown, fallback: string): string {
  console.error("[ble] error:", error);
  if (error instanceof Error) return error.message || fallback;
  if (typeof error === "string") return error || fallback;
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
    try {
      return JSON.stringify(error);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

export interface ScannedHub {
  address: string;
  /** Also the device's real deviceId once connected — see docs/MQTT_API.md "Định danh thiết bị". */
  name: string;
  rssi: number;
}

/**
 * In a browser, "scanning" is a single native chooser dialog (Web Bluetooth has no API for a live list
 * of nearby devices with RSSI) — it must be called directly from a click handler (see
 * components/home/add-device/ble-provisioning.tsx's web branch), and resolves with exactly one device,
 * already chosen by the user.
 */
export async function scanForHubs(timeoutMs: number): Promise<ScannedHub[]> {
  if (!runsInApp()) {
    const hub = await requestHub();
    return [{ ...hub, rssi: 0 }];
  }

  const found = new Map<string, ScannedHub>();

  // startScan's own `timeout` already stops the scan internally — calling stopScan() again
  // ourselves once that elapses races the plugin's own stop on Windows and throws btleplug
  // HRESULT 0x80004004 ("Operation aborted"). Instead, wait for the real "scanning stopped"
  // signal (getScanningUpdates) rather than guessing with a timer — the WinRT BLE watcher
  // needs to actually finish tearing down before a connect() right after won't itself throw
  // the same E_ABORT.
  const stopped = new Promise<void>((resolve) => {
    getScanningUpdates((scanning) => {
      if (!scanning) resolve();
    }).catch(() => {
      resolve();
    });
  });

  await startScan((devices) => {
    for (const device of devices) {
      if (!device.services.some((uuid) => uuid.toLowerCase() === HUB_SERVICE_UUID.toLowerCase())) continue;
      found.set(device.address, { address: device.address, name: device.name, rssi: device.rssi });
    }
  }, timeoutMs);

  await stopped;
  // Small settle buffer: Windows' BLE watcher teardown isn't always instantaneous even after
  // the "stopped" event fires, and connecting immediately after can still hit E_ABORT.
  await sleep(300);
  return Array.from(found.values());
}

export async function connectToHub(address: string, onDisconnect?: () => void): Promise<void> {
  if (!runsInApp()) {
    await webConnect(address, onDisconnect);
    return;
  }

  // btleplug's Windows (WinRT) backend can throw a transient E_ABORT ("Operation aborted")
  // on the first connect attempt right after a scan, even with the settle buffer above —
  // documented flakiness in the underlying WinRT Bluetooth APIs. One retry clears it in
  // practice; if it still fails the second time, surface the real error.
  try {
    await connect(address, onDisconnect ?? null);
  } catch (error) {
    console.warn("[ble] connect failed, retrying once", error);
    await sleep(500);
    await connect(address, onDisconnect ?? null);
  }

  // Force GATT service/characteristic discovery to fully resolve before any subscribe/write —
  // without this, the very first GATT operation right after connect (our subscribe in
  // provisionWifi) can itself throw E_ABORT because the service database isn't cached yet.
  // (listServices resolves to an error string rather than throwing on failure.)
  const services = await listServices(address);
  if (typeof services === "string") {
    throw new Error(t("errors.bleServices", { services }));
  }
  await sleep(200);
}

export async function disconnectFromHub(): Promise<void> {
  if (!runsInApp()) {
    await webUnsubscribeString().catch(() => undefined);
    webDisconnect();
    return;
  }
  await unsubscribe(HUB_CHARACTERISTIC_UUID).catch(() => undefined);
  await disconnect();
}

export interface InitAck {
  success: boolean;
  message: string;
}

export interface ProvisionResult {
  /** True only if the device's `init|{...}` ACK notification actually reached the app. */
  acked: boolean;
  ack?: InitAck;
}

/**
 * Sends `init|{ssid,ssid_pass,time_zone}` (docs/MQTT_API.md section 8) and waits for the
 * device's reply frame on the same characteristic.
 *
 * The firmware first tests the credentials by actually joining the WiFi (up to ~20s), then
 * replies `init|{"success":bool,"message":...}`:
 *  - success:true  → credentials saved, device reboots (~3s later) onto that network.
 *  - success:false → wrong SSID/password (or similar); nothing is saved, the device does NOT
 *                    reboot and the BLE link stays open, so the caller can just retry.
 * The wait therefore has to cover the device's WiFi test, hence the long default timeout.
 *
 * If no reply arrives at all (`acked: false`), it is not thrown: the caller falls back to the
 * claim step, which only succeeds once the device is really online on the new network. Real
 * GATT failures (subscribe/write) still reject.
 */
/** The init|{...} ACK-waiting protocol shared by both transports — only how a frame is subscribed/sent differs. */
async function raceForAck(
  ackTimeoutMs: number,
  subscribe: (onFrame: (data: string) => void) => Promise<void>,
  send: (frame: string) => Promise<void>,
  unsub: () => Promise<void>,
  frame: string
): Promise<ProvisionResult> {
  const receivedFrames: string[] = [];
  let resolveAck: (ack: InitAck) => void = () => undefined;
  const ackPromise = new Promise<InitAck>((resolve) => {
    resolveAck = resolve;
  });

  await subscribe((data) => {
    console.info("[ble] notification frame:", data);
    receivedFrames.push(data);
    const separatorIndex = data.indexOf("|");
    if (separatorIndex < 0 || data.slice(0, separatorIndex) !== "init") return;
    try {
      resolveAck(JSON.parse(data.slice(separatorIndex + 1)) as InitAck);
    } catch {
      console.warn("[ble] malformed init ACK frame:", data);
    }
  });

  await send(frame);

  const ack = await Promise.race([ackPromise, sleep(ackTimeoutMs).then(() => undefined)]);
  // The device reboots right after acking, so the link may already be gone — ignore failures.
  unsub().catch(() => undefined);

  if (!ack) {
    console.warn(
      `[ble] no init ACK within ${ackTimeoutMs}ms (received ${receivedFrames.length} notification frame(s)); ` +
        "continuing — the claim step is the real success signal"
    );
    return { acked: false };
  }
  return { acked: true, ack };
}

export async function provisionWifi(
  ssid: string,
  ssidPassword: string,
  timeZone: string,
  // The device now test-connects to the WiFi (up to WIFI_CONNECT_TIMEOUT_MS = 20s) BEFORE it
  // replies, so the ACK legitimately takes that long on a wrong password.
  ackTimeoutMs = 30000
): Promise<ProvisionResult> {
  const payload = JSON.stringify({ ssid, ssid_pass: ssidPassword, time_zone: timeZone });
  const frame = `init|${payload}`;

  if (!runsInApp()) {
    return raceForAck(
      ackTimeoutMs,
      (onFrame) => webSubscribeString(onFrame),
      (f) => webWriteString(f),
      () => webUnsubscribeString(),
      frame
    );
  }

  return raceForAck(
    ackTimeoutMs,
    async (onFrame) => {
      // WinRT GATT can't have a subscribe (CCCD write) and a characteristic write in flight at the
      // same time on the same characteristic — subscribe must fully complete before the write.
      await subscribeString(HUB_CHARACTERISTIC_UUID, HUB_SERVICE_UUID, onFrame);
      // Even after the subscribe promise resolves WinRT can still be finishing the CCCD write.
      await sleep(200);
    },
    // withoutResponse: WinRT's write-with-response completion path threw E_ABORT even though the
    // device received the full payload; the characteristic also advertises WRITE_NR.
    (f) => sendString(HUB_CHARACTERISTIC_UUID, f, "withoutResponse", HUB_SERVICE_UUID),
    () => unsubscribe(HUB_CHARACTERISTIC_UUID),
    frame
  );
}
