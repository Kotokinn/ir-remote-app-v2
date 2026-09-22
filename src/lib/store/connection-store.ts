"use client";

import { create } from "zustand";

/** Which path a command actually went out on. */
export type CommandRoute = "mqtt" | "ble";

export interface CommandOutcome {
  /** null when the command failed on every path. */
  route: CommandRoute | null;
  ok: boolean;
  at: number;
}

interface ConnectionStore {
  /** Outcome of the most recent command per hub deviceId — lets the UI say how it was sent / that it failed. */
  lastCommand: Partial<Record<string, CommandOutcome>>;
  /** deviceId of the hub the app currently holds the (single, app-wide) BLE connection to. */
  bleDeviceId: string | null;
  recordCommand: (deviceId: string, outcome: CommandOutcome) => void;
  setBleDeviceId: (deviceId: string | null) => void;
}

export const useConnectionStore = create<ConnectionStore>()((set) => ({
  lastCommand: {},
  bleDeviceId: null,
  recordCommand: (deviceId, outcome) => {
    set((store) => ({ lastCommand: { ...store.lastCommand, [deviceId]: outcome } }));
  },
  setBleDeviceId: (deviceId) => {
    set({ bleDeviceId: deviceId });
  },
}));
