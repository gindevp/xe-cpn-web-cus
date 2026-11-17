import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ProtectedPage } from "@/components/AppShell";
import { Section } from "@/components/PageBits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { MoneyInput } from "@/components/MoneyInput";
import { useStore, type FareDiscountCode, type FareDiscountRule } from "@/lib/store";
import { formatVND } from "@/lib/mock-data";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { isApiEnabled } from "@/lib/api/client";
import {
  fetchAhamovePromoCodes,
  fetchFareDiscountCodes,
  fetchFareDiscountRules,
  persistAhamovePromoCodes,
  persistFareDiscountCodes,
  persistFareDiscountRules,
  type AhamovePromoCode,
} from "@/lib/api/finance-config-api";
import { useAuth } from "@/lib/auth";
import { canRead, canWrite, useRbacVersion } from "@/lib/rbac";
import { normalizeDiscountCode, vnCalendarDate } from "@/lib/pricing";
import { cn } from "@/lib/utils";

/** Ghi KM: quyền màn này / quản trị; fallback — ai vào được màn (canRead) thì CRUD (BE vẫn chặn 403). */
function canManagePromo(role: Parameters<typeof canWrite>[0]) {
  if (
    canWrite(role, "khuyen-mai") ||
    canWrite(role, "tai-khoan") ||
    canWrite(role, "nhom-quyen") ||
    canWrite(role, "tich-hop") ||
    canWrite(role, "bao-tri")
  ) {
    return true;
  }
  return canRead(role, "khuyen-mai");
}

const newId = () => `fd-${Math.random().toString(36).slice(2, 9)}`;

type ProgramGroup = {
  key: string;
  name: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  active: boolean;
  tiers: FareDiscountRule[];
};

/** Gom bậc cùng tên → một chương trình (UI design). */
function groupPrograms(rules: FareDiscountRule[]): ProgramGroup[] {
  const map = new Map<string, ProgramGroup>();
  for (const r of rules) {
    const name = r.name.trim() || `(Không tên · ${r.id})`;
    const key = r.name.trim() ? `n:${r.name.trim().toLowerCase()}` : `id:${r.id}`;
    const g = map.get(key);
    if (!g) {
      map.set(key, {
        key,
        name: r.name.trim() || "",
        effectiveFrom: r.effectiveFrom,
        effectiveTo: r.effectiveTo,
        active: r.active,
        tiers: [r],
      });
    } else {
      g.tiers.push(r);
      g.active = g.active || r.active;
      if (!g.effectiveFrom && r.effectiveFrom) g.effectiveFrom = r.effectiveFrom;
      if (!g.effectiveTo && r.effectiveTo) g.effectiveTo = r.effectiveTo;
    }
  }
  return [...map.values()].map((g) => ({
    ...g,
    tiers: [...g.tiers].sort((a, b) => a.minFare - b.minFare || a.discountAmount - b.discountAmount),
  }));
}

function programStatus(p: ProgramGroup, day = vnCalendarDate()): { label: string; className: string } {
  if (!p.active) return { label: "Tắt", className: "bg-muted text-muted-foreground border-transparent" };
  if (p.effectiveFrom && day < p.effectiveFrom) {
    return { label: "Sắp áp dụng", className: "bg-sky-100 text-sky-800 border-transparent dark:bg-sky-950 dark:text-sky-200" };
  }
  if (p.effectiveTo && day > p.effectiveTo) {
    return { label: "Đã kết thúc", className: "bg-muted text-muted-foreground border-transparent" };
  }
  return { label: "Đang áp dụng", className: "bg-emerald-100 text-emerald-800 border-transparent dark:bg-emerald-950 dark:text-emerald-200" };
}

function codeStatus(c: FareDiscountCode, day = vnCalendarDate()) {
  return programStatus(
    {
      key: c.id,
      name: c.name,
      effectiveFrom: c.effectiveFrom,
      effectiveTo: c.effectiveTo,
      active: c.active,
      tiers: [],
    },
    day,
  );
}

function formatDateRange(from?: string, to?: string) {
  const f = from ? from.split("-").reverse().join("/") : "…";
  const t = to ? to.split("-").reverse().join("/") : "…";
  return `${f} – ${t}`;
}

function tierSummary(tiers: FareDiscountRule[]) {
  if (!tiers.length) return "—";
  return tiers.map((t) => formatVND(t.discountAmount)).join(" · ");
}

function bandToLabel(tier: FareDiscountRule, ordered: FareDiscountRule[]) {
  const next = ordered.find((x) => x.minFare > tier.minFare);
  if (!next) return "Không giới hạn";
  const to = next.minFare - 1;
  return to >= tier.minFare ? formatVND(to) : formatVND(next.minFare);
}

function findGaps(ordered: FareDiscountRule[]): string[] {
  const gaps: string[] = [];
  for (let i = 0; i < ordered.length - 1; i++) {
    const a = ordered[i]!;
    const b = ordered[i + 1]!;
    if (b.minFare > a.minFare + 1) {
      const from = a.minFare + 1;
      const to = b.minFare - 1;
      if (from <= to) {
        gaps.push(
          `Tổng cước từ ${formatVND(from)} đến ${formatVND(to)} không thuộc bậc nào trong chương trình này.`,
        );
      }
    }
  }
  return gaps;
}

export const Route = createFileRoute("/khuyen-mai")({
  head: () => ({
    meta: [
      { title: "Cài đặt giảm giá — X.E" },
      { name: "description", content: "Chương trình giảm giá, mã giảm giá và voucher Ahamove." },
    ],
  }),
  component: () => (
    <ProtectedPage title="Cài đặt giảm giá" screen="khuyen-mai">
      <Page />
    </ProtectedPage>
  ),
});

function emptyTier(name: string, from: string | undefined, to: string | undefined, active: boolean): FareDiscountRule {
  return {
    id: newId(),
    name,
    minFare: 300_000,
    discountAmount: 30_000,
    effectiveFrom: from,
    effectiveTo: to,
    active,
  };
}

function emptyCode(): FareDiscountCode {
  return {
    id: newId(),
    code: "",
    name: "",
    discountAmount: 50_000,
    minFare: 0,
    active: true,
  };
}

function emptyAha(): AhamovePromoCode {
  return {
    id: newId(),
    code: "",
    name: "",
    active: true,
  };
}

function Page() {
  const { session } = useAuth();
  useRbacVersion();
  const writable = canManagePromo(session?.role);
  const [tab, setTab] = useState<"program" | "code" | "aha">("program");
  const storedRules = useStore((s) => s.fareDiscountRules);
  const storedCodes = useStore((s) => s.fareDiscountCodes);
  const setFareDiscountRules = useStore((s) => s.setFareDiscountRules);
  const setFareDiscountCodes = useStore((s) => s.setFareDiscountCodes);
  const [rules, setRules] = useState<FareDiscountRule[]>(storedRules);
  const [codes, setCodes] = useState<FareDiscountCode[]>(storedCodes);
  const [ahaRows, setAhaRows] = useState<AhamovePromoCode[]>([]);
  const [ahaSaved, setAhaSaved] = useState<AhamovePromoCode[]>([]);
  const [saving, setSaving] = useState(false);
  const [selectedProgramKey, setSelectedProgramKey] = useState<string | null>(null);
  const [selectedCodeId, setSelectedCodeId] = useState<string | null>(null);

  useEffect(() => {
    setRules(storedRules);
  }, [storedRules]);
  useEffect(() => {
    setCodes(storedCodes);
  }, [storedCodes]);

  useEffect(() => {
    if (!isApiEnabled()) return;
    void Promise.all([fetchFareDiscountRules(), fetchFareDiscountCodes(), fetchAhamovePromoCodes()])
      .then(([r, c, a]) => {
        useStore.setState({ fareDiscountRules: r, fareDiscountCodes: c });
        setRules(r);
        setCodes(c);
        setAhaRows(a);
        setAhaSaved(a);
      })
      .catch(() => undefined);
  }, []);

  const programs = useMemo(() => groupPrograms(rules), [rules]);

  useEffect(() => {
    if (!selectedProgramKey && programs[0]) setSelectedProgramKey(programs[0].key);
    if (selectedProgramKey && !programs.some((p) => p.key === selectedProgramKey)) {
      setSelectedProgramKey(programs[0]?.key ?? null);
    }
  }, [programs, selectedProgramKey]);

  useEffect(() => {
    if (!selectedCodeId && codes[0]) setSelectedCodeId(codes[0].id);
    if (selectedCodeId && !codes.some((c) => c.id === selectedCodeId)) {
      setSelectedCodeId(codes[0]?.id ?? null);
    }
  }, [codes, selectedCodeId]);

  const selectedProgram = programs.find((p) => p.key === selectedProgramKey) ?? null;
  const selectedCode = codes.find((c) => c.id === selectedCodeId) ?? null;
  const gaps = selectedProgram ? findGaps(selectedProgram.tiers) : [];

  const updateProgramMeta = (key: string, patch: Partial<Pick<ProgramGroup, "name" | "effectiveFrom" | "effectiveTo" | "active">>) => {
    const prog = programs.find((p) => p.key === key);
    if (!prog) return;
    const ids = new Set(prog.tiers.map((t) => t.id));
    const nextName = patch.name !== undefined ? patch.name : prog.name;
    setRules((prev) =>
      prev.map((r) => {
        if (!ids.has(r.id)) return r;
        return {
          ...r,
          name: nextName,
          effectiveFrom: patch.effectiveFrom !== undefined ? patch.effectiveFrom || undefined : r.effectiveFrom,
          effectiveTo: patch.effectiveTo !== undefined ? patch.effectiveTo || undefined : r.effectiveTo,
          active: patch.active !== undefined ? patch.active : r.active,
        };
      }),
    );
    if (patch.name !== undefined) {
      const newKey = nextName.trim() ? `n:${nextName.trim().toLowerCase()}` : key;
      setSelectedProgramKey(newKey);
    }
  };

  const updateTier = (id: string, patch: Partial<FareDiscountRule>) => {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const addProgram = () => {
    const name = `Chương trình mới ${programs.length + 1}`;
    const tier = emptyTier(name, undefined, undefined, true);
    setRules((p) => [...p, tier]);
    setSelectedProgramKey(`n:${name.toLowerCase()}`);
    toast.message("Đã thêm chương trình — chỉnh bậc rồi Lưu");
  };

  const addTier = () => {
    if (!selectedProgram) return;
    const last = selectedProgram.tiers[selectedProgram.tiers.length - 1];
    const minFare = last ? last.minFare + 200_000 : 300_000;
    const tier = emptyTier(selectedProgram.name || "Chương trình", selectedProgram.effectiveFrom, selectedProgram.effectiveTo, selectedProgram.active);
    tier.minFare = minFare;
    tier.discountAmount = Math.max(10_000, Math.round(minFare * 0.1));
    setRules((p) => [...p, tier]);
  };

  const removeTier = (id: string) => {
    setRules((prev) => prev.filter((r) => r.id !== id));
  };

  const removeProgram = (key: string) => {
    const prog = programs.find((p) => p.key === key);
    if (!prog) return;
    const ids = new Set(prog.tiers.map((t) => t.id));
    setRules((prev) => prev.filter((r) => !ids.has(r.id)));
    if (selectedProgramKey === key) setSelectedProgramKey(null);
  };

  const saveRules = async () => {
    for (const r of rules) {
      if (!r.name.trim()) {
        toast.error("Nhập tên chương trình cho mọi bậc");
        return;
      }
      if (r.minFare <= 0 || r.discountAmount <= 0) {
        toast.error("Mức cước và số tiền giảm phải lớn hơn 0");
        return;
      }
      if (r.discountAmount > r.minFare) {
        toast.error("Số tiền giảm không được lớn hơn mức cước áp dụng");
        return;
      }
      if (r.effectiveFrom && r.effectiveTo && r.effectiveTo < r.effectiveFrom) {
        toast.error("Ngày kết thúc phải sau ngày bắt đầu");
        return;
      }
    }
    setSaving(true);
    try {
      if (isApiEnabled()) {
        const saved = await persistFareDiscountRules(rules, storedRules);
        useStore.setState({ fareDiscountRules: saved });
        setRules(saved);
      } else {
        setFareDiscountRules(rules);
      }
      toast.success("Đã lưu chương trình giảm giá");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không lưu được");
    } finally {
      setSaving(false);
    }
  };

  const updateCode = (id: string, patch: Partial<FareDiscountCode>) => {
    setCodes((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const addCode = () => {
    const row = emptyCode();
    row.name = `Mã mới ${codes.length + 1}`;
    setCodes((p) => [...p, row]);
    setSelectedCodeId(row.id);
  };

  const saveCodes = async () => {
    const seen = new Set<string>();
    for (const r of codes) {
      const code = normalizeDiscountCode(r.code);
      if (!code) {
        toast.error("Nhập mã cho mọi dòng");
        return;
      }
      if (seen.has(code)) {
        toast.error(`Trùng mã ${code}`);
        return;
      }
      seen.add(code);
      if (!r.name.trim()) {
        toast.error("Nhập tên cho mọi mã");
        return;
      }
      if (r.discountAmount <= 0) {
        toast.error("Số tiền giảm phải lớn hơn 0");
        return;
      }
      const min = Math.round(Number(r.minFare) || 0);
      if (min > 0 && r.discountAmount > min) {
        toast.error("Số tiền giảm không được lớn hơn mức cước tối thiểu");
        return;
      }
      if (r.effectiveFrom && r.effectiveTo && r.effectiveTo < r.effectiveFrom) {
        toast.error("Ngày kết thúc phải sau ngày bắt đầu");
        return;
      }
    }
    const normalized = codes.map((c) => ({ ...c, code: normalizeDiscountCode(c.code) }));
    setSaving(true);
    try {
      if (isApiEnabled()) {
        const saved = await persistFareDiscountCodes(normalized, storedCodes);
        useStore.setState({ fareDiscountCodes: saved });
        setCodes(saved);
      } else {
        setFareDiscountCodes(normalized);
      }
      toast.success("Đã lưu mã giảm giá");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không lưu được");
    } finally {
      setSaving(false);
    }
  };

  const updateAha = (id: string, patch: Partial<AhamovePromoCode>) => {
    setAhaRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const saveAha = async () => {
    const seen = new Set<string>();
    for (const r of ahaRows) {
      const code = normalizeDiscountCode(r.code);
      if (!code) {
        toast.error("Nhập mã voucher Ahamove cho mọi dòng");
        return;
      }
      if (seen.has(code)) {
        toast.error(`Trùng mã ${code}`);
        return;
      }
      seen.add(code);
      if (!r.name.trim()) {
        toast.error("Nhập tên cho mọi voucher");
        return;
      }
      if (r.effectiveFrom && r.effectiveTo && r.effectiveTo < r.effectiveFrom) {
        toast.error("Ngày kết thúc phải sau ngày bắt đầu");
        return;
      }
    }
    if (!isApiEnabled()) {
      toast.error("Cần kết nối máy chủ để lưu voucher Ahamove");
      return;
    }
    const normalized = ahaRows.map((c) => ({ ...c, code: normalizeDiscountCode(c.code) }));
    setSaving(true);
    try {
      const saved = await persistAhamovePromoCodes(normalized, ahaSaved);
      setAhaRows(saved);
      setAhaSaved(saved);
      toast.success("Đã lưu voucher Ahamove");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không lưu được");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {!writable && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
          Tài khoản chỉ được xem (vai trò: <strong>{session?.role ?? "?"}</strong>). Cần quyền ghi Khuyến mãi / quản trị.
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 rounded-full bg-muted/60 p-1">
          {(
            [
              ["program", "Chương trình giảm giá", programs.length],
              ["code", "Mã giảm giá", codes.length],
              ["aha", "Voucher Aha", ahaRows.length],
            ] as const
          ).map(([id, label, count]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                tab === id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
              <span
                className={cn(
                  "rounded-full px-1.5 text-xs tabular-nums",
                  tab === id ? "bg-primary-foreground/20" : "bg-background/80",
                )}
              >
                {count}
              </span>
            </button>
          ))}
        </div>
        {tab === "program" && writable ? (
          <Button type="button" onClick={addProgram}>
            <Plus className="mr-1 h-4 w-4" /> Thêm chương trình
          </Button>
        ) : null}
        {tab === "code" && writable ? (
          <Button type="button" onClick={addCode}>
            <Plus className="mr-1 h-4 w-4" /> Thêm mã
          </Button>
        ) : null}
        {tab === "aha" && writable ? (
          <Button type="button" onClick={() => setAhaRows((p) => [...p, emptyAha()])}>
            <Plus className="mr-1 h-4 w-4" /> Thêm voucher
          </Button>
        ) : null}
      </div>

      <p className="text-sm text-muted-foreground">
        {tab === "program"
          ? "Giảm tự động theo tổng cước. Nhiều chương trình cùng bật → chọn mức giảm tiền lớn nhất. Hiện chỉ hỗ trợ giảm số tiền cố định."
          : tab === "code"
            ? "Khách/NV nhập mã lúc tạo đơn. Có cả bậc cước và mã → lấy mức giảm lớn hơn."
            : "Voucher Ahamove: ước tính và book tự chọn mã giảm phí đối tác nhiều nhất."}
      </p>

      {tab === "program" ? (
        <>
          <Section title="Danh sách chương trình">
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[880px] text-sm">
                <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2.5 font-medium">Tên chương trình</th>
                    <th className="px-3 py-2.5 font-medium">Thời gian</th>
                    <th className="px-3 py-2.5 font-medium">Áp dụng cho</th>
                    <th className="px-3 py-2.5 font-medium">Bậc giảm</th>
                    <th className="px-3 py-2.5 font-medium">Trạng thái</th>
                    <th className="px-3 py-2.5 font-medium">Bật/tắt</th>
                  </tr>
                </thead>
                <tbody>
                  {programs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">
                        Chưa có chương trình. Bấm Thêm chương trình để tạo bậc giảm theo cước.
                      </td>
                    </tr>
                  ) : (
                    programs.map((p) => {
                      const st = programStatus(p);
                      const selected = p.key === selectedProgramKey;
                      return (
                        <tr
                          key={p.key}
                          className={cn("border-t cursor-pointer", selected ? "bg-primary/5" : "hover:bg-muted/30")}
                          onClick={() => setSelectedProgramKey(p.key)}
                        >
                          <td className="px-3 py-3 font-medium">{p.name || "—"}</td>
                          <td className="px-3 py-3 text-muted-foreground">{formatDateRange(p.effectiveFrom, p.effectiveTo)}</td>
                          <td className="px-3 py-3 text-muted-foreground">Đơn CPN</td>
                          <td className="px-3 py-3">
                            {p.tiers.length} bậc ({tierSummary(p.tiers)})
                          </td>
                          <td className="px-3 py-3">
                            <Badge className={st.className}>{st.label}</Badge>
                          </td>
                          <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                            <Switch
                              disabled={!writable}
                              checked={p.active}
                              onCheckedChange={(active) => updateProgramMeta(p.key, { active })}
                            />
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Section>

          {selectedProgram ? (
            <Section title={`Chi tiết: ${selectedProgram.name || "Chương trình mới"}`}>
              <div className="grid gap-6 lg:grid-cols-[minmax(240px,320px)_1fr]">
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>Tên chương trình</Label>
                    <Input
                      disabled={!writable}
                      value={selectedProgram.name}
                      placeholder="VD: Khuyến mại cước phí vận chuyển"
                      onChange={(e) => updateProgramMeta(selectedProgram.key, { name: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <Label>Hiệu lực từ</Label>
                      <Input
                        type="date"
                        disabled={!writable}
                        value={selectedProgram.effectiveFrom ?? ""}
                        onChange={(e) => updateProgramMeta(selectedProgram.key, { effectiveFrom: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Đến ngày</Label>
                      <Input
                        type="date"
                        disabled={!writable}
                        value={selectedProgram.effectiveTo ?? ""}
                        onChange={(e) => updateProgramMeta(selectedProgram.key, { effectiveTo: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-2 rounded-lg border bg-muted/20 p-3 text-sm">
                    <div className="font-medium">Áp dụng cho đơn</div>
                    <label className="flex items-center gap-2 text-muted-foreground">
                      <input type="checkbox" checked readOnly className="accent-primary" /> Đơn CPN
                    </label>
                    <label className="flex items-center gap-2 text-muted-foreground/70">
                      <input type="checkbox" disabled className="accent-primary" /> Đơn giao qua đối tác (sắp có)
                    </label>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Văn phòng áp dụng</Label>
                    <Input disabled value="Tất cả văn phòng" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Tính trên</Label>
                    <Input disabled value="Tổng cước hàng" />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium">Bậc giảm giá</div>
                    {writable ? (
                      <Button type="button" size="sm" variant="outline" onClick={addTier}>
                        <Plus className="mr-1 h-4 w-4" /> Thêm bậc
                      </Button>
                    ) : null}
                  </div>
                  <div className="overflow-x-auto rounded-xl border">
                    <table className="w-full min-w-[640px] text-sm">
                      <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                        <tr>
                          <th className="px-2 py-2 font-medium">Bậc</th>
                          <th className="px-2 py-2 font-medium">Tổng cước từ</th>
                          <th className="px-2 py-2 font-medium">Đến</th>
                          <th className="px-2 py-2 font-medium">Giảm theo</th>
                          <th className="px-2 py-2 font-medium">Mức giảm</th>
                          <th className="px-2 py-2 font-medium" />
                        </tr>
                      </thead>
                      <tbody>
                        {selectedProgram.tiers.map((t, i) => (
                          <tr key={t.id} className="border-t">
                            <td className="px-2 py-2 tabular-nums text-muted-foreground">{i + 1}</td>
                            <td className="px-2 py-2">
                              <MoneyInput
                                disabled={!writable}
                                value={t.minFare}
                                onChange={(minFare) => updateTier(t.id, { minFare })}
                                className="w-32"
                              />
                            </td>
                            <td className="px-2 py-2 text-xs text-muted-foreground whitespace-nowrap">
                              {bandToLabel(t, selectedProgram.tiers)}
                            </td>
                            <td className="px-2 py-2">
                              <div className="inline-flex rounded-full border bg-muted/40 p-0.5 text-xs">
                                <span className="rounded-full px-2 py-0.5 text-muted-foreground">%</span>
                                <span className="rounded-full bg-background px-2 py-0.5 font-medium shadow-sm">Số tiền</span>
                              </div>
                            </td>
                            <td className="px-2 py-2">
                              <MoneyInput
                                disabled={!writable}
                                value={t.discountAmount}
                                onChange={(discountAmount) => updateTier(t.id, { discountAmount })}
                                className="w-32"
                              />
                            </td>
                            <td className="px-2 py-2">
                              {writable ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  aria-label="Xóa bậc"
                                  onClick={() => removeTier(t.id)}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              ) : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {gaps.map((g) => (
                    <div
                      key={g}
                      className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-100"
                    >
                      {g}
                    </div>
                  ))}
                  <div className="flex flex-wrap justify-end gap-2 pt-1">
                    {writable ? (
                      <>
                        <Button type="button" variant="outline" onClick={() => removeProgram(selectedProgram.key)}>
                          Xóa chương trình
                        </Button>
                        <Button type="button" disabled={saving} onClick={() => void saveRules()}>
                          {saving ? "Đang lưu…" : "Lưu chương trình"}
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
            </Section>
          ) : null}
        </>
      ) : null}

      {tab === "code" ? (
        <>
          <Section title="Danh sách mã">
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[800px] text-sm">
                <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2.5 font-medium">Mã</th>
                    <th className="px-3 py-2.5 font-medium">Tên</th>
                    <th className="px-3 py-2.5 font-medium">Giảm</th>
                    <th className="px-3 py-2.5 font-medium">Cước tối thiểu</th>
                    <th className="px-3 py-2.5 font-medium">Thời gian</th>
                    <th className="px-3 py-2.5 font-medium">Trạng thái</th>
                    <th className="px-3 py-2.5 font-medium">Bật/tắt</th>
                  </tr>
                </thead>
                <tbody>
                  {codes.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">
                        Chưa có mã. Ví dụ: XE50K giảm 50.000đ.
                      </td>
                    </tr>
                  ) : (
                    codes.map((c) => {
                      const st = codeStatus(c);
                      const selected = c.id === selectedCodeId;
                      return (
                        <tr
                          key={c.id}
                          className={cn("border-t cursor-pointer", selected ? "bg-primary/5" : "hover:bg-muted/30")}
                          onClick={() => setSelectedCodeId(c.id)}
                        >
                          <td className="px-3 py-3 font-mono font-medium">{c.code || "—"}</td>
                          <td className="px-3 py-3">{c.name || "—"}</td>
                          <td className="px-3 py-3">{formatVND(c.discountAmount)}</td>
                          <td className="px-3 py-3 text-muted-foreground">
                            {c.minFare && c.minFare > 0 ? formatVND(c.minFare) : "Không"}
                          </td>
                          <td className="px-3 py-3 text-muted-foreground">{formatDateRange(c.effectiveFrom, c.effectiveTo)}</td>
                          <td className="px-3 py-3">
                            <Badge className={st.className}>{st.label}</Badge>
                          </td>
                          <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                            <Switch
                              disabled={!writable}
                              checked={c.active}
                              onCheckedChange={(active) => updateCode(c.id, { active })}
                            />
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Section>

          {selectedCode ? (
            <Section title={`Chi tiết mã: ${selectedCode.code || "mới"}`}>
              <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Mã</Label>
                  <Input
                    disabled={!writable}
                    value={selectedCode.code}
                    placeholder="XE50K"
                    className="font-mono uppercase"
                    onChange={(e) => updateCode(selectedCode.id, { code: e.target.value.toUpperCase() })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Tên</Label>
                  <Input
                    disabled={!writable}
                    value={selectedCode.name}
                    placeholder="KM tháng 11"
                    onChange={(e) => updateCode(selectedCode.id, { name: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Giảm (số tiền)</Label>
                  <MoneyInput
                    disabled={!writable}
                    value={selectedCode.discountAmount}
                    onChange={(discountAmount) => updateCode(selectedCode.id, { discountAmount })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Cước tối thiểu</Label>
                  <MoneyInput
                    disabled={!writable}
                    value={selectedCode.minFare ?? 0}
                    onChange={(minFare) => updateCode(selectedCode.id, { minFare })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Hiệu lực từ</Label>
                  <Input
                    type="date"
                    disabled={!writable}
                    value={selectedCode.effectiveFrom ?? ""}
                    onChange={(e) => updateCode(selectedCode.id, { effectiveFrom: e.target.value || undefined })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Đến ngày</Label>
                  <Input
                    type="date"
                    disabled={!writable}
                    value={selectedCode.effectiveTo ?? ""}
                    onChange={(e) => updateCode(selectedCode.id, { effectiveTo: e.target.value || undefined })}
                  />
                </div>
              </div>
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                {writable ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setCodes((prev) => prev.filter((x) => x.id !== selectedCode.id));
                        setSelectedCodeId(null);
                      }}
                    >
                      Xóa mã
                    </Button>
                    <Button type="button" disabled={saving} onClick={() => void saveCodes()}>
                      {saving ? "Đang lưu…" : "Lưu mã giảm giá"}
                    </Button>
                  </>
                ) : null}
              </div>
            </Section>
          ) : null}
        </>
      ) : null}

      {tab === "aha" ? (
        <Section title="Voucher Ahamove">
          <p className="mb-3 text-sm text-muted-foreground">
            Ước tính và book tự chọn mã giảm phí đối tác nhiều nhất. Mã hết hạn / Aha từ chối → bỏ qua.
          </p>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Mã voucher</th>
                  <th className="px-3 py-2 font-medium">Tên</th>
                  <th className="px-3 py-2 font-medium">Từ ngày</th>
                  <th className="px-3 py-2 font-medium">Đến ngày</th>
                  <th className="px-3 py-2 font-medium">Bật</th>
                  <th className="px-3 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {ahaRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                      Chưa có voucher. Staging Aha: AHAKM, AHAKM20.
                    </td>
                  </tr>
                ) : (
                  ahaRows.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="px-3 py-2">
                        <Input
                          disabled={!writable}
                          value={r.code}
                          placeholder="AHAKM"
                          className="w-36 font-mono uppercase"
                          onChange={(e) => updateAha(r.id, { code: e.target.value.toUpperCase() })}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          disabled={!writable}
                          value={r.name}
                          placeholder="KM Aha"
                          onChange={(e) => updateAha(r.id, { name: e.target.value })}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="date"
                          disabled={!writable}
                          value={r.effectiveFrom ?? ""}
                          onChange={(e) => updateAha(r.id, { effectiveFrom: e.target.value || undefined })}
                          className="w-36"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="date"
                          disabled={!writable}
                          value={r.effectiveTo ?? ""}
                          onChange={(e) => updateAha(r.id, { effectiveTo: e.target.value || undefined })}
                          className="w-36"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Switch
                          disabled={!writable}
                          checked={r.active}
                          onCheckedChange={(active) => updateAha(r.id, { active })}
                        />
                      </td>
                      <td className="px-3 py-2">
                        {writable ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label="Xóa"
                            onClick={() => setAhaRows((prev) => prev.filter((x) => x.id !== r.id))}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {writable ? (
            <div className="mt-3">
              <Button type="button" disabled={saving} onClick={() => void saveAha()}>
                {saving ? "Đang lưu…" : "Lưu voucher Aha"}
              </Button>
            </div>
          ) : null}
        </Section>
      ) : null}
    </div>
  );
}
