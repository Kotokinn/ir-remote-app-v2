"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/lib/store/auth-store";
import { useRoomsStore } from "@/lib/store/rooms-store";
import { useDevicesStore } from "@/lib/store/devices-store";
import { useHubsStore } from "@/lib/store/hubs-store";
import { useScenesStore } from "@/lib/store/scenes-store";
import { useSchedulesStore } from "@/lib/store/schedules-store";
import { useNotificationsStore } from "@/lib/store/notifications-store";
import { startDeviceStream, stopDeviceStream } from "@/lib/device/device-stream";
import { registerForPush } from "@/lib/device/push";
import { startNotificationStream, stopNotificationStream } from "@/lib/notification-stream";

export function DataHydrator() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const authHydrated = useAuthStore((s) => s.hydrated);
  const physicalDevices = useHubsStore((s) => s.physicalDevices);

  useEffect(() => {
    void useAuthStore.persist.rehydrate();
    void useDevicesStore.persist.rehydrate();
    void useHubsStore.persist.rehydrate();
  }, []);

  useEffect(() => {
    if (!authHydrated || !accessToken) return;
    void useRoomsStore.getState().fetchRooms();
    void useScenesStore.getState().fetchScenes();
    void useSchedulesStore.getState().fetchSchedules();
    void useNotificationsStore.getState().fetchNotifications();
  }, [authHydrated, accessToken]);

  // Push token → backend, once per sign-in. Keyed on "signed in" rather than the token itself so a
  // token refresh doesn't re-prompt or re-register.
  const signedIn = accessToken !== null;
  useEffect(() => {
    if (!authHydrated || !signedIn) return;
    let cleanup: (() => void) | undefined;
    let cancelled = false;
    registerForPush()
      .then((stop) => {
        if (cancelled) stop();
        else cleanup = stop;
      })
      .catch((error: unknown) => {
        console.error("[push] registration failed", error);
      });
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [authHydrated, signedIn]);

  // New notifications pushed as they are created (SSE handled in Rust). accessToken is a dependency so
  // the stream restarts with the refreshed token (Rust captures it at start).
  useEffect(() => {
    if (!authHydrated || !accessToken) return;
    startNotificationStream().catch((error: unknown) => {
      console.error("[notification-stream] failed to start", error);
    });
    return () => {
      stopNotificationStream().catch(() => undefined);
    };
  }, [authHydrated, accessToken]);

  // Live device state over SSE (handled in Rust). Besides showing state, this is what tells
  // sendDeviceCommand whether MQTT is still reaching the device or BLE fallback is needed.
  // accessToken is a dependency so streams restart with the refreshed token (Rust captures it
  // at start).
  useEffect(() => {
    if (!authHydrated || !accessToken) return;
    const deviceIds = physicalDevices
      .map((device) => device.deviceId)
      .filter((id): id is string => Boolean(id));
    for (const deviceId of deviceIds) {
      startDeviceStream(deviceId).catch((error: unknown) => {
        console.error(`[device-stream] failed to start for ${deviceId}`, error);
      });
    }
    return () => {
      for (const deviceId of deviceIds) {
        stopDeviceStream(deviceId).catch(() => undefined);
      }
    };
  }, [authHydrated, accessToken, physicalDevices]);

  return null;
}
