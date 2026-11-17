import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ProtectedPage } from "@/components/AppShell";
import { Section } from "@/components/PageBits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { calcCodeDiscount, calcOrderDiscount, normalizeDiscountCode, vnCalendarDate } from "@/lib/pricing";

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

/** Sắp bậc theo cước từ — giống bảng giá sắp mức cân. */
function sortedRules(rows: FareDiscountRule[]) {
  return [...rows].sort((a, b) => a.minFare - b.minFare || a.discountAmount - b.discountAmount);
}

/**
 * Khoảng áp dụng thực tế: đơn ≥ mức này và (nếu có) dưới mức bậc cao hơn kế tiếp.
 * Nhiều bậc khớp → lấy bậc có «Cước từ» cao nhất.
 */
function bandLabel(rule: FareDiscountRule, ordered: FareDiscountRule[]) {
  const next = ordered.find((x) => x.minFare > rule.minFare);
  if (!next) return `Từ ${formatVND(rule.minFare)} trở lên`;
  return `Từ ${formatVND(rule.minFare)} đến dưới ${formatVND(next.minFare)}`;
}

function pickMatchingTier(rows: FareDiscountRule[], gross: number, day = vnCalendarDate()) {
  let best: FareDiscountRule | null = null;
  for (const r of rows) {
    if (!r.active) continue;
    if (r.effectiveFrom && day < r.effectiveFrom) continue;
    if (r.effectiveTo && day > r.effectiveTo) continue;
    if (r.minFare <= 0 || r.discountAmount <= 0 || gross < r.minFare) continue;
    if (!best || r.minFare > best.minFare || (r.minFare === best.minFare && r.discountAmount > best.discountAmount)) {
      best = r;
    }
  }
  return best;
}

export const Route = createFileRoute("/khuyen-mai")({
  head: () => ({
    meta: [
      { title: "Khuyến mãi — X.E" },
      { name: "description", content: "Giảm giá đơn hàng và voucher Ahamove." },
    ],
  }),
  component: () => (
    <ProtectedPage title="Khuyến mãi" screen="khuyen-mai">
      <Page />
    </ProtectedPage>
  ),
});

const newId = () => `fd-${Math.random().toString(36).slice(2, 9)}`;

function emptyRule(): FareDiscountRule {
  return {
    id: newId(),
    name: "",
    minFare: 500_000,
    discountAmount: 50_000,
    active: true,
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
  const [tab, setTab] = useState<"tier" | "code" | "aha">("tier");
  const storedRules = useStore((s) => s.fareDiscountRules);
  const storedCodes = useStore((s) => s.fareDiscountCodes);
  const setFareDiscountRules = useStore((s) => s.setFareDiscountRules);
  const setFareDiscountCodes = useStore((s) => s.setFareDiscountCodes);
  const [rules, setRules] = useState<FareDiscountRule[]>(storedRules);
  const [codes, setCodes] = useState<FareDiscountCode[]>(storedCodes);
  const [ahaRows, setAhaRows] = useState<AhamovePromoCode[]>([]);
  const [ahaSaved, setAhaSaved] = useState<AhamovePromoCode[]>([]);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(520_000);
  const [previewCode, setPreviewCode] = useState("");

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

  const updateRule = (id: string, patch: Partial<FareDiscountRule>) => {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };
  const updateCode = (id: string, patch: Partial<FareDiscountCode>) => {
    setCodes((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };
  const updateAha = (id: string, patch: Partial<AhamovePromoCode>) => {
    setAhaRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
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
      toast.success("Đã lưu bậc khuyến mãi");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không lưu được");
    } finally {
      setSaving(false);
    }
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
        toast.error("Nhập tên chương trình cho mọi mã");
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

  const orderedRules = sortedRules(rules);
  const previewMatched = (() => {
    const prevR = useStore.getState().fareDiscountRules;
    const prevC = useStore.getState().fareDiscountCodes;
    useStore.setState({ fareDiscountRules: rules, fareDiscountCodes: codes });
    const off = calcOrderDiscount(preview, previewCode);
    const codeOff = calcCodeDiscount(preview, previewCode);
    useStore.setState({ fareDiscountRules: prevR, fareDiscountCodes: prevC });
    const tier = pickMatchingTier(rules, preview);
    return { off, codeOff, tier };
  })();

  return (
    <div className="space-y-4">
      {!writable && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
          Tài khoản chỉ được xem (vai trò hiện tại: <strong>{session?.role ?? "?"}</strong>). Cần quyền ghi{" "}
          <strong>Khuyến mãi</strong> hoặc màn quản trị (Tài khoản / Nhóm quyền). Vào <strong>Nhóm quyền</strong> cấp Ghi
          cho màn Khuyến mãi rồi đăng nhập lại.
        </div>
      )}
      <div className="flex gap-2 border-b pb-2">
        <Button type="button" variant={tab === "tier" ? "default" : "ghost"} size="sm" onClick={() => setTab("tier")}>
          Theo cước đơn
        </Button>
        <Button type="button" variant={tab === "code" ? "default" : "ghost"} size="sm" onClick={() => setTab("code")}>
          Mã giảm giá
        </Button>
        <Button type="button" variant={tab === "aha" ? "default" : "ghost"} size="sm" onClick={() => setTab("aha")}>
          Voucher Aha
        </Button>
      </div>

      {tab === "tier" ? (
        <Section title="Giảm giá theo cước đơn">
          <p className="mb-3 text-sm text-muted-foreground">
            Giống bảng giá theo khoảng: mỗi bậc là một <strong>mốc cước tối thiểu</strong>. Đơn đạt mốc nào thì được
            giảm số tiền của mốc đó; nếu đạt nhiều mốc → lấy mốc <strong>cao nhất</strong>. Ví dụ 300K→20K và
            500K→50K: đơn 400K giảm 20K, đơn 600K giảm 50K. Tự áp lúc tạo đơn (không cần nhập mã).
          </p>
          {orderedRules.length > 0 && (
            <div className="mb-3 overflow-x-auto rounded-xl border bg-muted/20">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Khoảng cước áp dụng</th>
                    <th className="px-3 py-2 font-medium">Giảm</th>
                    <th className="px-3 py-2 font-medium">Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {orderedRules[0] && orderedRules[0].minFare > 0 && (
                    <tr className="border-t text-muted-foreground">
                      <td className="px-3 py-2">Dưới {formatVND(orderedRules[0].minFare)}</td>
                      <td className="px-3 py-2">Không giảm (theo bậc)</td>
                      <td className="px-3 py-2">—</td>
                    </tr>
                  )}
                  {orderedRules.map((r) => (
                    <tr key={`band-${r.id}`} className="border-t">
                      <td className="px-3 py-2 font-medium">{bandLabel(r, orderedRules)}</td>
                      <td className="px-3 py-2">{formatVND(r.discountAmount)}</td>
                      <td className="px-3 py-2">{r.active ? "Đang bật" : "Tắt"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Tên</th>
                  <th className="px-3 py-2 font-medium">Cước từ (≥)</th>
                  <th className="px-3 py-2 font-medium">Khoảng áp dụng</th>
                  <th className="px-3 py-2 font-medium">Giảm cố định</th>
                  <th className="px-3 py-2 font-medium">Từ ngày</th>
                  <th className="px-3 py-2 font-medium">Đến ngày</th>
                  <th className="px-3 py-2 font-medium">Bật</th>
                  <th className="px-3 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {rules.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                      Chưa có bậc. Thêm ví dụ: cước từ 500.000đ giảm 50.000đ — rồi thêm bậc 1.000.000đ giảm 120.000đ.
                    </td>
                  </tr>
                )}
                {orderedRules.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-3 py-2">
                      <Input
                        disabled={!writable}
                        value={r.name}
                        placeholder="VD: KM cước ≥ 500K"
                        onChange={(e) => updateRule(r.id, { name: e.target.value })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <MoneyInput
                        disabled={!writable}
                        value={r.minFare}
                        onChange={(minFare) => updateRule(r.id, { minFare })}
                        className="w-36"
                      />
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                      {bandLabel(r, orderedRules)}
                    </td>
                    <td className="px-3 py-2">
                      <MoneyInput
                        disabled={!writable}
                        value={r.discountAmount}
                        onChange={(discountAmount) => updateRule(r.id, { discountAmount })}
                        className="w-36"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="date"
                        disabled={!writable}
                        value={r.effectiveFrom ?? ""}
                        onChange={(e) => updateRule(r.id, { effectiveFrom: e.target.value || undefined })}
                        className="w-36"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="date"
                        disabled={!writable}
                        value={r.effectiveTo ?? ""}
                        onChange={(e) => updateRule(r.id, { effectiveTo: e.target.value || undefined })}
                        className="w-36"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Switch
                        disabled={!writable}
                        checked={r.active}
                        onCheckedChange={(active) => updateRule(r.id, { active })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      {writable && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Xóa bậc"
                          onClick={() => setRules((prev) => prev.filter((x) => x.id !== r.id))}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" disabled={!writable} onClick={() => setRules((p) => [...p, emptyRule()])}>
              <Plus className="mr-1 h-4 w-4" /> Thêm bậc
            </Button>
            <Button type="button" disabled={!writable || saving} onClick={() => void saveRules()}>
              {saving ? "Đang lưu…" : "Lưu"}
            </Button>
          </div>
        </Section>
      ) : tab === "code" ? (
        <Section title="Mã giảm giá">
          <p className="mb-3 text-sm text-muted-foreground">
            Tạo mã để khách/NV nhập lúc tạo đơn. Đúng mã → giảm số tiền cố định. Có cả bậc cước và mã → lấy mức giảm lớn
            hơn.
          </p>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Mã</th>
                  <th className="px-3 py-2 font-medium">Tên</th>
                  <th className="px-3 py-2 font-medium">Giảm</th>
                  <th className="px-3 py-2 font-medium">Cước tối thiểu</th>
                  <th className="px-3 py-2 font-medium">Từ ngày</th>
                  <th className="px-3 py-2 font-medium">Đến ngày</th>
                  <th className="px-3 py-2 font-medium">Bật</th>
                  <th className="px-3 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {codes.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                      Chưa có mã. Ví dụ: XE50K giảm 50.000đ.
                    </td>
                  </tr>
                )}
                {codes.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-3 py-2">
                      <Input
                        disabled={!writable}
                        value={r.code}
                        placeholder="XE50K"
                        className="w-32 font-mono uppercase"
                        onChange={(e) => updateCode(r.id, { code: e.target.value.toUpperCase() })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        disabled={!writable}
                        value={r.name}
                        placeholder="KM tháng 11"
                        onChange={(e) => updateCode(r.id, { name: e.target.value })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <MoneyInput
                        disabled={!writable}
                        value={r.discountAmount}
                        onChange={(discountAmount) => updateCode(r.id, { discountAmount })}
                        className="w-36"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <MoneyInput
                        disabled={!writable}
                        value={r.minFare ?? 0}
                        onChange={(minFare) => updateCode(r.id, { minFare })}
                        className="w-36"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="date"
                        disabled={!writable}
                        value={r.effectiveFrom ?? ""}
                        onChange={(e) => updateCode(r.id, { effectiveFrom: e.target.value || undefined })}
                        className="w-36"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="date"
                        disabled={!writable}
                        value={r.effectiveTo ?? ""}
                        onChange={(e) => updateCode(r.id, { effectiveTo: e.target.value || undefined })}
                        className="w-36"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Switch
                        disabled={!writable}
                        checked={r.active}
                        onCheckedChange={(active) => updateCode(r.id, { active })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      {writable && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Xóa mã"
                          onClick={() => setCodes((prev) => prev.filter((x) => x.id !== r.id))}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" disabled={!writable} onClick={() => setCodes((p) => [...p, emptyCode()])}>
              <Plus className="mr-1 h-4 w-4" /> Thêm mã
            </Button>
            <Button type="button" disabled={!writable || saving} onClick={() => void saveCodes()}>
              {saving ? "Đang lưu…" : "Lưu"}
            </Button>
          </div>
        </Section>
      ) : tab === "aha" ? (
        <Section title="Voucher Ahamove">
          <p className="mb-3 text-sm text-muted-foreground">
            Nhập các mã voucher Aha cung cấp. Lúc <strong>ước tính phí</strong> và lúc <strong>book</strong>, hệ thống
            gọi Aha kèm từng mã ({`promo_code`}), chọn mã giảm phí nhiều nhất, hiện rõ phí gốc / voucher / phí sau giảm.
            Mã hết hạn hoặc Aha từ chối → bỏ qua; book lỗi với mã → thử lại không mã.
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
                {ahaRows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                      Chưa có voucher. Ví dụ staging Aha: AHAKM, AHAKM20.
                    </td>
                  </tr>
                )}
                {ahaRows.map((r) => (
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
                        placeholder="KM Aha tháng 11"
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
                      {writable && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Xóa voucher"
                          onClick={() => setAhaRows((prev) => prev.filter((x) => x.id !== r.id))}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" disabled={!writable} onClick={() => setAhaRows((p) => [...p, emptyAha()])}>
              <Plus className="mr-1 h-4 w-4" /> Thêm voucher
            </Button>
            <Button type="button" disabled={!writable || saving} onClick={() => void saveAha()}>
              {saving ? "Đang lưu…" : "Lưu"}
            </Button>
          </div>
        </Section>
      ) : null}

      {tab !== "aha" && (
        <Section title="Thử tính (không lưu)">
          <p className="mb-3 text-sm text-muted-foreground">
            Máy tính kiểm tra: nhập giả định tổng cước đơn (+ mã nếu có) để xem hệ thống sẽ chọn khoảng nào và giảm bao
            nhiêu. Không ghi vào cấu hình.
          </p>
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <div className="mb-1 text-xs text-muted-foreground">Tổng cước trước giảm</div>
              <MoneyInput value={preview} onChange={setPreview} className="w-44" />
            </div>
            {tab === "code" && (
              <div>
                <div className="mb-1 text-xs text-muted-foreground">Mã giảm giá</div>
                <Input
                  value={previewCode}
                  placeholder="Tuỳ chọn"
                  className="w-36 font-mono uppercase"
                  onChange={(e) => setPreviewCode(e.target.value.toUpperCase())}
                />
              </div>
            )}
            <div className="space-y-1 text-sm">
              <div>
                Giảm <strong>{formatVND(previewMatched.off)}</strong>
                {" → "}
                Cước sau giảm <strong>{formatVND(Math.max(0, preview - previewMatched.off))}</strong>
              </div>
              <div className="text-xs text-muted-foreground">
                {previewMatched.tier ? (
                  <>
                    Bậc khớp: <strong>{previewMatched.tier.name || bandLabel(previewMatched.tier, orderedRules)}</strong>
                    {" · "}
                    {bandLabel(previewMatched.tier, orderedRules)} · giảm {formatVND(previewMatched.tier.discountAmount)}
                  </>
                ) : (
                  <>Không khớp bậc cước nào</>
                )}
                {previewCode.trim() ? (
                  <>
                    {" · "}
                    Mã: giảm {formatVND(previewMatched.codeOff)}
                    {previewMatched.off > 0 && previewMatched.codeOff >= (previewMatched.tier?.discountAmount ?? 0)
                      ? " (đang thắng / ngang bậc)"
                      : previewMatched.codeOff > 0
                        ? " (thua bậc cước)"
                        : " (không áp dụng)"}
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </Section>
      )}
    </div>
  );
}
