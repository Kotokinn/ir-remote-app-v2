"use client";

import { create } from "zustand";

// Mirrors publishOtaEvent() in both firmwares (main.cpp). Current firmware updates itself and only sends
// otaStarted / otaSuccess / otaFailed; firmwareAvailable (asks the user to confirm) comes from older firmware.
export type OtaEventType =
  | "firmwareAvailable"
  | "otaStarted"
  | "otaSuccess"
  | "otaFailed";

export interface OtaEvent {
  type: OtaEventType;
  currentVersion: string;
  newVersion: string;
  title: string;
}

interface OtaState {
  /** Keyed by the hub's real deviceId — always just the latest event per hub, nothing older matters. */
  events: Partial<Record<string, OtaEvent>>;
  /** The offered version the user closed, per hub: the retained attributes must not bring that one back. */
  dismissedVersions: Record<string, string>;
  setEvent: (deviceId: string, event: OtaEvent) => void;
  dismiss: (deviceId: string) => void;
}

export const useOtaStore = create<OtaState>()((set) => ({
  events: {},
  dismissedVersions: {},
  setEvent: (deviceId, event) => {
    set((state) => ({ events: { ...state.events, [deviceId]: event } }));
  },
  dismiss: (deviceId) => {
    set((state) => {
      const event = state.events[deviceId];
      if (!event) return state;
      return {
        events: Object.fromEntries(
          Object.entries(state.events).filter(([id]) => id !== deviceId),
        ),
        dismissedVersions:
          event.type === "firmwareAvailable"
            ? { ...state.dismissedVersions, [deviceId]: event.newVersion }
            : state.dismissedVersions,
      };
    });
  },
}));
