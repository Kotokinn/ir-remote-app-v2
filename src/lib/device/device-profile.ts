// Every direct-to-device transport (BLE, RS485) builds its own topic string client-side, and it
// MUST use the same DEVICE_PROFILE the device itself built its COMMAND_PREFIX from
// (buildTopics() in main.cpp, both hub-ir and smart-control firmware). Get the profile wrong and
// the device's own strncmp(topic, COMMAND_PREFIX, ...) check silently drops the frame
// ("[DISPATCH] Unsupported topic") — nothing on the wire looks broken, the command just vanishes.
import { getPhysicalDeviceByDeviceId, useHubsStore, type PhysicalProductType } from "@/lib/store/hubs-store";

export const TENANT_ID = "tenant-001";

const PROFILE_BY_PRODUCT: Record<PhysicalProductType, string> = {
  "hub-ir": "SmartIrHub",
  "relay8": "SmartSwitch",
};

/**
 * Throws rather than guessing: a deviceId with no matching hub means something upstream is wrong
 * (removed hub, stale reference, a future refactor that stopped resolving deviceId through
 * hubs-store). Silently defaulting to one profile would misdirect the frame to a device kind it
 * was never meant for and get it dropped without any error — exactly the bug this file exists to
 * prevent, just moved from "wrong on purpose" to "wrong by accident".
 */
export function profileForDeviceId(deviceId: string): string {
  const hub = getPhysicalDeviceByDeviceId(useHubsStore.getState().physicalDevices, deviceId);
  if (!hub) {
    throw new Error(`No hub found for deviceId ${deviceId} — can't tell which firmware profile to address.`);
  }
  return PROFILE_BY_PRODUCT[hub.productType];
}

/** The exact frame prefix a device-direct transport (BLE/RS485) sends a command to. */
export function commandRequestTopic(deviceId: string, requestId: string): string {
  return `v1/tenants/${TENANT_ID}/devices/${profileForDeviceId(deviceId)}/${deviceId}/commands/request/${requestId}`;
}
