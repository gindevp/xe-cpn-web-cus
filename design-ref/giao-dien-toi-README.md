# Giao diện tối (dark mode) cho web CPN

Áp dụng cho toàn bộ 26 màn, menu bên trái, thanh đầu trang, popup đơn, các menu xổ, tooltip và biểu đồ.
Bản chạy được: https://claude.ai/artifact/1N3jkzox49HDCbEaAjs2ih (bản 98), bấm ảnh đại diện ở cuối sidebar → Giao diện → Tối.

## Nội dung gói
- giao-dien-toi.css: biến màu sáng/tối và các quy tắc riêng của giao diện tối, viết theo cách bật bằng `data-theme` trên thẻ html.
- anh-man-hinh/: 26 màn ở giao diện tối, khổ 1440.
- anh-thanh-phan/: popup đơn, menu tài khoản, menu nhóm, ô số liệu biểu đồ khi rê chuột; 3 ảnh giao diện sáng để so sánh.

## Cách người dùng đổi giao diện
- Bấm ảnh đại diện ở cuối sidebar → mục Giao diện có 3 lựa chọn: Sáng, Tối, Hệ thống (theo cài đặt sáng/tối của máy).
- Mặc định: Sáng.
- Lựa chọn lưu theo trình duyệt (bản mẫu dùng localStorage, khoá `cpn-theme`, giá trị `light` | `dark` | `system`). Nên lưu thêm theo tài khoản phía server nếu muốn đồng bộ giữa các máy.
- Chọn Hệ thống: theo `prefers-color-scheme`, máy đổi sáng/tối thì trang đổi ngay.
- Áp dụng ngay khi chọn, không tải lại trang; mở màn khác hoặc màn Đăng nhập vẫn giữ lựa chọn.
- Đặt thuộc tính trước khi vẽ trang để tránh nháy trắng khi tải.

## Bảng màu
| Biến | Sáng | Tối | Dùng cho |
| --- | --- | --- | --- |
| `--primary` | #274ea1 | #a8bcf3 | Màu chính: link, chữ nhấn, viền focus |
| `--on-primary` | #ffffff | #002c72 | Chữ trên màu chính |
| `--primary-container` | #dae2ff | #174295 | Nền nhấn nhẹ (ô KPI chính ở Tổng quan) |
| `--on-primary-container` | #174295 | #dae2ff | Chữ trên nền nhấn nhẹ |
| `--secondary` | #585e71 | #c0c6dd | Vòng focus |
| `--secondary-container` | #dce2f9 | #3a4052 | Nút tonal, viền ô nhập |
| `--on-secondary-container` | #404659 | #dce2f9 | Chữ nút tonal |
| `--on-surface` | #1a1b21 | #dcdde4 | Chữ chính |
| `--on-surface-variant` | #45464f | #b9bac4 | Chữ phụ, nhãn, icon |
| `--lowest` | #ffffff | #1e1f25 | Nền thẻ, popup, menu, ô nhập |
| `--low` | #f4f3fa | #121318 | Nền trang (ngoài thẻ) |
| `--high` | #e8e7ef | #33343a | Nền nhấn trên trang |
| `--outline` | #757780 | #8f9099 | Viền đậm |
| `--outline-variant` | #c5c6d0 | #3d3e46 | Đường kẻ, viền mảnh |
| `--inverse-surface` | #2f3036 | #3a3b42 | Nền tooltip, ô số liệu khi rê chuột |
| `--inverse-on-surface` | #f1f0f7 | #e4e4ea | Chữ trong tooltip |
| `--error` | #ba1a1a | #ffb4ab | Chữ, icon lỗi |
| `--error-container` | #ffdad6 | #93000a | Nền nhãn lỗi |
| `--on-error-container` | #93000a | #ffdad6 | Chữ trên nền lỗi |
| `--success-container` | #b8f1ad | #1e511e | Nền nhãn thành công |
| `--on-success-container` | #1e511e | #b8f1ad | Chữ trên nền thành công |
| `--warning-container` | #ffdf92 | #594400 | Nền nhãn cảnh báo |
| `--on-warning-container` | #594400 | #ffdf92 | Chữ trên nền cảnh báo |
| `--chart-sent` | #DE8F45 | #CC7F3E | Đường/cột đơn gửi |
| `--chart-recv` | #6488CC | #6C8ED6 | Đường/cột đơn nhận |
| `--chart-rev` | #2A9D8F | #35A899 | Thanh doanh thu |
| `--rev-ink` | #0E7569 | #74cfc1 | Icon tiêu đề, icon chỉ số, số cước |
| `--rev-tint` | #D3EDE8 | #16302d | Nền khung số nổi bật, card 1 VP |
| `--rev-ic-bg` | #DDF1EE | #1d3a36 | Nền tròn sau icon |

## Quy tắc riêng của giao diện tối
1. **Lớp nền sáng dần từ ngoài vào trong:** nền trang tối nhất, thẻ và popup sáng hơn một bậc, khối bên trong thẻ (ví dụ các khối Người gửi, Người nhận trong Tạo đơn) sáng hơn nữa: #121318 → #1e1f25 → #26272e (nền nhấn bên trong #30313a). Không để khối bên trong tối hơn thẻ chứa nó.
2. **Không dùng mảng xanh sáng lớn:** tab, lối tắt, mục menu, trang đang chọn và ô Tổng phải thu dùng nền #26386b, chữ #dbe3ff. Nút chính dùng nền #3a57a3, chữ #eef1ff.
3. **Ô nhập trong khối bên trong** dùng nền thẻ (#1e1f25) nên trông chìm xuống một bậc; đó là chủ ý.
4. **Điều khiển gốc của trình duyệt** (ô tick, select, thanh cuộn) theo kiểu tối nhờ `color-scheme: dark`.
5. **Ảnh minh hoạ, biểu đồ, icon** dùng biến màu ở trên nên tự đổi; không cần ảnh riêng cho giao diện tối.
6. **Logo:** hiện chỉ có bản xanh đậm nên tạm đặt trên nền sáng #d3d6e2. Cần bản logo cho nền tối.

## Độ tương phản đã đo
- Chữ chính trên nền trang: 13,7:1.
- Chữ phụ trên thẻ: 8,5:1; trên khối bên trong: 7,7:1.
- Chữ trên nút chính: 6,1:1. Chữ trên mảng chọn: 8,8:1.
- Số cước / icon xanh ngọc trên nền khung nổi bật: 7,7:1.

## Chưa có
- Logo cho nền tối.
- Các màu tối mới (lớp nền bên trong thẻ, mảng chọn, nút chính) chưa đưa vào design system CPN – Material 3.
- Ảnh trong bản mẫu là ô giữ chỗ; ảnh thật (POD, ảnh hàng) giữ nguyên màu, không đảo màu.
