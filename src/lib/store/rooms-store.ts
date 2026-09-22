"use client";

import { create } from "zustand";
import { ROOM_COLOR_OPTIONS, type RoomIconKey } from "@/lib/room-icons";
import { ApiError } from "@/lib/api/auth";
import { roomsApi, type RoomResponse } from "@/lib/api/smart";

export interface UserRoom {
  id: string;
  name: string;
  iconKey: RoomIconKey;
  color: string;
}

interface RoomsState {
  rooms: UserRoom[];
  hydrated: boolean;
  /** Why the last load failed (null = ok). Lets the UI tell "failed to load" apart from "no rooms". */
  error: string | null;
  fetchRooms: () => Promise<void>;
  addRoom: (name: string, iconKey: RoomIconKey) => Promise<void>;
  removeRoom: (id: string) => Promise<void>;
}

function fromResponse(response: RoomResponse): UserRoom {
  return {
    id: String(response.id),
    name: response.name,
    iconKey: response.iconKey as RoomIconKey,
    color: response.color,
  };
}

function randomColor() {
  return ROOM_COLOR_OPTIONS[Math.floor(Math.random() * ROOM_COLOR_OPTIONS.length)];
}

export const useRoomsStore = create<RoomsState>()((set) => ({
  rooms: [],
  hydrated: false,
  error: null,
  fetchRooms: async () => {
    try {
      const rooms = await roomsApi.list();
      set({ rooms: rooms.map(fromResponse), hydrated: true, error: null });
    } catch (error) {
      console.error("[rooms] failed to load rooms", error);
      const reason =
        error instanceof ApiError
          ? `${error.status}: ${error.message}`
          : error instanceof Error
            ? error.message
            : "Unknown error";
      set({ hydrated: true, error: reason });
    }
  },
  addRoom: async (name, iconKey) => {
    const created = await roomsApi.create({ name: name.trim(), iconKey, color: randomColor() });
    set((state) => ({ rooms: [...state.rooms, fromResponse(created)] }));
  },
  removeRoom: async (id) => {
    await roomsApi.remove(Number(id));
    set((state) => ({ rooms: state.rooms.filter((r) => r.id !== id) }));
  },
}));
