// SSE is consumed here (Rust), not via a browser EventSource in the webview: EventSource
// can't set an Authorization header, and the stream endpoints are JWT-protected.
// reqwest-eventsource sends a normal `Authorization: Bearer <token>` header; the frontend
// just invokes a `*_stream_start` command then listens for the Tauri event it re-emits:
//   - device_stream_start(deviceId)   -> `device-event:<deviceId>`   (mqtt-service device stream)
//   - notification_stream_start()     -> `notification-event`        (smart-iot notification stream)
use futures_util::StreamExt;
use reqwest_eventsource::{Event, EventSource};
use serde::Serialize;
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Duration;
use tauri::async_runtime::JoinHandle;
use tauri::{AppHandle, Emitter, State};

// mqtt-service pings every 10s (see device-state-store.ts's STREAM_SILENCE_THRESHOLD_MS, which the
// frontend uses to paint the connection red at 30s of silence). A dead TCP socket left over from a
// network switch (WiFi -> another WiFi/cellular) doesn't error on its own - the OS doesn't always
// notice the old interface is gone, so reqwest just blocks forever on a read that will never
// complete, and reqwest-eventsource's own retry logic never kicks in. This watchdog forces a fresh
// connection (which binds on whatever network is active now) if nothing - not even a ping - arrives
// in time, well before the frontend's own 30s threshold so it doesn't need to wait that long either.
const STREAM_IDLE_TIMEOUT: Duration = Duration::from_secs(25);

#[derive(Default)]
pub struct DeviceStreamState(Mutex<HashMap<String, JoinHandle<()>>>);

#[derive(Serialize, Clone)]
struct DeviceEventPayload {
    event: String,
    data: String,
}

fn stop_existing(state: &State<'_, DeviceStreamState>, device_id: &str) {
    if let Some(handle) = state.0.lock().unwrap().remove(device_id) {
        handle.abort();
    }
}

/// Key of the notification stream in the shared task map (device ids are hex, so this can't collide).
const NOTIFICATION_STREAM_KEY: &str = "__notifications__";

/// Opens `url` as an SSE stream and re-emits everything as Tauri events named `event_name`, until
/// the returned task is aborted. Rust-side `open` / `error` pseudo-events tell the frontend when
/// the stream (re)connected or failed; reqwest-eventsource retries by itself.
fn open_event_source(client: &reqwest::Client, url: &str, token: &str) -> Result<EventSource, String> {
    EventSource::new(client.get(url).bearer_auth(token)).map_err(|e| e.to_string())
}

fn spawn_stream(
    app: AppHandle,
    url: String,
    token: String,
    event_name: String,
) -> Result<JoinHandle<()>, String> {
    let client = reqwest::Client::new();
    let mut event_source = open_event_source(&client, &url, &token)?;
    println!("[device_stream] spawning for {event_name} -> {url}");

    Ok(tauri::async_runtime::spawn(async move {
        loop {
            let event = match tokio::time::timeout(STREAM_IDLE_TIMEOUT, event_source.next()).await {
                Ok(Some(event)) => event,
                Ok(None) => {
                    println!("[device_stream] {event_name}: iterator ended");
                    break;
                }
                Err(_elapsed) => {
                    // Not even a ping in STREAM_IDLE_TIMEOUT - most likely a socket left stranded by
                    // a network switch. Don't wait on it any longer; open a new one now.
                    println!("[device_stream] {event_name}: idle for {STREAM_IDLE_TIMEOUT:?}, reconnecting");
                    event_source.close();
                    event_source = match open_event_source(&client, &url, &token) {
                        Ok(source) => source,
                        Err(err) => {
                            println!("[device_stream] {event_name}: reconnect failed: {err}");
                            let _ = app.emit(
                                &event_name,
                                DeviceEventPayload { event: "error".to_string(), data: err },
                            );
                            break;
                        }
                    };
                    continue;
                }
            };

            match event {
                // Tell the frontend the stream is (re)connected so it can clear a previous error.
                Ok(Event::Open) => {
                    println!("[device_stream] {event_name}: open");
                    let _ = app.emit(
                        &event_name,
                        DeviceEventPayload { event: "open".to_string(), data: "{}".to_string() },
                    );
                }
                Ok(Event::Message(message)) => {
                    let _ = app.emit(
                        &event_name,
                        DeviceEventPayload { event: message.event, data: message.data },
                    );
                }
                Err(reqwest_eventsource::Error::StreamEnded) => {
                    println!("[device_stream] {event_name}: stream ended");
                    event_source.close();
                    break;
                }
                Err(err) => {
                    println!("[device_stream] {event_name}: error: {err}");
                    let _ = app.emit(
                        &event_name,
                        DeviceEventPayload { event: "error".to_string(), data: err.to_string() },
                    );
                }
            }
        }
    }))
}

#[tauri::command]
pub async fn device_stream_start(
    app: AppHandle,
    state: State<'_, DeviceStreamState>,
    device_id: String,
    base_url: String,
    token: String,
) -> Result<(), String> {
    stop_existing(&state, &device_id);

    let url = format!("{}/api/mqtt/devices/{}/stream", base_url, device_id);
    let handle = spawn_stream(app, url, token, format!("device-event:{}", device_id))?;
    state.0.lock().unwrap().insert(device_id, handle);
    Ok(())
}

#[tauri::command]
pub fn device_stream_stop(state: State<'_, DeviceStreamState>, device_id: String) {
    stop_existing(&state, &device_id);
}

#[tauri::command]
pub async fn notification_stream_start(
    app: AppHandle,
    state: State<'_, DeviceStreamState>,
    base_url: String,
    token: String,
) -> Result<(), String> {
    stop_existing(&state, NOTIFICATION_STREAM_KEY);

    let url = format!("{}/api/smart/notifications/stream", base_url);
    let handle = spawn_stream(app, url, token, "notification-event".to_string())?;
    state.0.lock().unwrap().insert(NOTIFICATION_STREAM_KEY.to_string(), handle);
    Ok(())
}

#[tauri::command]
pub fn notification_stream_stop(state: State<'_, DeviceStreamState>) {
    stop_existing(&state, NOTIFICATION_STREAM_KEY);
}
