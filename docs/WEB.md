# Bản web

Cùng một mã nguồn chạy được trong app cài đặt (Tauri) và trong trình duyệt. Trình duyệt hỗ trợ Web Bluetooth (Chrome/Edge, desktop và Android) và Web Serial (Chrome/Edge, chỉ desktop) — xem [BLE-SERIAL-WEB.md](BLE-SERIAL-WEB.md); trình duyệt nào không hỗ trợ thì tự động chỉ còn MQTT. Deep link và push (FCM) thì chỉ có ở app.

## Build và triển khai
```
npm run build        # xuất tĩnh ra dist/ (cũng là thứ Tauri đóng gói)
```
- Đặt `NEXT_PUBLIC_API_URL` = địa chỉ api-gateway (vd `https://dev.vietdanjsc.com`) trước khi build.
- Đưa `dist/` lên hosting tĩnh (Cloudflare Pages, nginx…). Hosting phải phục vụ **URL không đuôi** (`/home` → `home.html`, `/auth/callback` → `auth/callback.html`). Cloudflare Pages tự làm; nginx: `try_files $uri $uri.html $uri/ =404;`.
- HTTPS bắt buộc ngoài localhost (camera quét QR, đăng nhập).

## Phía server (services)
1. **CORS** — api-gateway: thêm origin của web vào `GATEWAY_CORS_ALLOWED_ORIGINS` (vd `https://app.vietdanjsc.com`).
2. **Đăng nhập Google** — auth-service: thêm cùng origin vào `AUTH_WEB_RETURN_ORIGINS` (khớp chính xác, phân tách bằng dấu phẩy; rỗng = tắt đăng nhập web). Không cần đổi gì trên Google Cloud Console: web dùng lại luồng qua auth-service.

## Đăng nhập hoạt động thế nào
Nút "Continue with Google" chuyển cả trang tới `<API>/oauth2/authorization/google?return_to=<origin>/auth/callback`. Sau Google, auth-service chuyển hướng về `/auth/callback#accessToken=…&refreshToken=…` (token nằm ở phần `#`, trình duyệt không gửi lên server và không ghi log). Trang callback lưu phiên, xoá `#` khỏi thanh địa chỉ, rồi vào `/home`. Chỉ origin trong `AUTH_WEB_RETURN_ORIGINS` và đường dẫn đúng `/auth/callback` mới được nhận token.

## Khác biệt so với app
| | App | Web |
|---|---|---|
| Gọi API | Tauri HTTP (không CORS) | `fetch` (cần CORS) |
| Luồng thời gian thực (SSE) | Rust | `fetch` streaming (`src/lib/sse.ts`), tự nối lại |
| Bluetooth / RS485 | có | có, nếu trình duyệt hỗ trợ (Chrome/Edge) — xem [BLE-SERIAL-WEB.md](BLE-SERIAL-WEB.md) |
| Ghép nối hub/module mới | có | có, nếu trình duyệt hỗ trợ Web Bluetooth; ngược lại hiện thông báo "trình duyệt này không ghép nối được" |
| Push (FCM), deep link | có | không |
| Hàng đợi đồng bộ offline | có | có (localStorage); đường BLE/RS485 để điều khiển khi mất mạng phụ thuộc trình duyệt có hỗ trợ hay không |

`src/lib/platform.ts` (`runsInApp()` / `useRunsInApp()`) là chỗ duy nhất để hỏi "đang ở app hay web". Mã cần phần native phải hỏi ở đó trước.

## Cài như ứng dụng (PWA)
`public/manifest.webmanifest` cho phép "Add to Home screen". Chưa có service worker, nên mở khi hoàn toàn offline chưa được (dữ liệu đã lưu và hàng đợi thay đổi vẫn còn trong trình duyệt).

## Thử nhanh
Chạy `npm run dev` (http://localhost:3000): origin này đã có sẵn trong cấu hình mặc định của `docker-compose.yml` (CORS và `AUTH_WEB_RETURN_ORIGINS`).
