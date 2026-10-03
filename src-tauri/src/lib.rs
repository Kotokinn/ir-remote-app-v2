// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Emitter;
#[cfg(desktop)]
use tauri::Manager;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpListener;

#[cfg(desktop)]
use tauri_plugin_deep_link::DeepLinkExt;

mod device_stream;
use device_stream::{
  device_stream_start, device_stream_stop, notification_stream_start, notification_stream_stop,
  DeviceStreamState,
};

// RS485 needs an actual serial port, so it only exists on desktop; mobile gets stubs with the same
// names/signatures so invoke_handler! below never needs to know which platform it's building for.
#[cfg(desktop)]
mod serial_transport;
#[cfg(desktop)]
use serial_transport::{list_serial_ports, serial_send_command};

#[cfg(mobile)]
#[tauri::command]
fn list_serial_ports() -> Result<Vec<String>, String> {
  Err("RS485 is desktop-only".into())
}

#[cfg(mobile)]
#[tauri::command]
async fn serial_send_command(
  _port_name: String,
  _baud: u32,
  _frame: String,
  _timeout_ms: u64,
) -> Result<String, String> {
  Err("RS485 is desktop-only".into())
}

#[tauri::command]
fn greet() -> String {
  let now = SystemTime::now();
  let epoch_ms = now.duration_since(UNIX_EPOCH).unwrap().as_millis();
  format!("Hello world from Rust! Current epoch: {epoch_ms}")
}

/// Google's OAuth policy no longer allows custom URI scheme redirects (any
/// client type, since 2022 - "app impersonation" risk). The supported native-app
/// replacement is a loopback HTTP redirect: bind an ephemeral port on 127.0.0.1,
/// tell the frontend which port so it can build the redirect_uri, then block
/// until Google's browser redirect lands on it and hand the raw query string back.
#[tauri::command]
async fn oauth_loopback_listen(app: tauri::AppHandle) -> Result<String, String> {
  let listener = TcpListener::bind("127.0.0.1:0").await.map_err(|e| e.to_string())?;
  let port = listener.local_addr().map_err(|e| e.to_string())?.port();
  app.emit("oauth-loopback-port", port).map_err(|e| e.to_string())?;

  let (stream, _) = listener.accept().await.map_err(|e| e.to_string())?;
  let mut reader = BufReader::new(stream);
  let mut request_line = String::new();
  reader.read_line(&mut request_line).await.map_err(|e| e.to_string())?;

  let query = request_line
    .split_whitespace()
    .nth(1)
    .unwrap_or("")
    .split_once('?')
    .map(|(_, q)| q.to_string())
    .unwrap_or_default();

  let has_error = query.split('&').any(|pair| pair.starts_with("error="));
  let body = render_callback_page(has_error);
  let response = format!(
    "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\n\r\n{}",
    body.len(),
    body
  );
  let mut stream = reader.into_inner();
  let _ = stream.write_all(response.as_bytes()).await;

  Ok(query)
}

// Embedded at compile time (works the same in a bundled/installed app, no runtime file lookup relative
// to the exe) — edit assets/oauth-callback.html directly, its __PLACEHOLDER__s are filled in below.
const OAUTH_CALLBACK_TEMPLATE: &str = include_str!("../assets/oauth-callback.html");

fn render_callback_page(has_error: bool) -> String {
  // Which icon shows is a CSS toggle in the template itself (body.success / body.error) — this only
  // says which state it is, not which icon markup to use.
  let (state, title, message) = if has_error {
    (
      "error",
      "Sign-in didn't complete",
      "Something went wrong or you cancelled the request. You can close this window and try again from the app.",
    )
  } else {
    (
      "success",
      "Sign-in complete",
      "You're all set - you can close this window and return to the app.",
    )
  };

  OAUTH_CALLBACK_TEMPLATE
    .replace("__STATE__", state)
    .replace("__TITLE__", title)
    .replace("__MESSAGE__", message)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  #[allow(unused_mut)]
  let mut builder = tauri::Builder::default();

  #[cfg(desktop)]
  {
    // Fires in the ALREADY-RUNNING instance when a second launch happens (e.g. the OS invoking us
    // again for a smarthome:// link while the app is already open — Windows/Linux have no other way
    // to deliver it). The "deep-link" feature on this plugin (Cargo.toml) already re-dispatches that
    // second launch's argv into the deep-link plugin's own onOpenUrl/getCurrent (so the frontend's
    // listeners still fire); what it does NOT do is bring the window forward, so without this the
    // link is handled but the app just sits there — indistinguishable from "the app didn't open".
    builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
      if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
      }
    }));
  }

  // FCM push tokens exist on mobile only (desktop has no FCM).
  #[cfg(mobile)]
  {
    builder = builder.plugin(tauri_plugin_fcm::init());
  }

  builder
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_deep_link::init())
    .plugin(tauri_plugin_http::init())
    .plugin(tauri_plugin_blec::init())
    .manage(DeviceStreamState::default())
    .setup(|_app| {
      #[cfg(windows)]
      {
        _app.deep_link().register_all()?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      greet,
      oauth_loopback_listen,
      device_stream_start,
      device_stream_stop,
      notification_stream_start,
      notification_stream_stop,
      list_serial_ports,
      serial_send_command
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
