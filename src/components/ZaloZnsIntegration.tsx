import { SecretInput } from "@/components/SecretInput";
import { TablePagination } from "@/components/TablePagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CfgActs, CfgField, CfgHeader, CfgInput, CfgUrl } from "@/components/m3/CfgKit";
import { getApiBase, isApiEnabled } from "@/lib/api/client";
import type { GaponeZnsLog } from "@/lib/api/finance-config-api";
import { ExportFormatButton } from "@/components/ExportFormatButton";
import { downloadExcelRows, type ExportFormat } from "@/lib/csv";
import { useStore } from "@/lib/store";
import type { Pager } from "@/lib/use-paged-rows";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

type OaRow = { oaId: string; oaName: string };
type TemplateRow = { templateId: string; name: string; params?: string; status?: string };

const SELECT_CLASS =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

type KindFilter = "" | "SEND" | "CALLBACK";
type ResultFilter = "" | "OK" | "ERROR" | "PENDING";

const EXPORT_PAGE_SIZE = 5_000;
const EXPORT_SAFETY_MAX_PAGES = 2_000;

/** Khớp whitelist BE GapOneAutocallZnsService.FIELD_KEYS */
const ORDER_FIELD_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "orderCode", label: "Mã đơn" },
  { value: "receiverName", label: "Tên người nhận" },
  { value: "receiverPhone", label: "SĐT người nhận" },
  { value: "deliveryAddress", label: "Địa chỉ giao" },
  { value: "senderName", label: "Tên người gửi" },
  { value: "senderPhone", label: "SĐT người gửi" },
  { value: "codAmount", label: "COD" },
  { value: "fareAmount", label: "Cước phí" },
  { value: "paidAmount", label: "Đã thanh toán" },
  { value: "goodsName", label: "Tên hàng" },
  { value: "toOfficeCode", label: "Mã VP nhận" },
  { value: "toOfficeName", label: "Tên VP nhận" },
  { value: "toOfficeAddress", label: "Địa chỉ VP nhận" },
  { value: "fromOfficeCode", label: "Mã VP gửi" },
  { value: "fromOfficeName", label: "Tên VP gửi" },
  { value: "quantity", label: "Số kiện" },
  { value: "weightKg", label: "Khối lượng (kg)" },
  { value: "paymentTerm", label: "Hình thức TT" },
  { value: "serviceType", label: "Loại dịch vụ" },
  { value: "status", label: "Trạng thái đơn" },
  { value: "refId", label: "refId Auto Call" },
  { value: "retryDay", label: "Ngày gọi (retryDay)" },
  { value: "retryNo", label: "Lần gọi trong ngày" },
];

function dateInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function logToCsvRow(l: GaponeZnsLog) {
  return [
    l.createdAt ? new Date(l.createdAt).toLocaleString("vi-VN") : "",
    l.kind ?? "",
    l.result ?? "",
    l.source ?? "",
    l.orderCode ?? "",
    l.phone ?? "",
    l.oaId ?? "",
    l.templateId ?? "",
    l.messageId ?? "",
    l.requestId ?? "",
    l.deliveryChannel ?? "",
    l.deliveryStatus != null ? String(l.deliveryStatus) : "",
    l.deliveryDescription ?? "",
    l.errorMessage ?? "",
  ];
}

function seedTemplateData(paramsCsv?: string) {
  if (!paramsCsv?.trim()) return '{\n  "customer_name": "Test"\n}';
  const obj: Record<string, string> = {};
  for (const p of paramsCsv.split(",")) {
    const key = p.trim();
    if (!key) continue;
    obj[key] =
      key.toLowerCase().includes("otp") || key.toLowerCase().includes("pin") ? "123456" : "Test";
  }
  return JSON.stringify(obj, null, 2);
}

function parseFieldMap(raw?: string): Record<string, string> {
  if (!raw?.trim()) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const out: Record<string, string> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (typeof val === "string" && val.trim()) out[k] = val.trim();
    }
    return out;
  } catch {
    return {};
  }
}

function guessFieldForParam(param: string): string {
  const p = param.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (p.includes("order") || p.includes("madon") || p.includes("code")) return "orderCode";
  if (p.includes("phone") || p.includes("sdt") || p.includes("mobile")) return "receiverPhone";
  if (p.includes("name") || p.includes("ten") || p.includes("customer")) return "receiverName";
  if (p.includes("address") || p.includes("diachi")) return "deliveryAddress";
  if (p.includes("cod")) return "codAmount";
  if (p.includes("fare") || p.includes("cuoc")) return "fareAmount";
  if (p.includes("goods") || p.includes("hang") || p.includes("product")) return "goodsName";
  if (p.includes("office") || p.includes("diem")) return "toOfficeName";
  return "";
}

/**
 * Tích hợp GapOne Zalo ZNS — Kết nối / Tự động (Auto Call) / Gửi thử / Nhật ký.
 */
export function ZaloZnsIntegration() {
  const integrations = useStore((s) => s.integrations);
  const [clientId, setClientId] = useState(integrations.gaponeClientId ?? "");
  const [clientSecret, setClientSecret] = useState("");
  const [oaId, setOaId] = useState(integrations.gaponeOaId ?? "");
  const [saving, setSaving] = useState(false);
  const [savingAuto, setSavingAuto] = useState(false);
  const [testing, setTesting] = useState(false);
  const [sending, setSending] = useState(false);
  const [loadingTpl, setLoadingTpl] = useState(false);
  const [oas, setOas] = useState<OaRow[]>([]);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [phone, setPhone] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [templateDataJson, setTemplateDataJson] = useState('{\n  "customer_name": "Test"\n}');
  const [lastSend, setLastSend] = useState<{ messageId?: string; requestId?: string } | null>(null);

  const [autoEnabled, setAutoEnabled] = useState(integrations.gaponeAutocallZnsEnabled === true);
  const [autoTemplateId, setAutoTemplateId] = useState(
    integrations.gaponeAutocallZnsTemplateId ?? "",
  );
  const [fieldMap, setFieldMap] = useState<Record<string, string>>(() =>
    parseFieldMap(integrations.gaponeAutocallZnsFieldMap),
  );

  const [otpEnabled, setOtpEnabled] = useState(integrations.gaponeLoginOtpEnabled === true);
  const [otpTemplateId, setOtpTemplateId] = useState(integrations.gaponeLoginOtpTemplateId ?? "");
  const [otpParam, setOtpParam] = useState(integrations.gaponeLoginOtpParam ?? "otp");
  const [otpTestPhones, setOtpTestPhones] = useState(integrations.gaponeLoginOtpTestPhones ?? "");
  const [otpTestCode, setOtpTestCode] = useState(integrations.gaponeLoginOtpTestCode ?? "");
  const [savingOtp, setSavingOtp] = useState(false);

  const today = new Date();
  const [logFrom, setLogFrom] = useState(dateInput(new Date(today.getTime() - 6 * 86400000)));
  const [logTo, setLogTo] = useState(dateInput(today));
  const [logKind, setLogKind] = useState<KindFilter>("");
  const [logResult, setLogResult] = useState<ResultFilter>("");
  const [logPage, setLogPage] = useState(1);
  const [logLimit, setLogLimit] = useState(20);
  const [logs, setLogs] = useState<GaponeZnsLog[] | null>(null);
  const [logTotal, setLogTotal] = useState(0);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);
  const [phoneInput, setPhoneInput] = useState("");
  const [logPhone, setLogPhone] = useState("");
  const [exporting, setExporting] = useState(false);

  const autoTemplate = useMemo(
    () => templates.find((t) => t.templateId === autoTemplateId),
    [templates, autoTemplateId],
  );

  const autoParams = useMemo(() => {
    const fromTpl = (autoTemplate?.params ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const keys = new Set([...fromTpl, ...Object.keys(fieldMap)]);
    return Array.from(keys);
  }, [autoTemplate, fieldMap]);

  const refreshLogs = useCallback(() => {
    if (!isApiEnabled()) return;
    setLoadingLogs(true);
    setLogError(null);
    void (async () => {
      try {
        const { fetchGaponeLogs } = await import("@/lib/api/finance-config-api");
        const r = await fetchGaponeLogs({
          from: logFrom,
          to: logTo,
          kind: logKind,
          result: logResult,
          phone: logPhone,
          page: logPage,
          limit: logLimit,
        });
        setLogs(Array.isArray(r.items) ? r.items : []);
        setLogTotal(r.pagination?.total ?? r.items?.length ?? 0);
      } catch (e: unknown) {
        setLogs([]);
        setLogTotal(0);
        setLogError(e instanceof Error ? e.message : "Không tải được nhật ký");
      } finally {
        setLoadingLogs(false);
      }
    })();
  }, [logFrom, logTo, logKind, logResult, logPhone, logPage, logLimit]);

  useEffect(() => {
    if (!isApiEnabled()) return;
    void (async () => {
      try {
        const { fetchIntegrationConfig } = await import("@/lib/api/finance-config-api");
        const saved = await fetchIntegrationConfig();
        useStore.setState({ integrations: saved });
        setClientId(saved.gaponeClientId ?? "");
        setOaId(saved.gaponeOaId ?? "");
        setAutoEnabled(saved.gaponeAutocallZnsEnabled === true);
        setAutoTemplateId(saved.gaponeAutocallZnsTemplateId ?? "");
        setFieldMap(parseFieldMap(saved.gaponeAutocallZnsFieldMap));
        applyOtpConfig(saved);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  function applyOtpConfig(saved: typeof integrations) {
    setOtpEnabled(saved.gaponeLoginOtpEnabled === true);
    setOtpTemplateId(saved.gaponeLoginOtpTemplateId ?? "");
    setOtpParam(saved.gaponeLoginOtpParam ?? "otp");
    setOtpTestPhones(saved.gaponeLoginOtpTestPhones ?? "");
    setOtpTestCode(saved.gaponeLoginOtpTestCode ?? "");
  }

  const saveOtp = () => {
    if (otpEnabled && !otpTemplateId.trim()) {
      return toast.error("Chọn template ZNS OTP trước khi bật");
    }
    if (otpTestCode.trim() && !/^\d{6}$/.test(otpTestCode.trim())) {
      return toast.error("Mã OTP test phải gồm 6 chữ số");
    }
    const patch = {
      gaponeLoginOtpEnabled: otpEnabled,
      gaponeLoginOtpTemplateId: otpTemplateId.trim(),
      gaponeLoginOtpParam: otpParam.trim() || "otp",
      gaponeLoginOtpTestPhones: otpTestPhones.trim(),
      gaponeLoginOtpTestCode: otpTestCode.trim(),
    };
    setSavingOtp(true);
    void (async () => {
      try {
        if (!isApiEnabled()) {
          useStore.getState().setIntegrations(patch);
          toast.success("Đã lưu (local)");
          return;
        }
        const { putIntegrationConfig } = await import("@/lib/api/finance-config-api");
        const saved = await putIntegrationConfig(patch);
        useStore.setState({ integrations: saved });
        applyOtpConfig(saved);
        toast.success("Đã lưu cấu hình OTP đăng nhập");
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Lưu thất bại");
      } finally {
        setSavingOtp(false);
      }
    })();
  };

  const pickTemplateOtp = (t: TemplateRow) => {
    setOtpTemplateId(t.templateId);
    const first = (t.params ?? "")
      .split(",")
      .map((s) => s.trim())
      .find((p) => /otp|code|ma/i.test(p));
    if (first) setOtpParam(first);
    toast.message(`Đã chọn mẫu OTP ${t.templateId}`);
  };

  useEffect(() => {
    refreshLogs();
  }, [refreshLogs]);

  const searchPhone = () => {
    const p = phoneInput.trim();
    if (p && p.replace(/\D/g, "").length < 3) return toast.error("Nhập ít nhất 3 số điện thoại");
    setLogPhone(p);
    setLogPage(1);
  };

  const clearPhone = () => {
    setPhoneInput("");
    setLogPhone("");
    setLogPage(1);
  };

  const exportCsv = async (format: ExportFormat = "csv") => {
    if (exporting) return;
    setExporting(true);
    try {
      const { fetchGaponeLogs } = await import("@/lib/api/finance-config-api");
      const all: GaponeZnsLog[] = [];
      for (let p = 1; p <= EXPORT_SAFETY_MAX_PAGES; p++) {
        const r = await fetchGaponeLogs({
          from: logFrom,
          to: logTo,
          kind: logKind,
          result: logResult,
          phone: logPhone,
          page: p,
          limit: EXPORT_PAGE_SIZE,
        });
        const chunk = r.items ?? [];
        all.push(...chunk);
        const total = r.pagination?.total ?? all.length;
        const totalPages =
          r.pagination?.totalPages ?? Math.max(1, Math.ceil(total / EXPORT_PAGE_SIZE));
        if (chunk.length === 0 || all.length >= total || p >= totalPages) break;
      }
      if (!all.length) {
        toast.message("Không có nhật ký theo bộ lọc hiện tại");
        return;
      }
      downloadExcelRows(
        `gapone-zns-${logFrom}_${logTo}`,
        [
          [
            "Thời gian",
            "Loại",
            "Kết quả",
            "Nguồn",
            "Mã đơn",
            "SĐT",
            "OA ID",
            "Template ID",
            "message_id",
            "request_id",
            "Kênh",
            "delivery_status",
            "delivery_description",
            "Lỗi",
          ],
          ...all.map(logToCsvRow),
        ],
        "ZNS",
        format,
      );
      toast.success(`Đã xuất ${all.length.toLocaleString("vi-VN")} dòng nhật ký`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Xuất thất bại");
    } finally {
      setExporting(false);
    }
  };

  const setFilter =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setLogPage(1);
    };

  const logPager: Pager = {
    page: logPage,
    pageCount: Math.max(1, Math.ceil(logTotal / logLimit)),
    pageSize: logLimit,
    total: logTotal,
    start: (logPage - 1) * logLimit,
    setPage: setLogPage,
    setPageSize: (n) => {
      setLogLimit(n);
      setLogPage(1);
    },
  };

  const webhookUrl = integrations.gaponeWebhookToken
    ? `${getApiBase()}/api/public/gapone/webhook?token=${integrations.gaponeWebhookToken}`
    : "";

  const save = () => {
    if (!clientId.trim() && !integrations.gaponeClientId) {
      return toast.error("Nhập Client ID GapOne");
    }
    if (!clientSecret.trim() && !integrations.gaponeClientSecretConfigured) {
      return toast.error("Nhập Client Secret GapOne (lần đầu)");
    }
    setSaving(true);
    void (async () => {
      try {
        if (!isApiEnabled()) {
          useStore.getState().setIntegrations({
            gaponeClientId: clientId.trim() || undefined,
            gaponeClientSecret: clientSecret.trim() || undefined,
            gaponeOaId: oaId.trim() || undefined,
          });
          toast.success("Đã lưu (local)");
          return;
        }
        const { putIntegrationConfig } = await import("@/lib/api/finance-config-api");
        const patch: Parameters<typeof putIntegrationConfig>[0] = {
          gaponeOaId: oaId.trim(),
        };
        if (clientId.trim()) patch.gaponeClientId = clientId.trim();
        if (clientSecret.trim()) patch.gaponeClientSecret = clientSecret.trim();
        const saved = await putIntegrationConfig(patch);
        useStore.setState({ integrations: saved });
        setClientId(saved.gaponeClientId ?? clientId.trim());
        setOaId(saved.gaponeOaId ?? "");
        setClientSecret("");
        toast.success("Đã lưu GapOne ZNS");
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Lưu thất bại");
      } finally {
        setSaving(false);
      }
    })();
  };

  const saveAuto = () => {
    if (autoEnabled && !autoTemplateId.trim()) {
      return toast.error("Chọn template ZNS trước khi bật tự động");
    }
    setSavingAuto(true);
    void (async () => {
      try {
        if (!isApiEnabled()) {
          useStore.getState().setIntegrations({
            gaponeAutocallZnsEnabled: autoEnabled,
            gaponeAutocallZnsTemplateId: autoTemplateId.trim() || undefined,
            gaponeAutocallZnsFieldMap: JSON.stringify(fieldMap),
          });
          toast.success("Đã lưu (local)");
          return;
        }
        const { putIntegrationConfig } = await import("@/lib/api/finance-config-api");
        const saved = await putIntegrationConfig({
          gaponeAutocallZnsEnabled: autoEnabled,
          gaponeAutocallZnsTemplateId: autoTemplateId.trim(),
          gaponeAutocallZnsFieldMap: JSON.stringify(fieldMap),
        });
        useStore.setState({ integrations: saved });
        setAutoEnabled(saved.gaponeAutocallZnsEnabled === true);
        setAutoTemplateId(saved.gaponeAutocallZnsTemplateId ?? "");
        setFieldMap(parseFieldMap(saved.gaponeAutocallZnsFieldMap));
        toast.success("Đã lưu cấu hình ZNS tự động");
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Lưu thất bại");
      } finally {
        setSavingAuto(false);
      }
    })();
  };

  const test = () => {
    if (!integrations.gaponeClientId || !integrations.gaponeClientSecretConfigured) {
      return toast.error("Lưu Client ID và Client Secret trước khi test");
    }
    setTesting(true);
    void (async () => {
      try {
        if (!isApiEnabled()) throw new Error("API chưa cấu hình");
        const { testGaponeApi } = await import("@/lib/api/finance-config-api");
        const r = await testGaponeApi();
        if (r.ok === false || r.gaponeTokenOk === false) {
          toast.error(r.gaponeError || r.message || "GapOne từ chối");
          setOas([]);
          return;
        }
        const list = Array.isArray(r.oas) ? (r.oas as OaRow[]).filter((o) => o?.oaId) : [];
        setOas(list);
        if (list.length === 1) setOaId(list[0].oaId);
        const n = typeof r.oaCount === "number" ? r.oaCount : list.length;
        toast.success(
          n > 0
            ? `Kết nối OK — ${n} OA${list.length === 1 ? " (đã chọn sẵn)" : ""}`
            : "Kết nối OK — chưa có OA liên kết trên GapOne",
        );
        try {
          const { fetchIntegrationConfig } = await import("@/lib/api/finance-config-api");
          useStore.setState({ integrations: await fetchIntegrationConfig() });
        } catch {
          /* ignore */
        }
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Test GapOne thất bại");
        setOas([]);
      } finally {
        setTesting(false);
      }
    })();
  };

  const loadTemplates = () => {
    const from = oaId.trim() || integrations.gaponeOaId?.trim() || "";
    if (!integrations.gaponeClientId || !integrations.gaponeClientSecretConfigured) {
      return toast.error("Lưu Client ID / Secret trước");
    }
    if (!from) return toast.error("Chọn/lưu OA ID trước khi tải mẫu");
    setLoadingTpl(true);
    void (async () => {
      try {
        if (!isApiEnabled()) throw new Error("API chưa cấu hình");
        const { fetchGaponeTemplates } = await import("@/lib/api/finance-config-api");
        const r = await fetchGaponeTemplates(from);
        if (r.ok === false) {
          toast.error(r.gaponeError || r.message || "Tải mẫu thất bại");
          setTemplates([]);
          return;
        }
        const list = Array.isArray(r.templates) ? r.templates.filter((t) => t?.templateId) : [];
        setTemplates(list);
        toast.success(
          list.length > 0
            ? `Có ${list.length} mẫu ZNS`
            : "OA chưa có mẫu ZNS (duyệt mẫu trên Zalo/GapOne trước)",
        );
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Tải mẫu thất bại");
        setTemplates([]);
      } finally {
        setLoadingTpl(false);
      }
    })();
  };

  const pickTemplateTrial = (t: TemplateRow) => {
    setTemplateId(t.templateId);
    setTemplateDataJson(seedTemplateData(t.params));
    toast.message(`Đã chọn mẫu ${t.templateId}`);
  };

  const pickTemplateAuto = (t: TemplateRow) => {
    setAutoTemplateId(t.templateId);
    const params = (t.params ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (params.length) {
      setFieldMap((prev) => {
        const next = { ...prev };
        for (const p of params) {
          if (!next[p]) next[p] = guessFieldForParam(p);
        }
        return next;
      });
    }
    toast.message(`Đã chọn mẫu tự động ${t.templateId}`);
  };

  const sendTrial = () => {
    const from = oaId.trim() || integrations.gaponeOaId?.trim() || "";
    if (!integrations.gaponeClientId || !integrations.gaponeClientSecretConfigured) {
      return toast.error("Lưu Client ID / Secret trước");
    }
    if (!from) return toast.error("Chọn/lưu OA ID trước khi gửi thử");
    if (!phone.trim()) return toast.error("Nhập SĐT nhận thử");
    if (!templateId.trim()) return toast.error("Chọn mẫu (Tải mẫu ZNS) hoặc nhập template_id");
    let templateData: Record<string, unknown> | undefined;
    const rawJson = templateDataJson.trim();
    if (rawJson) {
      try {
        const parsed = JSON.parse(rawJson) as unknown;
        if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
          return toast.error('template_data phải là object JSON, vd {"customer_name":"A"}');
        }
        templateData = parsed as Record<string, unknown>;
      } catch {
        return toast.error("template_data không phải JSON hợp lệ");
      }
    }
    setSending(true);
    void (async () => {
      try {
        if (!isApiEnabled()) throw new Error("API chưa cấu hình");
        const { testGaponeSend } = await import("@/lib/api/finance-config-api");
        const r = await testGaponeSend({
          phone: phone.trim(),
          templateId: templateId.trim(),
          oaId: from,
          templateData,
        });
        if (r.ok === false) {
          toast.error(r.gaponeError || r.message || "Gửi thử thất bại");
          setLastSend(null);
          return;
        }
        setLastSend({ messageId: r.messageId, requestId: r.requestId });
        toast.success(
          r.messageId ? `Đã gửi thử — message_id ${r.messageId}` : r.message || "Đã gửi thử ZNS",
        );
        refreshLogs();
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Gửi thử thất bại");
        setLastSend(null);
        refreshLogs();
      } finally {
        setSending(false);
      }
    })();
  };

  return (
    <Tabs defaultValue="ket-noi" className="stack" style={{ gap: 16 }}>
      <TabsList>
        <TabsTrigger value="ket-noi">Kết nối</TabsTrigger>
        <TabsTrigger value="tu-dong">Tự động</TabsTrigger>
        <TabsTrigger value="otp-login">OTP đăng nhập</TabsTrigger>
        <TabsTrigger value="gui-thu">Gửi thử</TabsTrigger>
        <TabsTrigger value="nhat-ky">Nhật ký</TabsTrigger>
      </TabsList>

      <TabsContent value="ket-noi" className="card stack mt-0">
        <CfgHeader
          icon="chat"
          title="GapOne - Zalo ZNS"
          desc={
            <>
              Theo{" "}
              <a
                className="underline underline-offset-2"
                href="https://docs.gapone.vn/vi/api-docs"
                target="_blank"
                rel="noreferrer"
              >
                docs.gapone.vn
              </a>
              : tạo app tại{" "}
              <a
                className="underline underline-offset-2"
                href="https://app.gapone.vn/OAuth2Application"
                target="_blank"
                rel="noreferrer"
              >
                Cài đặt → Kết nối API
              </a>{" "}
              lấy client_id và client_secret. JWT không cần dán, hệ thống tự lấy token khi test hoặc
              gửi thử. Webhook cấu hình trên GapOne: dán URL bên dưới vào Webhook URL rồi lưu.
            </>
          }
        />
        <div className="cfg-grid">
          <CfgField label="Client ID (API key)" saved={!!integrations.gaponeClientId}>
            <CfgInput
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              autoComplete="off"
              placeholder="client_id từ Kết nối API"
            />
          </CfgField>
          <CfgField label="Client Secret" saved={!!integrations.gaponeClientSecretConfigured}>
            <SecretInput
              placeholder={
                integrations.gaponeClientSecretConfigured
                  ? "Để trống nếu giữ secret đã lưu"
                  : "client_secret — không dán JWT"
              }
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
            />
          </CfgField>
          <CfgField label="OA ID (Zalo sender)" saved={!!integrations.gaponeOaId}>
            <CfgInput
              value={oaId}
              onChange={(e) => setOaId(e.target.value)}
              placeholder="Lấy sau khi Test kết nối"
              autoComplete="off"
            />
          </CfgField>
          <CfgUrl
            label="URL webhook - copy sang GapOne"
            url={webhookUrl}
            emptyText="Bấm Lưu để sinh URL webhook."
            copiedText="Đã copy URL webhook"
          />
          {oas.length > 0 ? (
            <div className="note cfg-wide stack" style={{ gap: 8 }}>
              <div className="title-small" style={{ fontWeight: 600, color: "var(--on-surface)" }}>
                OA đã liên kết (từ lần test gần nhất)
              </div>
              {oas.map((o) => (
                <div
                  key={o.oaId}
                  style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}
                >
                  <span className="num" style={{ color: "var(--on-surface)" }}>
                    {o.oaId}
                  </span>
                  <span>{o.oaName}</span>
                  <button type="button" className="text-act" onClick={() => setOaId(o.oaId)}>
                    Chọn
                  </button>
                </div>
              ))}
              <span>Chọn OA rồi bấm Lưu.</span>
            </div>
          ) : null}
        </div>
        <CfgActs updatedAt={undefined}>
          {integrations.gaponeTokenExpiresAt ? (
            <span className="lab muted num" style={{ alignSelf: "center" }}>
              Token hết hạn khoảng{" "}
              {new Date(integrations.gaponeTokenExpiresAt).toLocaleString("vi-VN")}
            </span>
          ) : null}
          <button type="button" className="btn tonal" onClick={test} disabled={testing}>
            {testing ? "Đang test…" : "Test kết nối"}
          </button>
          <button type="button" className="btn" onClick={save} disabled={saving}>
            {saving ? "Đang lưu…" : "Lưu"}
          </button>
        </CfgActs>
      </TabsContent>

      <TabsContent value="tu-dong" className="card stack mt-0">
        <CfgHeader icon="chat" title="Tin ZNS sau khi gọi không thành công" />
        <p className="text-xs text-muted-foreground">
          Khi Auto Call hết vòng gọi <strong>ngày 1</strong> (mặc định 3 cuộc theo lịch{" "}
          <code className="text-[11px]">60,120</code>) và kết quả là <strong>không nghe máy</strong>{" "}
          hoặc <strong>đã huỷ</strong>, CPN gửi 1 tin ZNS tới SĐT người nhận. Cấu hình lịch gọi vẫn
          ở tab Auto Call → Lịch gọi.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Switch id="gapone-ac-zns" checked={autoEnabled} onCheckedChange={setAutoEnabled} />
          <Label htmlFor="gapone-ac-zns" className="text-sm">
            Bật ZNS sau hết vòng gọi ngày 1 (không nghe / đã huỷ)
          </Label>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={loadTemplates} disabled={loadingTpl}>
            {loadingTpl ? "Đang tải mẫu…" : "Tải mẫu ZNS"}
          </Button>
        </div>
        {templates.length > 0 ? (
          <ul className="max-h-40 space-y-1 overflow-y-auto text-sm">
            {templates.map((t) => (
              <li
                key={t.templateId}
                className="flex flex-wrap items-center gap-2 border-b border-border/60 py-1.5"
              >
                <span className="font-mono text-xs">{t.templateId}</span>
                <span className="text-muted-foreground">{t.name}</span>
                {t.params ? (
                  <span className="text-[11px] text-muted-foreground">params: {t.params}</span>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7"
                  onClick={() => pickTemplateAuto(t)}
                >
                  Chọn
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        <F label="Template ID (mẫu gửi tự động)">
          <Input
            value={autoTemplateId}
            onChange={(e) => setAutoTemplateId(e.target.value)}
            placeholder="Tải mẫu rồi Chọn — hoặc dán tay"
            autoComplete="off"
          />
        </F>
        <div>
          <div className="mb-2 text-sm font-medium">Map tham số mẫu → thông tin đơn</div>
          <p className="mb-2 text-xs text-muted-foreground">
            Mỗi biến trong mẫu ZNS chọn nguồn dữ liệu từ đơn / cuộc gọi. Thêm dòng nếu mẫu có param
            chưa liệt kê.
          </p>
          {autoParams.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Chọn mẫu có params, hoặc bấm Thêm biến bên dưới.
            </p>
          ) : (
            <div className="space-y-2">
              {autoParams.map((param) => (
                <div key={param} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] items-end">
                  <F label="Biến mẫu">
                    <Input
                      value={param}
                      readOnly={
                        !!autoTemplate?.params
                          ?.split(",")
                          .map((s) => s.trim())
                          .includes(param)
                      }
                      onChange={(e) => {
                        const nextKey = e.target.value.trim();
                        setFieldMap((prev) => {
                          const n = { ...prev };
                          const val = n[param] ?? "";
                          delete n[param];
                          if (nextKey) n[nextKey] = val;
                          return n;
                        });
                      }}
                    />
                  </F>
                  <F label="Nguồn dữ liệu">
                    <select
                      className={SELECT_CLASS}
                      value={fieldMap[param] ?? ""}
                      onChange={(e) =>
                        setFieldMap((prev) => ({ ...prev, [param]: e.target.value }))
                      }
                    >
                      <option value="">— Chọn —</option>
                      {ORDER_FIELD_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label} ({o.value})
                        </option>
                      ))}
                    </select>
                  </F>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mb-0.5"
                    onClick={() =>
                      setFieldMap((prev) => {
                        const n = { ...prev };
                        delete n[param];
                        return n;
                      })
                    }
                  >
                    Xóa
                  </Button>
                </div>
              ))}
            </div>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() =>
              setFieldMap((prev) => {
                let i = 1;
                let key = `param_${i}`;
                while (prev[key] != null) {
                  i += 1;
                  key = `param_${i}`;
                }
                return { ...prev, [key]: "" };
              })
            }
          >
            Thêm biến
          </Button>
        </div>
        <Button type="button" onClick={saveAuto} disabled={savingAuto}>
          {savingAuto ? "Đang lưu…" : "Lưu cấu hình tự động"}
        </Button>
      </TabsContent>

      <TabsContent value="otp-login" className="card stack mt-0">
        <CfgHeader icon="chat" title="OTP đăng nhập" />
        <p className="text-xs text-muted-foreground">
          Khách đăng nhập trang <strong>cpn.xevietnam.com</strong> bằng SĐT: CPN sinh mã 6 số, gửi
          qua mẫu ZNS bên dưới (hết hạn sau 5 phút, gửi lại sau 60 giây). SĐT test đăng nhập bằng mã
          cố định, không gửi tin.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Switch id="gapone-login-otp" checked={otpEnabled} onCheckedChange={setOtpEnabled} />
          <Label htmlFor="gapone-login-otp" className="text-sm">
            Bật gửi OTP đăng nhập qua ZNS
          </Label>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={loadTemplates} disabled={loadingTpl}>
            {loadingTpl ? "Đang tải mẫu…" : "Tải mẫu ZNS"}
          </Button>
        </div>
        {templates.length > 0 ? (
          <ul className="max-h-40 space-y-1 overflow-y-auto text-sm">
            {templates.map((t) => (
              <li
                key={t.templateId}
                className="flex flex-wrap items-center gap-2 border-b border-border/60 py-1.5"
              >
                <span className="font-mono text-xs">{t.templateId}</span>
                <span className="text-muted-foreground">{t.name}</span>
                {t.params ? (
                  <span className="text-[11px] text-muted-foreground">params: {t.params}</span>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7"
                  onClick={() => pickTemplateOtp(t)}
                >
                  Chọn
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <F label="Template ID (mẫu OTP)">
            <Input
              value={otpTemplateId}
              onChange={(e) => setOtpTemplateId(e.target.value)}
              placeholder="Tải mẫu rồi Chọn — hoặc dán tay"
              autoComplete="off"
            />
          </F>
          <F label="Tên biến mã OTP trong mẫu">
            <Input
              value={otpParam}
              onChange={(e) => setOtpParam(e.target.value)}
              placeholder="otp"
              autoComplete="off"
            />
          </F>
          <F label="SĐT test (phân cách dấu phẩy)">
            <Input
              value={otpTestPhones}
              onChange={(e) => setOtpTestPhones(e.target.value)}
              placeholder="0393883210"
              inputMode="tel"
              autoComplete="off"
            />
          </F>
          <F label="Mã OTP cố định cho SĐT test">
            <Input
              value={otpTestCode}
              onChange={(e) => setOtpTestCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="123456"
              inputMode="numeric"
              autoComplete="off"
            />
          </F>
        </div>
        <Button type="button" onClick={saveOtp} disabled={savingOtp}>
          {savingOtp ? "Đang lưu…" : "Lưu cấu hình OTP"}
        </Button>
      </TabsContent>

      <TabsContent value="gui-thu" className="card stack mt-0">
        <CfgHeader icon="chat" title="Gửi thử" />
        <p className="text-xs text-muted-foreground">
          Gửi thử thủ công (có thể tốn phí). Không gắn đơn — dùng để kiểm tra template.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={loadTemplates} disabled={loadingTpl}>
            {loadingTpl ? "Đang tải mẫu…" : "Tải mẫu ZNS"}
          </Button>
        </div>
        {templates.length > 0 ? (
          <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
            {templates.map((t) => (
              <li
                key={t.templateId}
                className="flex flex-wrap items-center gap-2 border-b border-border/60 py-1.5"
              >
                <span className="font-mono text-xs">{t.templateId}</span>
                <span className="text-muted-foreground">{t.name}</span>
                {t.params ? (
                  <span className="text-[11px] text-muted-foreground">params: {t.params}</span>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7"
                  onClick={() => pickTemplateTrial(t)}
                >
                  Chọn
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <F label="SĐT nhận thử">
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0912345678"
              inputMode="tel"
            />
          </F>
          <F label="Template ID (mã mẫu)">
            <Input
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              placeholder="Tải mẫu rồi Chọn — hoặc dán tay"
              autoComplete="off"
            />
          </F>
          <div className="sm:col-span-2">
            <F label="template_data (JSON)">
              <textarea
                className="min-h-[88px] w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
                value={templateDataJson}
                onChange={(e) => setTemplateDataJson(e.target.value)}
                spellCheck={false}
              />
            </F>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={sendTrial} disabled={sending}>
            {sending ? "Đang gửi…" : "Gửi thử"}
          </Button>
          {lastSend?.messageId ? (
            <span className="font-mono text-xs text-muted-foreground">
              message_id={lastSend.messageId}
            </span>
          ) : null}
        </div>
      </TabsContent>

      <TabsContent value="nhat-ky" className="card stack mt-0">
        <CfgHeader icon="chat" title="Nhật ký" />
        <p className="text-xs text-muted-foreground">
          <strong>SEND</strong> = gửi từ CPN (thử / Auto Call); <strong>CALLBACK</strong> = GapOne
          webhook delivery. Lọc + xuất CSV theo bộ lọc.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1.5">
            <Label className="text-xs">Từ ngày</Label>
            <Input
              type="date"
              value={logFrom}
              max={logTo}
              onChange={(e) => setFilter(setLogFrom)(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Đến ngày</Label>
            <Input
              type="date"
              value={logTo}
              min={logFrom}
              onChange={(e) => setFilter(setLogTo)(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Loại</Label>
            <select
              className={SELECT_CLASS}
              value={logKind}
              onChange={(e) => setFilter(setLogKind)(e.target.value as KindFilter)}
            >
              <option value="">Tất cả</option>
              <option value="SEND">SEND</option>
              <option value="CALLBACK">CALLBACK</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Kết quả</Label>
            <select
              className={SELECT_CLASS}
              value={logResult}
              onChange={(e) => setFilter(setLogResult)(e.target.value as ResultFilter)}
            >
              <option value="">Tất cả</option>
              <option value="OK">OK</option>
              <option value="ERROR">ERROR</option>
              <option value="PENDING">PENDING</option>
            </select>
          </div>
          <div className="flex items-end gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => refreshLogs()}
              disabled={loadingLogs || exporting}
            >
              {loadingLogs ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {loadingLogs ? "Đang tải…" : "Tải lại"}
            </Button>
            <ExportFormatButton
              variant="secondary"
              busy={exporting}
              disabled={loadingLogs}
              title="Xuất theo bộ lọc đang chọn (tất cả trang)"
              onExport={(format) => void exportCsv(format)}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-64 flex-1 space-y-1.5">
            <Label className="text-xs">Tìm theo SĐT</Label>
            <Input
              value={phoneInput}
              inputMode="tel"
              onChange={(e) => setPhoneInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") searchPhone();
              }}
              placeholder="0912345678 hoặc vài số cuối"
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={searchPhone}
            disabled={loadingLogs || exporting}
          >
            Tìm
          </Button>
          {logPhone ? (
            <Button type="button" variant="ghost" onClick={clearPhone} disabled={exporting}>
              Bỏ lọc
            </Button>
          ) : null}
        </div>
        {logError ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
            {logError}
          </div>
        ) : null}
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Thời gian</th>
                <th className="px-3 py-2 text-left font-medium">Loại</th>
                <th className="px-3 py-2 text-left font-medium">Nguồn</th>
                <th className="px-3 py-2 text-left font-medium">Kết quả</th>
                <th className="px-3 py-2 text-left font-medium">SĐT / đơn / mẫu</th>
                <th className="px-3 py-2 text-left font-medium">message_id / trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {logs == null ? (
                <tr>
                  <td colSpan={6} className="px-3 py-3 text-center text-xs text-muted-foreground">
                    Đang tải…
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-3 text-center text-xs text-muted-foreground">
                    Không có nhật ký theo bộ lọc
                  </td>
                </tr>
              ) : (
                logs.map((l) => (
                  <tr key={l.id} className="border-t align-top">
                    <td className="px-3 py-2 text-xs whitespace-nowrap">
                      {l.createdAt ? new Date(l.createdAt).toLocaleString("vi-VN") : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs font-medium">{l.kind}</td>
                    <td className="px-3 py-2 font-mono text-[11px]">{l.source ?? "—"}</td>
                    <td className="px-3 py-2 text-xs">
                      <span
                        className={
                          l.result === "OK"
                            ? "text-emerald-700"
                            : l.result === "ERROR"
                              ? "text-destructive"
                              : "text-muted-foreground"
                        }
                      >
                        {l.result}
                      </span>
                      {l.errorMessage ? (
                        <div className="mt-0.5 max-w-xs text-[11px] text-destructive">
                          {l.errorMessage}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {l.phone ?? "—"}
                      {l.orderCode ? (
                        <div className="text-muted-foreground">{l.orderCode}</div>
                      ) : null}
                      {l.templateId ? (
                        <div className="text-muted-foreground">tpl {l.templateId}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {l.messageId ?? "—"}
                      {l.deliveryDescription || l.deliveryStatus != null ? (
                        <div className="text-muted-foreground">
                          {l.deliveryStatus != null ? `${l.deliveryStatus}` : ""}
                          {l.deliveryDescription ? ` ${l.deliveryDescription}` : ""}
                        </div>
                      ) : null}
                      {l.requestId ? (
                        <div className="text-[11px] text-muted-foreground">req {l.requestId}</div>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <TablePagination pager={logPager} />
      </TabsContent>
    </Tabs>
  );
}

function F({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
