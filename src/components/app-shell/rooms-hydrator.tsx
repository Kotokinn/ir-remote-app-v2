"use client";

import { useEffect } from "react";
import { useRoomsStore } from "@/lib/store/rooms-store";

export function RoomsHydrator() {
  useEffect(() => {
    void useRoomsStore.persist.rehydrate();
  }, []);

  return null;
}
