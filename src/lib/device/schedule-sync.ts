// Pushes app schedules (scene + start/end time + weekdays) down to the hubs so they run ON the
// device — even with the app closed or the network down (docs/MQTT_API.md "setSchedule" /
// "deleteSchedule"). The backend only stores schedules; nothing else executes them.
//
// Rules of the translation:
//  - Each hub gets its own copy containing only the scene actions for devices behind that hub.
//  - startAction = the scene's devices set to their scene values.
//  - endAction (only when the schedule has an end time) = "revert": every device the scene turned
//    ON is turned OFF again. Devices the scene leaves off are not touched.
//  - Only AC (sendAc) and RGB (setRgbColor/setRgbMode) map to real firmware commands today;
//    light/toggle devices have no firmware method yet, so they are skipped.
//  - The firmware identifies a schedule by id (`s<appId>`), so re-sending overwrites and
//    deleteSchedule removes exactly that one.
import { t } from "@/lib/i18n";
import { buildRgbCommands, buildSendAcCommand } from "@/lib/device/commands";
import { sendDeviceCommand } from "@/lib/device/device-commands";
import { SHADE_COLORS, type Device, type Scene, type SceneAction, type Schedule } from "@/lib/mock-data";
import { useDevicesStore } from "@/lib/store/devices-store";
import { getPhysicalDevice, useHubsStore } from "@/lib/store/hubs-store";

// Firmware limit per side (MAX_SCHEDULE_ACTIONS); more would be dropped by the device anyway.
const MAX_ACTIONS_PER_SIDE = 6;

interface FirmwareAction {
  method: string;
  params: Record<string, unknown>;
}

interface FirmwareSchedule {
  id: string;
  repeat: true;
  days: number[];
  startTime: string;
  startAction: FirmwareAction[];
  endTime?: string;
  endAction?: FirmwareAction[];
}

// The firmware keeps schedule ids in a 24-byte buffer (SCHEDULE_ID_SIZE), so a UUID doesn't fit. The id
// the hub sees is derived from the app's id and must never change for a given schedule (re-sending
// overwrites, deleteSchedule removes exactly that one): "s" + the UUID's first 12 hex digits — or, for a
// schedule that predates client ids ("legacy-12"), the "s12" it has always had on the hubs.
export function firmwareScheduleId(scheduleId: string): string {
  const legacy = /^legacy-(\d+)$/.exec(scheduleId);
  if (legacy) return `s${legacy[1]}`;
  return `s${scheduleId.replace(/-/g, "").slice(0, 12)}`;
}

function firmwareId(schedule: Schedule): string {
  return firmwareScheduleId(schedule.id);
}

// The app's weekday index is 0=Monday..6=Sunday (schedule page); firmware uses 0=Sunday..6=Saturday.
export function toFirmwareDay(appDay: number): number {
  return (appDay + 1) % 7;
}

function actionsFor(device: Device, patch: SceneAction["patch"], revert: boolean): FirmwareAction[] {
  const state = { ...device, ...patch };
  if (revert && !state.isOn) return [];
  const isOn = revert ? false : state.isOn;

  if (device.kind === "ac" && device.brand) {
    const command = buildSendAcCommand(device.brand, {
      isOn,
      acMode: state.acMode ?? "cool",
      targetTemp: state.targetTemp ?? 24,
      fanSpeed: state.fanSpeed ?? "auto",
      swing: state.swing ?? "auto",
    });
    return [{ method: command.method, params: { ...command.params } }];
  }

  if (device.kind === "rgb") {
    return buildRgbCommands({
      isOn,
      intensity: state.intensity ?? 70,
      color: state.color ?? SHADE_COLORS[0],
      effect: state.effect ?? "solid",
      effectSpeed: state.effectSpeed ?? 50,
    });
  }

  return [];
}

/** Real device ids (eFuse MAC) of every paired hub behind the scene's devices. */
export function hubDeviceIdsForScene(scene: Scene | undefined): Set<string> {
  const { devices } = useDevicesStore.getState();
  const { physicalDevices } = useHubsStore.getState();
  const ids = new Set<string>();

  if (!scene) {
    // Scene is gone (deleted): we can't know where the schedule was pushed, so target every paired hub.
    for (const hub of physicalDevices) {
      if (hub.deviceId) ids.add(hub.deviceId);
    }
    return ids;
  }

  for (const action of scene.actions) {
    const device = devices.find((d) => d.id === action.deviceId);
    const hub = getPhysicalDevice(physicalDevices, device?.hubId);
    if (hub?.deviceId) ids.add(hub.deviceId);
  }
  return ids;
}

function buildHubSchedules(schedule: Schedule, scene: Scene): Map<string, FirmwareSchedule> {
  const { devices } = useDevicesStore.getState();
  const { physicalDevices } = useHubsStore.getState();
  const withEnd = schedule.hasEnd && Boolean(schedule.endAt);
  const perHub = new Map<string, { start: FirmwareAction[]; end: FirmwareAction[] }>();

  for (const action of scene.actions) {
    const device = devices.find((d) => d.id === action.deviceId);
    const hub = getPhysicalDevice(physicalDevices, device?.hubId);
    if (!device || !hub?.deviceId) continue;

    const entry = perHub.get(hub.deviceId) ?? { start: [], end: [] };
    entry.start.push(...actionsFor(device, action.patch, false));
    if (withEnd) entry.end.push(...actionsFor(device, action.patch, true));
    perHub.set(hub.deviceId, entry);
  }

  const result = new Map<string, FirmwareSchedule>();
  for (const [hubDeviceId, { start, end }] of perHub) {
    if (start.length === 0) continue;
    const payload: FirmwareSchedule = {
      id: firmwareId(schedule),
      repeat: true,
      days: schedule.days.map(toFirmwareDay),
      startTime: schedule.startAt,
      startAction: start.slice(0, MAX_ACTIONS_PER_SIDE),
    };
    if (end.length > 0 && schedule.endAt) {
      payload.endTime = schedule.endAt;
      payload.endAction = end.slice(0, MAX_ACTIONS_PER_SIDE);
    }
    result.set(hubDeviceId, payload);
  }
  return result;
}

export function hubLabel(hubDeviceId: string): string {
  const hub = useHubsStore.getState().physicalDevices.find((d) => d.deviceId === hubDeviceId);
  return hub?.name ?? hubDeviceId;
}

/**
 * Runs a scene right now: sends each device's scene values to the hub behind it (same translation
 * a schedule's startAction uses). One command at a time — a hub reached over BLE has a single
 * connection, and setRgbColor/setRgbMode must land in order. A hub that fails is skipped for the
 * rest of the scene. Resolves to the real device ids of hubs that could not be reached; devices
 * without a paired hub (or without a firmware method) are ignored.
 */
export async function runSceneOnHubs(scene: Scene): Promise<Set<string>> {
  const { devices } = useDevicesStore.getState();
  const { physicalDevices } = useHubsStore.getState();
  const failed = new Set<string>();

  for (const action of scene.actions) {
    const device = devices.find((d) => d.id === action.deviceId);
    const hub = getPhysicalDevice(physicalDevices, device?.hubId);
    if (!device || !hub?.deviceId || failed.has(hub.deviceId)) continue;

    for (const command of actionsFor(device, action.patch, false)) {
      try {
        await sendDeviceCommand(hub.deviceId, command.method, command.params);
      } catch (error) {
        console.error("[scene] command failed", hub.deviceId, command, error);
        failed.add(hub.deviceId);
        break;
      }
    }
  }
  return failed;
}

async function runOnHubs(
  tasks: Array<{ hubDeviceId: string; method: string; params: Record<string, unknown> }>
): Promise<string[]> {
  const results = await Promise.allSettled(
    tasks.map((task) => sendDeviceCommand(task.hubDeviceId, task.method, task.params))
  );
  const failed: string[] = [];
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      console.error("[schedule-sync] failed", tasks[index], result.reason);
      failed.push(hubLabel(tasks[index].hubDeviceId));
    }
  });
  return Array.from(new Set(failed));
}

/**
 * Makes the hubs match the schedule: hubs it applies to get (or overwrite) it, every other hub that
 * may hold a stale copy gets it deleted. A disabled schedule (or one with no weekday) is therefore
 * removed from all hubs. `extraStaleHubs` = hubs the previous version of the schedule/scene pointed
 * at. Resolves to the names of hubs that could not be reached.
 */
export async function syncScheduleToHubs(
  schedule: Schedule,
  scene: Scene | undefined,
  extraStaleHubs: Iterable<string> = []
): Promise<string[]> {
  const active = schedule.enabled && schedule.days.length > 0 && scene !== undefined;
  const wanted = active ? buildHubSchedules(schedule, scene) : new Map<string, FirmwareSchedule>();

  const stale = new Set<string>([...hubDeviceIdsForScene(scene), ...extraStaleHubs]);
  for (const hubDeviceId of wanted.keys()) stale.delete(hubDeviceId);

  return runOnHubs([
    ...Array.from(wanted, ([hubDeviceId, payload]) => ({
      hubDeviceId,
      method: "setSchedule",
      params: payload as unknown as Record<string, unknown>,
    })),
    ...Array.from(stale, (hubDeviceId) => ({
      hubDeviceId,
      method: "deleteSchedule",
      params: { id: firmwareId(schedule) },
    })),
  ]);
}

/** Deletes the schedule from every hub it may live on. */
export function removeScheduleFromHubs(schedule: Schedule, scene: Scene | undefined): Promise<string[]> {
  return runOnHubs(
    Array.from(hubDeviceIdsForScene(scene), (hubDeviceId) => ({
      hubDeviceId,
      method: "deleteSchedule",
      params: { id: firmwareId(schedule) },
    }))
  );
}

export function syncFailureMessage(failedHubs: string[]): string {
  return t("errors.scheduleSyncFailed", { hubs: failedHubs.join(", ") });
}
