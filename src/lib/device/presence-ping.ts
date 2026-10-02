"use client";

import { useEffect } from "react";
import { pingDevice } from "@/lib/api/mqtt";
import { useDeviceStateStore } from "@/lib/store/device-state-store";
import type { PhysicalDevice } from "@/lib/store/hubs-store";

/**
 * Confirms each hub shown on a screen is actually reachable right now, independent of whatever the
 * SSE stream currently shows — the stream can go stale (idle watchdog in device_stream.rs is the
 * client-side mitigation) without the device or the broker path really being down, which is exactly
 * what left the status dot red while commands still worked. Fire-and-forget per hub: a failed ping
 * doesn't force "offline" (a single missed reply isn't proof either way, and the passive stream/LWT
 * path still owns that call) — it only ever upgrades a hub to confirmed-online, immediately.
 */
export function usePingHubsOnOpen(hubs: PhysicalDevice[]): void {
  const deviceIds = hubs
    .map((hub) => hub.deviceId)
    .filter((id): id is string => Boolean(id));
  const key = deviceIds.join(",");

  useEffect(() => {
    if (!key) return;
    for (const deviceId of key.split(",")) {
      pingDevice(deviceId)
        .then(({ online }) => {
          if (online) useDeviceStateStore.getState().confirmReachable(deviceId);
        })
        .catch(() => undefined);
    }
  }, [key]);
}
