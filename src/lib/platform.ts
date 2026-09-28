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

/**
 * Brings the app window to the front — call after handling a deep link received while already running
 * (a Google sign-in hand-off, a join link), so a link that "did something" doesn't look like it did
 * nothing just because the window was minimized or behind another one. No-op outside the desktop/mobile
 * app. On Windows/Linux this duplicates what the Rust side's single-instance handler already does for the
 * OS-level relaunch case (src-tauri/src/lib.rs) — kept here too since it also covers the same-instance
 * case (e.g. macOS, where the OS hands the URL to the running process directly) with no extra cost.
 */
export async function focusAppWindow(): Promise<void> {
  if (!runsInApp()) return;
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const window = getCurrentWindow();
    await window.unminimize();
    await window.show();
    await window.setFocus();
  } catch (error) {
    console.warn("[platform] could not focus the app window", error);
  }
}
