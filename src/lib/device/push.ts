// Push notifications (Firebase Cloud Messaging) — Android app only. The plugin hands out the
// device's FCM token; the backend (firebasefcm-service) keeps it against the account so services
// like mqtt-service can push alerts to it. Desktop and the browser dev server have no FCM: every
// entry point is a no-op there.
import { getIdentifier } from "@tauri-apps/api/app";
import { isTauri } from "@tauri-apps/api/core";
import { fcmApi } from "@/lib/api/fcm";

function isAndroidApp(): boolean {
  return isTauri() && /android/i.test(navigator.userAgent);
}

async function sendTokenToBackend(token: string): Promise<void> {
  // The bundle identifier (com.vda.smarthome) is what the backend filters push targets by.
  const appId = await getIdentifier();
  await fcmApi.registerToken({ token, platform: "ANDROID", deviceName: "Android app", appId });
}

/**
 * Asks for the notification permission (Android 13+), then registers this device's FCM token with
 * the backend and keeps it registered when Firebase rotates it. Resolves to a cleanup function.
 * Call only while signed in (the backend ties the token to the account).
 */
export async function registerForPush(): Promise<() => void> {
  if (!isAndroidApp()) return () => undefined;

  const fcm = await import("tauri-plugin-fcm");

  let permission = await fcm.checkPermissions();
  if (permission !== "granted") permission = await fcm.requestPermissions();
  if (permission !== "granted") {
    console.warn("[push] notification permission not granted; not registering for push");
    return () => undefined;
  }

  const listener = await fcm.onTokenRefresh((event) => {
    sendTokenToBackend(event.token).catch((error: unknown) => {
      console.error("[push] couldn't send refreshed FCM token", error);
    });
  });
  const errorListener = await fcm.onPushError((event) => {
    console.error("[push] FCM error:", event.error);
  });

  const { token } = await fcm.getToken();
  await sendTokenToBackend(token);

  return () => {
    void listener.unregister();
    void errorListener.unregister();
  };
}
