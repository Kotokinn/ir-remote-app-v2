"use client";

import { create } from "zustand";

// Mirrors smart-control's publishOtaEvent() (main.cpp) — the only 4 types it ever sends.
export type OtaEventType = "firmwareAvailable" | "otaStarted" | "otaSuccess" | "otaFailed";

export interface OtaEvent {
  type: OtaEventType;
  currentVersion: string;
  newVersion: string;
  title: string;
}

interface OtaState {
  /** Keyed by the hub's real deviceId — always just the latest event per hub, nothing older matters. */
  events: Record<string, OtaEvent>;
  setEvent: (deviceId: string, event: OtaEvent) => void;
  dismiss: (deviceId: string) => void;
}

export const useOtaStore = create<OtaState>()((set) => ({
  events: {},
  setEvent: (deviceId, event) => {
    set((state) => ({ events: { ...state.events, [deviceId]: event } }));
  },
  dismiss: (deviceId) => {
    set((state) => {
      if (!(deviceId in state.events)) return state;
      return { events: Object.fromEntries(Object.entries(state.events).filter(([id]) => id !== deviceId)) };
    });
  },
}));
