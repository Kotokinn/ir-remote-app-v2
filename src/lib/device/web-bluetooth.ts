// Web Bluetooth — the browser build's BLE path. Same GATT service/characteristic and frame format as
// the native app (see ble-provisioning.ts's header comment), but a different permission model:
//
//  - Scanning: there is no "list of nearby devices with RSSI" API in stable Web Bluetooth. Picking a
//    device is a single browser-native chooser dialog (navigator.bluetooth.requestDevice), and — like
//    any powerful-feature prompt — it only opens from inside a direct user gesture (a click handler),
//    never from an effect or after an earlier `await`. requestHub() below is only ever safe to call
//    right at the top of a click handler.
//  - Reconnecting: once a device has been granted (via requestHub(), or still remembered from an
//    earlier grant — see rememberedHubs()), connecting to it AGAIN (device.gatt.connect()) needs no
//    further gesture. That's what makes ble-transport.ts's "send a command whenever" possible at all;
//    a device this page was never granted, or has forgotten, cannot be reached without the user
//    picking it again in a chooser.
//  - Support: Chrome/Edge desktop and Android only. No Firefox, no Safari/iOS. Check
//    isWebBluetoothSupported() before offering this path in the UI.
import { HUB_CHARACTERISTIC_UUID, HUB_SERVICE_UUID } from "@/lib/device/ble-constants";
import { t } from "@/lib/i18n";

export function isWebBluetoothSupported(): boolean {
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

/** Devices granted in this page session, by the name the hub advertises (== its deviceId once paired). */
const knownDevices = new Map<string, BluetoothDevice>();
let current: { device: BluetoothDevice; characteristic: BluetoothRemoteGATTCharacteristic } | null = null;
let notifyHandler: ((data: string) => void) | null = null;

function remember(device: BluetoothDevice): { address: string; name: string } {
  const name = device.name ?? device.id;
  knownDevices.set(name, device);
  return { address: device.id, name };
}

/** Opens the browser's own device chooser, filtered to hubs. Call this directly from a click handler. */
export async function requestHub(): Promise<{ address: string; name: string }> {
  if (!isWebBluetoothSupported()) throw new Error(t("errors.webBluetoothUnsupported"));
  const device = await navigator.bluetooth.requestDevice({
    filters: [{ services: [HUB_SERVICE_UUID] }],
    optionalServices: [HUB_SERVICE_UUID],
  });
  return remember(device);
}

/**
 * Devices already granted in an earlier page load, if this browser remembers them across reloads
 * (Chrome's getDevices() — not on every browser that otherwise supports Web Bluetooth; feature-detected).
 */
export async function rememberedHubs(): Promise<Array<{ address: string; name: string }>> {
  if (!isWebBluetoothSupported()) return [];
  // @types/web-bluetooth declares getDevices() as always present, but real support for it lags behind
  // Web Bluetooth itself — go through `unknown` so the optional check below isn't "impossible" to TS.
  const bluetooth = navigator.bluetooth as unknown as { getDevices?: () => Promise<BluetoothDevice[]> };
  if (!bluetooth.getDevices) return [];
  const devices = await bluetooth.getDevices();
  return devices.map(remember);
}

async function resolveDevice(nameOrAddress: string): Promise<BluetoothDevice> {
  const known = knownDevices.get(nameOrAddress);
  if (known) return known;
  // Not granted this page load (e.g. a reload) — see if the browser still remembers it from before.
  await rememberedHubs();
  const remembered = knownDevices.get(nameOrAddress) ?? [...knownDevices.values()].find((d) => d.id === nameOrAddress);
  if (remembered) return remembered;
  throw new Error(t("errors.webBluetoothNotGranted", { name: nameOrAddress }));
}

function onCharacteristicValueChanged(event: Event): void {
  const target = event.target as BluetoothRemoteGATTCharacteristic;
  if (target.value && notifyHandler) notifyHandler(new TextDecoder().decode(target.value));
}

/** `nameOrAddress` is whatever requestHub()/rememberedHubs() gave back — a hub's advertised name, or its address. */
export async function connect(nameOrAddress: string, onDisconnect?: () => void): Promise<void> {
  const device = await resolveDevice(nameOrAddress);
  if (current?.device === device && device.gatt?.connected) return;
  if (current) disconnect();

  if (!device.gatt) throw new Error(t("errors.webBluetoothNotConnected"));
  const server = await device.gatt.connect();
  const service = await server.getPrimaryService(HUB_SERVICE_UUID);
  const characteristic = await service.getCharacteristic(HUB_CHARACTERISTIC_UUID);
  current = { device, characteristic };

  if (onDisconnect) device.addEventListener("gattserverdisconnected", onDisconnect, { once: true });
}

export function disconnect(): void {
  current?.device.gatt?.disconnect();
  current = null;
}

export async function writeString(data: string): Promise<void> {
  if (!current) throw new Error(t("errors.webBluetoothNotConnected"));
  await current.characteristic.writeValueWithoutResponse(new TextEncoder().encode(data));
}

export async function subscribeString(handler: (data: string) => void): Promise<void> {
  if (!current) throw new Error(t("errors.webBluetoothNotConnected"));
  notifyHandler = handler;
  current.characteristic.addEventListener("characteristicvaluechanged", onCharacteristicValueChanged);
  await current.characteristic.startNotifications();
}

export async function unsubscribeString(): Promise<void> {
  if (!current) return;
  current.characteristic.removeEventListener("characteristicvaluechanged", onCharacteristicValueChanged);
  await current.characteristic.stopNotifications().catch(() => undefined);
  notifyHandler = null;
}
