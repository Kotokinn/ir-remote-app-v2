"use client";

import { useSyncExternalStore } from "react";
import { isTauri } from "@tauri-apps/api/core";

/**
 * The same code runs in the installed app (Tauri: Bluetooth, RS485, deep links, push, native HTTP) and in a
 * plain browser (cloud/MQTT only). Anything that needs the native side asks here first.
 */
export function runsInApp(): boolean {
  return isTauri();
}

const subscribeNothing = () => () => undefined;

/**
 * For deciding what to render. The static HTML is generated once for both, so the server snapshot is "app":
 * a browser then switches to the web variant right after hydration instead of mismatching it.
 */
export function useRunsInApp(): boolean {
  return useSyncExternalStore(subscribeNothing, runsInApp, () => true);
}
