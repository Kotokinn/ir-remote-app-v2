// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Emitter;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpListener;

#[cfg(desktop)]
use tauri_plugin_deep_link::DeepLinkExt;

mod device_stream;
use device_stream::{
  device_stream_start, device_stream_stop, notification_stream_start, notification_stream_stop,
  DeviceStreamState,
};

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

fn render_callback_page(has_error: bool) -> String {
  let (icon, title, message) = if has_error {
    (
      "\u{26A0}\u{FE0F}",
      "Sign-in didn't complete",
      "Something went wrong or you cancelled the request. You can close this window and try again from the app.",
    )
  } else {
    (
      "\u{2705}",
      "Sign-in complete",
      "You're all set - you can close this window and return to the app.",
    )
  };

  format!(
    r#"<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>{title}</title>
<style>
  :root {{ color-scheme: light dark; }}
  * {{ box-sizing: border-box; }}
  body {{
    margin: 0;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    padding: 24px;
  }}
  .card {{
    background: #ffffff;
    border-radius: 20px;
    padding: 40px 36px;
    max-width: 380px;
    width: 100%;
    text-align: center;
    box-shadow: 0 20px 60px rgba(79, 70, 229, 0.35);
  }}
  .icon {{
    font-size: 48px;
    line-height: 1;
    margin-bottom: 16px;
  }}
  h1 {{
    font-size: 20px;
    margin: 0 0 12px;
    color: #1f2937;
  }}
  p {{
    font-size: 14px;
    line-height: 1.6;
    color: #6b7280;
    margin: 0;
  }}
  .hint {{
    margin-top: 24px;
    font-size: 12px;
    color: #9ca3af;
  }}
</style>
</head>
<body>
  <div class="card">
    <div class="icon">{icon}</div>
    <h1>{title}</h1>
    <p>{message}</p>
    <div class="hint">This window will try to close automatically.</div>
  </div>
  <script>
    setTimeout(function () {{ window.close(); }}, 500);
  </script>
</body>
</html>"#
  )
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  #[allow(unused_mut)]
  let mut builder = tauri::Builder::default();

  #[cfg(desktop)]
  {
    builder = builder.plugin(tauri_plugin_single_instance::init(|_app, _argv, _cwd| {}));
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
      notification_stream_stop
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
