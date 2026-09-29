// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  connect,
  disconnect,
  isWebBluetoothSupported,
  rememberedHubs,
  requestHub,
  subscribeString,
  unsubscribeString,
  writeString,
} from "./web-bluetooth";

/** A minimal fake BluetoothDevice/GATT stack — just enough surface for the module under test. */
function fakeDevice(id: string, name: string) {
  const characteristic = {
    writeValueWithoutResponse: vi.fn(async () => undefined),
    startNotifications: vi.fn(async () => undefined),
    stopNotifications: vi.fn(async () => undefined),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    value: undefined as DataView | undefined,
  };
  const service = { getCharacteristic: vi.fn(async () => characteristic) };
  const server = {
    connected: false,
    connect: vi.fn(async function (this: { connected: boolean }) {
      this.connected = true;
      device.gatt.connected = true;
      return server;
    }),
    getPrimaryService: vi.fn(async () => service),
  };
  const listeners = new Map<string, () => void>();
  const device = {
    id,
    name,
    gatt: {
      connected: false,
      connect: server.connect,
      getPrimaryService: server.getPrimaryService,
      disconnect: vi.fn(() => {
        device.gatt.connected = false;
      }),
    },
    addEventListener: vi.fn((event: string, handler: () => void) => {
      listeners.set(event, handler);
    }),
    removeEventListener: vi.fn(),
    // test helpers
    _characteristic: characteristic,
    _fireDisconnect: () => {
      device.gatt.connected = false;
      listeners.get("gattserverdisconnected")?.();
    },
  };
  return device;
}

/** The fake above only implements the slice of BluetoothDevice this module actually uses — cast it once
 * here rather than fully typing out every field real BluetoothDevice also has. */
function stubRequestedDevice(device: ReturnType<typeof fakeDevice>): void {
  navigator.bluetooth.requestDevice = vi.fn(async () => device as unknown as BluetoothDevice);
}

function stubRememberedDevices(...devices: Array<ReturnType<typeof fakeDevice>>): void {
  (navigator.bluetooth as unknown as { getDevices: () => Promise<BluetoothDevice[]> }).getDevices = vi.fn(
    async () => devices as unknown as BluetoothDevice[]
  );
}

beforeEach(() => {
  vi.stubGlobal("navigator", { bluetooth: { requestDevice: vi.fn() } });
});

afterEach(() => {
  disconnect();
  vi.unstubAllGlobals();
});

describe("isWebBluetoothSupported", () => {
  it("is true only when navigator.bluetooth exists", () => {
    expect(isWebBluetoothSupported()).toBe(true);
    vi.stubGlobal("navigator", {});
    expect(isWebBluetoothSupported()).toBe(false);
  });
});

describe("requestHub / connect", () => {
  it("opens the chooser, then connects to exactly the device it returned", async () => {
    const device = fakeDevice("addr-1", "AABBCCDDEEFF");
    stubRequestedDevice(device);

    const hub = await requestHub();
    expect(hub).toEqual({ address: "addr-1", name: "AABBCCDDEEFF" });

    await connect("AABBCCDDEEFF");
    expect(device.gatt.connect).toHaveBeenCalledTimes(1);

    await writeString("topic|{}");
    expect(device._characteristic.writeValueWithoutResponse).toHaveBeenCalledTimes(1);
  });

  it("reconnecting to the same already-connected device is a no-op (no second connect() call)", async () => {
    const device = fakeDevice("addr-1", "hub-a");
    stubRequestedDevice(device);
    await requestHub();

    await connect("hub-a");
    await connect("hub-a");

    expect(device.gatt.connect).toHaveBeenCalledTimes(1);
  });

  it("rejects with a clear error for a device this page was never granted", async () => {
    await expect(connect("never-seen")).rejects.toThrow(/never-seen/);
  });

  it("runs onDisconnect when the device reports gattserverdisconnected", async () => {
    const device = fakeDevice("addr-1", "hub-a");
    stubRequestedDevice(device);
    await requestHub();
    const onDisconnect = vi.fn();

    await connect("hub-a", onDisconnect);
    device._fireDisconnect();

    expect(onDisconnect).toHaveBeenCalledTimes(1);
  });
});

describe("writeString / subscribeString / unsubscribeString", () => {
  it("reject when nothing is connected", async () => {
    await expect(writeString("x")).rejects.toThrow(/not connected/i);
    await expect(subscribeString(() => undefined)).rejects.toThrow(/not connected/i);
  });

  it("delivers notifications on the connected characteristic to the subscribed handler", async () => {
    const device = fakeDevice("addr-1", "hub-a");
    stubRequestedDevice(device);
    await requestHub();
    await connect("hub-a");

    const frames: string[] = [];
    await subscribeString((data) => {
      frames.push(data);
    });
    expect(device._characteristic.startNotifications).toHaveBeenCalledTimes(1);

    // Simulate the browser firing the DOM event the real characteristic would.
    const handler = device._characteristic.addEventListener.mock.calls[0][1] as (event: Event) => void;
    const value = new TextEncoder().encode("init|{\"success\":true}");
    handler({ target: { value: new DataView(value.buffer) } } as unknown as Event);

    expect(frames).toEqual(['init|{"success":true}']);

    await unsubscribeString();
    expect(device._characteristic.stopNotifications).toHaveBeenCalledTimes(1);
  });
});

describe("rememberedHubs", () => {
  it("returns nothing when the browser doesn't implement getDevices()", async () => {
    expect(await rememberedHubs()).toEqual([]);
  });

  it("returns what getDevices() reports, when it exists", async () => {
    const device = fakeDevice("addr-2", "hub-b");
    stubRememberedDevices(device);

    expect(await rememberedHubs()).toEqual([{ address: "addr-2", name: "hub-b" }]);
  });
});
