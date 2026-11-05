# Bàn giao thiết kế CPN

Bản mẫu web quản trị chuyển phát nhanh, 26 màn và 2 thành phần dùng chung.
Tài liệu bàn giao đầy đủ: https://claude.ai/artifact/EEzTWio4Ft3jbsJjGjGjGt
Canvas thiết kế: https://claude.ai/artifact/1N3jkzox49HDCbEaAjs2ih (bản 87)

## Chạy bản mẫu
    cd project
    python3 -m http.server 8000
Mở http://localhost:8000/DangNhap.dc.html. Cần mạng để tải font Inter và Material Symbols từ Google Fonts.

## Nội dung
- project/*.dc.html: mỗi tệp một màn. AppNav là menu, AppHero là thanh đầu trang và popup đơn.
- project/cpn.css: biến màu và toàn bộ style.
- project/support.js: runtime chỉ để chạy bản mẫu, không đưa vào sản phẩm.
- screenshots/: ảnh từng màn ở khổ 1440, nền sáng.

## Lưu ý
Bản mẫu dùng để đối chiếu giao diện và thao tác, không phải mã sản phẩm.
Tên 16 văn phòng là thật; mọi số liệu, khách hàng, nhân viên và mã đơn đều là mẫu.
