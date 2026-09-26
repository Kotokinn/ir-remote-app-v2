"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { ROOM_COLOR_OPTIONS, type RoomIconKey } from "@/lib/room-icons";
import { ApiError } from "@/lib/api/auth";
import { errorMessage } from "@/lib/i18n/errors";
import { roomsApi, type AccessLevel, type RoomResponse } from "@/lib/api/smart";

export interface UserRoom {
  id: string;
  name: string;
  iconKey: RoomIconKey;
  color: string;
  /** Whose room it is (not the signed-in account's, for one shared with them). */
  ownerAccountId: number;
  /** "owner", or "room" when the owner shared this room with the signed-in account. */
  access: AccessLevel;
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
    ownerAccountId: response.ownerAccountId,
    access: response.access,
  };
}

function randomColor() {
  return ROOM_COLOR_OPTIONS[Math.floor(Math.random() * ROOM_COLOR_OPTIONS.length)];
}

export const useRoomsStore = create<RoomsState>()(
  persist(
    (set) => ({
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
              ? `${error.status}: ${errorMessage(error)}`
              : errorMessage(error);
          // The cached rooms (if any) stay: being offline must not blank the app.
          set({ hydrated: true, error: reason });
        }
      },
      // Creating or deleting a room stays online-only: a room is what sharing and device placement hang
      // off, and both need the server's answer.
      addRoom: async (name, iconKey) => {
        const created = await roomsApi.create({ name: name.trim(), iconKey, color: randomColor() });
        set((state) => ({ rooms: [...state.rooms, fromResponse(created)] }));
      },
      removeRoom: async (id) => {
        await roomsApi.remove(Number(id));
        set((state) => ({ rooms: state.rooms.filter((r) => r.id !== id) }));
      },
    }),
    {
      name: "smart-home-rooms",
      storage: createJSONStorage(() => window.localStorage),
      skipHydration: true,
      // Only a non-empty cache counts as "loaded": an empty one must not flash "No rooms yet" before the fetch.
      onRehydrateStorage: () => (state) => {
        if (state && state.rooms.length > 0) state.hydrated = true;
      },
      partialize: (state) => ({ rooms: state.rooms }),
    }
  )
);
