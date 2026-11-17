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
import { canWrite } from "@/lib/rbac";
import { calcOrderDiscount, normalizeDiscountCode } from "@/lib/pricing";

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
  const session = useAuth((s) => s.session);
  const writable = canWrite(session?.role, "khuyen-mai");
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

  const previewOff = (() => {
    const prevR = useStore.getState().fareDiscountRules;
    const prevC = useStore.getState().fareDiscountCodes;
    useStore.setState({ fareDiscountRules: rules, fareDiscountCodes: codes });
    const off = calcOrderDiscount(preview, previewCode);
    useStore.setState({ fareDiscountRules: prevR, fareDiscountCodes: prevC });
    return off;
  })();

  return (
    <div className="space-y-4">
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
        <Section
          title="Giảm giá theo cước đơn"
          description="Khi tổng cước (trước giảm) đạt mức, hệ thống tự trừ số tiền cố định lúc tạo đơn. Nhiều bậc khớp → lấy bậc cao nhất."
        >
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Tên</th>
                  <th className="px-3 py-2 font-medium">Cước từ</th>
                  <th className="px-3 py-2 font-medium">Giảm</th>
                  <th className="px-3 py-2 font-medium">Từ ngày</th>
                  <th className="px-3 py-2 font-medium">Đến ngày</th>
                  <th className="px-3 py-2 font-medium">Bật</th>
                  <th className="px-3 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {rules.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                      Chưa có bậc nào. Thêm ví dụ: cước từ 500.000đ giảm 50.000đ.
                    </td>
                  </tr>
                )}
                {rules.map((r) => (
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
            {writable && (
              <>
                <Button type="button" variant="outline" onClick={() => setRules((p) => [...p, emptyRule()])}>
                  <Plus className="mr-1 h-4 w-4" /> Thêm bậc
                </Button>
                <Button type="button" disabled={saving} onClick={() => void saveRules()}>
                  {saving ? "Đang lưu…" : "Lưu"}
                </Button>
              </>
            )}
          </div>
        </Section>
      ) : tab === "code" ? (
        <Section
          title="Mã giảm giá"
          description="Tạo mã để khách/NV nhập lúc tạo đơn. Đúng mã → giảm số tiền cố định. Có cả bậc cước và mã → lấy mức giảm lớn hơn."
        >
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
            {writable && (
              <>
                <Button type="button" variant="outline" onClick={() => setCodes((p) => [...p, emptyCode()])}>
                  <Plus className="mr-1 h-4 w-4" /> Thêm mã
                </Button>
                <Button type="button" disabled={saving} onClick={() => void saveCodes()}>
                  {saving ? "Đang lưu…" : "Lưu"}
                </Button>
              </>
            )}
          </div>
        </Section>
      ) : tab === "aha" ? (
        <Section
          title="Voucher Ahamove"
          description="Nhập các mã voucher Aha cung cấp. Khi CPN book giao/lấy Ahamove (trả phí đối tác), hệ thống tự ước tính và chọn mã giảm nhiều nhất. Mã hết hạn / không dùng được sẽ bỏ qua."
        >
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
            {writable && (
              <>
                <Button type="button" variant="outline" onClick={() => setAhaRows((p) => [...p, emptyAha()])}>
                  <Plus className="mr-1 h-4 w-4" /> Thêm voucher
                </Button>
                <Button type="button" disabled={saving} onClick={() => void saveAha()}>
                  {saving ? "Đang lưu…" : "Lưu"}
                </Button>
              </>
            )}
          </div>
        </Section>
      ) : null}

      {tab !== "aha" && (
        <Section title="Xem trước" description="Nhập tổng cước và (tuỳ chọn) mã để kiểm tra mức giảm.">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <div className="mb-1 text-xs text-muted-foreground">Tổng cước trước giảm</div>
              <MoneyInput value={preview} onChange={setPreview} className="w-44" />
            </div>
            <div>
              <div className="mb-1 text-xs text-muted-foreground">Mã giảm giá</div>
              <Input
                value={previewCode}
                placeholder="Tuỳ chọn"
                className="w-36 font-mono uppercase"
                onChange={(e) => setPreviewCode(e.target.value.toUpperCase())}
              />
            </div>
            <div className="text-sm">
              Giảm <strong>{formatVND(previewOff)}</strong>
              {" → "}
              Cước sau giảm <strong>{formatVND(Math.max(0, preview - previewOff))}</strong>
            </div>
          </div>
        </Section>
      )}
    </div>
  );
}
