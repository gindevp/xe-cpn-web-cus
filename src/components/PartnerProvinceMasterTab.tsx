import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { askConfirm } from "@/components/m3/askConfirm";
import { M3ConfirmActions, M3Sheet, M3SheetTitle } from "@/components/m3/M3Sheet";
import {
  LINEHAUL_PARTNER_VEXERE,
  createLinehaulProvince,
  deleteLinehaulProvince,
  fetchLinehaulAgencies,
  fetchLinehaulProvinces,
  fetchXeProvinces,
  setLinehaulProvinceActive,
  suggestProvinceShortCode,
  updateLinehaulProvince,
  type LinehaulAgency,
  type LinehaulProvince,
} from "@/lib/api/linehaul-api";
import { listProvincesV2 } from "@/lib/vn-address-data";
import { toast } from "sonner";

function scopeLabel(p: LinehaulProvince, all: LinehaulProvince[]) {
  if (p.scope === "KHU_VUC" || p.areaName) return `Khu vực riêng · ${p.provinceName}`;
  const areas = all.filter((x) => x.provinceName === p.provinceName && x.areaName).map((x) => x.displayName);
  return areas.length ? `Cả tỉnh, trừ ${areas.join(", ")}` : "Cả tỉnh";
}

function fold(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "");
}

/** Design: khu vực riêng trước, rồi cả tỉnh cùng tỉnh. */
function sortPartnerRows(rows: LinehaulProvince[]) {
  return [...rows].sort((a, b) => {
    const pa = fold(a.provinceName);
    const pb = fold(b.provinceName);
    if (pa !== pb) return a.provinceName.localeCompare(b.provinceName, "vi");
    const aa = a.areaName ? 0 : 1;
    const bb = b.areaName ? 0 : 1;
    if (aa !== bb) return aa - bb;
    return (a.displayName || "").localeCompare(b.displayName || "", "vi");
  });
}

export function PartnerProvinceMasterTab({
  writable,
  onCount,
}: {
  writable: boolean;
  onCount?: (n: number) => void;
}) {
  const [rows, setRows] = useState<LinehaulProvince[]>([]);
  const [agencies, setAgencies] = useState<LinehaulAgency[]>([]);
  const [xeFolded, setXeFolded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [dlg, setDlg] = useState<null | {
    id?: number;
    prov: string;
    isArea: boolean;
    area: string;
    shortCode: string;
    partnerCode: string;
    tried: boolean;
  }>(null);
  const [busy, setBusy] = useState(false);

  /** Chỉ tỉnh ngoài phạm vi VP X.E — không hiện Hà Nội / tỉnh đang có VP trong dropdown đối tác. */
  const provinces = useMemo(() => {
    return listProvincesV2()
      .map((p) => p.name)
      .filter((name) => !xeFolded.has(fold(name)));
  }, [xeFolded]);

  const reload = async () => {
    setLoading(true);
    try {
      const [list, xe, agencyList] = await Promise.all([
        fetchLinehaulProvinces(false),
        fetchXeProvinces().catch(() => []),
        fetchLinehaulAgencies(false).catch(() => []),
      ]);
      const sorted = sortPartnerRows(list);
      setRows(sorted);
      setAgencies(agencyList);
      onCount?.(list.length);
      setXeFolded(
        new Set(
          (xe ?? []).map((s) =>
            s
              .toLowerCase()
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .replace(/đ/g, "d")
              .replace(/[^a-z0-9]+/g, ""),
          ),
        ),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không tải được tỉnh đối tác");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const save = async () => {
    if (!dlg) return;
    const tried = { ...dlg, tried: true };
    setDlg(tried);
    if (!dlg.prov.trim()) return toast.error("Chọn tỉnh/thành");
    if (xeFolded.has(fold(dlg.prov))) return toast.error("Tỉnh đang có VP X.E, không khai báo làm tỉnh đối tác được");
    if (dlg.isArea && !dlg.area.trim()) return toast.error("Nhập tên khu vực");
    const shortCode = dlg.shortCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!shortCode) return toast.error("Nhập mã tỉnh viết tắt (vd. NA)");
    if (shortCode.length > 10) return toast.error("Mã viết tắt tối đa 10 ký tự");
    setBusy(true);
    try {
      if (!dlg.partnerCode.trim()) return toast.error("Chọn đối tác giao");
      const body = {
        provinceName: dlg.prov.trim(),
        areaName: dlg.isArea ? dlg.area.trim() : null,
        scope: dlg.isArea ? "KHU_VUC" : "CA_TINH",
        partnerCode: dlg.partnerCode.trim().toUpperCase(),
        shortCode,
        active: true,
      };
      if (dlg.id != null) await updateLinehaulProvince(dlg.id, body);
      else await createLinehaulProvince(body);
      toast.success(dlg.id != null ? "Đã lưu" : "Đã thêm tỉnh đối tác");
      setDlg(null);
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không lưu được");
    } finally {
      setBusy(false);
    }
  };

  const prevText = dlg
    ? `${(dlg.isArea ? dlg.area.trim() : dlg.prov.trim()) || "Tên tỉnh"} · Giao tận nhà`
    : "";

  return (
    <section className="card stack">
      <div className="title-row" style={{ alignItems: "center" }}>
        <div>
          <h2 className="group-title sec-title num">
            <span className="sec-ic" aria-hidden="true">
              <span className="ms">map</span>
            </span>
            <span>Tỉnh đối tác</span>
            <span className="count num">{rows.length}</span>
          </h2>
          <div className="lab muted">
            Tỉnh/thành ngoài phạm vi giao của X.E. Điểm nhận thuộc các tỉnh này sẽ tự chọn Giao tận nhà, gắn tag
            &quot;Giao qua&quot; + tên đối tác và tính cước theo bảng giá đối tác.
          </div>
        </div>
        {writable ? (
          <button
            type="button"
            className="btn"
            onClick={() =>
              setDlg({
                prov: "",
                isArea: false,
                area: "",
                shortCode: "",
                partnerCode:
                  agencies.find((a) => a.active)?.code ||
                  agencies[0]?.code ||
                  LINEHAUL_PARTNER_VEXERE,
                tried: false,
              })
            }
          >
            <span className="ms" aria-hidden="true">
              add
            </span>
            Thêm tỉnh đối tác
          </button>
        ) : null}
      </div>

      {loading ? (
        <div className="lab muted">Đang tải…</div>
      ) : rows.length === 0 ? (
        <div className="lab muted">Chưa có tỉnh đối tác.</div>
      ) : (
        <div className="scroller">
          <table className="tbl md-pt" style={{ ["--tbl-min" as string]: "1120px" }}>
            <thead>
              <tr>
                <th>Tỉnh / khu vực</th>
                <th>Mã viết tắt</th>
                <th>Hiển thị khi tạo đơn</th>
                <th>Đối tác giao</th>
                <th>Phường/xã đã phân vùng giá</th>
                <th>Trạng thái</th>
                <th className="r">Tác vụ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const total = p.wardTotal || p.wardMapped;
                const hasUnset = !total || total > p.wardMapped;
                const wardText = total ? `${p.wardMapped}/${total}` : "—";
                const unsetText = total
                  ? `${total - p.wardMapped} phường/xã chưa phân vùng`
                  : "Chưa phân vùng, chưa tạo đơn được";
                return (
                  <tr key={p.id}>
                    <td>
                      <span style={{ fontWeight: 600 }}>{p.displayName}</span>
                      <span className="sub">{scopeLabel(p, rows)}</span>
                    </td>
                    <td>
                      <span className="num" style={{ fontWeight: 600 }}>
                        {p.shortCode || "—"}
                      </span>
                      <span className="sub">In tem</span>
                    </td>
                    <td>
                      <span className="md-dest">{p.createOrderLabel}</span>
                      <span className="row-tags">
                        <span className="tag partner sm">
                          <span className="ms" aria-hidden="true">
                            handshake
                          </span>
                          Giao qua {p.partnerCode}
                        </span>
                      </span>
                    </td>
                    <td>{p.partnerCode}</td>
                    <td>
                      <span className="num" style={{ fontWeight: 500 }}>
                        {wardText}
                      </span>
                      {hasUnset ? (
                        <span className="sub" style={{ color: "var(--error)" }}>
                          {unsetText}
                        </span>
                      ) : null}
                      <Link
                        to="/bang-gia"
                        search={{
                          tab: "partner",
                          partner: p.partnerCode || LINEHAUL_PARTNER_VEXERE,
                          provinceId: p.id,
                          focus: "zones",
                        }}
                        className="link"
                        style={{ display: "block", marginTop: 2 }}
                      >
                        Phân vùng giá
                      </Link>
                    </td>
                    <td>
                      <span className={`tag ${p.active ? "ok" : "warn"} sm`}>
                        {p.active ? "Đang áp dụng" : "Tạm dừng"}
                      </span>
                    </td>
                    <td>
                      <div className="act">
                        <input
                          className="switch"
                          type="checkbox"
                          aria-label={`Bật ${p.displayName}`}
                          checked={p.active}
                          disabled={!writable}
                          onChange={(e) => {
                            void setLinehaulProvinceActive(p.id, e.target.checked)
                              .then(() => reload())
                              .catch((err) =>
                                toast.error(err instanceof Error ? err.message : "Không đổi trạng thái"),
                              );
                          }}
                        />
                        {writable ? (
                          <>
                            <button
                              type="button"
                              className="no"
                              aria-label={`Sửa ${p.displayName}`}
                              title="Sửa"
                              onClick={() =>
                                setDlg({
                                  id: p.id,
                                  prov: p.provinceName,
                                  isArea: p.scope === "KHU_VUC" || !!p.areaName,
                                  area: p.areaName ?? "",
                                  shortCode: p.shortCode ?? "",
                                  partnerCode: p.partnerCode || LINEHAUL_PARTNER_VEXERE,
                                  tried: false,
                                })
                              }
                            >
                              <span className="ms">edit</span>
                            </button>
                            <button
                              type="button"
                              className="no"
                              aria-label={`Xoá ${p.displayName}`}
                              title="Xoá"
                              onClick={async () => {
                                if (!(await askConfirm(`Xoá ${p.displayName}?`))) return;
                                try {
                                  await deleteLinehaulProvince(p.id);
                                  toast.success("Đã xoá");
                                  await reload();
                                } catch (e) {
                                  toast.error(e instanceof Error ? e.message : "Không xoá được");
                                }
                              }}
                            >
                              <span className="ms">delete</span>
                            </button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="note">
        Một tỉnh chỉ thuộc X.E hoặc đối tác, không đồng thời cả hai: tỉnh đang có VP X.E không khai báo làm tỉnh đối tác
        được. Đối tác tự đi qua từng VP để lấy hàng, không gom về một VP. Tắt một tỉnh thì đơn mới không chọn được điểm
        nhận đó, đơn đã tạo vẫn giữ nguyên.
      </div>

      {dlg ? (
        <M3Sheet open onOpenChange={(o) => !o && !busy && setDlg(null)} variant="confirm" className="md-dlg">
          <M3SheetTitle>{dlg.id != null ? `Sửa ${dlg.area || dlg.prov}` : "Thêm tỉnh đối tác"}</M3SheetTitle>
          <label className={`field cfg-field${dlg.tried && (!dlg.prov || xeFolded.has(fold(dlg.prov))) ? " has-err" : ""}`} style={{ width: "100%" }}>
            <span className="l">Tỉnh/Thành *</span>
            <span className="box input-box sel-box">
              <select
                value={dlg.prov}
                onChange={(e) => {
                  const prov = e.target.value;
                  const next = { ...dlg, prov };
                  if (!dlg.shortCode.trim() && !dlg.isArea && prov) {
                    next.shortCode = suggestProvinceShortCode(prov);
                  }
                  setDlg(next);
                }}
                aria-label="Tỉnh/Thành"
              >
                <option value="">Chọn tỉnh/thành</option>
                {provinces.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <span className="ms" aria-hidden="true">
                expand_more
              </span>
            </span>
            {dlg.tried && !dlg.prov ? <span className="err-msg">Chọn tỉnh/thành</span> : null}
            {dlg.tried && dlg.prov && xeFolded.has(fold(dlg.prov)) ? (
              <span className="err-msg">Tỉnh đang có VP X.E, không khai báo làm tỉnh đối tác được</span>
            ) : null}
          </label>
          <div className="field cfg-field" style={{ width: "100%" }}>
            <span className="l">Phạm vi</span>
            <div className="seg lo" role="radiogroup" aria-label="Phạm vi" style={{ alignSelf: "flex-start" }}>
              <button
                type="button"
                role="radio"
                aria-checked={!dlg.isArea}
                className={!dlg.isArea ? "on" : undefined}
                onClick={() => setDlg({ ...dlg, isArea: false, area: "" })}
              >
                Cả tỉnh
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={dlg.isArea}
                className={dlg.isArea ? "on" : undefined}
                onClick={() => setDlg({ ...dlg, isArea: true })}
              >
                Khu vực riêng trong tỉnh
              </button>
            </div>
          </div>
          {dlg.isArea ? (
            <label className={`field cfg-field${dlg.tried && !dlg.area.trim() ? " has-err" : ""}`} style={{ width: "100%" }}>
              <span className="l">Tên khu vực *</span>
              <span className="box input-box">
                <input
                  placeholder="Ví dụ: TP Vinh"
                  value={dlg.area}
                  onChange={(e) => {
                    const area = e.target.value;
                    const next = { ...dlg, area };
                    if (!dlg.shortCode.trim() && area.trim()) {
                      next.shortCode = suggestProvinceShortCode(area);
                    }
                    setDlg(next);
                  }}
                />
              </span>
              {dlg.tried && !dlg.area.trim() ? <span className="err-msg">Nhập tên khu vực</span> : null}
              <span className="small muted" style={{ fontSize: 12 }}>
                Khu vực hiện thành một lựa chọn riêng khi tạo đơn. Chọn phường/xã thuộc khu vực ở màn Bảng giá đối tác.
              </span>
            </label>
          ) : null}
          <label
            className={`field cfg-field${dlg.tried && !dlg.shortCode.trim() ? " has-err" : ""}`}
            style={{ width: "100%" }}
          >
            <span className="l">Mã tỉnh viết tắt *</span>
            <span className="box input-box">
              <input
                placeholder="Ví dụ: NA"
                value={dlg.shortCode}
                maxLength={10}
                onChange={(e) =>
                  setDlg({
                    ...dlg,
                    shortCode: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10),
                  })
                }
              />
            </span>
            {dlg.tried && !dlg.shortCode.trim() ? <span className="err-msg">Nhập mã viết tắt</span> : null}
            <span className="small muted" style={{ fontSize: 12 }}>
              In góc tem vận đơn (ngắn, không dấu) — ví dụ Nghệ An → NA, TP Vinh → VINH.
            </span>
          </label>
          <label
            className={`field cfg-field${dlg.tried && !dlg.partnerCode ? " has-err" : ""}`}
            style={{ width: "100%" }}
          >
            <span className="l">Đối tác giao *</span>
            <span className="box input-box sel-box">
              <select
                aria-label="Đối tác giao"
                value={dlg.partnerCode}
                onChange={(e) => setDlg({ ...dlg, partnerCode: e.target.value })}
              >
                <option value="">Chọn đối tác</option>
                {agencies
                  .filter((a) => a.active || a.code === dlg.partnerCode)
                  .map((a) => (
                    <option key={a.id} value={a.code}>
                      {a.name}
                    </option>
                  ))}
              </select>
              <span className="ms" aria-hidden="true">
                expand_more
              </span>
            </span>
            {dlg.tried && !dlg.partnerCode ? <span className="err-msg">Chọn đối tác giao</span> : null}
            {!agencies.length ? (
              <span className="small muted" style={{ fontSize: 12 }}>
                Chưa có đối tác — thêm ở tab Đối tác trước.
              </span>
            ) : null}
          </label>
          <div className="md-prev">
            <span className="small muted">Hiển thị ở ô VP / tỉnh nhận khi tạo đơn</span>
            <span className="md-prev-row">
              <b>{prevText}</b>
              <span className="tag partner sm">
                <span className="ms" aria-hidden="true">
                  handshake
                </span>
                Giao qua {dlg.partnerCode || "…"}
              </span>
            </span>
          </div>
          <M3ConfirmActions>
            <button type="button" className="btn ghost" disabled={busy} onClick={() => setDlg(null)}>
              Huỷ
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => void save()}>
              {busy ? "Đang lưu…" : dlg.id != null ? "Lưu" : "Thêm"}
            </button>
          </M3ConfirmActions>
        </M3Sheet>
      ) : null}
    </section>
  );
}
