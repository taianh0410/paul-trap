# PAUL TRAP · 7 thập kỷ Khoa Vật lý HUS

Bản **tích hợp mới có thể khởi động** dựa trên tài liệu `KẾ HOẠCH LẬP TRÌNH CHI TIẾT.pdf` và các nhánh mã nguồn gốc `24001789`, `Paul_trap_Mobile_cilent`, `feature/viet-anh`, `upload-code`, `master`. Giữ giao thức gốc của Backend: namespace `/ion-trap`, `join_room` (room ID chuỗi), `sensor_data` (`{roomId,beta,gamma}`), `sync_data` (`{beta,gamma}`). Phần state machine bổ sung các sự kiện mới.

## Chạy trên Windows

Cài **Node.js 18+** rồi mở PowerShell trong thư mục dự án:

```powershell
npm install
npm start
```

Mở **http://localhost:3000** trên laptop. Trên điện thoại, mở QR hoặc địa chỉ `/mobile?room=XXXXXX` hiển thị trên màn hình. Để điện thoại nhận cảm biến chuyển động, nên triển khai **HTTPS có chứng chỉ được điện thoại tin cậy** (Safari/iOS và nhiều trình duyệt Android hạn chế DeviceOrientation trên HTTP LAN). Nếu chỉ muốn kiểm thử kết nối/gameplay trên máy tính, chọn **BẬT JOYSTICK** trên trang Mobile.

Để bật Admin, đặt `$env:ADMIN_TOKEN="your-strong-secret-123"` trước khi chạy server, sau đó mở `/admin`. Không chia sẻ token cho người chơi.

Có thể đặt `PORT=3000` trong môi trường; mặc định 3000. Server tự lấy IPv4 LAN đầu tiên khi tạo QR từ `localhost` (nếu máy có nhiều card mạng, kiểm tra lại địa chỉ trong QR).

### HTTPS nội bộ

Tạo chứng chỉ tin cậy cho địa chỉ IP/tên miền nội bộ bằng `mkcert` hoặc dùng reverse proxy HTTPS. Trên PowerShell:

```powershell
$env:TLS_KEY="C:\\path\\to\\key.pem"
$env:TLS_CERT="C:\\path\\to\\cert.pem"
npm start
```

Truy cập `https://<IP-LAN>:3000`. Điện thoại phải tin cậy chứng chỉ đó. Nếu không thiết lập HTTPS, vẫn dùng được joystick thử nghiệm.

### Docker

```bash
docker compose up --build
```

## Cách chơi

1. Màn hình laptop tự tạo phòng và QR.
2. Điện thoại quét QR, kết nối, cấp quyền cảm biến, hiệu chuẩn rồi nhấn **SẴN SÀNG**.
3. Laptop nhấn **BẮT ĐẦU**; cả hai nhận đếm ngược 3–2–1.
4. Mỗi màn 20 giây. Nghiêng điện thoại để giữ hạt trong bẫy. Đụng biên hoặc điểm hút: thua.
5. Qua màn: chọn **NHẬN QUÀ & DỪNG** hoặc **TIẾP TỤC**. Qua màn 7: kết thúc thắng.
6. Nhấn **CHƠI LẠI** để reset; điện thoại phải nhấn READY lại.

## Phân tách module

- `server.js`: Node/Express/Socket.IO; phòng và vai trò display/mobile, lọc EMA, xác thực dữ liệu, state machine, countdown, kết thúc, reset.
- `public/js/engine.js`: mô phỏng 2D 7 giai đoạn, fixed step 60 Hz, va chạm, lực nhiễu, shock, mass, attractor, rotating coordinates.
- `public/js/display.js`: Canvas, UI, QR, quản lý màn hình và gameplay.
- `public/js/mobile.js`: DeviceOrientation, hiệu chuẩn, READY, 60 Hz, rung, joystick dự phòng.
- `legacy/original-IonTrapPhysicsEngine.js`: bản engine cũ để đối chiếu.

## API chính

`create_room` (display) → `{ok,roomId,state}`; `join_room` (mobile, chuỗi) → ack; `player_ready`; `start_game`; `sensor_data`; `sync_data`; `room_state`; `countdown`; `stage_complete`; `stage_clear`; `next_stage`; `claim_reward`; `game_over`; `victory`; `reset_game`.

**Lưu ý phạm vi:** Tài liệu không định nghĩa cụ thể loại quà, cách trao quà hay điểm số. Game hiện hiển thị lựa chọn nhận quà và kết thúc lượt, **không tự phát thưởng vật lý**. Admin được viết lại tại `/admin`, kết nối namespace `/admin` bằng biến môi trường `ADMIN_TOKEN` (tối thiểu 12 ký tự), cho phép xem phòng, reset, kết thúc, ép hoàn thành/qua màn. Đây là Admin thay thế tương thích với state machine mới, không phải giao diện Admin gốc. Trước khi đưa ra sự kiện cần kiểm thử trên điện thoại thật, mạng LAN, HTTPS, nhiều phiên chơi và hiệu chỉnh độ khó. Chưa được xác nhận end-to-end trong môi trường tác giả nếu chưa chạy npm và browser thực tế.

## Kiểm tra

```bash
npm test
node --check server.js
```
