# cpn-web-m3 (`xe-cpn-web-cus`)

FE React mới của CPN với giao diện Material 3 (bàn giao design). Chạy **song song** với FE cũ `FE_react/Pixel Perfect` — không thay thế cho đến khi nghiệm thu.

Repo GitHub: https://github.com/gindevp/xe-cpn-web-cus.git

## Khác biệt với FE cũ

| | Pixel Perfect (cũ) | cpn-m3 / cus (mới) |
|---|---|---|
| Thư mục | `FE_react/Pixel Perfect` | `FE_react/cpn-m3` |
| GitHub | `gindevp/xe-cpn-web` | `gindevp/xe-cpn-web-cus` |
| Dev port | 7081 | **7182** |
| Deploy 133 | `/opt/cpn-web` → docker `cpn-web` `:8088` | `/opt/cpn-web-cus` → docker `cpn-web-cus` `:8089` |
| JWT storage | `xe-jwt` | `xe-m3-jwt` |
| Store persist | `xe-vthh-v1` | `xe-m3-vthh-v1` |
| UI | Pixel Perfect / shadcn | Material 3 (`design-ref` + `src/styles/cpn-m3.css`) |
| BE | `https://api.cpn.xevietnam.com` (CI) | cùng |

## Chạy DEV

```bash
# BE (terminal riêng)
# → http://localhost:7080

cd FE_react/cpn-m3
bun install   # hoặc npm install
bun run dev   # → http://localhost:7182
```

Đối chiếu UI prototype (tĩnh):

```bash
cd design-ref/project
python -m http.server 8000
# mở http://localhost:8000/DangNhap.dc.html
```

FE cũ vẫn chạy độc lập trên 7081.

## Design reference

- `design-ref/` — bản bàn giao DesignCanvas (không ship `support.js` vào production).
- `src/styles/cpn-m3.css` — tokens/layout Material 3 dùng trong app.

## Build

```bash
bun run build
# hoặc: npx vite build
```

## Checklist nghiệm thu song song (UAT)

Đối chiếu FE cũ `:7081` và FE mới `:7182` trên cùng BE `:7080`:

1. Đăng nhập / đăng xuất / thiết bị chờ duyệt (storage `xe-m3-*` không đụng FE cũ)
2. Shell: rail menu 5 nhóm + pills lifecycle (Chờ bàn giao → Ngoại lệ) + tìm đơn
3. Tạo đơn, chờ bàn giao, nhập kho, thành công, ngoại lệ
4. Phiếu thu, danh sách phiếu thu, thu hộ, COD, hoá đơn, Day Close (`/bao-cao-thu`)
5. Bảng giá / phụ phí / master / tài khoản / nhóm quyền / phiên / tích hợp / cấu hình
6. POD quầy, giao tận nhà, quét xuất/nhập (parity ops)
7. RBAC: BL read-only; không vượt quyền so với FE cũ
8. `npx vite build` / `bun run build` thành công

Chỉ chuyển traffic / nginx domain sau khi checklist PASS.

## Deploy server 133 (GitHub Actions)

Workflow: [`.github/workflows/deploy-web-133.yml`](.github/workflows/deploy-web-133.yml) — cùng pattern FE cũ:

1. `push` `main` hoặc **Actions → Deploy web cus 133 → Run workflow**
2. Build Nitro (`NITRO_PRESET=node-server`, API `https://api.cpn.xevietnam.com`)
3. SCP → `/opt/cpn-web-cus`, docker `cpn-web-cus` map **8089→3000**

### Secrets (copy từ `xe-cpn-web`)

Trên repo `xe-cpn-web-cus` cần đúng 3 secrets như FE cũ:

| Secret | Ý nghĩa |
|---|---|
| `CPN_WEB_SSH_HOST` | IP / host máy 133 |
| `CPN_WEB_SSH_KEY` | Private key SSH user `root` |
| `CPN_WEB_SSH_PORT` | Port SSH |

Không ghi đè container `cpn-web` (8088). Gắn domain/nginx tới `127.0.0.1:8089` khi muốn public FE mới.
