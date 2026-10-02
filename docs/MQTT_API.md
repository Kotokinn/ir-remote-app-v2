# Giao thức dữ liệu HUB-IR (MQTT + BLE)

Tài liệu này mô tả topic và JSON payload để gửi/nhận dữ liệu với firmware `src/main.cpp`.
Nguồn contract chính xác là code (`buildTopics()`, `processCommand()`, `processConfig()`, `addSchedule()`, `dispatchTopicPayload()`); tài liệu này chỉ tóm tắt lại.

## Transport

Thiết bị hỗ trợ **hai đường truyền song song, cùng topic và cùng payload**:

- **MQTT** — kết nối tới TBMQ broker (`TBMQ_SERVER:TBMQ_PORT`), username/password tĩnh (`MQTT_USERNAME`/`MQTT_PASSWORD`), client ID = `deviceId`.
- **BLE** — GATT server (NimBLE), dùng khi chưa có WiFi hoặc muốn giao tiếp cục bộ không qua broker. Chi tiết đầy đủ ở mục [BLE chi tiết](#ble-chi-tiết).

Mọi payload chỉ nhận trên MQTT sẽ tự động cũng nhận được qua BLE nếu app kết nối BLE, và ngược lại — cùng một hàm xử lý (`dispatchTopicPayload()`).

## Định danh thiết bị

| Thành phần | Giá trị | Ghi chú |
|---|---|---|
| `tenant` | `tenant-001` | hằng số `TENANT_ID` |
| `profile` | `SmartIrHub` | hằng số `DEVICE_PROFILE` |
| `deviceId` | 12 ký tự hex, VD `A1B2C3D4E5F6` | sinh từ eFuse MAC lúc boot (`initDeviceId()`), in ra Serial log `[DEVICE] Device ID (eFuse MAC): ...` |

Tất cả topic bên dưới có dạng nền:

```
v1/tenants/<tenant>/devices/<profile>/<deviceId>/<phần riêng>
```

(riêng `claim` không có prefix `v1/tenants/<tenant>`, xem bảng topic).

## Bảng topic

| Topic | Chiều | Retained | Mô tả |
|---|---|---|---|
| `.../telemetry` | device → server | không | Dữ liệu đo định kỳ (`TELEMETRY_SEND_INTERVAL_MS`, hiện 5 phút/lần) |
| `.../attributes` | device → server | có | Thông tin thiết bị, publish khi connect hoặc khi state đổi |
| `.../state` | device → server | có | **Hiện diện (presence)** — chỉ đổi khi thiết bị online/offline: `online:true` lúc connect MQTT, `online:false` do LWT |
| `.../events` | device → server | không | Thông báo sự kiện (hiện: firmware mới / tiến trình OTA, xem mục 9) |
| `.../commands/request/<requestId>` | server → device | không | Server gửi lệnh, `<requestId>` tự đặt để khớp response |
| `.../commands/response/<requestId>` | device → server | không | Phản hồi lệnh, topic khớp đúng `requestId` vừa gửi |
| `.../config/set` | server → device | không | Đổi state trực tiếp (không cần request/response) |
| `.../schedule/set` | server → device | không | Thêm lịch hẹn giờ (xem mục Schedule) |
| `devices/<profile>/<deviceId>/claim` | device → server | không | Claim thiết bị, gửi tự động lúc connect (nếu bật) |
| `init` (chỉ qua BLE) | server → device | — | Cấu hình WiFi/timezone lần đầu, chưa cần kết nối WiFi |

Subscribe từ phía thiết bị (server publish vào các topic này để điều khiển): `commands/request/+`, `config/set`, `schedule/set`.

---

## 1. Telemetry — `.../telemetry`

Publish định kỳ mỗi `TELEMETRY_SEND_INTERVAL_MS` (hiện **5 phút**). Không retained — app/backend không được suy ra online/offline từ việc telemetry im (dùng `state`, mục 3).

```json
{
  "deviceName": "A1B2C3D4E5F6",
  "temp": 28.5,
  "ledMode": 0,
  "rssi": -52
}
```

- `temp`: nhiệt độ tại vị trí đặt hub (°C) đo bằng NTC, `NaN`/`null` nếu chưa đọc được lần nào.
- `ledMode`: 0 = LED báo hiệu (built-in) sáng cố định, 1 = nháy.
- `rssi`: cường độ WiFi (dBm).

## 2. Attributes — `.../attributes`

Publish (retained) lúc kết nối MQTT và mỗi khi thuộc tính đổi.

```json
{
  "deviceName": "A1B2C3D4E5F6",
  "serialNumber": "A1B2C3D4E5F6",
  "macAddress": "AA:BB:CC:DD:EE:FF",
  "localIp": "192.168.1.50",
  "ssid": "Viet Dan",
  "bssid": "11:22:33:44:55:66",
  "channel": 6,
  "firmwareVersion": "1.0.0",
  "pendingFirmwareVersion": "",
  "ledMode": 0,
  "ledState": false,
  "blinkingInterval": 1000,
  "sleepModeActive": false
}
```

`pendingFirmwareVersion`: phiên bản firmware mới đang **chờ xác nhận cập nhật** (mục 9), chuỗi rỗng nếu không có.

## 3. State — `.../state` (presence)

`state` là kênh **hiện diện** và **chỉ thay đổi khi thiết bị online hoặc offline**. Retained, QoS 1.

- Thiết bị publish `online:true` **một lần mỗi phiên MQTT** (ngay sau khi connect).
- Khi mất kết nối không sạch (mất điện, mất WiFi, treo), broker tự publish Last Will `online:false` sau ~1.5× keepalive (keepalive 30s ⇒ ~45s).

```json
{ "deviceName": "A1B2C3D4E5F6", "online": true }
```

Mọi dữ liệu vận hành khác (`ledMode`, `rssi`, `temp`...) nằm ở `attributes` / `telemetry`, không nằm trong `state`. Vì `state` retained nên client mới subscribe sẽ nhận ngay trạng thái hiện tại.

## 4. Commands — `.../commands/request/<requestId>` → `.../commands/response/<requestId>`

Payload chung: `{ "method": "<tên method>", "params": { ... } }`.
Response chung:

```json
{
  "success": true,
  "message": "…",
  "ledMode": 0,
  "ledState": false,
  "blinkingInterval": 1000,
  "sleepModeActive": false
}
```

### getState

Không cần `params`. Trả về `success:true` cùng state hiện tại (không thao tác gì).

```json
{ "method": "getState" }
```

### confirmOtaUpdate

Xác nhận cập nhật firmware mới mà thiết bị đã báo (mục 9). Thiết bị chỉ tải và cập nhật sau lệnh này. `params.version` là tuỳ chọn: nếu có, phải khớp `pendingFirmwareVersion` (tránh xác nhận nhầm bản cũ).

```json
{ "method": "confirmOtaUpdate", "params": { "version": "1.1.0" } }
```

Response `success:true` `"Firmware update started"`; `success:false` với `"No firmware update pending"`, `"Version does not match pending update"` hoặc `"Firmware update already in progress"`. Thiết bị tự khởi động lại khi cập nhật xong.

### setLedMode

Đổi mode LED báo hiệu (0 = sáng cố định, 1 = nháy).

```json
{ "method": "setLedMode", "params": { "mode": 1 } }
```

### setLedState

Bật/tắt LED báo hiệu ngay (chỉ có tác dụng khi `ledMode = 0`).

```json
{ "method": "setLedState", "params": { "state": true } }
```

### setBlinkingInterval

Đổi chu kỳ nháy (ms), hợp lệ trong khoảng 10 - 60000.

```json
{ "method": "setBlinkingInterval", "params": { "value": 500 } }
```

### claim

Gửi lại claim request (secretKey = deviceId) lên topic claim.

```json
{ "method": "claim" }
```

### sendAc

Build lệnh AC qua `IR_UNIVERSAL_ENGINE` rồi phát IR. **Device chỉ gửi đúng 1 protocol app chỉ định cho mỗi lệnh, không tự thử protocol nào khác.** Một hãng thường có nhiều biến thể encode, nên để ghép cặp điều hoà thì app tự gửi lần lượt từng protocol của hãng (mỗi protocol 1 lệnh `sendAc`), người dùng xác nhận điều hoà phản ứng ở lần nào thì lưu protocol đó lại.

```json
{
  "method": "sendAc",
  "params": {
    "protocol": "PANASONIC_AC32",
    "power": true,
    "temp": 26,
    "mode": 1,
    "fan": 0,
    "swing": 0
  }
}
```

- `protocol`: giá trị decodeType của IRremoteESP8266 — **tên** (`"PANASONIC_AC32"`, không phân biệt hoa thường) **hoặc số** `decode_type_t` tương ứng. `brand` là tên cũ của cùng trường, vẫn được nhận nếu không có `protocol`.
  - Không nhận ra giá trị: `success:false`, `"Unknown AC protocol"`.
  - Nhận ra nhưng thư viện IRac không build được (VD `SAMSUNG`, `MIDEA24`, `DAIKIN200`): `success:false`, `"AC protocol not supported"` — không phát ra gì.
- `mode`: 0=auto, 1=cool, 2=heat, 3=dry, 4=fan
- `fan`: 0=auto, 1=low, 2=medium, 3=high, 4=min, 5=max
- `swing`: 0=off, 1=auto, 2=highest, 3=high, 4=middle, 5=low, 6=lowest, 7=upperMiddle

Protocol hợp lệ theo hãng (thứ tự gợi ý để app thử lần lượt; chỉ gồm protocol IRac build được):

| Hãng | Protocol |
|---|---|
| Daikin | `DAIKIN`, `DAIKIN2`, `DAIKIN64`, `DAIKIN128`, `DAIKIN152`, `DAIKIN160`, `DAIKIN176`, `DAIKIN216`, `DAIKIN312` |
| Panasonic | `PANASONIC_AC`, `PANASONIC_AC32` |
| LG | `LG`, `LG2` |
| Midea | `MIDEA` |
| Samsung | `SAMSUNG_AC` |
| Mitsubishi | `MITSUBISHI_AC`, `MITSUBISHI_HEAVY_88`, `MITSUBISHI_HEAVY_152`, `MITSUBISHI112`, `MITSUBISHI136` |
| Hitachi | `HITACHI_AC`, `HITACHI_AC1`, `HITACHI_AC264`, `HITACHI_AC296`, `HITACHI_AC344`, `HITACHI_AC424` |
| Haier | `HAIER_AC`, `HAIER_AC_YRW02`, `HAIER_AC160`, `HAIER_AC176` |
| Carrier | `CARRIER_AC64` |
| Sharp | `SHARP_AC` |
| Sanyo | `SANYO_AC`, `SANYO_AC88` |
| Toshiba | `TOSHIBA_AC` |
| Fujitsu | `FUJITSU_AC` |
| Gree | `GREE` |
| Coolix | `COOLIX` |
| Whirlpool | `WHIRLPOOL_AC` |
| Electra | `ELECTRA_AC` |
| TCL | `TCL112AC` |
| Trotec | `TROTEC`, `TROTEC_3550` |
| Kelon | `KELON` |
| York | `YORK` |

### setSleepMode

Bật/tắt sleep mode cho AC. Có nhiệt độ dễ ngủ mặc định theo từng đối tượng (tham khảo khuyến nghị phổ biến), app có thể ghi đè bằng `targetTemp`. Bật `setSleepMode` mà chưa gửi `sendAc` lần nào trong phiên, hoặc RTC chưa sẵn sàng, đều bị từ chối.

```json
{ "method": "setSleepMode", "params": { "enabled": true, "subject": "adult", "wakeTime": "06:00", "targetTemp": 24 } }
```

- `enabled`: `true` để bật (bắt buộc `subject` + `wakeTime`), `false` để tắt ngay (không gửi lệnh IR nào khi tắt, AC giữ nguyên trạng thái hiện tại).
- `subject`: `"child"` | `"adult"` | `"elder"` — quyết định nhiệt độ dễ ngủ mặc định nếu không có `targetTemp`.
- `wakeTime`: `"HH:MM"`, giờ kết thúc sleep mode.
- `targetTemp` *(tuỳ chọn)*: nhiệt độ mong muốn khi ngủ (°C, 16-30). Không có thì dùng mặc định theo `subject`: `child`=27, `adult`=25, `elder`=27.

Vòng đời (tính từ lúc `enabled:true`):

1. **Giữ nguyên (30 phút đầu)**: không gửi lệnh gì, AC vẫn chạy đúng cấu hình lúc bấm sleep (baseline = `sendAc` gần nhất).
2. **Giai đoạn ngủ**: set thẳng `targetTemp` (mặc định hoặc app tự chọn), sau đó **dùng chính cảm biến nhiệt của hub** (`temp` trong telemetry, mục 1) để bù trừ — vì setpoint AC không đảm bảo phòng thực sự đạt đúng mức đó:
   - Phòng đo được nóng hơn `targetTemp` quá 0.5°C → giảm setpoint 1°C (lạnh thêm).
   - Phòng đo được lạnh hơn `targetTemp` quá 0.5°C → tăng setpoint 1°C (bớt lạnh, tránh quá lạnh lúc ngủ).
   - Trong sai số 0.5°C → không đổi gì.
   - Độ phân giải bù trừ phụ thuộc chu kỳ đọc cảm biến của hub (`ROOM_TEMP_READ_INTERVAL_MS`, hiện 15 phút/lần) — không bù nhanh hơn tốc độ đo thật.
3. **Tới `wakeTime`**: dừng điều chỉnh, AC giữ nguyên setpoint cuối cùng (không có lệnh trả về cấu hình cũ, không tắt AC). Sleep mode tự tắt (`sleepModeActive:false`).

Ghi chú:
- Bất kỳ lệnh `sendAc` nào (người dùng chỉnh tay) trong lúc đang sleep sẽ **tự huỷ sleep mode** ngay, tránh việc thiết bị ghi đè lại lệnh vừa gửi.
- Trạng thái sleep mode **không lưu NVS** — khởi động lại thiết bị là mất phiên đang chạy (giống trạng thái buzzer đang kêu).
- Trạng thái hiện tại xem ở field `sleepModeActive` trong response lệnh và trong `attributes` (mục 2).

### setRgbColor

Đổi màu dải LED RGB (WS2812B) ngay lập tức.

```json
{ "method": "setRgbColor", "params": { "color": "#FF8800" } }
```

### setRgbMode

Đổi hiệu ứng dải LED RGB.

```json
{ "method": "setRgbMode", "params": { "mode": 6 } }
```

`mode` (0-11): `0`=OFF, `1`=STATIC, `2`=ROTATING, `3`=BREATHING, `4`=WAVE, `5`=RAINBOW, `6`=STROBE, `7`=SPARKLE, `8`=CONFETTI, `9`=POLICE, `10`=COLOR_WIPE, `11`=FIRE.

### setRgbBrightness

Đổi độ sáng dải LED RGB.

```json
{ "method": "setRgbBrightness", "params": { "value": 70 } }
```

`value`: 0-100 (%), map sang FastLED 0-255 nội bộ.

### setRgbSpeed

Đổi tốc độ hiệu ứng LED (chạy theo nhịp - STROBE/WAVE/SPARKLE/CONFETTI/POLICE/COLOR_WIPE). STATIC không dùng tới.

```json
{ "method": "setRgbSpeed", "params": { "value": 50 } }
```

`value`: 10-500 (ms/bước), càng nhỏ càng nhanh.

### setAlarm

Điều khiển buzzer (báo thức / còi). Buzzer nối chân `BUZZER_PIN` (GPIO 15), do `buzzerTask` sở hữu; lệnh đi qua queue nên tắt/đổi mode có hiệu lực ngay.

```json
{ "method": "setAlarm", "params": { "mode": "WAKEUP", "volume": 80, "crescendo": true, "durationMs": 60000 } }
```

- `mode` (bắt buộc): tên (không phân biệt hoa thường) hoặc số 0-7. Sai mode trả `success:false`, `"Invalid alarm mode"`.

  | Số | Tên | Âm thanh |
  |---|---|---|
  | 0 | `OFF` | Tắt còi |
  | 1 | `SHORT_BEEP` | 1 tiếng bíp ngắn (100ms) rồi tự tắt |
  | 2 | `LONG_BEEP` | 1 tiếng bíp dài (800ms) rồi tự tắt |
  | 3 | `SLOW` | Bíp chậm lặp lại (500ms) |
  | 4 | `FAST` | Bíp nhanh lặp lại (150ms) |
  | 5 | `SIREN_TWO_TONE` | Còi hai tông luân phiên |
  | 6 | `AMBULANCE` | Còi cứu thương (quét tần số lên/xuống) |
  | 7 | `WAKEUP` | Báo thức: chuỗi bíp ngắn, nghỉ 1 giây, lặp lại |

- `volume` (0-100, optional): âm lượng. Bỏ trống thì giữ giá trị đang dùng (mặc định 60).
- `crescendo` (bool, optional): âm lượng tăng dần từ 0 tới `volume`. Bỏ trống thì giữ giá trị đang dùng.
- `durationMs` (optional): tự tắt sau ngần này ms. Bỏ trống hoặc `0` = kêu liên tục tới khi gửi `mode: "OFF"` (các mode `SHORT_BEEP`/`LONG_BEEP` vốn tự tắt).

Tắt còi: `{ "method": "setAlarm", "params": { "mode": "OFF" } }`.

**Nút bấm tại chỗ:** nối 1 nút giữa `STOP_ALARM_BUTTON_PIN` (GPIO 16) và GND (kéo lên nội bộ, nhấn = mức thấp). **1 click = tắt còi ngay** (tương đương gửi `mode: "OFF"`), không cần mạng/MQTT/BLE và không đổi `volume`/`crescendo` đã lưu.

Dùng làm **báo thức hẹn giờ** bằng cách đặt `setAlarm` vào `startAction`/`endAction` của schedule (mục 6).

### setSchedule / deleteSchedule

Thêm/ghi đè và xoá **từng** schedule qua kênh command (có response, và app gửi được cả qua BLE). Payload của `setSchedule` giống hệt `schedule/set` (mục 6) — thêm trường `id` để định danh:

```json
{
  "method": "setSchedule",
  "params": {
    "id": "s12",
    "repeat": true,
    "days": [1, 2, 3, 4, 5],
    "startTime": "07:00",
    "startAction": [{ "method": "sendAc", "params": { "protocol": "DAIKIN", "power": true, "temp": 26, "mode": 1 } }],
    "endTime": "22:00",
    "endAction": [{ "method": "sendAc", "params": { "protocol": "DAIKIN", "power": false } }]
  }
}
```

- Gửi lại `setSchedule` với **cùng `id`** thì ghi đè lịch cũ (không tạo bản trùng) — dùng để sửa lịch.
- `id` (chuỗi ≤ 23 ký tự) do app đặt. Bỏ trống thì vẫn thêm được nhưng chỉ xoá được bằng `clearSchedules`.
- Response: `success:true` `"Schedule saved"`, hoặc `success:false` `"Schedule invalid or no free slot"` (payload sai, hoặc đủ 8 lịch và `id` chưa tồn tại).

Xoá 1 lịch theo `id`:

```json
{ "method": "deleteSchedule", "params": { "id": "s12" } }
```

Response `success:true` `"Schedule deleted"`, hoặc `success:false` `"Schedule not found"`. Cả hai đều ghi NVS ngay.

### clearSchedules

Xoá toàn bộ schedule (cả bản đã lưu trong NVS). Không cần `params`.

```json
{ "method": "clearSchedules" }
```

### Lưu cấu hình (NVS)

Các cấu hình sau được lưu vào flash và **giữ nguyên sau khi khởi động lại**: `ledMode`, `ledState`, `blinkingInterval`, màu, mode, độ sáng và tốc độ RGB (`setRgbColor`/`setRgbMode`/`setRgbBrightness`/`setRgbSpeed`), `volume`/`crescendo` của buzzer (`setAlarm`), và toàn bộ schedule (mục 6). Trạng thái đang kêu của buzzer không được lưu: khởi động lại là tắt còi. Lưu ngay khi đổi qua command hoặc `config/set`; nạp lại lúc boot. Schedule `repeat=false` đã chạy xong tự bị xoá khỏi NVS; schedule `repeat=true` tồn tại tới khi gọi `clearSchedules`. WiFi/timezone (mục 8) và token OTA vốn đã được lưu riêng.

### IR nhận thô

Không phải command — thiết bị tự động nhận tín hiệu IR ở `IR_RECEIVE_PIN` và phát lại y hệt qua `IR_SEND_PIN` bất cứ lúc nào không có lệnh `sendAc` đang chờ. Không cần publish gì để bật tính năng này.

---

## 5. Config — `.../config/set`

Đổi state trực tiếp, không qua request/response, không trả lời riêng (chỉ publish lại `state`/`attributes` nếu có gì đổi). Các field đều optional, gửi field nào đổi field đó:

```json
{
  "ledMode": 1,
  "ledState": true,
  "blinkingInterval": 500
}
```

## 6. Schedule — `.../schedule/set`

Thêm một lịch hẹn giờ (tối đa **8** lịch cùng lúc, mỗi bên start/end tối đa **6** action; toàn bộ payload phải nhỏ hơn 1024 byte). Topic này không có response; muốn có response và ghi đè/xoá riêng theo `id` thì dùng command `setSchedule`/`deleteSchedule` (mục 4).

```json
{
  "repeat": false,
  "startTime": "10:00",
  "startAction": [
    { "method": "sendAc", "params": { "protocol": "DAIKIN", "power": true, "temp": 26, "mode": 1 } }
  ],
  "endTime": "22:00",
  "endAction": [
    { "method": "sendAc", "params": { "protocol": "DAIKIN", "power": false } }
  ],
  "days": [1, 2, 3, 4, 5]
}
```

- `id` (optional): định danh do app đặt; gửi lại cùng `id` thì ghi đè, và `deleteSchedule` xoá theo `id` này.
- `startTime`/`endTime`: định dạng `"HH:MM"`, cả hai optional nhưng phải có ít nhất một.
- `startAction`/`endAction`: mảng action, mỗi phần tử đúng shape `{ "method", "params" }` như Command ở mục 4 (dùng chung toàn bộ danh sách method phía trên).
- `days`: mảng số 0-6, **0 = Chủ nhật … 6 = Thứ bảy** (chuẩn `DateTime::dayOfTheWeek()` của RTClib). Chỉ có tác dụng khi `repeat = true`.
- `repeat = false`: chạy đúng 1 lần (start rồi end) rồi tự huỷ lịch.
- `repeat = true`: lặp lại vào các ngày trong `days` mỗi tuần, không tự huỷ.

Ví dụ **báo thức 6:30 các ngày trong tuần**, kêu 1 phút với âm lượng tăng dần:

```json
{
  "repeat": true,
  "startTime": "06:30",
  "startAction": [
    { "method": "setAlarm", "params": { "mode": "WAKEUP", "volume": 80, "crescendo": true, "durationMs": 60000 } }
  ],
  "days": [1, 2, 3, 4, 5]
}
```

Yêu cầu RTC đã sync giờ thật (qua NTP) — nếu RTC chưa sẵn sàng, lịch bị bỏ qua (log Serial `[SCHEDULE] RTC chua san sang`).

## 7. Claim — `devices/<profile>/<deviceId>/claim`

Thiết bị tự publish khi connect MQTT (nếu `AUTO_CLAIM_ON_CONNECT = true`) hoặc khi nhận command `claim`.

```json
{
  "secretKey": "A1B2C3D4E5F6",
  "durationMs": 86400000
}
```

## 8. Init (chỉ qua BLE) — topic `init`

Dùng khi thiết bị **chưa có WiFi** — cấu hình lần đầu qua BLE trực tiếp (điện thoại kết nối BLE, không cần mạng).

```json
{
  "ssid": "Ten_WiFi",
  "ssid_pass": "mat_khau_wifi",
  "time_zone": "Asia/Ho_Chi_Minh"
}
```

- `ssid` bắt buộc, `ssid_pass`/`time_zone` optional.
- Thiết bị **thử kết nối WiFi trước** (tối đa 20 giây, `WIFI_CONNECT_TIMEOUT_MS`) để kiểm tra SSID/mật khẩu, rồi mới phản hồi qua BLE trên topic `init`. App nên chờ ACK ít nhất ~30 giây.
  - Kết nối được: lưu NVS, ACK `{"success":true,"message":"WiFi connected, rebooting"}`, chờ 3 giây cho ACK ra sóng rồi **tự khởi động lại** để áp dụng.
  - Kết nối thất bại (sai mật khẩu/SSID, không thấy mạng): **không lưu, không khởi động lại**, ACK `{"success":false,"message":"WiFi connect failed (wrong password or SSID?)"}`. Thiết bị giữ nguyên WiFi cũ, app có thể gửi lại `init` với thông tin khác.
  - Thiếu `ssid`: ACK `{"success":false,"message":"Missing ssid"}`.

---

## 9. Events / OTA có xác nhận — `.../events`

Thiết bị kiểm tra ThingsBoard mỗi 5 giờ (và ngay sau khi boot). Khi thấy phiên bản khác `firmwareVersion` hiện tại, thiết bị **không tự cập nhật** mà:

1. Publish một event `firmwareAvailable` lên `.../events` (mỗi phiên bản chỉ báo 1 lần; nếu lúc đó chưa gửi được thì thử lại sau 30 giây) và cập nhật attributes với `pendingFirmwareVersion`.
2. Chờ command `confirmOtaUpdate` (mục 4). Chưa xác nhận thì thiết bị giữ nguyên firmware đang chạy.
3. Sau khi xác nhận: tải, ghi flash, rồi khởi động lại. Nếu tải/ghi lỗi, bản mới vẫn ở trạng thái chờ (`pendingFirmwareVersion` giữ nguyên) và có thể gửi `confirmOtaUpdate` lại.

```json
{
  "deviceName": "A1B2C3D4E5F6",
  "type": "firmwareAvailable",
  "currentVersion": "1.0.0",
  "newVersion": "1.1.0",
  "title": "hub-ir"
}
```

`type`: `firmwareAvailable` (có bản mới, chờ xác nhận) · `otaStarted` (đã xác nhận, bắt đầu tải) · `otaSuccess` (ghi xong, sắp khởi động lại) · `otaFailed` (lỗi, vẫn chờ). Cấu trúc payload giống nhau ở cả bốn loại. Sau khi khởi động lại, `firmwareVersion` trong attributes là phiên bản mới và `pendingFirmwareVersion` rỗng.

Đèn RGB báo trạng thái khi cập nhật: xanh dương nháy = đang cập nhật, xanh lá nháy = thành công, đỏ nháy = lỗi.

---

## BLE chi tiết

### Advertising / kết nối

| Thông tin | Giá trị |
|---|---|
| Tên thiết bị quảng bá (advertised name) | = `DEVICE_PROFILE` (VD `SmartIrHub`) — **chỉ để hiển thị**, giống nhau ở mọi thiết bị cùng loại, không dùng làm deviceId |
| Service UUID | `4fafc201-1fb5-459e-8fcc-c5c9c331914b` |
| Characteristic UUID | `bd4fcc47-3393-40d5-966e-7d38db846eab` |
| Characteristic properties | `READ`, `WRITE`, `WRITE NO RESPONSE`, `NOTIFY` |
| Descriptor | CCCD chuẩn `0x2902` (ghi `0x0001` để bật notify) |
| MTU thiết bị yêu cầu | 517 byte (thực tế phụ thuộc MTU hai bên thương lượng được) |
| Scan response | Bật (`enableScanResponse(true)`) — gói ADV chính 31 byte đã gần đầy với Flags + Service UUID 128-bit, tên dễ không đủ chỗ nếu nhét chung |

**deviceId thật** (eFuse MAC, duy nhất — cần cho `init`/claim) **không** nằm trong tên quảng bá. Ngay sau `begin()`, thiết bị set sẵn giá trị đầu tiên của characteristic thành frame `device|{"deviceId":"<MAC>"}` — app GATT **read** (không phải notify) characteristic này ngay sau khi connect, trước khi gửi/nhận bất kỳ frame nào khác, để lấy đúng deviceId trước khi `init`/claim (xem `lib/device/ble-provisioning.ts` hàm `readDeviceId()`).
| Advertising interval | 0x20–0x40 slot (~12.5ms–40ms) |

Chỉ **một** characteristic dùng chung cho cả gửi và nhận (không tách TX/RX riêng):

- App **ghi** (`write`/`write without response`) vào characteristic để gửi dữ liệu lên thiết bị.
- App **subscribe notify** (bật CCCD) để nhận dữ liệu thiết bị chủ động đẩy xuống (state/attributes/telemetry/command response...).
- App cũng có thể **read** characteristic để lấy lại payload cuối cùng thiết bị đã gửi (hữu ích khi vừa connect, chưa kịp nhận notify nào).

### Định dạng frame

Cả chiều gửi và nhận đều dùng **1 chuỗi text UTF-8** duy nhất, không phải JSON thuần:

```
<topic>|<payload_json>
```

Ký tự `|` đầu tiên là dấu phân tách; phần trước là topic (giống hệt topic MQTT ở các mục trên, hoặc `init`/`config/set`-style ngắn tuỳ ngữ cảnh), phần sau là JSON payload nguyên văn.

Ví dụ app gửi lệnh bật LED báo hiệu (tương đương publish MQTT vào `.../commands/request/<requestId>`):

```
v1/tenants/tenant-001/devices/SmartIrHub/A1B2C3D4E5F6/commands/request/req-1|{"method":"setLedState","params":{"state":true}}
```

Ví dụ thiết bị notify xuống telemetry:

```
v1/tenants/tenant-001/devices/SmartIrHub/A1B2C3D4E5F6/telemetry|{"deviceName":"A1B2C3D4E5F6","temp":28.5,"ledMode":0}
```

Ví dụ cấu hình WiFi lần đầu (topic ngắn `init`, xem mục 8):

```
init|{"ssid":"Ten_WiFi","ssid_pass":"matkhau","time_zone":"Asia/Ho_Chi_Minh"}
```

### Giới hạn cần biết

- Chưa có cơ chế fragment nhiều gói ATT — payload dài (vài trăm byte, ví dụ `attributes` đầy đủ field) có thể bị cắt cụt nếu vượt quá MTU thương lượng thực tế. Ưu tiên dùng BLE cho payload ngắn (`command`, `config/set`, `schedule/set`, `init`); dữ liệu nặng nên đọc qua MQTT khi có WiFi.
- Không có xác thực/mã hoá ở tầng ứng dụng — bảo mật dựa vào BLE pairing/bonding (nếu bật) của platform, không phải cơ chế riêng của firmware.
- Số kết nối BLE đồng thời tối đa theo cấu hình mặc định của NimBLE-Arduino (không giới hạn thêm ở tầng ứng dụng firmware).

## Ghi chú

- Mọi payload JSON phải nhỏ hơn `MQTT_BUFFER_SIZE` (1024 byte).
- `deviceId` cố định theo phần cứng (eFuse MAC), không đổi giữa các lần boot — dùng để build topic ở client.
- Thông báo và xác nhận OTA đi qua `.../events` + `confirmOtaUpdate` (mục 9). Riêng việc dò/tải firmware từ ThingsBoard dùng HTTPS qua `TB_HTTP_HOST` (`POST /api/tb/provision`, `GET /api/tb/{token}/attributes`, `GET /api/tb/{token}/firmware`), xem code `provisionDeviceToken()`/`fetchLatestFirmwareInfo()`/`downloadAndApplyFirmware()` trong `src/main.cpp`. 3 request này dùng `WiFiClientSecure::setInsecure()` (bỏ xác thực chứng chỉ server) — cần thiết vì ESP32 không đủ heap để verify-full khi không pin CA cert thật; chấp nhận đánh đổi vì payload chỉ là provisioning token/firmware, không phải dữ liệu nhạy cảm.
- `setInsecure()` vẫn không tránh được mbedTLS phải cấp phát heap để parse chứng chỉ/tính BIGNUM (RSA) lúc handshake. NimBLE chiếm khoảng 40KB heap khi đang chạy — đo thực tế có BLE thì chỉ còn ~58KB free/~50KB liền khối, không đủ (`BIGNUM - Memory allocation failed`); tắt hẳn BLE thì dư (~98KB).
- Chỉ `downloadAndApplyFirmware()` tắt tạm BLE (`NimBLEDevice::deinit`) trước khi gọi HTTPS rồi bật lại ngay sau, và cũng chỉ khi không có client BLE nào đang kết nối (`bleTransport.isConnected() == false`). `provisionDeviceToken()`/`fetchLatestFirmwareInfo()` **không đụng BLE** — dù `isConnected()==false` cũng không đủ để tắt an toàn cho 2 hàm này: `provisionDeviceToken()` bị gọi lại mỗi 30 giây khi chưa có token và giữ BLE tắt suốt cả lúc gọi HTTPS (vài giây/lần chứ không phải tức thời), nên dễ trúng đúng lúc app đang **gửi yêu cầu kết nối** (`isConnected()` vẫn đọc `false` ở bước này — chỉ báo "đã kết nối xong", không báo "đang kết nối") — NimBLE bị deinit giữa lúc đó khiến yêu cầu bị hủy (`request canceled`), y hệt bug đã gặp hai lần. Vì vậy 2 hàm này thiếu heap thì cứ fail, tự retry ở lần sau; chỉ hàm tải firmware (hiếm, do app xác nhận, không lặp theo chu kỳ) mới đánh đổi tắt BLE.
