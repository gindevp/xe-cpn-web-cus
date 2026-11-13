# Web khách hàng CPN – mã tham khảo

Thư mục `screens/` chứa mã nguồn prototype của 14 màn. Mỗi file là một trang HTML với style inline, kèm đoạn script mô tả trạng thái (dropdown, tab, công tắc, toast).

Lưu ý:
- File chạy trên runtime của canvas thiết kế (`support.js`), nên mở trực tiếp bằng trình duyệt sẽ không hiển thị đúng. Để xem và bấm thử, dùng prototype: https://claude.ai/artifact/3kxY2jhYiEtGwqKHoahNTc
- Dùng file để lấy giá trị style (màu, cỡ chữ, khoảng cách, bo góc) và logic hiển thị. Dựng lại bằng framework và component của dự án, không chép nguyên.
- Cú pháp `{{ten}}`, `<sc-if>`, `<sc-for>` là chỗ dữ liệu động: giá trị lấy từ API thật.
- Token màu, chữ, khoảng cách nằm ở `cpn-tokens.css`.
- Đặc tả đầy đủ: tài liệu "Bàn giao dev – Web khách hàng CPN": https://claude.ai/artifact/HFS4Tgjt2Q63wK1grUXDjt

| File | Màn |
| --- | --- |
| Main.dc.html | L1 Đăng nhập: nhập SĐT (mobile) |
| PhoneError.dc.html | L2 SĐT không hợp lệ |
| Otp.dc.html | L3 Nhập mã OTP |
| OtpError.dc.html | L4 OTP sai, gửi lại mã |
| Desktop.dc.html | L5 Đăng nhập desktop |
| Overview.dc.html | A Tổng quan |
| CreateStep1.dc.html | B Tạo đơn – Bước 1 |
| CreateStep2.dc.html | C Tạo đơn – Bước 2 |
| CreateDone.dc.html | D Tạo đơn – Hoàn tất |
| Orders.dc.html | E Quản lý đơn hàng |
| OrderDetail.dc.html | F Chi tiết đơn |
| Bank.dc.html | G Tài khoản ngân hàng |
| Sender.dc.html | H Thông tin người gửi |
| Defaults.dc.html | I Cài đặt mặc định |
