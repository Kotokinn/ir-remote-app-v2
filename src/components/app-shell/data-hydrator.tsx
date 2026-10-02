"use client";

import { useEffect } from "react";
import {
  startDeviceStream,
  stopDeviceStream,
} from "@/lib/device/device-stream";
import { registerForPush } from "@/lib/device/push";
import {
  startNotificationStream,
  stopNotificationStream,
} from "@/lib/notification-stream";
import { useAuthStore } from "@/lib/store/auth-store";
import { useDevicesStore } from "@/lib/store/devices-store";
import { useHubsStore } from "@/lib/store/hubs-store";
import { useNotificationsStore } from "@/lib/store/notifications-store";
import { useProfileStore } from "@/lib/store/profile-store";
import { useRoomsStore } from "@/lib/store/rooms-store";
import { useScenesStore } from "@/lib/store/scenes-store";
import { useSchedulesStore } from "@/lib/store/schedules-store";
import { syncEngine } from "@/lib/sync";
import { useOutboxStore } from "@/lib/sync/outbox-store";

export function DataHydrator() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const authHydrated = useAuthStore((s) => s.hydrated);
  const accountId = useAuthStore((s) => s.account?.id ?? null);
  const physicalDevices = useHubsStore((s) => s.physicalDevices);

  useEffect(() => {
    void useAuthStore.persist.rehydrate();
    void useDevicesStore.persist.rehydrate();
    void useHubsStore.persist.rehydrate();
    void useRoomsStore.persist.rehydrate();
    void useScenesStore.persist.rehydrate();
    void useSchedulesStore.persist.rehydrate();
    void useOutboxStore.persist.rehydrate();
    void useProfileStore.persist.rehydrate();
  }, []);

  // The local caches belong to whoever was signed in: with sharing, the next account to sign in on this
  // machine must not flash (or, offline, keep) the previous one's rooms and devices.
  useEffect(() => {
    if (!authHydrated || accessToken) return;
    useHubsStore.setState({ physicalDevices: [] });
    useDevicesStore.setState({ devices: [] });
    useRoomsStore.setState({ rooms: [], hydrated: false });
    useScenesStore.setState({ scenes: [] });
    useSchedulesStore.setState({ schedules: [] });
    useProfileStore.getState().clear();
    // The outbox is deliberately kept: it may hold changes not yet sent, and it never replays under a
    // different account (see the engine) — sign-out with pending changes is guarded in Settings.
  }, [authHydrated, accessToken]);

  // Delivers queued changes to the server whenever it can: now, when back online, when the app returns to
  // the foreground, and on a timer (see sync-engine.ts). Runs only with a session.
  useEffect(() => {
    if (!authHydrated || !accessToken) return;
    return syncEngine.start();
  }, [authHydrated, accessToken]);

  useEffect(() => {
    if (!authHydrated || !accessToken) return;
    void useRoomsStore.getState().fetchRooms();
    void useHubsStore.getState().fetchHubs();
    void useDevicesStore.getState().fetchDevices();
    void useScenesStore.getState().fetchScenes();
    void useSchedulesStore.getState().fetchSchedules();
    void useNotificationsStore.getState().fetchNotifications();
  }, [authHydrated, accessToken]);

  useEffect(() => {
    if (!authHydrated || accountId === null) return;
    void useProfileStore.getState().fetchProfile(accountId);
  }, [authHydrated, accountId]);

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
  // at start). Keyed on the joined deviceId set, not the physicalDevices array reference itself —
  // that reference changes (new array from the store) on every hub field update (name, online,
  // preferredTransport...), which would otherwise restart every stream for no reason each time.
  const deviceIdsKey = physicalDevices
    .map((device) => device.deviceId)
    .filter((id): id is string => Boolean(id))
    .join(",");

  useEffect(() => {
    if (!authHydrated || !accessToken || !deviceIdsKey) return;
    const deviceIds = deviceIdsKey.split(",");
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
  }, [authHydrated, accessToken, deviceIdsKey]);

  // Force both live streams to reconnect right away on a clear "network's probably back" signal
  // (OS reports online, app returns to the foreground) instead of waiting on the Rust-side idle
  // watchdog (device_stream.rs's STREAM_IDLE_TIMEOUT), which only exists as a fallback for a
  // switch between two networks that never looked "offline" to the webview. startDeviceStream /
  // startNotificationStream already stop-then-start, so calling them again here is always safe.
  useEffect(() => {
    if (!authHydrated || !accessToken) return;
    const deviceIds = deviceIdsKey ? deviceIdsKey.split(",") : [];

    function reconnect() {
      startNotificationStream().catch(() => undefined);
      for (const deviceId of deviceIds) {
        startDeviceStream(deviceId).catch(() => undefined);
      }
    }
    function onVisible() {
      if (document.visibilityState === "visible") reconnect();
    }

    window.addEventListener("online", reconnect);
    window.addEventListener("focus", reconnect);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", reconnect);
      window.removeEventListener("focus", reconnect);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [authHydrated, accessToken, deviceIdsKey]);

  return null;
}
