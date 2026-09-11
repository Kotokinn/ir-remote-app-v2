"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { ROOM_COLOR_OPTIONS, type RoomIconKey } from "@/lib/room-icons";

export interface UserRoom {
  id: string;
  name: string;
  iconKey: RoomIconKey;
  color: string;
}

interface RoomsState {
  rooms: UserRoom[];
  hydrated: boolean;
  addRoom: (name: string, iconKey: RoomIconKey) => void;
  removeRoom: (id: string) => void;
}

function randomColor() {
  return ROOM_COLOR_OPTIONS[Math.floor(Math.random() * ROOM_COLOR_OPTIONS.length)];
}

export const useRoomsStore = create<RoomsState>()(
  persist(
    (set) => ({
      rooms: [],
      hydrated: false,
      addRoom: (name, iconKey) =>
        set((state) => ({
          rooms: [
            ...state.rooms,
            {
              id: `room-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
              name: name.trim(),
              iconKey,
              color: randomColor(),
            },
          ],
        })),
      removeRoom: (id) =>
        set((state) => ({ rooms: state.rooms.filter((r) => r.id !== id) })),
    }),
    {
      name: "smart-home-rooms",
      storage: createJSONStorage(() => window.localStorage),
      skipHydration: true,
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true;
      },
      partialize: (state) => ({ rooms: state.rooms }),
    }
  )
);
