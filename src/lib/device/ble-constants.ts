// Shared between the native (Tauri/@mnlphlp/plugin-blec) and Web Bluetooth code paths — one hub
// characteristic, used for both write and notify (docs/MQTT_API.md "BLE chi tiết"). Split out to its
// own file so ble-provisioning.ts and web-bluetooth.ts can both import it without an import cycle
// (ble-provisioning re-exports these two for existing callers that import them from there).
export const HUB_SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
export const HUB_CHARACTERISTIC_UUID = "bd4fcc47-3393-40d5-966e-7d38db846eab";
