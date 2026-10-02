"use client";

import { create } from "zustand";

export interface DeviceLiveState {
  telemetry: Record<string, unknown> | null;
  state: Record<string, unknown> | null;
  attributes: Record<string, unknown> | null;
  lastCommandResponse: Record<string, unknown> | null;
  /**
   * Presence from the `state` topic: true when the device announced itself, false when the broker
   * published its last-will (LWT). `state` only ever changes on online/offline, so this — not
   * telemetry recency — is the source of truth. null = no state received yet.
   */
  presence: boolean | null;
  /** Epoch ms of the last SSE activity of any kind (incl. the server's ping). null = never seen. */
  streamAt: number | null;
  /** The stream failed and hasn't reconnected yet. */
  streamError: boolean;
  /** mqtt-service's own MQTT link to the broker. null = unknown. */
  brokerConnected: boolean | null;
}

const EMPTY_DEVICE_STATE: DeviceLiveState = {
  telemetry: null,
  state: null,
  attributes: null,
  lastCommandResponse: null,
  presence: null,
  streamAt: null,
  streamError: false,
  brokerConnected: null,
};

// mqtt-service pings every 10s; three missed beats means the path to the server is down even if
// the TCP connection hasn't reported an error yet.
export const STREAM_SILENCE_THRESHOLD_MS = 30_000;

interface DeviceStateStore {
  devices: Record<string, DeviceLiveState>;
  setTelemetry: (deviceId: string, telemetry: Record<string, unknown>) => void;
  setState: (deviceId: string, state: Record<string, unknown>) => void;
  setAttributes: (
    deviceId: string,
    attributes: Record<string, unknown>,
  ) => void;
  pushCommandResponse: (
    deviceId: string,
    response: Record<string, unknown>,
  ) => void;
  setBroker: (deviceId: string, connected: boolean) => void;
  /** Stream is alive (ping / open): clears a previous error. */
  touchStream: (deviceId: string) => void;
  markStreamError: (deviceId: string) => void;
  /** A direct ping (bypassing the stream, see lib/api/mqtt.ts's pingDevice) got a reply: the device
   * and the path to it are confirmed up right now, regardless of what the stream itself currently
   * shows (it may just be stale, not actually broken — see mqttHealthOf). */
  confirmReachable: (deviceId: string) => void;
}

function getOrCreate(
  devices: Record<string, DeviceLiveState>,
  deviceId: string,
): DeviceLiveState {
  return devices[deviceId] ?? EMPTY_DEVICE_STATE;
}

export const useDeviceStateStore = create<DeviceStateStore>()((set) => {
  // Every event proves the stream is alive, so all setters also refresh streamAt.
  function update(
    deviceId: string,
    patch: (current: DeviceLiveState) => Partial<DeviceLiveState>,
  ) {
    set((store) => {
      const current = getOrCreate(store.devices, deviceId);
      return {
        devices: {
          ...store.devices,
          [deviceId]: {
            ...current,
            streamAt: Date.now(),
            streamError: false,
            ...patch(current),
          },
        },
      };
    });
  }

  return {
    devices: {},
    setTelemetry: (deviceId, telemetry) => {
      update(deviceId, () => ({ telemetry }));
    },
    setState: (deviceId, state) => {
      update(deviceId, (current) => ({
        state,
        presence:
          typeof state.online === "boolean" ? state.online : current.presence,
      }));
    },
    setAttributes: (deviceId, attributes) => {
      update(deviceId, () => ({ attributes }));
    },
    pushCommandResponse: (deviceId, response) => {
      update(deviceId, () => ({ lastCommandResponse: response }));
    },
    setBroker: (deviceId, connected) => {
      update(deviceId, () => ({ brokerConnected: connected }));
    },
    touchStream: (deviceId) => {
      update(deviceId, () => ({}));
    },
    confirmReachable: (deviceId) => {
      update(deviceId, () => ({ presence: true }));
    },
    markStreamError: (deviceId) => {
      set((store) => ({
        devices: {
          ...store.devices,
          [deviceId]: {
            ...getOrCreate(store.devices, deviceId),
            streamError: true,
          },
        },
      }));
    },
  };
});

export function useDeviceLiveState(
  deviceId: string | undefined,
): DeviceLiveState {
  return useDeviceStateStore((store) =>
    deviceId ? getOrCreate(store.devices, deviceId) : EMPTY_DEVICE_STATE,
  );
}

export type MqttHealth = "alive" | "silent" | "unknown";

/**
 * Health of the MQTT path to a device.
 *  - "alive":   the stream is up, the server's broker link is up, and the device says it's online.
 *  - "silent":  path known down — stream failed/quiet, server lost the broker, or the device is
 *               offline (LWT). BLE goes first for commands.
 *  - "unknown": nothing decisive yet (stream just started / no state received).
 */
export function mqttHealthOf(
  live: DeviceLiveState | undefined,
  now: number,
): MqttHealth {
  if (!live || live.streamAt === null) return "unknown";
  if (
    live.streamError ||
    live.brokerConnected === false ||
    now - live.streamAt > STREAM_SILENCE_THRESHOLD_MS
  ) {
    return "silent";
  }
  if (live.presence === null) return "unknown";
  return live.presence ? "alive" : "silent";
}

/** Why the MQTT path is down: our network/server, or the device itself. null if it isn't down. */
export function mqttDownCause(
  live: DeviceLiveState | undefined,
  now: number,
): "network" | "device" | null {
  if (!live || mqttHealthOf(live, now) !== "silent") return null;
  const pathDown =
    live.streamError ||
    live.brokerConnected === false ||
    (live.streamAt !== null &&
      now - live.streamAt > STREAM_SILENCE_THRESHOLD_MS);
  return pathDown ? "network" : "device";
}

export function mqttHealth(deviceId: string, now = Date.now()): MqttHealth {
  // Partial: an unseen deviceId is simply absent (Record<string, T> index types hide that).
  const devices: Partial<Record<string, DeviceLiveState>> =
    useDeviceStateStore.getState().devices;
  return mqttHealthOf(devices[deviceId], now);
}
