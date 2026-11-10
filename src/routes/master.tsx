import { createFileRoute } from "@tanstack/react-router";
import { askConfirm } from "@/components/m3/askConfirm";
import { ProtectedPage } from "@/components/AppShell";
import { M3Page } from "@/components/M3Page";
import { EmptyState } from "@/components/PageBits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NameInput } from "@/components/NameInput";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { VehicleFormDialog } from "@/components/VehicleFormDialog";
import { ShipperMasterTab } from "@/components/ShipperMasterTab";
import { useStore, type VehicleRec } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { isApiEnabled } from "@/lib/api/client";
import { syncMasterFromApi } from "@/lib/api/sync";
import { geoGeocodeAddress } from "@/lib/api/geo-api";
import type { OfficeRec as StoreOfficeRec } from "@/lib/mock-data";
import {
  itineraryPointLabel,
  OFFICE_ITINERARY_POINTS,
  splitItineraryPoints,
} from "@/lib/mock-data";
import { OfficeLocationMap } from "@/components/OfficeLocationMap";
import { OfficeWifiDialog } from "@/components/OfficeWifiDialog";
import { OfficeVehicleItineraryDialog } from "@/components/OfficeVehicleItineraryDialog";
import { AddressPicker } from "@/components/AddressPicker";
import { TransitHubSettings } from "@/components/TransitHubSettings";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/master")({
  head: () => ({ meta: [{ title: "Master dữ liệu — X.E" }] }),
  component: () => (
    <ProtectedPage title="Master VP / Tuyến / Xe / Tài xế" screen="master" hidePageTitle>
      <M3Page>
        <Page />
      </M3Page>
    </ProtectedPage>
  ),
});

type MasterTab = "vp" | "tuyen" | "xe" | "ts" | "shipper";

type OfficeRec = StoreOfficeRec;

const OFFICE_SOURCE_ORDER = [
  16655, 63418, 17323, 18094, 41156, 40911, 46159, 46063, 59165, 36202, 36201, 45654, 57439, 48341,
  46042, 16632,
];

function Page() {
  const { session } = useAuth();
  const writable = canWrite(session?.role, "master");
  const offices = useStore((s) => s.offices);
  const listedOffices = [...offices].sort((a, b) => {
    const ia = a.sourceId != null ? OFFICE_SOURCE_ORDER.indexOf(a.sourceId) : -1;
    const ib = b.sourceId != null ? OFFICE_SOURCE_ORDER.indexOf(b.sourceId) : -1;
    if (ia === -1 && ib === -1)
      return (a.code + (a.address ?? "")).localeCompare(b.code + (b.address ?? ""));
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
  const routes = useStore((s) => s.routes);
  const vehicles = useStore((s) => s.vehicles);
  const drivers = useStore((s) => s.drivers);
  const {
    addOffice,
    updateOffice,
    removeOffice,
    addRoute,
    updateRoute,
    removeRoute,
    removeVehicles,
    addDriver,
    updateDriver,
    removeDrivers,
  } = useStore.getState();
  const [pickedXe, setPickedXe] = useState<Set<string>>(new Set());
  const [pickedTs, setPickedTs] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const runDelete = async (
    label: string,
    items: string[],
    remove: (items: string[]) => Promise<number>,
    clear: () => void,
  ) => {
    if (!items.length) return;
    const preview =
      items.slice(0, 10).join(", ") + (items.length > 10 ? ` … (+${items.length - 10})` : "");
    if (!(await askConfirm(`Xóa ${items.length} ${label}?\n${preview}`))) return;
    setDeleting(true);
    try {
      const failed = await remove(items);
      clear();
      if (failed > 0)
        toast.error(`${failed}/${items.length} ${label} không xóa được — xem lại sau khi tải lại`);
      else toast.success(`Đã xóa ${items.length} ${label}`);
    } catch (e: any) {
      toast.error(e?.message || `Không xóa được ${label}`);
    } finally {
      setDeleting(false);
    }
  };

  const [dlg, setDlg] = useState<
    null | "vp" | "vp-edit" | "tuyen" | "tuyen-edit" | "xe" | "xe-edit" | "ts" | "ts-edit"
  >(null);
  const [editXe, setEditXe] = useState<VehicleRec | null>(null);
  const [editVp, setEditVp] = useState<OfficeRec | null>(null);
  const [wifiVp, setWifiVp] = useState<OfficeRec | null>(null);
  const [itinVp, setItinVp] = useState<OfficeRec | null>(null);
  const [editRoute, setEditRoute] = useState<string | null>(null);
  const [editDriver, setEditDriver] = useState<string | null>(null);
  const [syncingXe, setSyncingXe] = useState(false);
  const [shipperCount, setShipperCount] = useState<number | null>(null);
  const [tab, setTab] = useState<MasterTab>("vp");

  const truckVehicles = useMemo(
    () =>
      [...vehicles]
        .filter((v) => v.active !== false && !/limousine/i.test(v.vehicleType ?? ""))
        .sort((a, b) => a.bks.localeCompare(b.bks, "vi")),
    [vehicles],
  );

  const reloadMaster = async () => {
    if (!isApiEnabled()) return;
    setSyncingXe(true);
    try {
      await syncMasterFromApi();
    } catch (e: any) {
      toast.error(e?.message || "Không tải được master từ máy chủ");
    } finally {
      setSyncingXe(false);
    }
  };

  useEffect(() => {
    void reloadMaster();
  }, []);

  return (
    <div className="stack" style={{ gap: 16 }}>
      <h1 className="page-title">Master dữ liệu</h1>
      <div className="seg" role="tablist" aria-label="Danh mục" style={{ alignSelf: "flex-start" }}>
        {(
          [
            ["vp", "store", "VP", listedOffices.length],
            ["tuyen", "route", "Tuyến", routes.length],
            ["xe", "local_shipping", "Xe tải", truckVehicles.length],
            ["ts", "badge", "Tài xế", drivers.length],
            ["shipper", "two_wheeler", "Shipper", shipperCount],
          ] as const
        ).map(([id, icon, label, count]) => (
          <button
            key={id}
            type="button"
            role="tab"
            className={tab === id ? "on" : undefined}
            aria-selected={tab === id}
            onClick={() => setTab(id)}
          >
            <span className="ms" aria-hidden="true">
              {icon}
            </span>
            {label}
            <span className="count num">{count != null ? count : "…"}</span>
          </button>
        ))}
      </div>

      {tab === "vp" ? (
        <div className="stack" style={{ gap: 16 }}>
          <section className="card stack">
            <TransitHubSettings offices={listedOffices} writable={writable} />
          </section>
          <section className="card stack">
            <div className="title-row" style={{ alignItems: "center" }}>
              <h2 className="group-title sec-title num">
                <span className="sec-ic" aria-hidden="true">
                  <span className="ms">store</span>
                </span>
                Văn phòng ({listedOffices.length})
              </h2>
              {writable ? (
                <button type="button" className="btn" onClick={() => setDlg("vp")}>
                  <span className="ms" aria-hidden="true">
                    add
                  </span>
                  Thêm VP
                </button>
              ) : null}
            </div>
            <Table
              minWidth={960}
              headers={["ID", "Mã VP", "Tên VP", "Địa chỉ", "Điểm lộ trình", "Toạ độ", "Khách chọn", "Tác vụ"]}
              rightLast
            >
              {listedOffices.map((o) => (
                <tr key={o.id ?? o.sourceId ?? `${o.code}-${o.address ?? ""}`}>
                  <td className="muted">{o.sourceId ?? "—"}</td>
                  <td className="main">{o.code}</td>
                  <td style={{ fontWeight: 500, whiteSpace: "nowrap" }}>{o.name}</td>
                  <td>{o.address ?? "—"}</td>
                  <td className="muted">{itineraryPointLabel(o.itineraryPoint)}</td>
                  <td className="muted num" style={{ whiteSpace: "nowrap" }}>
                    {o.latitude != null && o.longitude != null
                      ? `${Number(o.latitude).toFixed(5)}, ${Number(o.longitude).toFixed(5)}`
                      : "Chưa có"}
                  </td>
                  <td className="muted">{o.customerVisible === false ? "Ẩn" : "Hiện"}</td>
                  <td>
                    <div className="act">
                      {o.id != null && isApiEnabled() ? (
                        <button type="button" className="text-act" onClick={() => setWifiVp(o)}>
                          Wifi
                        </button>
                      ) : null}
                      {o.id != null && isApiEnabled() ? (
                        <button
                          type="button"
                          className="text-act"
                          style={{ whiteSpace: "nowrap" }}
                          onClick={() => setItinVp(o)}
                        >
                          Lộ trình áp dụng
                        </button>
                      ) : null}
                      {writable ? (
                        <>
                          <button
                            type="button"
                            className="no"
                            aria-label="Sửa VP"
                            title="Sửa"
                            onClick={() => {
                              setEditVp(o);
                              setDlg("vp-edit");
                            }}
                          >
                            <span className="ms" aria-hidden="true">
                              edit
                            </span>
                          </button>
                          <Del
                            onClick={async () => {
                              if (
                                !(await askConfirm(
                                  `Xóa văn phòng "${o.name}" (${o.code})?\nVP sẽ ngừng hoạt động, đơn và lịch sử cũ vẫn giữ nguyên.`,
                                ))
                              )
                                return;
                              removeOffice(o);
                              toast.success("Đã xóa");
                            }}
                          />
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
          </section>
        </div>
      ) : null}

      {tab === "tuyen" ? (
        <section className="card stack">
          <div className="title-row" style={{ alignItems: "center" }}>
            <h2 className="group-title sec-title num">
              <span className="sec-ic" aria-hidden="true">
                <span className="ms">route</span>
              </span>
              Tuyến ({routes.length})
            </h2>
            {writable ? (
              <button type="button" className="btn" onClick={() => setDlg("tuyen")}>
                <span className="ms" aria-hidden="true">
                  add
                </span>
                Thêm tuyến
              </button>
            ) : null}
          </div>
          <Table headers={["Tuyến", "Tác vụ"]} rightLast>
            {routes.map((r) => (
              <tr key={r}>
                <td style={{ fontWeight: 500 }}>{r}</td>
                <td>
                  {writable ? (
                    <div className="act">
                      <button
                        type="button"
                        className="no"
                        aria-label="Sửa tuyến"
                        title="Sửa"
                        onClick={() => {
                          setEditRoute(r);
                          setDlg("tuyen-edit");
                        }}
                      >
                        <span className="ms" aria-hidden="true">
                          edit
                        </span>
                      </button>
                      <Del
                        onClick={async () => {
                          if (
                            !(await askConfirm(
                              `Xóa tuyến "${r}"?\nNếu tuyến đang gắn chuyến, hệ thống sẽ ẩn khỏi danh sách (không xóa lịch sử chuyến).`,
                            ))
                          )
                            return;
                          removeRoute(r);
                          toast.success("Đã gửi lệnh xóa tuyến");
                        }}
                      />
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
          </Table>
        </section>
      ) : null}

      {tab === "xe" ? (
        <section className="card stack">
          <div className="title-row" style={{ alignItems: "center" }}>
            <div>
              <h2 className="group-title sec-title num">
                <span className="sec-ic" aria-hidden="true">
                  <span className="ms">local_shipping</span>
                </span>
                Xe tải ({truckVehicles.length})
              </h2>
              <div className="lab muted">
                Cùng danh sách xe tải với màn gán xe. Xe đã chạy chuyến được ẩn, giữ lịch sử.
              </div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <button
                type="button"
                className="btn ghost"
                disabled={syncingXe || !isApiEnabled()}
                onClick={() => void reloadMaster()}
              >
                <span className="ms" aria-hidden="true">
                  refresh
                </span>
                {syncingXe ? "Đang tải…" : "Tải lại từ máy chủ"}
              </button>
              {writable ? (
                <button type="button" className="btn" onClick={() => setDlg("xe")}>
                  <span className="ms" aria-hidden="true">
                    add
                  </span>
                  Thêm xe tải
                </button>
              ) : null}
              {writable && pickedXe.size > 0 ? (
                <button
                  type="button"
                  className="btn danger"
                  disabled={deleting}
                  onClick={() =>
                    void runDelete("xe", [...pickedXe], removeVehicles, () =>
                      setPickedXe(new Set()),
                    )
                  }
                >
                  {deleting ? "Đang xóa…" : `Xóa ${pickedXe.size} xe đã chọn`}
                </button>
              ) : null}
            </div>
          </div>
          {truckVehicles.length === 0 ? (
            <EmptyState>
              {syncingXe
                ? "Đang tải xe tải…"
                : "Chưa có xe tải — thêm tại đây hoặc từ tab Xe tải khi gán đơn."}
            </EmptyState>
          ) : (
            <Table
              minWidth={720}
              rightLast
              headers={[
                writable ? (
                  <PickAll
                    key="all"
                    all={truckVehicles.map((v) => v.bks)}
                    picked={pickedXe}
                    onChange={setPickedXe}
                  />
                ) : (
                  ""
                ),
                "BKS",
                "Loại / tải trọng",
                "Định mức (kg)",
                "Tài xế",
                "Trạng thái",
                "Tác vụ",
              ]}
            >
              {truckVehicles.map((v) => (
                <tr key={v.id ?? v.bks}>
                  <td>
                    {writable ? (
                      <PickOne value={v.bks} picked={pickedXe} onChange={setPickedXe} />
                    ) : null}
                  </td>
                  <td className="main">{v.bks}</td>
                  <td>{v.vehicleType ?? "Xe tải"}</td>
                  <td className="r">{v.capacity || "—"}</td>
                  <td>{v.driverName ?? "—"}</td>
                  <td>
                    <span className={v.active === false ? "tag warn" : "tag ok"}>
                      {v.active === false ? "Ngưng" : "Hoạt động"}
                    </span>
                  </td>
                  <td>
                    {writable ? (
                      <div className="act">
                        <button
                          type="button"
                          className="no"
                          aria-label="Sửa xe"
                          title="Sửa"
                          onClick={() => {
                            setEditXe(v);
                            setDlg("xe-edit");
                          }}
                        >
                          <span className="ms" aria-hidden="true">
                            edit
                          </span>
                        </button>
                        <Del
                          onClick={() =>
                            void runDelete("xe", [v.bks], removeVehicles, () =>
                              setPickedXe((p) => {
                                const n = new Set(p);
                                n.delete(v.bks);
                                return n;
                              }),
                            )
                          }
                        />
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </section>
      ) : null}

      {tab === "ts" ? (
        <section className="card stack">
          <div className="title-row" style={{ alignItems: "center" }}>
            <h2 className="group-title sec-title num">
              <span className="sec-ic" aria-hidden="true">
                <span className="ms">badge</span>
              </span>
              Tài xế ({drivers.length})
            </h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {writable ? (
                <button type="button" className="btn" onClick={() => setDlg("ts")}>
                  <span className="ms" aria-hidden="true">
                    add
                  </span>
                  Thêm tài xế
                </button>
              ) : null}
              {writable && pickedTs.size > 0 ? (
                <button
                  type="button"
                  className="btn danger"
                  disabled={deleting}
                  onClick={() =>
                    void runDelete("tài xế", [...pickedTs], removeDrivers, () =>
                      setPickedTs(new Set()),
                    )
                  }
                >
                  {deleting ? "Đang xóa…" : `Xóa ${pickedTs.size} tài xế đã chọn`}
                </button>
              ) : null}
            </div>
          </div>
          <Table
            rightLast
            headers={[
              writable ? (
                <PickAll key="all" all={drivers} picked={pickedTs} onChange={setPickedTs} />
              ) : (
                ""
              ),
              "Tài xế",
              "Tác vụ",
            ]}
          >
            {drivers.map((d) => (
              <tr key={d}>
                <td>
                  {writable ? <PickOne value={d} picked={pickedTs} onChange={setPickedTs} /> : null}
                </td>
                <td style={{ fontWeight: 500 }}>{d}</td>
                <td>
                  {writable ? (
                    <div className="act">
                      <button
                        type="button"
                        className="no"
                        aria-label="Sửa tài xế"
                        title="Sửa"
                        onClick={() => {
                          setEditDriver(d);
                          setDlg("ts-edit");
                        }}
                      >
                        <span className="ms" aria-hidden="true">
                          edit
                        </span>
                      </button>
                      <Del
                        onClick={() =>
                          void runDelete("tài xế", [d], removeDrivers, () =>
                            setPickedTs((p) => {
                              const n = new Set(p);
                              n.delete(d);
                              return n;
                            }),
                          )
                        }
                      />
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
          </Table>
        </section>
      ) : null}

      {tab === "shipper" ? (
        <section className="card stack">
          <div className="title-row" style={{ alignItems: "center" }}>
            <h2 className="group-title sec-title num">
              <span className="sec-ic" aria-hidden="true">
                <span className="ms">two_wheeler</span>
              </span>
              Shipper{shipperCount != null ? ` (${shipperCount})` : ""}
            </h2>
          </div>
          <ShipperMasterTab offices={listedOffices} writable={writable} onCount={setShipperCount} />
        </section>
      ) : null}

      {wifiVp?.id != null && (
        <OfficeWifiDialog
          officeId={wifiVp.id}
          officeName={wifiVp.name || wifiVp.code}
          writable={writable}
          onClose={() => setWifiVp(null)}
        />
      )}
      {itinVp?.id != null && (
        <OfficeVehicleItineraryDialog
          officeId={itinVp.id}
          officeName={itinVp.name || itinVp.code}
          writable={writable}
          onClose={() => setItinVp(null)}
        />
      )}
      {dlg === "vp" && (
        <VpDialog
          title="Thêm VP"
          onClose={() => setDlg(null)}
          onSave={(code, name, extras) => {
            addOffice(code, name, extras);
            toast.success("Đã thêm VP");
            setDlg(null);
          }}
        />
      )}
      {dlg === "vp-edit" && editVp && (
        <VpDialog
          title="Sửa VP"
          initial={editVp}
          saveLabel="Lưu"
          onClose={() => {
            setDlg(null);
            setEditVp(null);
          }}
          onSave={(code, name, extras) => {
            updateOffice(editVp, { code, name, ...extras });
            toast.success("Đã cập nhật VP");
            setDlg(null);
            setEditVp(null);
          }}
        />
      )}
      {dlg === "tuyen" && (
        <SingleDialog
          title="Thêm tuyến"
          label="Tuyến (ví dụ HN → HCM)"
          onClose={() => setDlg(null)}
          onSave={(v) => {
            addRoute(v);
            toast.success("Đã thêm tuyến");
            setDlg(null);
          }}
        />
      )}
      {dlg === "tuyen-edit" && editRoute != null && (
        <SingleDialog
          title="Sửa tuyến"
          label="Tên tuyến"
          initial={editRoute}
          saveLabel="Lưu"
          onClose={() => {
            setDlg(null);
            setEditRoute(null);
          }}
          onSave={(v) => {
            updateRoute(editRoute, v);
            toast.success("Đã cập nhật tuyến");
            setDlg(null);
            setEditRoute(null);
          }}
        />
      )}
      {dlg === "xe" && <VehicleFormDialog mode="create" onClose={() => setDlg(null)} />}
      {dlg === "xe-edit" && editXe && (
        <VehicleFormDialog
          mode="edit"
          initial={editXe}
          onClose={() => {
            setDlg(null);
            setEditXe(null);
          }}
        />
      )}
      {dlg === "ts" && (
        <SingleDialog
          title="Thêm tài xế"
          label="Họ tên"
          onClose={() => setDlg(null)}
          onSave={(v) => {
            addDriver(v);
            toast.success("Đã thêm tài xế");
            setDlg(null);
          }}
        />
      )}
      {dlg === "ts-edit" && editDriver != null && (
        <SingleDialog
          title="Sửa tài xế"
          label="Họ tên"
          initial={editDriver}
          saveLabel="Lưu"
          onClose={() => {
            setDlg(null);
            setEditDriver(null);
          }}
          onSave={(v) => {
            updateDriver(editDriver, v);
            toast.success("Đã cập nhật tài xế");
            setDlg(null);
            setEditDriver(null);
          }}
        />
      )}
    </div>
  );
}

function Del({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="no" aria-label="Xoá" title="Xoá" onClick={onClick}>
      <span className="ms" aria-hidden="true">
        delete
      </span>
    </button>
  );
}

function PickOne({
  value,
  picked,
  onChange,
}: {
  value: string;
  picked: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  return (
    <input
      type="checkbox"
      className="check"
      checked={picked.has(value)}
      onChange={(e) => {
        const next = new Set(picked);
        if (e.target.checked) next.add(value);
        else next.delete(value);
        onChange(next);
      }}
    />
  );
}

function PickAll({
  all,
  picked,
  onChange,
}: {
  all: string[];
  picked: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const count = all.filter((x) => picked.has(x)).length;
  return (
    <input
      type="checkbox"
      title="Chọn tất cả"
      className="check"
      checked={all.length > 0 && count === all.length}
      ref={(el) => {
        if (el) el.indeterminate = count > 0 && count < all.length;
      }}
      onChange={(e) => onChange(e.target.checked ? new Set(all) : new Set())}
    />
  );
}

function Table({
  headers,
  children,
  minWidth = 0,
  rightLast,
}: {
  headers: ReactNode[];
  children: ReactNode;
  minWidth?: number;
  rightLast?: boolean;
}) {
  return (
    <div className="scroller">
      <table className="tbl" style={{ ["--tbl-min" as string]: `${minWidth}px` }}>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} className={rightLast && i === headers.length - 1 ? "r" : undefined}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function VpDialog({
  title,
  initial,
  saveLabel = "Thêm",
  onClose,
  onSave,
}: {
  title: string;
  initial?: OfficeRec;
  saveLabel?: string;
  onClose: () => void;
  onSave: (
    code: string,
    name: string,
    extras: {
      address?: string;
      sourceId?: number;
      latitude?: number | null;
      longitude?: number | null;
      itineraryPoint?: string;
      customerVisible?: boolean;
    },
  ) => void;
}) {
  /** Sửa VP: khóa ID nguồn; mã VP vẫn sửa được. */
  const idLocked = Boolean(initial);
  const [code, setCode] = useState(initial?.code ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const initialPoints = splitItineraryPoints(initial?.itineraryPoint);
  const [itineraryPoint, setItineraryPoint] = useState(initialPoints[0] ?? "");
  const [secondaryPoint, setSecondaryPoint] = useState(initialPoints[1] ?? "");
  const [latText, setLatText] = useState(initial?.latitude != null ? String(initial.latitude) : "");
  const [lngText, setLngText] = useState(
    initial?.longitude != null ? String(initial.longitude) : "",
  );
  const [sourceIdText, setSourceIdText] = useState(
    initial?.sourceId != null ? String(initial.sourceId) : "",
  );
  const [pinning, setPinning] = useState(false);
  const [customerVisible, setCustomerVisible] = useState(initial?.customerVisible !== false);

  /** Chọn địa chỉ (V1/V2 như tạo đơn) → geocode OSM → pin map. */
  const onAddressPicked = async (full: string) => {
    setAddress(full);
    if (!full.trim() || !isApiEnabled()) return;
    setPinning(true);
    try {
      const hit = await geoGeocodeAddress(full);
      if (hit) {
        setLatText(String(hit.lat));
        setLngText(String(hit.lng));
        toast.success("Đã ping bản đồ theo huyện/tỉnh");
      } else {
        toast.message("Chưa nhận ra tỉnh — kéo pin để chỉnh");
      }
    } catch {
      toast.message("Chưa geocode được — kéo pin trên bản đồ để chọn vị trí");
    } finally {
      setPinning(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex max-h-[92vh] w-[calc(100%-1.5rem)] max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 overflow-y-auto px-6 py-4">
          <div className="space-y-1.5">
            <Label>ID</Label>
            <Input
              inputMode="numeric"
              value={sourceIdText}
              disabled={idLocked}
              readOnly={idLocked}
              onChange={(e) => {
                if (idLocked) return;
                setSourceIdText(e.target.value.replace(/[^\d]/g, ""));
              }}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Điểm lộ trình chính</Label>
              <Select
                value={itineraryPoint || undefined}
                onValueChange={(v) => {
                  setItineraryPoint(v);
                  if (v === secondaryPoint) setSecondaryPoint("");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn 1 điểm" />
                </SelectTrigger>
                <SelectContent>
                  <ItineraryPointGroups />
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Điểm lộ trình phụ (kiêm)</Label>
              <Select
                value={secondaryPoint || NO_SECONDARY_POINT}
                onValueChange={(v) => setSecondaryPoint(v === NO_SECONDARY_POINT ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Không" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_SECONDARY_POINT}>Không</SelectItem>
                  <ItineraryPointGroups exclude={itineraryPoint} />
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="-mt-1 text-xs text-muted-foreground">
            Khi tạo đơn, hệ thống ưu tiên lộ trình theo điểm chính; nếu điểm chính không có lộ trình
            đang bật tới đầu kia thì dùng điểm phụ.
          </p>
          <AddressPicker
            label="Địa chỉ văn phòng"
            required
            value={address}
            onChange={(full) => void onAddressPicked(full)}
            placeholder="Chọn địa chỉ (trước/sau sáp nhập)"
          />
          {pinning ? (
            <p className="text-xs text-muted-foreground">Đang lấy GPS trên bản đồ…</p>
          ) : null}
          <div className="space-y-1.5">
            <Label>Bản đồ (kéo/click pin để chỉnh GPS)</Label>
            <OfficeLocationMap
              className="h-[22rem] w-full overflow-hidden rounded-md border z-0"
              lat={latText.trim() === "" || Number.isNaN(Number(latText)) ? null : Number(latText)}
              lng={lngText.trim() === "" || Number.isNaN(Number(lngText)) ? null : Number(lngText)}
              onPick={(lat, lng) => {
                setLatText(String(lat));
                setLngText(String(lng));
              }}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Latitude</Label>
              <Input
                inputMode="decimal"
                value={latText}
                placeholder="21.02889"
                onChange={(e) => setLatText(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Longitude</Label>
              <Input
                inputMode="decimal"
                value={lngText}
                placeholder="105.85250"
                onChange={(e) => setLngText(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Mã VP</Label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="VD: TNT"
              />
              {idLocked ? (
                <p className="text-[11px] text-muted-foreground">
                  Đổi mã VP sẽ cập nhật trên hệ thống; đơn cũ vẫn giữ mã VP lúc tạo đơn.
                </p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label>Tên VP</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          </div>
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md border px-3 py-2.5">
            <span className="space-y-0.5">
              <span className="block text-sm font-medium">Hiện cho khách chọn</span>
              <span className="block text-xs text-muted-foreground">
                Tắt thì VP không có trong danh sách chọn VP gửi / nhận khi khách tự tạo đơn.
              </span>
            </span>
            <Switch checked={customerVisible} onCheckedChange={setCustomerVisible} />
          </label>
        </div>
        <DialogFooter className="shrink-0 border-t px-6 py-4">
          <Button variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button
            onClick={() => {
              if (!code || !name) {
                toast.error("Điền đủ mã và tên VP");
                return;
              }
              if (!address.trim()) {
                toast.error("Chọn địa chỉ văn phòng");
                return;
              }
              if (!itineraryPoint) {
                toast.error("Chọn điểm lộ trình");
                return;
              }
              const lat = latText.trim() === "" ? null : Number(latText);
              const lng = lngText.trim() === "" ? null : Number(lngText);
              if (latText.trim() && (lat == null || Number.isNaN(lat))) {
                toast.error("Latitude không hợp lệ");
                return;
              }
              if (lngText.trim() && (lng == null || Number.isNaN(lng))) {
                toast.error("Longitude không hợp lệ");
                return;
              }
              const extras: {
                address?: string;
                sourceId?: number;
                latitude?: number | null;
                longitude?: number | null;
                itineraryPoint?: string;
                customerVisible?: boolean;
              } = {
                address: address.trim(),
                latitude: lat,
                longitude: lng,
                itineraryPoint: [itineraryPoint, secondaryPoint].filter(Boolean).join(","),
                customerVisible,
              };
              if (sourceIdText) extras.sourceId = Number(sourceIdText);
              onSave(code, name, extras);
            }}
          >
            {saveLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const NO_SECONDARY_POINT = "__none";

function ItineraryPointGroups({ exclude }: { exclude?: string }) {
  return (
    <>
      <SelectGroup>
        <SelectLabel>Tỉnh khác</SelectLabel>
        {OFFICE_ITINERARY_POINTS.province
          .filter((p) => p.value !== exclude)
          .map((p) => (
            <SelectItem key={p.value} value={p.value}>
              {p.label}
            </SelectItem>
          ))}
      </SelectGroup>
      <SelectGroup>
        <SelectLabel>Hà Nội</SelectLabel>
        {OFFICE_ITINERARY_POINTS.hanoi
          .filter((p) => p.value !== exclude)
          .map((p) => (
            <SelectItem key={p.value} value={p.value}>
              {p.label}
            </SelectItem>
          ))}
      </SelectGroup>
    </>
  );
}

function SingleDialog({
  title,
  label,
  initial = "",
  saveLabel = "Thêm",
  onClose,
  onSave,
}: {
  title: string;
  label: string;
  initial?: string;
  saveLabel?: string;
  onClose: () => void;
  onSave: (v: string) => void;
}) {
  const [v, setV] = useState(initial);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>{label}</Label>
          {label === "Họ tên" ? (
            <NameInput preserveCase value={v} onChange={setV} />
          ) : (
            <Input value={v} onChange={(e) => setV(e.target.value)} />
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button onClick={() => (v.trim() ? onSave(v.trim()) : toast.error("Nhập giá trị"))}>
            {saveLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
