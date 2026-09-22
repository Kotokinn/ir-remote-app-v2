// The Alarm device kind ("built-in alarm on this hub") is really a standalone firmware schedule:
// time + repeat days -> setSchedule with a single startAction that rings the buzzer
// (docs/MQTT_API.md "setAlarm" / "setSchedule" — the doc itself suggests using setAlarm this way).
// It does not go through the app's Scene/Schedule feature (Automation tab); this is its own,
// simpler, per-device sync, independent of that one.
import { toFirmwareDay, hubLabel } from "@/lib/device/schedule-sync";
import { sendDeviceCommand } from "@/lib/device/device-commands";
import type { Device } from "@/lib/mock-data";
import { getPhysicalDevice, useHubsStore } from "@/lib/store/hubs-store";

// Rings until manually stopped (STOP_ALARM_BUTTON on the hub, or setAlarm mode:OFF) or this many ms
// pass, whichever first — a wake-up alarm nobody dismisses must not ring forever.
const ALARM_RING_MS = 5 * 60 * 1000;

// Firmware schedule ids must be ≤ 23 chars (docs/MQTT_API.md "setSchedule"); "a" + a locally
// generated device id ("dev-<8-9 chars>-<5 chars>") stays well under that.
function alarmScheduleId(device: Device): string {
  return `a${device.id}`;
}

export type AlarmSyncResult = { ok: true } | { ok: false; message: string };

/** Pushes (or removes) this alarm's schedule on its hub to match the device's current fields. */
export async function syncAlarmToHub(device: Device): Promise<AlarmSyncResult> {
  const hub = getPhysicalDevice(useHubsStore.getState().physicalDevices, device.hubId);
  if (!hub?.deviceId) {
    return { ok: false, message: "This hub isn't paired over the network yet, so the alarm wasn't sent to it." };
  }

  const active = device.isOn && Boolean(device.alarmTime) && (device.alarmDays?.length ?? 0) > 0;
  try {
    if (active) {
      await sendDeviceCommand(hub.deviceId, "setSchedule", {
        id: alarmScheduleId(device),
        repeat: true,
        days: (device.alarmDays ?? []).map((day) => toFirmwareDay(Number(day))),
        startTime: device.alarmTime,
        startAction: [
          { method: "setAlarm", params: { mode: "WAKEUP", volume: 80, crescendo: true, durationMs: ALARM_RING_MS } },
        ],
      });
    } else {
      // Covers "turned off" and "never had valid time/days yet" alike: nothing should ring.
      await sendDeviceCommand(hub.deviceId, "deleteSchedule", { id: alarmScheduleId(device) });
    }
    return { ok: true };
  } catch (error) {
    console.error("[alarm] sync failed", error);
    return { ok: false, message: `Couldn't reach ${hubLabel(hub.deviceId)}. The alarm may not ring as set.` };
  }
}

/** Deletes this alarm's schedule from its hub. Best-effort — used when the alarm device itself is removed. */
export async function removeAlarmFromHub(device: Device): Promise<void> {
  const hub = getPhysicalDevice(useHubsStore.getState().physicalDevices, device.hubId);
  if (!hub?.deviceId) return;
  try {
    await sendDeviceCommand(hub.deviceId, "deleteSchedule", { id: alarmScheduleId(device) });
  } catch (error) {
    console.error("[alarm] couldn't remove schedule from hub", error);
  }
}
