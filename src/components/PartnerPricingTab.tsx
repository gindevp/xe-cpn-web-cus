import { useEffect, useMemo, useRef, useState } from "react";
import { askConfirm } from "@/components/m3/askConfirm";
import { M3ConfirmActions, M3Sheet, M3SheetTitle } from "@/components/m3/M3Sheet";
import { MoneyInput } from "@/components/MoneyInput";
import { NumberInput } from "@/components/NumberInput";
import {
  deleteLinehaulBand,
  fetchLinehaulBands,
  fetchLinehaulProvinces,
  fetchLinehaulZoneWards,
  fetchLinehaulZones,
  replaceLinehaulZoneWards,
  LINEHAUL_PARTNER_VEXERE,
  saveLinehaulBand,
  type LinehaulBand,
  type LinehaulProvince,
  type LinehaulZone,
} from "@/lib/api/linehaul-api";
import {
  findDistrictV1ForArea,
  findProvinceV1ByName,
  listDistrictsByProvinceV1,
  listWardsByDistrictV1,
} from "@/lib/vn-address-data";
import { formatMoney } from "@/lib/mock-data";
import { toast } from "sonner";

type BandRow = LinehaulBand & { amounts: Record<number, number> };
type WardRow = { code: string; name: string; zoneId: number | null };

/** Đơn vị phân vùng: cả tỉnh = huyện V1; khu vực riêng = phường/xã thuộc huyện đó (design). */
function catalogUnitsForProvince(p: LinehaulProvince): { code: string; name: string }[] {
  const meta = findProvinceV1ByName(p.provinceName);
  if (!meta) return [];
  if (p.scope === "KHU_VUC") {
    const dist = findDistrictV1ForArea(meta.code, p.areaName || p.displayName);
    if (!dist) return [];
    return listWardsByDistrictV1(dist.code).map((w) => ({ code: String(w.code), name: w.name }));
  }
  return listDistrictsByProvinceV1(meta.code).map((d) => ({ code: String(d.code), name: d.name }));
}

/** Huyện bị khu vực riêng giữ (vd Thành phố Vinh) — không hiện ở tab cả tỉnh. */
function siblingDistrictCodes(
  province: LinehaulProvince,
  all: LinehaulProvince[],
): Set<string> {
  const taken = new Set<string>();
  const meta = findProvinceV1ByName(province.provinceName);
  if (!meta) return taken;
  for (const sib of all) {
    if (sib.provinceName !== province.provinceName || sib.id === province.id) continue;
    if (sib.scope !== "KHU_VUC") continue;
    const dist = findDistrictV1ForArea(meta.code, sib.areaName || sib.displayName);
    if (dist) taken.add(String(dist.code));
  }
  return taken;
}

/** Design: vùng xa = cam, trung bình = xanh lá, còn lại (TP/khu vực) = xanh dương. */
function zoneTone(name: string, fallbackIndex = 0) {
  const n = name.toLowerCase();
  if (/v[uù]ng\s*xa|\bxa\b/.test(n)) return "z2";
  if (/trung\s*b[iì]nh/.test(n)) return "z1";
  if (fallbackIndex % 3 === 1) return "z1";
  if (fallbackIndex % 3 === 2) return "z2";
  return "";
}

/** Design tile: "Nghệ An trung bình" (không dùng dấu · / viết tắt NA). */
function zoneTileLabel(provinceDisplay: string, zoneName: string) {
  const z = zoneName.trim();
  if (!z) return provinceDisplay;
  if (z.toLowerCase().includes(provinceDisplay.toLowerCase())) return z;
  const stripped = z.replace(/^(NA|HT|TP)\s+/i, "").trim();
  return `${provinceDisplay} ${stripped}`.trim();
}

function plain(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function PartnerPricingTab({
  writable,
  partnerCode = LINEHAUL_PARTNER_VEXERE,
  initialProvinceId,
  focusZones = false,
}: {
  writable: boolean;
  partnerCode?: string;
  /** Prefill tỉnh từ Master → Phân vùng giá. */
  initialProvinceId?: number;
  /** Cuộn tới khối phân vùng phường/xã. */
  focusZones?: boolean;
}) {
  const [provinces, setProvinces] = useState<LinehaulProvince[]>([]);
  const [zones, setZones] = useState<LinehaulZone[]>([]);
  const [bands, setBands] = useState<BandRow[]>([]);
  /** zoneId → wards đã gắn (toàn bộ đối tác). */
  const [wardsByZone, setWardsByZone] = useState<Record<number, { wardCode: string; wardName: string }[]>>({});
  const [loading, setLoading] = useState(true);
  const [bandDlg, setBandDlg] = useState<null | BandRow>(null);
  const [busy, setBusy] = useState(false);

  const [mapProvinceId, setMapProvinceId] = useState<number | null>(initialProvinceId ?? null);
  const [mapZoneFilter, setMapZoneFilter] = useState<number | null>(null);
  const [wardQ, setWardQ] = useState("");
  const [selectedWardCodes, setSelectedWardCodes] = useState<string[]>([]);
  const [savingWards, setSavingWards] = useState(false);
  /** Tránh PUT song song ghi đè danh sách ward của cùng tỉnh. */
  const wardSaveChain = useRef(Promise.resolve());
  const assignmentRef = useRef<Map<string, number>>(new Map());
  const nameRef = useRef<Map<string, string>>(new Map());
  const zonesSectionRef = useRef<HTMLElement | null>(null);
  const preferredProvinceId = useRef<number | null>(initialProvinceId ?? null);

  useEffect(() => {
    preferredProvinceId.current = initialProvinceId ?? null;
    if (initialProvinceId != null) setMapProvinceId(initialProvinceId);
  }, [initialProvinceId]);

  const reload = async () => {
    setLoading(true);
    try {
      const [prov, zs, payload] = await Promise.all([
        fetchLinehaulProvinces(false),
        fetchLinehaulZones(),
        fetchLinehaulBands(partnerCode),
      ]);
      setProvinces(prov.filter((p) => !partnerCode || p.partnerCode === partnerCode));
      setZones(zs);
      const amountsByBand = payload.amountsByBand ?? {};
      setBands(
        (payload.bands ?? []).map((b) => {
          const raw = amountsByBand[String(b.id)] ?? {};
          const amounts: Record<number, number> = {};
          for (const [k, v] of Object.entries(raw)) amounts[Number(k)] = Number(v);
          return { ...b, kgFrom: Number(b.kgFrom), kgTo: Number(b.kgTo), amounts };
        }),
      );
      const wardEntries = await Promise.all(
        zs.map(async (z) => {
          try {
            const wards = await fetchLinehaulZoneWards(z.id);
            return [z.id, wards.map((w) => ({ wardCode: w.wardCode, wardName: w.wardName }))] as const;
          } catch {
            return [z.id, []] as const;
          }
        }),
      );
      setWardsByZone(Object.fromEntries(wardEntries));
      const filtered = prov.filter((p) => !partnerCode || p.partnerCode === partnerCode);
      setMapProvinceId((prev) => {
        const prefer = preferredProvinceId.current;
        if (prefer != null && filtered.some((p) => p.id === prefer)) return prefer;
        if (prev != null && filtered.some((p) => p.id === prev)) return prev;
        const ordered = [...filtered].sort((a, b) => {
          const aKv = a.scope === "KHU_VUC" ? 0 : 1;
          const bKv = b.scope === "KHU_VUC" ? 0 : 1;
          if (aKv !== bKv) return aKv - bKv;
          return a.id - b.id;
        });
        return ordered[0]?.id ?? null;
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không tải bảng giá đối tác");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload theo partner
  }, [partnerCode]);

  useEffect(() => {
    if (!focusZones || loading) return;
    const el = zonesSectionRef.current;
    if (!el) return;
    const t = window.setTimeout(() => {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
    return () => window.clearTimeout(t);
  }, [focusZones, loading, mapProvinceId, partnerCode]);

  const zoneGroups = useMemo(() => {
    const ordered = [...provinces].sort((a, b) => {
      const aKv = a.scope === "KHU_VUC" ? 0 : 1;
      const bKv = b.scope === "KHU_VUC" ? 0 : 1;
      if (aKv !== bKv) return aKv - bKv;
      return a.id - b.id;
    });
    return ordered.map((p) => ({
      province: p,
      zones: zones
        .filter((z) => z.provinceId === p.id)
        .slice()
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id),
    }));
  }, [provinces, zones]);

  const mapProvince = zoneGroups.find((g) => g.province.id === mapProvinceId)?.province ?? null;
  const mapZones = zoneGroups.find((g) => g.province.id === mapProvinceId)?.zones ?? [];
  const priceZones = useMemo(
    () =>
      mapZones.map((z, zi) => ({
        zone: z,
        tone: zoneTone(z.name, zi),
      })),
    [mapZones],
  );
  const tblMin = Math.max(720, 360 + Math.max(priceZones.length, 1) * 120);

  /** Mã huyện/phường đã giữ bởi sibling (khu vực riêng) — không liệt kê ở tab cả tỉnh. */
  const siblingTakenCodes = useMemo(() => {
    if (!mapProvince) return new Set<string>();
    const taken = siblingDistrictCodes(mapProvince, provinces);
    const siblingIds = new Set(
      provinces.filter((p) => p.provinceName === mapProvince.provinceName && p.id !== mapProvince.id).map((p) => p.id),
    );
    for (const z of zones) {
      if (!siblingIds.has(z.provinceId)) continue;
      for (const w of wardsByZone[z.id] ?? []) taken.add(w.wardCode);
    }
    return taken;
  }, [mapProvince, provinces, zones, wardsByZone]);

  const assignmentByCode = useMemo(() => {
    const m = new Map<string, number>();
    for (const z of mapZones) {
      for (const w of wardsByZone[z.id] ?? []) m.set(w.wardCode, z.id);
    }
    return m;
  }, [mapZones, wardsByZone]);

  useEffect(() => {
    assignmentRef.current = new Map(assignmentByCode);
  }, [assignmentByCode]);

  const catalogWards = useMemo(() => {
    if (!mapProvince) return [] as WardRow[];
    const isKhuVuc = mapProvince.scope === "KHU_VUC";
    const fromCatalog = catalogUnitsForProvince(mapProvince);
    const byCode = new Map(fromCatalog.map((w) => [w.code, w]));
    // Khu vực riêng: giữ phường đã gắn (mã cũ). Cả tỉnh: chỉ huyện trong catalog — bỏ mã phường lệch.
    if (isKhuVuc) {
      for (const z of mapZones) {
        for (const w of wardsByZone[z.id] ?? []) {
          if (!byCode.has(w.wardCode)) byCode.set(w.wardCode, { code: w.wardCode, name: w.wardName });
        }
      }
    }
    const q = plain(wardQ.trim());
    const rows: WardRow[] = [];
    for (const w of byCode.values()) {
      const assignedHere = assignmentByCode.has(w.code);
      if (siblingTakenCodes.has(w.code) && !assignedHere) continue;
      if (q && !plain(w.name).includes(q) && !w.code.includes(q)) continue;
      rows.push({ code: w.code, name: w.name, zoneId: assignmentByCode.get(w.code) ?? null });
    }
    rows.sort((a, b) => a.name.localeCompare(b.name, "vi"));
    return rows;
  }, [mapProvince, mapZones, wardsByZone, siblingTakenCodes, assignmentByCode, wardQ]);

  useEffect(() => {
    nameRef.current = new Map(catalogWards.map((w) => [w.code, w.name]));
  }, [catalogWards]);

  const filteredWards = useMemo(() => {
    const q = plain(wardQ.trim());
    return catalogWards.filter((w) => {
      if (mapZoneFilter != null && w.zoneId !== mapZoneFilter) return false;
      if (!q) return true;
      return plain(w.name).includes(q) || w.code.includes(q);
    });
  }, [catalogWards, wardQ, mapZoneFilter]);

  const sampleBand = useMemo(() => {
    if (!bands.length) return null;
    return (
      bands.find((b) => b.kgFrom <= 5.001 && b.kgTo >= 10) ||
      bands.find((b) => b.kgFrom >= 5 && b.kgFrom < 15) ||
      bands[1] ||
      bands[0] ||
      null
    );
  }, [bands]);

  const sampleFeeLabel = sampleBand
    ? `Cước kiện ${String(sampleBand.kgFrom).replace(".", ",")} – ${String(sampleBand.kgTo).replace(".", ",")} kg`
    : "Cước kiện";

  const zoneCount = (zoneId: number) => (wardsByZone[zoneId] ?? []).length;

  const persistProvinceAssignments = (nextAssign: Map<string, number>, nameByCode: Map<string, string>) => {
    if (!mapProvince || !writable) return Promise.resolve();
    const prevAssign = new Map(assignmentRef.current);
    assignmentRef.current = nextAssign;
    for (const [code, name] of nameByCode) nameRef.current.set(code, name);
    // Optimistic UI
    setWardsByZone((prev) => {
      const copy = { ...prev };
      for (const z of mapZones) {
        copy[z.id] = [...nextAssign.entries()]
          .filter(([, zoneId]) => zoneId === z.id)
          .map(([code]) => ({ wardCode: code, wardName: nameByCode.get(code) || nameRef.current.get(code) || code }));
      }
      return copy;
    });
    const zonesSnapshot = mapZones;
    const provinceZoneIds = new Set(zonesSnapshot.map((z) => z.id));
    setSavingWards(true);
    const job = async () => {
      try {
        const latest = assignmentRef.current;
        const affected = new Set<number>();
        for (const [code, zid] of prevAssign) {
          if (provinceZoneIds.has(zid) && latest.get(code) !== zid) affected.add(zid);
        }
        for (const [code, zid] of latest) {
          if (provinceZoneIds.has(zid) && prevAssign.get(code) !== zid) affected.add(zid);
        }
        // Gỡ vùng cũ trước, gắn vùng mới sau — tránh race PUT song song.
        const leaving: number[] = [];
        const receiving: number[] = [];
        for (const zid of affected) {
          let lost = false;
          for (const [code, oz] of prevAssign) {
            if (oz === zid && latest.get(code) !== zid) {
              lost = true;
              break;
            }
          }
          (lost ? leaving : receiving).push(zid);
        }
        const ordered = [...leaving, ...receiving.filter((id) => !leaving.includes(id))];
        for (const zid of ordered) {
          const list = [...latest.entries()]
            .filter(([, zoneId]) => zoneId === zid)
            .map(([code]) => ({
              wardCode: code,
              wardName: nameRef.current.get(code) || code,
            }));
          await replaceLinehaulZoneWards(zid, list);
        }
      } catch (e) {
        const raw = e instanceof Error ? e.message.trim() : "";
        toast.error(raw && raw.length <= 140 ? raw : "Không lưu được phân vùng giá — thử lại");
        await reload();
        throw e;
      }
    };
    wardSaveChain.current = wardSaveChain.current.then(job, job).finally(() => setSavingWards(false));
    return wardSaveChain.current;
  };

  const setWardZone = async (ward: WardRow, zoneId: number | null) => {
    if (!writable) return;
    const next = new Map(assignmentRef.current);
    if (zoneId == null) next.delete(ward.code);
    else next.set(ward.code, zoneId);
    const names = new Map(nameRef.current);
    names.set(ward.code, ward.name);
    try {
      await persistProvinceAssignments(next, names);
    } catch {
      /* lỗi đã toast + reload trong persist */
    }
  };

  const applyZoneToSelected = async (zoneId: number | null) => {
    if (!writable || !selectedWardCodes.length) return;
    const next = new Map(assignmentRef.current);
    for (const code of selectedWardCodes) {
      if (zoneId == null) next.delete(code);
      else next.set(code, zoneId);
    }
    try {
      await persistProvinceAssignments(next, new Map(nameRef.current));
      setSelectedWardCodes([]);
      toast.success("Đã cập nhật vùng giá");
    } catch {
      /* lỗi đã toast + reload trong persist */
    }
  };

  const toggleWardSelected = (code: string, on: boolean) => {
    setSelectedWardCodes((prev) => (on ? [...prev, code] : prev.filter((c) => c !== code)));
  };

  const toggleAllVisible = (on: boolean) => {
    const codes = filteredWards.map((w) => w.code);
    setSelectedWardCodes((prev) => {
      if (!on) return prev.filter((c) => !codes.includes(c));
      return Array.from(new Set([...prev, ...codes]));
    });
  };

  const saveBand = async () => {
    if (!bandDlg) return;
    if (!mapProvince || mapZones.length === 0) {
      return toast.error("Chọn tỉnh có vùng giá trước khi lưu khung");
    }
    if (bandDlg.kgTo < bandDlg.kgFrom) return toast.error("Đến kg phải ≥ Từ kg");
    // BE replace toàn bộ cell theo band → phải giữ amounts tỉnh khác, chỉ cập nhật vùng tab hiện tại.
    const currentZoneIds = new Set(mapZones.map((z) => z.id));
    const amounts: Record<number, number> = {};
    for (const [k, v] of Object.entries(bandDlg.amounts)) {
      const zid = Number(k);
      if (!Number.isFinite(zid)) continue;
      if (bandDlg.id != null && !currentZoneIds.has(zid)) {
        amounts[zid] = Number(v) || 0;
      }
    }
    for (const z of mapZones) {
      amounts[z.id] = Number(bandDlg.amounts[z.id]) || 0;
    }
    setBusy(true);
    try {
      await saveLinehaulBand(
        {
          id: bandDlg.id,
          partnerCode,
          kgFrom: bandDlg.kgFrom,
          kgTo: bandDlg.kgTo,
          dimLCm: bandDlg.dimLCm ?? null,
          dimWCm: bandDlg.dimWCm ?? null,
          dimHCm: bandDlg.dimHCm ?? null,
          active: true,
          sortOrder: bandDlg.sortOrder ?? 0,
        },
        amounts,
      );
      toast.success(
        bandDlg.id
          ? `Đã lưu khung · ${mapProvince.displayName}`
          : `Đã thêm khung · ${mapProvince.displayName}`,
      );
      setBandDlg(null);
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không lưu khung");
    } finally {
      setBusy(false);
    }
  };

  const partnerShort = partnerCode || LINEHAUL_PARTNER_VEXERE;
  const unsetCount = mapProvince
    ? Math.max(0, (mapProvince.wardTotal ?? 0) - (mapProvince.wardMapped ?? 0))
    : 0;

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 12 }}>
        <div className="field" style={{ flex: "0 0 auto", minWidth: 0, margin: 0 }}>
          <span className="l" id="pz-prov-tabs">
            Tỉnh
          </span>
          <div className="seg" role="tablist" aria-labelledby="pz-prov-tabs">
            {zoneGroups.map((g) => (
              <button
                key={g.province.id}
                type="button"
                role="tab"
                className={mapProvinceId === g.province.id ? "on" : undefined}
                aria-selected={mapProvinceId === g.province.id}
                onClick={() => {
                  setMapProvinceId(g.province.id);
                  setMapZoneFilter(null);
                  setWardQ("");
                  setSelectedWardCodes([]);
                }}
              >
                {g.province.displayName}
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="note" style={{ margin: 0 }}>
        Bảng giá của {partnerShort} cho đơn có điểm nhận tại{" "}
        <b>{mapProvince?.displayName || "tỉnh đối tác"}</b>. Giá đối tác đã gồm giao tận nhà. Cước hàng của từng kiện
        tính theo khung cân và vùng giá của phường/xã nhận. Phụ phí (thu hộ COD, khai báo giá trị, lấy tận nơi…) vẫn
        tính như CPN ở màn Cài đặt phụ phí.
      </p>

      <section className="card stack" style={{ gap: 16 }}>
        <div className="title-row" style={{ alignItems: "center" }}>
          <h2 className="group-title sec-title">
            <span className="sec-ic" aria-hidden="true">
              <span className="ms">package_2</span>
            </span>
            Giá theo khung cân và vùng · {mapProvince?.displayName || "—"}
          </h2>
          {writable ? (
            <button
              type="button"
              className="btn"
              disabled={!mapProvince || mapZones.length === 0}
              title={
                !mapProvince
                  ? "Chọn tỉnh trước"
                  : mapZones.length === 0
                    ? "Tỉnh này chưa có vùng giá"
                    : undefined
              }
              onClick={() =>
                setBandDlg({
                  kgFrom: 0,
                  kgTo: 5,
                  dimLCm: 30,
                  dimWCm: 25,
                  dimHCm: 20,
                  // Chỉ khởi tạo ô giá cho vùng của tỉnh đang mở tab.
                  amounts: Object.fromEntries(mapZones.map((z) => [z.id, 0])),
                })
              }
            >
              <span className="ms" aria-hidden="true">
                add
              </span>
              Thêm khung
            </button>
          ) : null}
        </div>

        {loading ? (
          <div className="lab muted">Đang tải…</div>
        ) : (
          <div className="scroller">
            <table className="tbl pz-tbl" style={{ ["--tbl-min" as string]: `${tblMin}px` }}>
              <thead>
                <tr>
                  <th>TT</th>
                  <th className="r">Từ (kg)</th>
                  <th className="r">Đến (kg)</th>
                  <th>Kích thước tham khảo (cm)</th>
                  {priceZones.length
                    ? priceZones.map(({ zone, tone }) => (
                        <th key={zone.id} className="r">
                          <span className={`pz-h ${tone}`}>{zone.name}</span>
                        </th>
                      ))
                    : [
                        <th key="empty" className="r">
                          <span className="muted">—</span>
                        </th>,
                      ]}
                  <th className="r">Tác vụ</th>
                </tr>
              </thead>
              <tbody>
                {bands.map((b, i) => (
                  <tr key={b.id ?? i}>
                    <td className="muted">{i + 1}</td>
                    <td className="num r">{b.kgFrom}</td>
                    <td className="num r">{b.kgTo}</td>
                    <td className="muted num">
                      {b.dimLCm && b.dimWCm && b.dimHCm ? `${b.dimLCm}x${b.dimWCm}x${b.dimHCm}` : "—"}
                    </td>
                    {priceZones.length
                      ? priceZones.map(({ zone, tone }) => (
                          <td key={zone.id} className={`r main num${tone === "z2" ? " pz-far" : ""}`}>
                            {b.amounts[zone.id] != null ? formatMoney(b.amounts[zone.id]) : "—"}
                          </td>
                        ))
                      : [
                          <td key="e" className="c">
                            —
                          </td>,
                        ]}
                    <td className="r">
                      {writable ? (
                        <div className="act">
                          <button
                            type="button"
                            className="no"
                            aria-label="Sửa"
                            disabled={!mapProvince || mapZones.length === 0}
                            onClick={() => {
                              // Giữ amounts tỉnh khác; dialog chỉ sửa vùng của tab hiện tại.
                              const amounts = { ...b.amounts };
                              for (const z of mapZones) {
                                if (amounts[z.id] == null) amounts[z.id] = 0;
                              }
                              setBandDlg({ ...b, amounts });
                            }}
                          >
                            <span className="ms">edit</span>
                          </button>
                          <button
                            type="button"
                            className="no"
                            aria-label="Xoá"
                            onClick={async () => {
                              if (b.id == null) return;
                              if (!(await askConfirm("Xoá khung cân này?"))) return;
                              try {
                                await deleteLinehaulBand(b.id);
                                toast.success("Đã xoá");
                                await reload();
                              } catch (e) {
                                toast.error(e instanceof Error ? e.message : "Không xoá được");
                              }
                            }}
                          >
                            <span className="ms">delete</span>
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
                {!bands.length ? (
                  <tr>
                    <td colSpan={5 + Math.max(priceZones.length, 1)} className="lab muted">
                      Chưa có khung cân.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
        <div className="note">
          Cân tính cước của từng kiện là cân lớn hơn giữa cân thật và khối lượng quy đổi Dài × Rộng × Cao / 5000. Cân
          nằm đúng ranh giới hai khung tính theo thiết lập khi sửa khung.
        </div>
      </section>

      <section
        ref={zonesSectionRef}
        id="pz-phan-vung"
        className="card stack"
        style={{ gap: 12, scrollMarginTop: 88 }}
      >
        <div className="title-row" style={{ alignItems: "center", gap: 12 }}>
          <h2 className="group-title sec-title" style={{ margin: 0 }}>
            <span className="sec-ic" aria-hidden="true">
              <span className="ms">map</span>
            </span>
            Phân vùng phường/xã · {mapProvince?.displayName || "—"}
          </h2>
          {mapProvince ? (
            <span className="small muted num" style={{ marginLeft: "auto" }}>
              {mapProvince.wardMapped}/{mapProvince.wardTotal} đã phân vùng
            </span>
          ) : null}
        </div>

        {!mapProvince ? (
          <span className="lab muted">Chưa có tỉnh đối tác — thêm ở Master trước.</span>
        ) : (
          <>
            {unsetCount > 0 ? (
              <div className="note pz-warn">
                <span className="ms" aria-hidden="true">
                  warning
                </span>
                {unsetCount} phường/xã chưa phân vùng — chưa chọn được khi tạo đơn.
              </div>
            ) : null}

            <div className="title-row" style={{ alignItems: "center", gap: 12 }}>
              <label className="field" style={{ flex: "1 1 240px", minWidth: 0, margin: 0 }}>
                <span className="box input-box">
                  <span className="ms" aria-hidden="true" style={{ marginLeft: 10, color: "var(--on-surface-variant)" }}>
                    search
                  </span>
                  <input
                    placeholder={mapProvince.scope === "KHU_VUC" ? "Tìm phường/xã" : "Tìm huyện / thị xã"}
                    value={wardQ}
                    onChange={(e) => setWardQ(e.target.value)}
                    aria-label="Tìm phường/xã"
                  />
                </span>
              </label>
              {writable && selectedWardCodes.length > 0 && mapZones.length > 0 ? (
                <label className="field" style={{ minWidth: 200, margin: 0 }}>
                  <span className="l">Gán vùng ({selectedWardCodes.length})</span>
                  <span className="box input-box sel-box">
                    <select
                      aria-label="Gán vùng giá"
                      disabled={savingWards}
                      defaultValue=""
                      onChange={(e) => {
                        const v = e.target.value;
                        e.target.value = "";
                        void applyZoneToSelected(v === "" ? null : Number(v));
                      }}
                    >
                      <option value="" disabled>
                        Chọn vùng…
                      </option>
                      {mapZones.map((z, zi) => (
                        <option key={z.id} value={z.id}>
                          {zoneTileLabel(mapProvince.displayName, z.name)}
                        </option>
                      ))}
                      <option value="">Bỏ gắn</option>
                    </select>
                    <span className="ms" aria-hidden="true">
                      expand_more
                    </span>
                  </span>
                </label>
              ) : null}
            </div>

            <div className="scroller">
              <table className="tbl pz-wtbl">
                <thead>
                  <tr>
                    <th style={{ width: 44 }}>
                      <input
                        type="checkbox"
                        aria-label="Chọn tất cả"
                        checked={
                          filteredWards.length > 0 && filteredWards.every((w) => selectedWardCodes.includes(w.code))
                        }
                        onChange={(e) => toggleAllVisible(e.target.checked)}
                        disabled={!writable}
                      />
                    </th>
                    <th>{mapProvince.scope === "KHU_VUC" ? "Phường/Xã" : "Huyện / Thị xã"}</th>
                    <th style={{ minWidth: 200 }}>Vùng giá</th>
                    <th className="r">{sampleFeeLabel}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredWards.map((w) => {
                    const z = mapZones.find((x) => x.id === w.zoneId) ?? null;
                    const zi = z ? mapZones.indexOf(z) : 0;
                    const tone = z ? zoneTone(z.name, zi) : "";
                    const fee = z && sampleBand ? sampleBand.amounts[z.id] : null;
                    return (
                      <tr key={w.code}>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`Chọn ${w.name}`}
                            checked={selectedWardCodes.includes(w.code)}
                            disabled={!writable}
                            onChange={(e) => toggleWardSelected(w.code, e.target.checked)}
                          />
                        </td>
                        <td>{w.name}</td>
                        <td>
                          {writable ? (
                            <span className="box input-box sel-box" style={{ height: 36 }}>
                              {z ? <span className={`pz-dot ${tone}`} aria-hidden="true" style={{ marginLeft: 10 }} /> : null}
                              <select
                                aria-label={`Vùng giá ${w.name}`}
                                value={w.zoneId ?? ""}
                                disabled={savingWards}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  void setWardZone(w, v === "" ? null : Number(v));
                                }}
                              >
                                <option value="">Chưa gắn</option>
                                {mapZones.map((opt) => (
                                  <option key={opt.id} value={opt.id}>
                                    {zoneTileLabel(mapProvince.displayName, opt.name)}
                                  </option>
                                ))}
                              </select>
                              <span className="ms" aria-hidden="true">
                                expand_more
                              </span>
                            </span>
                          ) : z ? (
                            <span className={`pz-h ${tone}`}>{zoneTileLabel(mapProvince.displayName, z.name)}</span>
                          ) : (
                            <span className="muted">Chưa gắn</span>
                          )}
                        </td>
                        <td className="num r">{fee != null ? formatMoney(fee) : "—"}</td>
                      </tr>
                    );
                  })}
                  {!filteredWards.length ? (
                    <tr>
                      <td colSpan={4} className="lab muted">
                        {loading ? "Đang tải…" : "Không có phường/xã phù hợp."}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {bandDlg ? (
        <M3Sheet open onOpenChange={(o) => !o && !busy && setBandDlg(null)} variant="form-sheet">
          <M3SheetTitle>
            {bandDlg.id ? "Sửa khung cân" : "Thêm khung cân"}
            {mapProvince ? ` · ${mapProvince.displayName}` : ""}
          </M3SheetTitle>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <label className="field">
              <span className="l">Từ (kg)</span>
              <NumberInput value={bandDlg.kgFrom} onChange={(v) => setBandDlg({ ...bandDlg, kgFrom: v })} />
            </label>
            <label className="field">
              <span className="l">Đến (kg)</span>
              <NumberInput value={bandDlg.kgTo} onChange={(v) => setBandDlg({ ...bandDlg, kgTo: v })} />
            </label>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <label className="field">
              <span className="l">Dài (cm)</span>
              <NumberInput
                value={bandDlg.dimLCm ?? 0}
                onChange={(v) => setBandDlg({ ...bandDlg, dimLCm: v || null })}
              />
            </label>
            <label className="field">
              <span className="l">Rộng (cm)</span>
              <NumberInput
                value={bandDlg.dimWCm ?? 0}
                onChange={(v) => setBandDlg({ ...bandDlg, dimWCm: v || null })}
              />
            </label>
            <label className="field">
              <span className="l">Cao (cm)</span>
              <NumberInput
                value={bandDlg.dimHCm ?? 0}
                onChange={(v) => setBandDlg({ ...bandDlg, dimHCm: v || null })}
              />
            </label>
          </div>
          <div className="stack" style={{ gap: 8 }}>
            <div className="lab muted" style={{ fontSize: 12 }}>
              Giá theo vùng của {mapProvince?.displayName || "tỉnh đang chọn"}
            </div>
            {mapZones.map((z, zi) => (
              <label key={z.id} className="field">
                <span className="l">
                  <span className={`pz-h ${zoneTone(z.name, zi)}`}>{z.name}</span>
                </span>
                <MoneyInput
                  value={bandDlg.amounts[z.id] ?? 0}
                  onChange={(v) => setBandDlg({ ...bandDlg, amounts: { ...bandDlg.amounts, [z.id]: v } })}
                />
              </label>
            ))}
            {!mapZones.length ? (
              <span className="lab muted">Tỉnh này chưa có vùng giá — khai báo vùng ở Master trước.</span>
            ) : null}
          </div>
          <M3ConfirmActions>
            <button type="button" className="btn ghost" disabled={busy} onClick={() => setBandDlg(null)}>
              Huỷ
            </button>
            <button type="button" className="btn" disabled={busy || !mapZones.length} onClick={() => void saveBand()}>
              {busy ? "Đang lưu…" : "Lưu"}
            </button>
          </M3ConfirmActions>
        </M3Sheet>
      ) : null}
    </div>
  );
}
