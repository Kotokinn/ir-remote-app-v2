# Bluetooth và RS485 trên bản web

Bản web dùng Web Bluetooth và Web Serial để làm đúng việc app đang làm qua Tauri: ghép nối hub mới, và gửi lệnh trực tiếp khi MQTT không tới được thiết bị. Cùng một giao thức khung tin (`docs/MQTT_API.md` "BLE chi tiết" / "RS485 chi tiết"), khác mô hình cấp quyền của trình duyệt.

## Hỗ trợ theo trình duyệt
| | Web Bluetooth | Web Serial |
|---|---|---|
| Chrome / Edge — máy tính | có | có |
| Chrome — Android | có | không |
| Firefox, Safari, iOS | không | không |

`isWebBluetoothSupported()` / `isWebSerialSupported()` (`lib/device/web-bluetooth.ts`, `lib/device/web-serial.ts`) kiểm tra runtime (`"bluetooth" in navigator` / `"serial" in navigator`) — không đoán theo tên trình duyệt.

## Khác mô hình cấp quyền so với app
- **App (Tauri):** quét thấy danh sách nhiều thiết bị kèm RSSI (`@mnlphlp/plugin-blec`), người dùng chọn trong danh sách của app. COM port: liệt kê tự do mọi cổng máy đang có (`serialport::available_ports()`).
- **Web:** trình duyệt sở hữu hộp thoại chọn thiết bị/cổng, không có API liệt kê tự do. Vì vậy:
  - **Bluetooth:** `navigator.bluetooth.requestDevice()` vừa quét vừa chọn trong MỘT hộp thoại của trình duyệt, trả về đúng một thiết bị. Màn "Select your device" (danh sách RSSI) không tồn tại trên web — bước "scanning" của `BleProvisioning` hiện nút "Choose a Bluetooth device" thay vì tự quét, và bấm vào coi như đã "pick" luôn.
  - **Serial:** `navigator.serial.getPorts()` chỉ trả cổng **đã được cấp quyền trước đó**. Thấy cổng MỚI luôn cần `requestPort()` (hộp thoại chọn cổng). `TransportPicker`'s "Rescan" trên web nghĩa là "xin thêm một cổng", không phải liệt kê lại.
- **Cả hai đều cần cử chỉ người dùng trực tiếp** (bấm chuột) để mở hộp thoại — không gọi được từ `useEffect` hay sau một `await` khác. Đây là lý do `ble-provisioning.tsx` không tự quét khi vào màn hình trên web.

## Kết nối lại để gửi lệnh (không phải lúc ghép nối)
Khi MQTT không tới được thiết bị, `sendDeviceCommand` thử qua BLE/RS485 (`device-commands.ts`). Lúc này KHÔNG có cử chỉ người dùng nào đang diễn ra — nên:
- **RS485:** không vấn đề gì. Một khi cổng đã được cấp quyền, `getPorts()` và `port.open()` dùng lại được **mãi mãi**, không cần hộp thoại nữa (cho tới khi người dùng tự thu hồi quyền trong cài đặt trình duyệt).
- **Bluetooth:** chỉ kết nối lại được nếu trang còn nhớ thiết bị đó (`lib/device/web-bluetooth.ts`'s `knownDevices`, tồn tại trong phiên trang hiện tại — mất khi tải lại trang) hoặc trình duyệt hỗ trợ `navigator.bluetooth.getDevices()` (Chrome mới, không phải mọi bản Chrome). Không có cả hai thì việc gửi lệnh qua BLE báo lỗi rõ ràng, không treo — người dùng cần mở lại "Connection method" và ghép nối lại. Đây là giới hạn thật của Web Bluetooth, không phải lỗi.

## Định danh cổng COM trên web
Web Serial không cho tên kiểu "COM3". `serialPort` (đã có sẵn trong `hubs-store.ts`, chỉ lưu local) trên web chứa chuỗi dạng `USB 1a86:7523` — lấy từ vendor/product id của bộ chuyển USB-serial (`port.getInfo()`), ổn định qua các lần tải lại trang cho cùng một thiết bị vật lý. Cổng không phải USB-serial (hiếm) rơi về `Port 1`, `Port 2`… không đảm bảo ổn định.

## File liên quan
- `lib/device/web-bluetooth.ts`, `lib/device/web-serial.ts` — cài đặt, có test (`*.test.ts`).
- `lib/device/ble-provisioning.ts`, `lib/device/ble-transport.ts`, `lib/device/serial-transport.ts` — rẽ nhánh app/web, giữ nguyên phía app.
- `components/home/add-device/ble-provisioning.tsx`, `components/home/transport-picker.tsx` — phần giao diện khác nhau giữa hai nền tảng.

## Đã kiểm tra
Chạy qua Chromium thật với `navigator.bluetooth`/`navigator.serial` giả lập đầy đủ vòng GATT: ghép nối hub mới trên web xong tới bước đặt tên (kèm khung `init|{...}` gửi đi đúng như app), và "Rescan" trên `TransportPicker` xin cấp một cổng COM mới, hiện đúng nhãn `USB xxxx:xxxx`. Chưa thử trên phần cứng thật hay trên Chrome/Edge thật (chỉ Chromium test giả lập API).
