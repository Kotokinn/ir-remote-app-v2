# Giao diện (theme)

Toàn bộ màu, font, bo góc và bóng nằm trong **một file**: `src/styles/theme.css`. Đổi theme = thay file này, không cần sửa component (component chỉ dùng token như `bg-primary`, `text-muted-foreground`; nền gradient `bg-brand-gradient` tự tạo từ `--primary`).

## Áp theme một lệnh
```bash
npm run theme -- --list                              # tên các theme trên tweakcn.com
npm run theme -- cosmic-night                        # theo tên
npm run theme -- https://tweakcn.com/themes/<id>     # URL trang theme (cả theme tự lưu của bạn)
npm run theme -- theme.json                          # JSON đã lưu từ tweakcn
npm run theme -- theme.css                           # CSS dán từ tab "Code" của tweakcn
```
Script tự:
- ghi lại `src/styles/theme.css` (màu sáng/tối, `@theme inline`, bóng, bo góc);
- nạp font Google của theme (`@import` trong file, cần mạng ở lần đầu; không có mạng thì dùng font dự phòng);
- cập nhật màu thanh trình duyệt/PWA (`themeColor` trong `layout.tsx`, `theme_color` trong `manifest.webmanifest`);
- cảnh báo (`hint:`) nếu `--primary` quá gần màu nền — khi đó chữ/biểu tượng màu chính khó đọc (thường ở chế độ tối); chọn theme khác hoặc chỉnh `--primary` trong khối `.dark`.

Hoàn tác: `git checkout src/styles/theme.css` (và `layout.tsx`, `public/manifest.webmanifest`), hoặc áp theme khác.

## Chỗ còn màu cố định (có chủ đích)
- Chữ trắng trên nền `destructive`, nền trắng của mã QR, nền đen khung camera, màu trang trí của biểu tượng.
- Trang bàn giao đăng nhập của auth-service (`AppHandoffPage`) có màu riêng — sửa phía server nếu cần đồng bộ.

## Quy tắc khi viết UI
Dùng token (`bg-primary`, `text-primary-foreground`, `text-muted-foreground`, `border-border`…). Trên bề mặt `bg-brand-gradient`/`bg-primary` dùng `text-primary-foreground` (và `-foreground/80` cho chữ phụ), **không** dùng `text-white`.
