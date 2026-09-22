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
use tauri::async_runtime::JoinHandle;
use tauri::{AppHandle, Emitter, State};

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
fn spawn_stream(
    app: AppHandle,
    url: String,
    token: String,
    event_name: String,
) -> Result<JoinHandle<()>, String> {
    let client = reqwest::Client::new();
    let request_builder = client.get(&url).bearer_auth(token);
    let mut event_source = EventSource::new(request_builder).map_err(|e| e.to_string())?;

    Ok(tauri::async_runtime::spawn(async move {
        while let Some(event) = event_source.next().await {
            match event {
                // Tell the frontend the stream is (re)connected so it can clear a previous error.
                Ok(Event::Open) => {
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
                    event_source.close();
                    break;
                }
                Err(err) => {
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
