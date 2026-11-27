import { useEffect, useState } from "react";
import { askConfirm } from "@/components/m3/askConfirm";
import { M3ConfirmActions, M3Sheet, M3SheetTitle } from "@/components/m3/M3Sheet";
import {
  createLinehaulAgency,
  deleteLinehaulAgency,
  fetchLinehaulAgencies,
  fetchLinehaulPartnerVehicles,
  fetchLinehaulProvinces,
  setLinehaulAgencyActive,
  updateLinehaulAgency,
  type LinehaulAgency,
} from "@/lib/api/linehaul-api";
import { toast } from "sonner";

type Dlg = {
  id?: number;
  code: string;
  /** Mã lúc mở form sửa — để hỏi xác nhận khi đổi mã đối tác đang dùng. */
  origCode?: string;
  inUse?: boolean;
  name: string;
  contactName: string;
  phone: string;
  note: string;
  tried: boolean;
};

function okPhone(x: string) {
  return /^0\d{9}$/.test(x.replace(/\s/g, ""));
}

export function PartnerAgencyMasterTab({
  writable,
  onCount,
}: {
  writable: boolean;
  onCount?: (n: number) => void;
}) {
  const [rows, setRows] = useState<LinehaulAgency[]>([]);
  const [provByPartner, setProvByPartner] = useState<Record<string, string[]>>({});
  const [vehByPartner, setVehByPartner] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [dlg, setDlg] = useState<Dlg | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    setLoading(true);
    try {
      const [list, provinces, vehicles] = await Promise.all([
        fetchLinehaulAgencies(false),
        fetchLinehaulProvinces(false).catch(() => []),
        fetchLinehaulPartnerVehicles(false).catch(() => []),
      ]);
      setRows(list);
      onCount?.(list.length);
      const pMap: Record<string, string[]> = {};
      for (const p of provinces) {
        const k = (p.partnerCode || "").toUpperCase();
        if (!k) continue;
        (pMap[k] ??= []).push(p.displayName || p.provinceName);
      }
      setProvByPartner(pMap);
      const vMap: Record<string, number> = {};
      for (const v of vehicles) {
        const k = (v.partnerCode || "").toUpperCase();
        vMap[k] = (vMap[k] ?? 0) + 1;
      }
      setVehByPartner(vMap);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không tải danh mục đối tác");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const save = async () => {
    if (!dlg) return;
    setDlg({ ...dlg, tried: true });
    if (!dlg.code.trim()) return toast.error("Nhập tên viết tắt");
    if (!dlg.name.trim()) return toast.error("Nhập tên đối tác");
    const phone = dlg.phone.trim();
    if (phone && !okPhone(phone)) return toast.error("SĐT gồm 10 số, bắt đầu bằng 0");
    const renaming = dlg.id != null && !!dlg.origCode && dlg.origCode !== dlg.code.trim().toUpperCase();
    if (
      renaming &&
      dlg.inUse &&
      !(await askConfirm(
        `Đổi tên viết tắt ${dlg.origCode} → ${dlg.code.trim().toUpperCase()}?\nTỉnh, xe, bảng giá và đơn đã tạo của đối tác này sẽ chuyển sang mã mới.`,
      ))
    ) {
      return;
    }
    setBusy(true);
    try {
      const body = {
        code: dlg.code,
        name: dlg.name,
        contactName: dlg.contactName,
        phone,
        note: dlg.note,
      };
      if (dlg.id != null) {
        await updateLinehaulAgency(dlg.id, body);
        toast.success("Đã lưu đối tác");
      } else {
        await createLinehaulAgency(body);
        toast.success("Đã thêm đối tác");
      }
      setDlg(null);
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không lưu được");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card stack" style={{ gap: 16 }}>
      <div className="title-row" style={{ alignItems: "center" }}>
        <div>
          <h2 className="group-title sec-title num">
            <span className="sec-ic" aria-hidden="true">
              <span className="ms">handshake</span>
            </span>
            <span>Đối tác giao hàng</span>
            <span className="count num">{rows.length}</span>
          </h2>
          <div className="lab muted">
            Đơn vị vận chuyển nhận giao các tỉnh ngoài phạm vi X.E. Đối tác đang hoạt động mới chọn được khi thêm tỉnh
            đối tác và xe đối tác.
          </div>
        </div>
        {writable ? (
          <button
            type="button"
            className="btn"
            onClick={() =>
              setDlg({
                code: "",
                name: "",
                contactName: "",
                phone: "",
                note: "",
                tried: false,
              })
            }
          >
            <span className="ms" aria-hidden="true">
              add
            </span>
            Thêm đối tác
          </button>
        ) : null}
      </div>

      {loading ? (
        <div className="lab muted">Đang tải…</div>
      ) : rows.length === 0 ? (
        <div className="lab muted">Chưa có đối tác.</div>
      ) : (
        <div className="scroller">
          <table className="tbl md-pt" style={{ ["--tbl-min" as string]: "980px" }}>
            <thead>
              <tr>
                <th>Đối tác</th>
                <th>Người liên hệ</th>
                <th>Tỉnh đang giao</th>
                <th className="r">Xe</th>
                <th>Trạng thái</th>
                <th className="r">Tác vụ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const code = p.code.toUpperCase();
                const provs = provByPartner[code] ?? [];
                const vehN = vehByPartner[code] ?? 0;
                const inUse = provs.length > 0 || vehN > 0;
                return (
                  <tr key={p.id}>
                    <td>
                      <span className="md-veh">
                        <span className="ms" aria-hidden="true">
                          handshake
                        </span>
                        <span>
                          <b>{p.code}</b>
                          <span className="sub">{p.name}</span>
                        </span>
                      </span>
                    </td>
                    <td>
                      <span style={{ fontWeight: 500 }}>{p.contactName || "—"}</span>
                      {p.phone ? <span className="sub num">{p.phone}</span> : null}
                    </td>
                    <td>
                      {provs.length ? (
                        <span className="md-areas">
                          {provs.map((a) => (
                            <span key={a} className="tag partner sm">
                              {a}
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span className="muted">Chưa gán tỉnh</span>
                      )}
                    </td>
                    <td className="r num">{vehN}</td>
                    <td>
                      <span className={`tag sm ${p.active ? "ok" : "warn"}`}>
                        {p.active ? "Đang hoạt động" : "Tạm dừng"}
                      </span>
                    </td>
                    <td>
                      <div className="act">
                        <input
                          className="switch"
                          type="checkbox"
                          aria-label={`Bật ${p.code}`}
                          checked={p.active}
                          disabled={!writable}
                          onChange={(e) => {
                            void setLinehaulAgencyActive(p.id, e.target.checked)
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
                              aria-label={`Sửa ${p.code}`}
                              title="Sửa"
                              onClick={() =>
                                setDlg({
                                  id: p.id,
                                  code: p.code,
                                  origCode: p.code.toUpperCase(),
                                  inUse,
                                  name: p.name,
                                  contactName: p.contactName ?? "",
                                  phone: p.phone ?? "",
                                  note: p.note ?? "",
                                  tried: false,
                                })
                              }
                            >
                              <span className="ms">edit</span>
                            </button>
                            <button
                              type="button"
                              className="no"
                              aria-label={`Xoá ${p.code}`}
                              title={inUse ? "Đang gán cho tỉnh hoặc xe, chỉ tắt được" : "Xoá"}
                              disabled={inUse}
                              onClick={async () => {
                                if (!(await askConfirm(`Xoá đối tác ${p.code}?`))) return;
                                try {
                                  await deleteLinehaulAgency(p.id);
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
        Đối tác đang được gán cho tỉnh hoặc xe thì không xoá được, chỉ tắt. Tắt đối tác thì không chọn được khi thêm
        tỉnh, xe mới; tỉnh và xe đã gán vẫn giữ nguyên.
      </div>

      {dlg ? (
        <M3Sheet open onOpenChange={(o) => !o && !busy && setDlg(null)} variant="confirm" className="md-dlg">
          <M3SheetTitle>{dlg.id != null ? `Sửa đối tác ${dlg.code}` : "Thêm đối tác"}</M3SheetTitle>
          <div className="md-two">
            <label className={`field cfg-field${dlg.tried && !dlg.code.trim() ? " has-err" : ""}`}>
              <span className="l">Tên viết tắt *</span>
              <span className="box input-box">
                <input
                  placeholder="VD: HTP"
                  value={dlg.code}
                  maxLength={40}
                  onChange={(e) =>
                    setDlg({ ...dlg, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })
                  }
                  aria-label="Tên viết tắt"
                />
              </span>
              <span className="small muted">
                {dlg.inUse
                  ? "Đổi viết tắt sẽ cập nhật theo ở tỉnh, xe, bảng giá và đơn đã tạo."
                  : "Hiện ở các ô chọn đối tác và tag “Giao qua”."}
              </span>
              {dlg.tried && !dlg.code.trim() ? <span className="err-msg">Nhập tên viết tắt</span> : null}
            </label>
            <label className={`field cfg-field${dlg.tried && !dlg.name.trim() ? " has-err" : ""}`}>
              <span className="l">Tên đối tác *</span>
              <span className="box input-box">
                <input
                  placeholder="Tên công ty / nhà xe"
                  value={dlg.name}
                  onChange={(e) => setDlg({ ...dlg, name: e.target.value })}
                  aria-label="Tên đối tác"
                />
              </span>
              {dlg.tried && !dlg.name.trim() ? <span className="err-msg">Nhập tên đối tác</span> : null}
            </label>
          </div>
          <div className="md-two">
            <label className="field cfg-field">
              <span className="l">Người liên hệ</span>
              <span className="box input-box">
                <input
                  placeholder="Họ tên"
                  value={dlg.contactName}
                  onChange={(e) => setDlg({ ...dlg, contactName: e.target.value })}
                  aria-label="Người liên hệ"
                />
              </span>
            </label>
            <label
              className={`field cfg-field${dlg.tried && dlg.phone.trim() && !okPhone(dlg.phone) ? " has-err" : ""}`}
            >
              <span className="l">SĐT liên hệ</span>
              <span className="box input-box">
                <input
                  className="num"
                  inputMode="tel"
                  placeholder="Không bắt buộc"
                  value={dlg.phone}
                  onChange={(e) => setDlg({ ...dlg, phone: e.target.value })}
                  aria-label="SĐT liên hệ"
                />
              </span>
              {dlg.tried && dlg.phone.trim() && !okPhone(dlg.phone) ? (
                <span className="err-msg">SĐT gồm 10 số, bắt đầu bằng 0</span>
              ) : null}
            </label>
          </div>
          <label className="field cfg-field" style={{ width: "100%" }}>
            <span className="l">Ghi chú</span>
            <textarea
              className="area"
              placeholder="VD: kỳ đối soát, cách nhận file kết quả"
              value={dlg.note}
              onChange={(e) => setDlg({ ...dlg, note: e.target.value })}
              aria-label="Ghi chú"
            />
          </label>
          <M3ConfirmActions>
            <button type="button" className="btn ghost" disabled={busy} onClick={() => setDlg(null)}>
              Huỷ
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => void save()}>
              {busy ? "Đang lưu…" : dlg.id != null ? "Lưu" : "Thêm đối tác"}
            </button>
          </M3ConfirmActions>
        </M3Sheet>
      ) : null}
    </section>
  );
}
