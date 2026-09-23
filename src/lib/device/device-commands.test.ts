// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendCommandOverMqtt = vi.hoisted(() => vi.fn());
const sendCommandOverBle = vi.hoisted(() => vi.fn());
const sendCommandOverSerial = vi.hoisted(() => vi.fn());
const mqttHealth = vi.hoisted(() => vi.fn((): "alive" | "silent" | "unknown" => "alive"));

vi.mock("@/lib/api/mqtt", () => ({ sendCommand: sendCommandOverMqtt }));
vi.mock("@/lib/device/ble-transport", () => ({ sendCommandOverBle }));
vi.mock("@/lib/device/serial-transport", () => ({ sendCommandOverSerial }));
vi.mock("@/lib/store/device-state-store", () => ({ mqttHealth }));

import { useConnectionStore } from "@/lib/store/connection-store";
import { useHubsStore, type PhysicalDevice } from "@/lib/store/hubs-store";
import { sendDeviceCommand } from "./device-commands";

const DEVICE_ID = "A1B2C3D4E5F6";

function registerHub(patch: Partial<PhysicalDevice> = {}) {
  useHubsStore.setState({
    physicalDevices: [
      {
        id: "hub-1",
        name: "Relay module",
        roomId: "all",
        productType: "relay8",
        online: true,
        deviceId: DEVICE_ID,
        ...patch,
      },
    ],
  });
}

beforeEach(() => {
  sendCommandOverMqtt.mockReset().mockResolvedValue(undefined);
  sendCommandOverBle.mockReset().mockResolvedValue(undefined);
  sendCommandOverSerial.mockReset().mockResolvedValue(undefined);
  mqttHealth.mockReset().mockReturnValue("alive");
  useHubsStore.setState({ physicalDevices: [] });
  useConnectionStore.setState({ lastCommand: {}, bleDeviceId: null });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("sendDeviceCommand: auto mode", () => {
  it("with no hub registered, falls back to the original MQTT-then-BLE behavior", async () => {
    mqttHealth.mockReturnValue("alive");

    const route = await sendDeviceCommand(DEVICE_ID, "getState");

    expect(route).toBe("mqtt");
    expect(sendCommandOverSerial).not.toHaveBeenCalled();
    expect(sendCommandOverBle).not.toHaveBeenCalled();
  });

  it("tries RS485 first when a port is assigned, and never touches MQTT/BLE if it succeeds", async () => {
    registerHub({ serialPort: "COM3" });

    const route = await sendDeviceCommand(DEVICE_ID, "setRelay", { relay: 1, state: true });

    expect(route).toBe("serial");
    expect(sendCommandOverSerial).toHaveBeenCalledWith("COM3", DEVICE_ID, "setRelay", { relay: 1, state: true });
    expect(sendCommandOverMqtt).not.toHaveBeenCalled();
    expect(sendCommandOverBle).not.toHaveBeenCalled();
  });

  it("falls back to the MQTT/BLE chain when RS485 fails (e.g. the cable was unplugged)", async () => {
    registerHub({ serialPort: "COM3" });
    sendCommandOverSerial.mockRejectedValue(new Error("port not found"));
    mqttHealth.mockReturnValue("alive");

    const route = await sendDeviceCommand(DEVICE_ID, "getState");

    expect(route).toBe("mqtt");
    expect(sendCommandOverMqtt).toHaveBeenCalledTimes(1);
  });

  it("with no port assigned, behaves exactly as before RS485 existed", async () => {
    registerHub(); // relay8 hub, but no serialPort
    mqttHealth.mockReturnValue("silent");

    const route = await sendDeviceCommand(DEVICE_ID, "getState");

    expect(route).toBe("ble");
    expect(sendCommandOverSerial).not.toHaveBeenCalled();
  });
});

describe("sendDeviceCommand: manual pin (hard, no fallback)", () => {
  it("pinned to rs485: uses only serial, even though MQTT/BLE would happily succeed", async () => {
    registerHub({ preferredTransport: "rs485", serialPort: "COM5" });

    const route = await sendDeviceCommand(DEVICE_ID, "getState");

    expect(route).toBe("serial");
    expect(sendCommandOverMqtt).not.toHaveBeenCalled();
    expect(sendCommandOverBle).not.toHaveBeenCalled();
  });

  it("pinned to rs485 with no port assigned: fails immediately, never opens a transport", async () => {
    registerHub({ preferredTransport: "rs485" });

    await expect(sendDeviceCommand(DEVICE_ID, "getState")).rejects.toThrow(/no com port/i);

    expect(sendCommandOverSerial).not.toHaveBeenCalled();
    expect(sendCommandOverMqtt).not.toHaveBeenCalled();
    expect(sendCommandOverBle).not.toHaveBeenCalled();
  });

  it("pinned to rs485 and the port fails: throws, does not silently fall back to MQTT/BLE", async () => {
    registerHub({ preferredTransport: "rs485", serialPort: "COM5" });
    sendCommandOverSerial.mockRejectedValue(new Error("port not found"));

    await expect(sendDeviceCommand(DEVICE_ID, "getState")).rejects.toThrow("port not found");

    expect(sendCommandOverMqtt).not.toHaveBeenCalled();
    expect(sendCommandOverBle).not.toHaveBeenCalled();
  });

  it("pinned to mqtt: never tries BLE even if MQTT fails", async () => {
    registerHub({ preferredTransport: "mqtt", serialPort: "COM5" });
    sendCommandOverMqtt.mockRejectedValue(new Error("broker down"));

    await expect(sendDeviceCommand(DEVICE_ID, "getState")).rejects.toThrow("broker down");

    expect(sendCommandOverBle).not.toHaveBeenCalled();
    expect(sendCommandOverSerial).not.toHaveBeenCalled();
  });

  it("pinned to ble: never tries MQTT or RS485", async () => {
    registerHub({ preferredTransport: "ble", serialPort: "COM5" });

    const route = await sendDeviceCommand(DEVICE_ID, "getState");

    expect(route).toBe("ble");
    expect(sendCommandOverMqtt).not.toHaveBeenCalled();
    expect(sendCommandOverSerial).not.toHaveBeenCalled();
  });
});

describe("sendDeviceCommand: recordCommand outcome", () => {
  it("records the route on success", async () => {
    registerHub({ serialPort: "COM3" });

    await sendDeviceCommand(DEVICE_ID, "getState");

    expect(useConnectionStore.getState().lastCommand[DEVICE_ID]).toMatchObject({ route: "serial", ok: true });
  });

  it("records a null route on total failure", async () => {
    registerHub({ preferredTransport: "ble" });
    sendCommandOverBle.mockRejectedValue(new Error("out of range"));

    await expect(sendDeviceCommand(DEVICE_ID, "getState")).rejects.toThrow();

    expect(useConnectionStore.getState().lastCommand[DEVICE_ID]).toMatchObject({ route: null, ok: false });
  });
});
