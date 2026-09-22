"use client";

// Live readings derived from the SSE-fed device-state-store, for showing "which room is how warm"
// and whether a hub is really reachable. Presence comes from the device's `state` topic (retained
// + LWT), NOT from how recently telemetry arrived — telemetry can be minutes apart. Whether the
// path to the device is up comes from the stream itself (ping / broker link), see mqttHealthOf.
import { useEffect, useState } from "react";
import {
  mqttDownCause,
  mqttHealthOf,
  useDeviceStateStore,
  type DeviceLiveState,
} from "@/lib/store/device-state-store";
import { useConnectionStore, type CommandOutcome } from "@/lib/store/connection-store";
import { useHubsStore, type PhysicalDevice } from "@/lib/store/hubs-store";

export type HubConnectivity = "online" | "offline" | "unknown";

// A hub with no verdict yet since this screen opened (stream still connecting / no state received)
// is "unknown" for this long, then "offline".
const UNSEEN_GRACE_MS = 20_000;

/** Re-renders on an interval so time-based staleness flips even when no new events arrive. */
export function useNow(intervalMs = 5000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now());
    }, intervalMs);
    return () => {
      clearInterval(id);
    };
  }, [intervalMs]);
  return now;
}

type LiveMap = Partial<Record<string, DeviceLiveState>>;

function liveOf(devices: LiveMap, deviceId: string | undefined): DeviceLiveState | undefined {
  return deviceId ? devices[deviceId] : undefined;
}

function readTemperature(live: DeviceLiveState | undefined, now: number): number | null {
  // Last known reading is shown for as long as the device is reachable and online — telemetry
  // arrives only every few minutes (and the server replays the latest one when a stream opens).
  if (mqttHealthOf(live, now) !== "alive") return null;
  // Firmware reports NaN/null until the first NTC read completes.
  const value = live?.telemetry?.temp;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Temperature measured at one hub (°C), or null if unknown or the hub isn't reachable/online. */
export function useHubTemperature(deviceId: string | undefined): number | null {
  const devices = useDeviceStateStore((s) => s.devices);
  const now = useNow();
  return readTemperature(liveOf(devices, deviceId), now);
}

export interface RoomTemperature {
  /** The room has at least one paired IR hub (the only product with a temperature sensor). */
  hasSensor: boolean;
  /** Average of the room's reachable hubs' readings (°C), or null if there is none. */
  celsius: number | null;
}

export function useRoomTemperature(roomId: string): RoomTemperature {
  const hubs = useHubsStore((s) => s.physicalDevices);
  const devices = useDeviceStateStore((s) => s.devices);
  const now = useNow();

  const sensors = hubs.filter(
    (hub) => hub.roomId === roomId && hub.productType === "hub-ir" && hub.deviceId
  );
  const readings = sensors
    .map((hub) => readTemperature(liveOf(devices, hub.deviceId), now))
    .filter((reading): reading is number => reading !== null);

  return {
    hasSensor: sensors.length > 0,
    celsius:
      readings.length === 0 ? null : readings.reduce((sum, reading) => sum + reading, 0) / readings.length,
  };
}

/** Real reachability of a hub, replacing the static `online` flag set at pairing time. */
export function useHubConnectivity(hub: PhysicalDevice): HubConnectivity {
  const devices = useDeviceStateStore((s) => s.devices);
  const now = useNow();
  const [mountedAt] = useState(() => Date.now());

  // Hubs paired before real deviceIds existed have no live data at all — keep the old flag.
  if (!hub.deviceId) return hub.online ? "online" : "offline";

  const health = mqttHealthOf(liveOf(devices, hub.deviceId), now);
  if (health === "alive") return "online";
  if (health === "silent") return "offline";
  return now - mountedAt > UNSEEN_GRACE_MS ? "offline" : "unknown";
}

export type HubLinkKind = "online" | "bluetooth" | "offline" | "connecting";

export interface HubLink {
  kind: HubLinkKind;
  /** The app currently holds its (single) BLE connection to this hub. */
  bleConnected: boolean;
  /** How the last command to this hub went out, or that it failed. */
  lastCommand: CommandOutcome | undefined;
  /** When the network path is down: is it our side (server/broker/stream) or the hub itself? */
  cause: "network" | "device" | null;
}

/**
 * Overall link to a hub: reachable over the network (MQTT), reachable only over Bluetooth
 * (network path down but the BLE link is up), unreachable, or still working it out.
 */
export function useHubLink(hub: PhysicalDevice): HubLink {
  const connectivity = useHubConnectivity(hub);
  const bleDeviceId = useConnectionStore((s) => s.bleDeviceId);
  const lastCommand = useConnectionStore((s) => (hub.deviceId ? s.lastCommand[hub.deviceId] : undefined));
  const bleConnected = Boolean(hub.deviceId) && bleDeviceId === hub.deviceId;
  const devices = useDeviceStateStore((s) => s.devices);
  const now = useNow();
  const cause = mqttDownCause(liveOf(devices, hub.deviceId), now);

  let kind: HubLinkKind;
  if (connectivity === "online") kind = "online";
  else if (bleConnected) kind = "bluetooth";
  else if (connectivity === "offline") kind = "offline";
  else kind = "connecting";

  return { kind, bleConnected, lastCommand, cause };
}

export function formatTemperature(celsius: number | null): string {
  return celsius === null ? "—" : `${celsius.toFixed(1)}°C`;
}
