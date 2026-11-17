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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useStore, type FareDiscountCode, type FareDiscountKind, type FareDiscountRule } from "@/lib/store";
import { formatVND } from "@/lib/mock-data";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
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
  applyCpn: boolean;
  applyPartner: boolean;
  tiers: FareDiscountRule[];
};

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
        applyCpn: r.applyCpn !== false,
        applyPartner: r.applyPartner === true,
        tiers: [r],
      });
    } else {
      g.tiers.push(r);
      g.active = g.active || r.active;
      g.applyCpn = g.applyCpn || r.applyCpn !== false;
      g.applyPartner = g.applyPartner || r.applyPartner === true;
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
  if (p.effectiveTo && day > p.effectiveTo) {
    return { label: "Đã kết thúc", className: "bg-muted text-muted-foreground border-transparent" };
  }
  if (!p.active) {
    return { label: "Tạm dừng", className: "bg-amber-100 text-amber-900 border-transparent dark:bg-amber-950 dark:text-amber-100" };
  }
  if (p.effectiveFrom && day < p.effectiveFrom) {
    return { label: "Sắp áp dụng", className: "bg-sky-100 text-sky-800 border-transparent dark:bg-sky-950 dark:text-sky-200" };
  }
  return { label: "Đang áp dụng", className: "bg-emerald-100 text-emerald-800 border-transparent dark:bg-emerald-950 dark:text-emerald-200" };
}

function formatDateRange(from?: string, to?: string) {
  const f = from ? from.split("-").reverse().join("/") : "…";
  const t = to ? to.split("-").reverse().join("/") : "…";
  return `${f} – ${t}`;
}

function formatDateVi(iso?: string) {
  if (!iso) return "—";
  return iso.split("-").reverse().join("/");
}

function tierSummary(tiers: FareDiscountRule[]) {
  if (!tiers.length) return "—";
  return tiers
    .map((t) =>
      t.discountType === "PERCENT"
        ? `${Math.round(t.discountAmount)}%`
        : `${Math.round(t.discountAmount).toLocaleString("vi-VN")}đ`,
    )
    .join(" → ");
}

function applyScopeLabel(p: ProgramGroup) {
  if (p.applyCpn && p.applyPartner) return "Đơn CPN + đối tác";
  if (p.applyPartner) return "Đơn đối tác";
  return "Đơn CPN";
}

function findIssues(ordered: FareDiscountRule[]): { hard: string[]; soft: string[] } {
  const hard: string[] = [];
  const soft: string[] = [];
  for (let i = 0; i < ordered.length; i++) {
    const a = ordered[i];
    const from = a.minFare;
    const to = a.maxFare && a.maxFare > 0 ? a.maxFare : null;
    if (to != null && to < from) hard.push(`Bậc ${i + 1}: mức "đến" nhỏ hơn mức "từ".`);
    if (a.discountType === "PERCENT" && a.discountAmount > 100) hard.push(`Bậc ${i + 1}: mức giảm không quá 100%.`);
    const b = ordered[i + 1];
    if (!b) continue;
    const nextFrom = b.minFare;
    const end = to ?? Number.POSITIVE_INFINITY;
    if (nextFrom <= end) hard.push(`Bậc ${i + 1} và bậc ${i + 2} bị chồng nhau.`);
    else if (to != null && nextFrom > to + 1) {
      soft.push(
        `Tổng cước từ ${formatVND(to + 1)} đến ${formatVND(nextFrom - 1)} chưa thuộc bậc nào, đơn trong khoảng này không được giảm.`,
      );
    }
  }
  return { hard, soft };
}

function emptyTier(
  name: string,
  from: string | undefined,
  to: string | undefined,
  active: boolean,
  applyCpn = true,
  applyPartner = false,
): FareDiscountRule {
  return {
    id: newId(),
    name,
    minFare: 300_000,
    maxFare: undefined,
    discountAmount: 10,
    discountType: "PERCENT",
    maxDiscount: undefined,
    effectiveFrom: from,
    effectiveTo: to,
    active,
    applyCpn,
    applyPartner,
  };
}

function emptyCode(by?: string): FareDiscountCode {
  return {
    id: newId(),
    code: "",
    name: "",
    discountAmount: 0,
    discountType: "PERCENT",
    maxDiscount: undefined,
    active: true,
    createdBy: by,
    createdAt: vnCalendarDate(),
  };
}

function emptyAha(): AhamovePromoCode {
  return { id: newId(), code: "", name: "", active: true };
}

function TypeSeg({
  value,
  onChange,
  disabled,
  pctLabel = "%",
  amtLabel = "Số tiền",
}: {
  value: FareDiscountKind;
  onChange: (v: FareDiscountKind) => void;
  disabled?: boolean;
  pctLabel?: string;
  amtLabel?: string;
}) {
  return (
    <div className="inline-flex rounded-full border bg-muted/50 p-0.5 text-xs">
      <button
        type="button"
        disabled={disabled}
        className={cn(
          "rounded-full px-2.5 py-1 font-medium transition-colors",
          value === "PERCENT" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
        )}
        onClick={() => onChange("PERCENT")}
      >
        {pctLabel}
      </button>
      <button
        type="button"
        disabled={disabled}
        className={cn(
          "rounded-full px-2.5 py-1 font-medium transition-colors",
          value === "FIXED" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
        )}
        onClick={() => onChange("FIXED")}
      >
        {amtLabel}
      </button>
    </div>
  );
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
  const [codeDlg, setCodeDlg] = useState<{ row: FareDiscountCode; tried: boolean } | null>(null);

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

  const selectedProgram = programs.find((p) => p.key === selectedProgramKey) ?? null;
  const issues = selectedProgram ? findIssues(selectedProgram.tiers) : { hard: [], soft: [] };
  const hardBlock = issues.hard.length > 0 || (selectedProgram != null && !selectedProgram.name.trim()) || (selectedProgram != null && !selectedProgram.effectiveFrom);

  const updateProgramMeta = (
    key: string,
    patch: Partial<Pick<ProgramGroup, "name" | "effectiveFrom" | "effectiveTo" | "active" | "applyCpn" | "applyPartner">>,
  ) => {
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
          applyCpn: patch.applyCpn !== undefined ? patch.applyCpn : r.applyCpn,
          applyPartner: patch.applyPartner !== undefined ? patch.applyPartner : r.applyPartner,
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
    const name = "";
    const today = vnCalendarDate();
    const tier = emptyTier(name, today, undefined, true);
    setRules((p) => [...p, tier]);
    setSelectedProgramKey(`id:${tier.id}`);
    toast.message("Đã mở chương trình mới — điền rồi Lưu");
  };

  const addTier = () => {
    if (!selectedProgram) return;
    const last = selectedProgram.tiers[selectedProgram.tiers.length - 1];
    const minFare = last?.maxFare && last.maxFare > 0 ? last.maxFare + 1 : last ? last.minFare + 200_000 : 300_000;
    const tier = emptyTier(
      selectedProgram.name || "Chương trình",
      selectedProgram.effectiveFrom,
      selectedProgram.effectiveTo,
      selectedProgram.active,
      selectedProgram.applyCpn,
      selectedProgram.applyPartner,
    );
    tier.minFare = minFare;
    tier.discountType = last?.discountType ?? "PERCENT";
    tier.discountAmount = last?.discountType === "FIXED" ? Math.max(10_000, Math.round(minFare * 0.1)) : 10;
    setRules((p) => [...p, tier]);
  };

  const removeTier = (id: string) => {
    if (!selectedProgram || selectedProgram.tiers.length <= 1) {
      toast.error("Luôn phải còn ít nhất 1 bậc");
      return;
    }
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
    if (!selectedProgram) return;
    if (!selectedProgram.name.trim()) {
      toast.error("Nhập tên chương trình");
      return;
    }
    if (!selectedProgram.effectiveFrom) {
      toast.error("Nhập ngày hiệu lực từ");
      return;
    }
    if (!selectedProgram.applyCpn && !selectedProgram.applyPartner) {
      toast.error("Chọn ít nhất một loại đơn áp dụng");
      return;
    }
    if (issues.hard.length) {
      toast.error(issues.hard[0]);
      return;
    }
    for (const r of selectedProgram.tiers) {
      if (r.minFare <= 0 || r.discountAmount <= 0) {
        toast.error("Mức cước từ và mức giảm phải lớn hơn 0");
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

  const openNewCode = () => {
    setCodeDlg({ row: emptyCode(session?.username), tried: false });
  };

  const openEditCode = (c: FareDiscountCode) => {
    setCodeDlg({ row: { ...c }, tried: false });
  };

  const saveCodeDlg = async () => {
    if (!codeDlg) return;
    const row = { ...codeDlg.row, code: normalizeDiscountCode(codeDlg.row.code) };
    setCodeDlg({ row, tried: true });
    if (!row.code) {
      toast.error("Nhập tên mã");
      return;
    }
    if (row.code.length < 3) {
      toast.error("Tối thiểu 3 ký tự");
      return;
    }
    if (codes.some((c) => normalizeDiscountCode(c.code) === row.code && c.id !== row.id)) {
      toast.error("Mã này đã tồn tại");
      return;
    }
    if (!row.discountAmount || row.discountAmount <= 0) {
      toast.error("Nhập mức giảm");
      return;
    }
    if (row.discountType === "PERCENT" && row.discountAmount > 100) {
      toast.error("Không quá 100%");
      return;
    }
    row.name = row.name.trim() || row.code;
    const next = codes.some((c) => c.id === row.id) ? codes.map((c) => (c.id === row.id ? row : c)) : [...codes, row];
    setSaving(true);
    try {
      if (isApiEnabled()) {
        const saved = await persistFareDiscountCodes(next, storedCodes);
        useStore.setState({ fareDiscountCodes: saved });
        setCodes(saved);
      } else {
        setFareDiscountCodes(next);
        setCodes(next);
      }
      setCodeDlg(null);
      toast.success(codes.some((c) => c.id === row.id) ? "Đã lưu mã" : "Đã tạo mã giảm giá");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không lưu được");
    } finally {
      setSaving(false);
    }
  };

  const deleteCode = async (id: string) => {
    if (!confirm("Xoá mã này?")) return;
    const next = codes.filter((c) => c.id !== id);
    setSaving(true);
    try {
      if (isApiEnabled()) {
        const saved = await persistFareDiscountCodes(next, storedCodes);
        useStore.setState({ fareDiscountCodes: saved });
        setCodes(saved);
      } else {
        setFareDiscountCodes(next);
        setCodes(next);
      }
      toast.success("Đã xoá mã");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không xoá được");
    } finally {
      setSaving(false);
    }
  };

  const toggleCode = async (id: string, active: boolean) => {
    const next = codes.map((c) => (c.id === id ? { ...c, active } : c));
    setCodes(next);
    try {
      if (isApiEnabled()) {
        const saved = await persistFareDiscountCodes(next, storedCodes);
        useStore.setState({ fareDiscountCodes: saved });
        setCodes(saved);
      } else {
        setFareDiscountCodes(next);
      }
    } catch (e) {
      setCodes(storedCodes);
      toast.error(e instanceof Error ? e.message : "Không lưu được");
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

  const cd = codeDlg?.row;
  const cdCode = cd ? normalizeDiscountCode(cd.code) : "";
  const cdDup = !!cd && codes.some((c) => normalizeDiscountCode(c.code) === cdCode && c.id !== cd.id);
  const cdNameMsg = !codeDlg?.tried
    ? ""
    : !cdCode
      ? "Nhập tên mã"
      : cdCode.length < 3
        ? "Tối thiểu 3 ký tự"
        : cdDup
          ? "Mã này đã tồn tại"
          : "";
  const cdValMsg = !codeDlg?.tried
    ? ""
    : !cd || !cd.discountAmount
      ? "Nhập mức giảm"
      : cd.discountType === "PERCENT" && cd.discountAmount > 100
        ? "Không quá 100%"
        : "";

  return (
    <div className="space-y-4">
      {!writable && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
          Tài khoản chỉ được xem (vai trò: <strong>{session?.role ?? "?"}</strong>). Cần quyền ghi Khuyến mãi / quản trị.
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cài đặt giảm giá</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Giảm trên tổng cước hàng của đơn theo bậc, theo % hoặc số tiền. Hệ thống tự áp khi tạo đơn.
          </p>
        </div>
        {tab === "program" && writable ? (
          <Button type="button" onClick={addProgram}>
            <Plus className="mr-1 h-4 w-4" /> Thêm chương trình
          </Button>
        ) : null}
        {tab === "code" && writable ? (
          <Button type="button" onClick={openNewCode}>
            <Plus className="mr-1 h-4 w-4" /> Tạo mã giảm giá
          </Button>
        ) : null}
        {tab === "aha" && writable ? (
          <Button type="button" onClick={() => setAhaRows((p) => [...p, emptyAha()])}>
            <Plus className="mr-1 h-4 w-4" /> Thêm voucher
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2 rounded-full bg-muted/60 p-1 self-start w-fit">
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
            <span className={cn("rounded-full px-1.5 text-xs tabular-nums", tab === id ? "bg-primary-foreground/20" : "bg-background/80")}>
              {count}
            </span>
          </button>
        ))}
      </div>

      {tab === "program" ? (
        <>
          <Section title="Chương trình giảm giá">
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[880px] table-fixed text-sm">
                <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="w-[26%] px-3 py-2.5 font-medium">Tên chương trình</th>
                    <th className="w-[16%] px-3 py-2.5 font-medium">Thời gian</th>
                    <th className="w-[14%] px-3 py-2.5 font-medium">Áp dụng cho</th>
                    <th className="w-[20%] px-3 py-2.5 font-medium">Bậc giảm</th>
                    <th className="w-[14%] px-3 py-2.5 font-medium">Trạng thái</th>
                    <th className="w-[10%] px-3 py-2.5 text-right font-medium">Bật/tắt</th>
                  </tr>
                </thead>
                <tbody>
                  {programs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">
                        Chưa có chương trình. Bấm Thêm chương trình để tạo.
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
                          <td className="px-3 py-3">
                            <button type="button" className="font-semibold text-primary hover:underline text-left">
                              {p.name || "Chương trình mới"}
                            </button>
                          </td>
                          <td className="px-3 py-3 tabular-nums text-muted-foreground">{formatDateRange(p.effectiveFrom, p.effectiveTo)}</td>
                          <td className="px-3 py-3 text-muted-foreground">{applyScopeLabel(p)}</td>
                          <td className="px-3 py-3 tabular-nums">{tierSummary(p.tiers)}</td>
                          <td className="px-3 py-3">
                            <Badge className={st.className}>{st.label}</Badge>
                          </td>
                          <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
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
            <Section
              title={selectedProgram.name.trim() ? `Chi tiết: ${selectedProgram.name}` : "Chương trình mới"}
              right={
                writable ? (
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setRules(storedRules);
                        toast.message("Đã huỷ thay đổi chưa lưu");
                      }}
                    >
                      Huỷ thay đổi
                    </Button>
                    <Button type="button" size="sm" disabled={saving || hardBlock} onClick={() => void saveRules()}>
                      {saving ? "Đang lưu…" : "Lưu chương trình"}
                    </Button>
                  </div>
                ) : null
              }
            >
              <div className="grid items-start gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>Tên chương trình *</Label>
                    <Input
                      disabled={!writable}
                      value={selectedProgram.name}
                      placeholder="Ví dụ: Khuyến mại cước phí vận chuyển"
                      onChange={(e) => updateProgramMeta(selectedProgram.key, { name: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Hiệu lực từ *</Label>
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
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Áp dụng cho đơn</div>
                    <label className="flex items-start gap-2.5 rounded-lg border bg-muted/20 px-3 py-2.5">
                      <input
                        type="checkbox"
                        className="mt-0.5 accent-primary"
                        disabled={!writable}
                        checked={selectedProgram.applyCpn}
                        onChange={(e) => updateProgramMeta(selectedProgram.key, { applyCpn: e.target.checked })}
                      />
                      <span>
                        <span className="block text-sm font-medium">Đơn CPN</span>
                        <span className="block text-xs text-muted-foreground">Đơn trong tuyến của X.E</span>
                      </span>
                    </label>
                    <label className="flex items-start gap-2.5 rounded-lg border bg-muted/20 px-3 py-2.5">
                      <input
                        type="checkbox"
                        className="mt-0.5 accent-primary"
                        disabled={!writable}
                        checked={selectedProgram.applyPartner}
                        onChange={(e) => updateProgramMeta(selectedProgram.key, { applyPartner: e.target.checked })}
                      />
                      <span>
                        <span className="block text-sm font-medium">Đơn giao qua đối tác</span>
                        <span className="block text-xs text-muted-foreground">Cước theo bảng giá đối tác</span>
                      </span>
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Văn phòng áp dụng</Label>
                      <Input disabled value="Tất cả VP" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Tính trên</Label>
                      <Input disabled value="Tổng cước hàng" />
                    </div>
                  </div>
                  <div className="rounded-lg border bg-muted/30 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
                    Mỗi đơn chỉ hưởng một bậc, theo tổng cước hàng (chưa gồm phụ phí COD, khai báo giá trị, lấy/giao tận
                    nơi). Không cộng dồn với chương trình khác: nếu nhiều chương trình cùng hợp lệ, hệ thống chọn mức
                    giảm cao nhất.
                  </div>
                  {writable ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => removeProgram(selectedProgram.key)}
                    >
                      Xóa chương trình
                    </Button>
                  ) : null}
                </div>

                <div className="space-y-3 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium">Bậc giảm giá</div>
                    {writable ? (
                      <Button type="button" size="sm" variant="secondary" onClick={addTier}>
                        <Plus className="mr-1 h-4 w-4" /> Thêm bậc
                      </Button>
                    ) : null}
                  </div>
                  <div className="overflow-x-auto rounded-xl border">
                    <table className="w-full min-w-[760px] table-fixed text-sm">
                      <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                        <tr>
                          <th className="w-12 px-2 py-2.5 text-center font-medium">Bậc</th>
                          <th className="w-[16%] px-2 py-2.5 text-right font-medium">Tổng cước từ</th>
                          <th className="w-[16%] px-2 py-2.5 text-right font-medium">Đến</th>
                          <th className="w-[18%] px-2 py-2.5 font-medium">Giảm theo</th>
                          <th className="w-[14%] px-2 py-2.5 text-right font-medium">Mức giảm</th>
                          <th className="w-[16%] px-2 py-2.5 text-right font-medium">Giảm tối đa</th>
                          <th className="w-10 px-1 py-2.5" />
                        </tr>
                      </thead>
                      <tbody>
                        {selectedProgram.tiers.map((t, i) => (
                          <tr key={t.id} className="border-t">
                            <td className="px-2 py-2.5 text-center">
                              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-medium tabular-nums">
                                {i + 1}
                              </span>
                            </td>
                            <td className="px-2 py-2.5">
                              <MoneyInput
                                disabled={!writable}
                                value={t.minFare}
                                onChange={(minFare) => updateTier(t.id, { minFare })}
                                className="max-w-[9rem] ml-auto"
                              />
                            </td>
                            <td className="px-2 py-2.5">
                              <MoneyInput
                                disabled={!writable}
                                value={t.maxFare ?? 0}
                                suffix="VNĐ"
                                placeholder="Không giới hạn"
                                onChange={(maxFare) => updateTier(t.id, { maxFare: maxFare > 0 ? maxFare : undefined })}
                                className="max-w-[9rem] ml-auto"
                              />
                            </td>
                            <td className="px-2 py-2.5">
                              <TypeSeg
                                disabled={!writable}
                                value={t.discountType === "PERCENT" ? "PERCENT" : "FIXED"}
                                onChange={(discountType) =>
                                  updateTier(t.id, {
                                    discountType,
                                    discountAmount: 0,
                                    maxDiscount: discountType === "FIXED" ? undefined : t.maxDiscount,
                                  })
                                }
                              />
                            </td>
                            <td className="px-2 py-2.5">
                              {t.discountType === "PERCENT" ? (
                                <div className="relative max-w-[7rem] ml-auto">
                                  <Input
                                    disabled={!writable}
                                    inputMode="numeric"
                                    className="h-9 pr-8 text-right tabular-nums"
                                    value={t.discountAmount || ""}
                                    onChange={(e) =>
                                      updateTier(t.id, { discountAmount: Math.max(0, Number(e.target.value.replace(/\D/g, "")) || 0) })
                                    }
                                  />
                                  <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                                    %
                                  </span>
                                </div>
                              ) : (
                                <MoneyInput
                                  disabled={!writable}
                                  value={t.discountAmount}
                                  onChange={(discountAmount) => updateTier(t.id, { discountAmount })}
                                  className="max-w-[9rem] ml-auto"
                                />
                              )}
                            </td>
                            <td className="px-2 py-2.5">
                              {t.discountType === "PERCENT" ? (
                                <MoneyInput
                                  disabled={!writable}
                                  value={t.maxDiscount ?? 0}
                                  onChange={(maxDiscount) =>
                                    updateTier(t.id, { maxDiscount: maxDiscount > 0 ? maxDiscount : undefined })
                                  }
                                  className="max-w-[9rem] ml-auto"
                                />
                              ) : (
                                <span className="block text-right text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-1 py-2.5 text-center">
                              {writable ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  aria-label="Xóa bậc"
                                  disabled={selectedProgram.tiers.length <= 1}
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
                  {[...issues.hard, ...issues.soft].map((g) => (
                    <div
                      key={g}
                      className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-100"
                    >
                      {g}
                    </div>
                  ))}
                </div>
              </div>
            </Section>
          ) : null}
        </>
      ) : null}

      {tab === "code" ? (
        <Section
          title="Mã giảm giá"
          right={<span className="text-sm text-muted-foreground">Điều phối nhập mã khi tạo đơn, mức giảm trừ vào cước hàng</span>}
        >
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2.5 font-medium">Tên mã</th>
                  <th className="px-3 py-2.5 font-medium">Mức giảm</th>
                  <th className="px-3 py-2.5 text-right font-medium">Giảm tối đa</th>
                  <th className="px-3 py-2.5 font-medium">Ngày tạo</th>
                  <th className="px-3 py-2.5 font-medium">Trạng thái</th>
                  <th className="px-3 py-2.5 text-right font-medium">Bật/tắt</th>
                  <th className="px-3 py-2.5 text-right font-medium">Tác vụ</th>
                </tr>
              </thead>
              <tbody>
                {codes.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">
                      Chưa có mã giảm giá
                    </td>
                  </tr>
                ) : (
                  codes.map((c) => (
                    <tr key={c.id} className="border-t">
                      <td className="px-3 py-3">
                        <span className="inline-flex rounded-md border border-dashed border-emerald-300 bg-emerald-50 px-2 py-0.5 font-mono text-sm font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
                          {c.code || "—"}
                        </span>
                      </td>
                      <td className="px-3 py-3 tabular-nums">
                        {c.discountType === "PERCENT"
                          ? `Giảm ${Math.round(c.discountAmount)}%`
                          : `Giảm ${formatVND(c.discountAmount)}`}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                        {c.discountType === "PERCENT" && c.maxDiscount ? formatVND(c.maxDiscount) : "—"}
                      </td>
                      <td className="px-3 py-3 tabular-nums">
                        <div>{formatDateVi(c.createdAt)}</div>
                        {c.createdBy ? <div className="text-xs text-muted-foreground">{c.createdBy}</div> : null}
                      </td>
                      <td className="px-3 py-3">
                        <Badge
                          className={
                            c.active
                              ? "bg-emerald-100 text-emerald-800 border-transparent"
                              : "bg-amber-100 text-amber-900 border-transparent"
                          }
                        >
                          {c.active ? "Đang dùng" : "Tạm dừng"}
                        </Badge>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <Switch disabled={!writable} checked={c.active} onCheckedChange={(on) => void toggleCode(c.id, on)} />
                      </td>
                      <td className="px-3 py-3 text-right">
                        {writable ? (
                          <div className="inline-flex gap-1">
                            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditCode(c)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => void deleteCode(c.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Section>
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
                {ahaRows.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-3 py-2">
                      <Input
                        disabled={!writable}
                        value={r.code}
                        className="w-36 font-mono uppercase"
                        onChange={(e) => updateAha(r.id, { code: e.target.value.toUpperCase() })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input disabled={!writable} value={r.name} onChange={(e) => updateAha(r.id, { name: e.target.value })} />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="date"
                        disabled={!writable}
                        value={r.effectiveFrom ?? ""}
                        onChange={(e) => updateAha(r.id, { effectiveFrom: e.target.value || undefined })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="date"
                        disabled={!writable}
                        value={r.effectiveTo ?? ""}
                        onChange={(e) => updateAha(r.id, { effectiveTo: e.target.value || undefined })}
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
                        <Button type="button" variant="ghost" size="icon" onClick={() => setAhaRows((p) => p.filter((x) => x.id !== r.id))}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {writable ? (
            <div className="mt-3 flex justify-end">
              <Button type="button" disabled={saving} onClick={() => void saveAha()}>
                {saving ? "Đang lưu…" : "Lưu voucher Aha"}
              </Button>
            </div>
          ) : null}
        </Section>
      ) : null}

      <Dialog open={!!codeDlg} onOpenChange={(o) => !o && setCodeDlg(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {cd && codes.some((c) => c.id === cd.id) ? `Sửa mã ${cd.code}` : "Tạo mã giảm giá"}
            </DialogTitle>
          </DialogHeader>
          {cd ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Tên mã *</Label>
                <Input
                  className="font-mono uppercase"
                  maxLength={20}
                  placeholder="Ví dụ: TET2027"
                  value={cd.code}
                  onChange={(e) =>
                    setCodeDlg({
                      ...codeDlg!,
                      row: { ...cd, code: normalizeDiscountCode(e.target.value) },
                    })
                  }
                />
                {cdNameMsg ? <p className="text-xs text-destructive">{cdNameMsg}</p> : null}
                <p className="text-xs text-muted-foreground">Chữ in hoa và số, không dấu, không khoảng trắng</p>
              </div>
              <div className="space-y-1.5">
                <Label>Giảm theo</Label>
                <TypeSeg
                  value={cd.discountType === "PERCENT" ? "PERCENT" : "FIXED"}
                  pctLabel="Phần trăm (%)"
                  amtLabel="Số tiền"
                  onChange={(discountType) =>
                    setCodeDlg({
                      ...codeDlg!,
                      row: { ...cd, discountType, discountAmount: 0, maxDiscount: undefined },
                    })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Mức giảm *</Label>
                  {cd.discountType === "PERCENT" ? (
                    <div className="relative">
                      <Input
                        inputMode="numeric"
                        className="pr-8 text-right tabular-nums"
                        placeholder="Ví dụ: 10"
                        value={cd.discountAmount || ""}
                        onChange={(e) =>
                          setCodeDlg({
                            ...codeDlg!,
                            row: { ...cd, discountAmount: Math.max(0, Number(e.target.value.replace(/\D/g, "")) || 0) },
                          })
                        }
                      />
                      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                    </div>
                  ) : (
                    <MoneyInput
                      value={cd.discountAmount}
                      onChange={(discountAmount) => setCodeDlg({ ...codeDlg!, row: { ...cd, discountAmount } })}
                    />
                  )}
                  {cdValMsg ? <p className="text-xs text-destructive">{cdValMsg}</p> : null}
                </div>
                {cd.discountType === "PERCENT" ? (
                  <div className="space-y-1.5">
                    <Label>Giảm tối đa</Label>
                    <MoneyInput
                      value={cd.maxDiscount ?? 0}
                      onChange={(maxDiscount) =>
                        setCodeDlg({
                          ...codeDlg!,
                          row: { ...cd, maxDiscount: maxDiscount > 0 ? maxDiscount : undefined },
                        })
                      }
                    />
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setCodeDlg(null)}>
              Huỷ
            </Button>
            <Button type="button" disabled={saving} onClick={() => void saveCodeDlg()}>
              {cd && codes.some((c) => c.id === cd.id) ? "Lưu" : "Tạo mã"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export const Route = createFileRoute("/khuyen-mai")({
  component: () => (
    <ProtectedPage screen="khuyen-mai" title="Cài đặt giảm giá">
      <Page />
    </ProtectedPage>
  ),
});
