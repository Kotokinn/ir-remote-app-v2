// Real-time notifications: the Rust side holds an SSE connection to smart-iot's
// /api/smart/notifications/stream (see device_stream.rs) and re-emits each event as the Tauri event
// `notification-event`. New notifications land in the store the moment the server creates them.
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { API_BASE_URL } from "@/lib/api/config";
import type { NotificationResponse } from "@/lib/api/smart";
import { useAuthStore } from "@/lib/store/auth-store";
import { useNotificationsStore } from "@/lib/store/notifications-store";

interface StreamPayload {
  event: string;
  data: string;
}

let unlisten: UnlistenFn | undefined;

function applyEvent(payload: StreamPayload): void {
  const store = useNotificationsStore.getState();

  switch (payload.event) {
    case "notification":
      try {
        store.receive(JSON.parse(payload.data) as NotificationResponse);
      } catch (error) {
        console.error("[notification-stream] unreadable notification", error);
      }
      break;
    case "open":
      // (Re)connected: anything created while the stream was down was not pushed, so re-read the list.
      void store.fetchNotifications();
      break;
    case "error":
      console.error("[notification-stream]", payload.data);
      break;
    default:
      break; // ready / ping
  }
}

/** Starts (or restarts, e.g. with a refreshed token) the live notification stream. No-op outside the Tauri app. */
export async function startNotificationStream(): Promise<void> {
  if (!isTauri()) return;
  await stopNotificationStream();

  const token = useAuthStore.getState().accessToken;
  if (!token) return;

  unlisten = await listen<StreamPayload>("notification-event", (event) => {
    applyEvent(event.payload);
  });
  await invoke("notification_stream_start", { baseUrl: API_BASE_URL, token });
}

export async function stopNotificationStream(): Promise<void> {
  if (!isTauri()) return;
  unlisten?.();
  unlisten = undefined;
  await invoke("notification_stream_stop");
}
