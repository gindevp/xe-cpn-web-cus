import { useEffect, useState } from "react";
import { askConfirm } from "@/components/m3/askConfirm";
import { M3ConfirmActions, M3Sheet, M3SheetTitle } from "@/components/m3/M3Sheet";
import {
  createLinehaulPartnerVehicle,
  deleteLinehaulPartnerVehicle,
  fetchLinehaulAgencies,
  fetchLinehaulPartnerVehicles,
  setLinehaulPartnerVehicleActive,
  updateLinehaulPartnerVehicle,
  type LinehaulAgency,
  type LinehaulPartnerVehicle,
} from "@/lib/api/linehaul-api";
import { toast } from "sonner";

type Dlg = {
  id?: number;
  bks: string;
  partnerCode: string;
  driverName: string;
  driverPhone: string;
  tried: boolean;
};

function okPhone(x: string) {
  return /^0\d{9}$/.test(x.replace(/\s/g, ""));
}

/** BKS hiển thị: biển số hoặc mã cũ (ký hiệu). */
function vehicleBks(v: Pick<LinehaulPartnerVehicle, "plate" | "code">) {
  return (v.plate || v.code || "").trim();
}

export function PartnerVehicleMasterTab({
  writable,
  onCount,
}: {
  writable: boolean;
  onCount?: (n: number) => void;
}) {
  const [rows, setRows] = useState<LinehaulPartnerVehicle[]>([]);
  const [agencies, setAgencies] = useState<LinehaulAgency[]>([]);
  const [loading, setLoading] = useState(true);
  const [dlg, setDlg] = useState<Dlg | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    setLoading(true);
    try {
      const [list, agencyList] = await Promise.all([
        fetchLinehaulPartnerVehicles(false),
        fetchLinehaulAgencies(false).catch(() => []),
      ]);
      setRows(list);
      setAgencies(agencyList);
      onCount?.(list.length);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không tải xe đối tác");
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
    const bks = dlg.bks.trim().toUpperCase();
    if (!bks) return toast.error("Nhập BKS");
    if (!dlg.partnerCode.trim()) return toast.error("Chọn đối tác");
    if (!dlg.driverName.trim()) return toast.error("Nhập họ tên lái xe");
    if (!okPhone(dlg.driverPhone)) return toast.error("SĐT gồm 10 số, bắt đầu bằng 0");
    setBusy(true);
    try {
      // Một trường BKS — ghi cả code lẫn plate để tương thích BE/gán chuyến.
      const body = {
        code: bks,
        plate: bks,
        partnerCode: dlg.partnerCode,
        driverName: dlg.driverName,
        driverPhone: dlg.driverPhone,
        appAccount: null,
      };
      if (dlg.id != null) {
        await updateLinehaulPartnerVehicle(dlg.id, body);
        toast.success("Đã lưu xe");
      } else {
        await createLinehaulPartnerVehicle(body);
        toast.success("Đã thêm xe đối tác");
      }
      setDlg(null);
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không lưu được");
    } finally {
      setBusy(false);
    }
  };

  const ptnOpts = agencies.filter((a) => a.active || a.code === dlg?.partnerCode);

  return (
    <section className="card stack" style={{ gap: 16 }}>
      <div className="title-row" style={{ alignItems: "center" }}>
        <div>
          <h2 className="group-title sec-title num">
            <span className="sec-ic" aria-hidden="true">
              <span className="ms">airport_shuttle</span>
            </span>
            <span>Xe đối tác</span>
            <span className="count num">{rows.length}</span>
          </h2>
          <div className="lab muted">
            Khai báo xe và lái xe của đối tác để gán đơn giao qua đối tác. X.E không quản lý lộ trình của xe.
          </div>
        </div>
        {writable ? (
          <button
            type="button"
            className="btn"
            onClick={() =>
              setDlg({
                bks: "",
                partnerCode: "",
                driverName: "",
                driverPhone: "",
                tried: false,
              })
            }
          >
            <span className="ms" aria-hidden="true">
              add
            </span>
            Thêm xe đối tác
          </button>
        ) : null}
      </div>

      {loading ? (
        <div className="lab muted">Đang tải…</div>
      ) : rows.length === 0 ? (
        <div className="lab muted">Chưa có xe đối tác.</div>
      ) : (
        <div className="scroller">
          <table className="tbl md-pt" style={{ ["--tbl-min" as string]: "720px" }}>
            <thead>
              <tr>
                <th>BKS</th>
                <th>Đối tác</th>
                <th>Lái xe</th>
                <th>Trạng thái</th>
                <th className="r">Tác vụ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => {
                const bks = vehicleBks(v) || "—";
                return (
                  <tr key={v.id}>
                    <td>
                      <span className="md-veh">
                        <span className="ms" aria-hidden="true">
                          airport_shuttle
                        </span>
                        <b className="num">{bks}</b>
                      </span>
                    </td>
                    <td>{v.partnerCode}</td>
                    <td>
                      <span style={{ fontWeight: 500 }}>{v.driverName}</span>
                      <span className="sub num">{v.driverPhone}</span>
                    </td>
                    <td>
                      <span className={`tag sm ${v.active ? "ok" : "warn"}`}>
                        {v.active ? "Đang hoạt động" : "Tạm dừng"}
                      </span>
                    </td>
                    <td>
                      <div className="act">
                        <input
                          className="switch"
                          type="checkbox"
                          aria-label={`Bật xe ${bks}`}
                          checked={v.active}
                          disabled={!writable}
                          onChange={(e) => {
                            void setLinehaulPartnerVehicleActive(v.id, e.target.checked)
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
                              aria-label={`Sửa xe ${bks}`}
                              title="Sửa"
                              onClick={() =>
                                setDlg({
                                  id: v.id,
                                  bks: vehicleBks(v),
                                  partnerCode: v.partnerCode,
                                  driverName: v.driverName,
                                  driverPhone: v.driverPhone,
                                  tried: false,
                                })
                              }
                            >
                              <span className="ms">edit</span>
                            </button>
                            <button
                              type="button"
                              className="no"
                              aria-label={`Xoá xe ${bks}`}
                              title="Xoá"
                              onClick={async () => {
                                if (!(await askConfirm(`Xoá xe ${bks}?`))) return;
                                try {
                                  await deleteLinehaulPartnerVehicle(v.id);
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
        Chỉ đơn có tag &quot;Giao qua&quot; + tên đối tác mới gán được lên xe đối tác, đơn thường không gán vào xe này
        được. Tắt xe thì không chọn được khi gán chuyến (đơn đã gán giữ nguyên).
      </div>

      {dlg ? (
        <M3Sheet open onOpenChange={(o) => !o && !busy && setDlg(null)} variant="confirm" className="md-dlg">
          <M3SheetTitle>{dlg.id != null ? `Sửa xe ${dlg.bks || ""}` : "Thêm xe đối tác"}</M3SheetTitle>
          <label className={`field cfg-field${dlg.tried && !dlg.bks.trim() ? " has-err" : ""}`} style={{ width: "100%" }}>
            <span className="l">BKS *</span>
            <span className="box input-box">
              <input
                className="num"
                placeholder="VD: 37C-000.01 hoặc HTP-04"
                value={dlg.bks}
                onChange={(e) => setDlg({ ...dlg, bks: e.target.value.toUpperCase() })}
                aria-label="BKS"
              />
            </span>
            {dlg.tried && !dlg.bks.trim() ? <span className="err-msg">Nhập BKS</span> : null}
          </label>
          <label className={`field cfg-field${dlg.tried && !dlg.partnerCode ? " has-err" : ""}`} style={{ width: "100%" }}>
            <span className="l">Đối tác *</span>
            <span className="box input-box sel-box">
              <select
                aria-label="Đối tác"
                value={dlg.partnerCode}
                onChange={(e) => setDlg({ ...dlg, partnerCode: e.target.value })}
              >
                <option value="">Chọn đối tác</option>
                {ptnOpts.map((a) => (
                  <option key={a.code} value={a.code}>
                    {a.code} · {a.name}
                  </option>
                ))}
              </select>
              <span className="ms" aria-hidden="true">
                expand_more
              </span>
            </span>
            {dlg.tried && !dlg.partnerCode ? <span className="err-msg">Chọn đối tác</span> : null}
          </label>
          <fieldset className="dc-bank" style={{ border: "none", margin: 0, padding: 0 }}>
            <legend style={{ fontWeight: 600, marginBottom: 8 }}>Lái xe</legend>
            <div className="md-two">
              <label className={`field cfg-field${dlg.tried && !dlg.driverName.trim() ? " has-err" : ""}`}>
                <span className="l">Họ tên *</span>
                <span className="box input-box">
                  <input
                    placeholder="Nhập họ tên"
                    value={dlg.driverName}
                    onChange={(e) => setDlg({ ...dlg, driverName: e.target.value })}
                    aria-label="Họ tên lái xe"
                  />
                </span>
                {dlg.tried && !dlg.driverName.trim() ? <span className="err-msg">Nhập họ tên lái xe</span> : null}
              </label>
              <label className={`field cfg-field${dlg.tried && !okPhone(dlg.driverPhone) ? " has-err" : ""}`}>
                <span className="l">SĐT *</span>
                <span className="box input-box">
                  <input
                    className="num"
                    inputMode="tel"
                    placeholder="Nhập SĐT"
                    value={dlg.driverPhone}
                    onChange={(e) => setDlg({ ...dlg, driverPhone: e.target.value })}
                    aria-label="SĐT lái xe"
                  />
                </span>
                {dlg.tried && !okPhone(dlg.driverPhone) ? (
                  <span className="err-msg">SĐT gồm 10 số, bắt đầu bằng 0</span>
                ) : null}
              </label>
            </div>
          </fieldset>
          <M3ConfirmActions>
            <button type="button" className="btn ghost" disabled={busy} onClick={() => setDlg(null)}>
              Huỷ
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => void save()}>
              {busy ? "Đang lưu…" : dlg.id != null ? "Lưu" : "Thêm xe"}
            </button>
          </M3ConfirmActions>
        </M3Sheet>
      ) : null}
    </section>
  );
}
