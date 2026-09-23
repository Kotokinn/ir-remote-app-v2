// RS485 (desktop only): opens the assigned COM port per command, writes one frame, reads one
// response line, closes. See docs (smart-control repo) "RS485 chi tiết" for the wire format:
// "<full topic>|<payload_json>\n" at 9600 8N1, no Modbus. The firmware (V1) is a single,
// unaddressed slave, so one COM port must correspond to exactly one device — the frontend enforces
// that by assigning a port to a specific hub, not by anything in the frame itself.
//
// Opened per call rather than held open: a command is one request/response round trip (same shape
// as an MQTT publish or a BLE write), and not holding the OS handle between commands means nothing
// else on the machine is locked out of the port while idle.
use std::io::{BufRead, BufReader, Write};
use std::time::Duration;

#[tauri::command]
pub fn list_serial_ports() -> Result<Vec<String>, String> {
    serialport::available_ports()
        .map(|ports| ports.into_iter().map(|p| p.port_name).collect())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn serial_send_command(
    port_name: String,
    baud: u32,
    frame: String,
    timeout_ms: u64,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut port = serialport::new(&port_name, baud)
            .timeout(Duration::from_millis(timeout_ms))
            .open()
            .map_err(|e| format!("Couldn't open {port_name}: {e}"))?;

        // The firmware appends '\n' itself on its own publishes (RS485MQTT::publish); we do the
        // same here rather than making the caller remember to, matching how BLE's frame has no
        // such suffix (a GATT write is already one discrete packet).
        port.write_all(frame.as_bytes())
            .and_then(|_| port.write_all(b"\n"))
            .map_err(|e| format!("Write to {port_name} failed: {e}"))?;
        port.flush().map_err(|e| format!("Flush on {port_name} failed: {e}"))?;

        let mut reader = BufReader::new(port);
        let mut line = String::new();
        reader
            .read_line(&mut line)
            .map_err(|e| format!("No response from {port_name}: {e}"))?;

        let trimmed = line.trim_end_matches(['\r', '\n']);
        if trimmed.is_empty() {
            return Err(format!("No response from {port_name} within {timeout_ms}ms"));
        }
        Ok(trimmed.to_string())
    })
    .await
    .map_err(|e| format!("Serial task panicked: {e}"))?
}
