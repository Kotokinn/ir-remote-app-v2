// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { useHubsStore } from "@/lib/store/hubs-store";
import { commandRequestTopic, profileForDeviceId } from "./device-profile";

beforeEach(() => {
  useHubsStore.setState({ physicalDevices: [] });
});

function registerHub(deviceId: string, productType: "hub-ir" | "relay8") {
  useHubsStore.setState({
    physicalDevices: [
      { id: "hub-1", name: "Hub", roomId: "all", productType, online: true, deviceId },
    ],
  });
}

describe("profileForDeviceId", () => {
  it("resolves a hub-ir device to SmartIrHub", () => {
    registerHub("8463616062EC", "hub-ir");
    expect(profileForDeviceId("8463616062EC")).toBe("SmartIrHub");
  });

  it("resolves a relay8 device to SmartSwitch — not the same profile as hub-ir", () => {
    registerHub("A1B2C3D4E5F6", "relay8");
    expect(profileForDeviceId("A1B2C3D4E5F6")).toBe("SmartSwitch");
  });

  it("throws instead of silently guessing when the deviceId matches no hub", () => {
    registerHub("A1B2C3D4E5F6", "relay8");
    expect(() => profileForDeviceId("SOME-OTHER-DEVICE")).toThrow(/no hub found/i);
  });
});

describe("commandRequestTopic", () => {
  it("addresses a relay8 device's own SmartSwitch topic, not SmartIrHub's", () => {
    registerHub("A1B2C3D4E5F6", "relay8");
    expect(commandRequestTopic("A1B2C3D4E5F6", "req-1")).toBe(
      "v1/tenants/tenant-001/devices/SmartSwitch/A1B2C3D4E5F6/commands/request/req-1"
    );
  });
});
