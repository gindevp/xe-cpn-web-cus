import {
  CfgActs,
  CfgCard,
  CfgField,
  CfgHeader,
  CfgInput,
  CfgNote,
  CfgSeg,
  CfgToggle,
  CfgUrl,
  type CollectSub,
} from "@/components/m3/CfgKit";
import { askConfirm } from "@/components/m3/askConfirm";
import { SecretInput } from "@/components/SecretInput";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getApiBase, isApiEnabled } from "@/lib/api/client";
import type {
  OnePayCallLog,
  OnePayConfig,
  OnePayInvoice,
  OnePayInvoiceState,
  OnePayListFilter,
  OnePaySampleIpn,
} from "@/lib/api/onepay-api";
import QRCode from "qrcode";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

const IPN_PATH = "/api/public/onepay/ipn";

const STATE_LABEL: Record<OnePayInvoiceState, string> = {
  UNPAID: "Chưa thanh toán",
  PAID: "Đã thanh toán",
  EXPIRED: "Hết hạn",
  AMOUNT_MISMATCH: "Lệch số tiền",
};

const INVOICE_STATES = Object.keys(STATE_LABEL) as OnePayInvoiceState[];

const RESULT_LABEL: Record<string, string> = {
  OK: "Thành công",
  ERROR: "Lỗi",
  PAID: "Ghi nhận thanh toán",
  AMOUNT_MISMATCH: "Lệch số tiền",
  EXTRA_PAYMENT: "Tiền về thêm",
  DUPLICATE: "Gửi lại (đã ghi)",
  UNMATCHED: "Không khớp hoá đơn",
  IGNORED_STATE: "Bỏ qua trạng thái",
  BAD_SIGNATURE: "Sai chữ ký",
  WRONG_MERCHANT: "Sai merchant",
  BAD_REQUEST: "Sai dữ liệu",
  DISABLED: "Đang tắt",
  SYSTEM_ERROR: "Lỗi hệ thống",
};

const LOG_RESULTS = Object.keys(RESULT_LABEL);

const GOOD_RESULTS = new Set(["OK", "PAID", "DUPLICATE"]);

const emptyFilter = (): OnePayListFilter => ({ q: "", state: "", from: "", to: "" });

const money = (n: number | null | undefined) =>
  n == null ? "—" : `${Number(n).toLocaleString("vi-VN")} đ`;
const when = (s: string | null | undefined) => (s ? new Date(s).toLocaleString("vi-VN") : "—");

function apiOrigin() {
  return getApiBase() || window.location.origin;
}

function copy(text: string) {
  void navigator.clipboard?.writeText(text).then(
    () => toast.success("Đã copy"),
    () => toast.error("Không copy được"),
  );
}

async function api() {
  return import("@/lib/api/onepay-api");
}

export function OnePayCollectionIntegration({ sub = "ket-noi" }: { sub?: CollectSub }) {
  const [cfg, setCfg] = useState<OnePayConfig | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const { fetchOnePayConfig } = await api();
      setCfg(await fetchOnePayConfig());
      setLoadError(null);
    } catch (e: any) {
      setLoadError(e?.message ?? "Không tải được cấu hình OnePay");
    }
  }, []);

  useEffect(() => {
    if (isApiEnabled()) reload().catch(() => undefined);
  }, [reload]);

  if (!isApiEnabled()) {
    return (
      <CfgCard
        icon="payments"
        title="Thu hộ OnePay"
        desc="Cần kết nối API máy chủ để cấu hình thu hộ OnePay."
      />
    );
  }

  return (
    <section className="card stack">
      {sub === "ket-noi" ? (
        <CfgHeader
          icon="payments"
          title="Thu hộ OnePay PayCollect (tài khoản ảo)"
          tags={[
            { label: "Chế độ TEST", tone: "warn" },
            cfg
              ? cfg.environment === "PRODUCTION"
                ? { label: "Môi trường thật", tone: "err" }
                : { label: "Sandbox", tone: "info" }
              : null,
            cfg
              ? cfg.enabled
                ? { label: "Đang bật", tone: "ok" }
                : { label: "Đang tắt", tone: "warn" }
              : null,
          ]}
          desc="Chế độ TEST chỉ ghi nhận tiền cho hoá đơn test, không đụng đơn hàng và phiếu thu thật."
        />
      ) : (
        <CfgHeader
          icon="payments"
          title={sub === "hoa-don" ? "Hoá đơn test · OnePay" : "Nhật ký · OnePay"}
        />
      )}
      {loadError ? (
        <div className="lab" style={{ color: "var(--error)" }}>
          {loadError}
        </div>
      ) : null}
      {sub === "ket-noi" ? (
        cfg ? (
          <ConnectionPanel cfg={cfg} onSaved={setCfg} />
        ) : null
      ) : sub === "hoa-don" ? (
        <InvoicesPanel cfg={cfg} />
      ) : (
        <LogsPanel />
      )}
    </section>
  );
}

function ConnectionPanel({
  cfg,
  onSaved,
}: {
  cfg: OnePayConfig;
  onSaved: (c: OnePayConfig) => void;
}) {
  const defaultIpn = `${apiOrigin()}${IPN_PATH}`;
  const [enabled, setEnabled] = useState(cfg.enabled);
  const [receiptCollectEnabled, setReceiptCollectEnabled] = useState(!!cfg.receiptCollectEnabled);
  const [orderCollectApp, setOrderCollectApp] = useState(cfg.orderCollectApp !== false);
  const [orderCollectCustomer, setOrderCollectCustomer] = useState(
    cfg.orderCollectCustomer !== false,
  );
  const [orderCollectGuest, setOrderCollectGuest] = useState(cfg.orderCollectGuest !== false);
  const [environment, setEnvironment] = useState(cfg.environment);
  const [partnerId, setPartnerId] = useState(cfg.partnerId ?? "");
  const [partnerKey, setPartnerKey] = useState("");
  const [ipnUrl, setIpnUrl] = useState(cfg.ipnUrl ?? defaultIpn);
  const [ttl, setTtl] = useState(String(cfg.invoiceTtlHours));
  const [signatureRequired, setSignatureRequired] = useState(cfg.signatureRequired);
  const [insecureSsl, setInsecureSsl] = useState(cfg.insecureSsl);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const save = async () => {
    const hours = Math.round(Number(ttl));
    if (!Number.isFinite(hours) || hours < 1)
      return toast.error("Thời hạn hoá đơn tối thiểu 1 giờ");
    if (enabled && !partnerId.trim()) return toast.error("Bật OnePay cần nhập Partner ID");
    if (enabled && !cfg.partnerKeyConfigured && !partnerKey.trim())
      return toast.error("Bật OnePay cần nhập Partner key");
    if (receiptCollectEnabled && !enabled)
      return toast.error("Bật thu hộ phiếu thu cần bật OnePay trước");
    if (
      environment === "PRODUCTION" &&
      cfg.environment !== "PRODUCTION" &&
      !(await askConfirm(
        "Chuyển sang môi trường thật onepay.vn? Tiền chuyển vào tài khoản ảo là tiền thật.",
      ))
    )
      return;
    setSaving(true);
    void (async () => {
      try {
        const { putOnePayConfig } = await api();
        const saved = await putOnePayConfig({
          enabled,
          receiptCollectEnabled,
          orderCollectApp,
          orderCollectCustomer,
          orderCollectGuest,
          environment,
          partnerId: partnerId.trim(),
          partnerKey: partnerKey.trim() || undefined,
          ipnUrl: ipnUrl.trim(),
          invoiceTtlHours: hours,
          signatureRequired,
          insecureSsl,
        });
        onSaved(saved);
        setPartnerKey("");
        toast.success("Đã lưu cấu hình OnePay");
      } catch (e: any) {
        toast.error(e?.message ?? "Lưu cấu hình OnePay thất bại");
      } finally {
        setSaving(false);
      }
    })();
  };

  const test = () => {
    setTesting(true);
    void (async () => {
      try {
        const { testOnePayConnection } = await api();
        const r = await testOnePayConnection();
        if (r.ok) toast.success(r.message);
        else toast.error(r.message);
      } catch (e: any) {
        toast.error(e?.message ?? "Test kết nối thất bại");
      } finally {
        setTesting(false);
      }
    })();
  };

  return (
    <>
      <div className="cfg-grid">
        <CfgToggle
          label="Thu hộ OnePay"
          checked={enabled}
          onChange={(v) => {
            setEnabled(v);
            if (!v) setReceiptCollectEnabled(false);
          }}
        />
        <CfgToggle
          label="Bật thu hộ cho phiếu thu"
          checked={receiptCollectEnabled}
          disabled={!enabled}
          onChange={setReceiptCollectEnabled}
        />
        <CfgToggle
          label="App khách hàng"
          checked={orderCollectApp}
          disabled={!enabled}
          onChange={setOrderCollectApp}
        />
        <CfgToggle
          label="Web - khách đã đăng nhập"
          checked={orderCollectCustomer}
          disabled={!enabled}
          onChange={setOrderCollectCustomer}
        />
        <CfgToggle
          label="Web - khách ẩn danh"
          checked={orderCollectGuest}
          disabled={!enabled}
          onChange={setOrderCollectGuest}
        />
        <CfgNote>
          Khi tắt OnePay, IPN gọi về bị từ chối và không tạo được hoá đơn. Thu hộ phiếu thu: QR
          phiếu thu (web + app Nộp tiền) ưu tiên VA OnePay, đủ tiền tự xác nhận; tắt hoặc OnePay lỗi
          thì dùng QR TK nhận tiền nộp (Bảo trì → Nộp tiền). Kênh QR thu cước tắt thì khách tạo đơn
          ở kênh đó không thấy QR, vẫn trả cước như luồng cũ; đơn đã có QR trước khi tắt vẫn ghi
          nhận nếu khách chuyển tiền.
        </CfgNote>
        <CfgSeg
          label="Môi trường"
          value={environment}
          options={[
            { value: "SANDBOX", label: "Test" },
            { value: "PRODUCTION", label: "Thật" },
          ]}
          onChange={(v) => setEnvironment(v)}
        />
        <CfgField label="Partner ID (merchant_id)">
          <CfgInput
            value={partnerId}
            onChange={(e) => setPartnerId(e.target.value)}
            placeholder="Sandbox: TESTPC1"
          />
        </CfgField>
        <CfgField label="Partner key" saved={cfg.partnerKeyConfigured}>
          <SecretInput
            name="onepay-partner-key"
            value={partnerKey}
            onChange={(e) => setPartnerKey(e.target.value)}
            placeholder={cfg.partnerKeyConfigured ? "Nhập key mới để thay" : "OnePay cấp"}
          />
        </CfgField>
        <CfgField label="Thời hạn hoá đơn (giờ)">
          <CfgInput type="number" min={1} value={ttl} onChange={(e) => setTtl(e.target.value)} />
        </CfgField>
        <CfgUrl
          label="URL IPN gửi OnePay cấu hình"
          url={ipnUrl || defaultIpn}
          emptyText=""
          copiedText="Đã copy URL IPN"
        />
        <CfgField
          label="URL IPN đã đăng ký với OnePay (dùng để kiểm chữ ký — phải trùng URL OnePay gọi)"
          wide
        >
          <span className="box input-box">
            <input
              className="num"
              value={ipnUrl}
              onChange={(e) => setIpnUrl(e.target.value)}
              placeholder={defaultIpn}
            />
            <button type="button" className="text-act" onClick={() => setIpnUrl(defaultIpn)}>
              Mặc định
            </button>
          </span>
        </CfgField>
        <div className="lab muted cfg-wide">
          OnePay gọi <code>PUT {IPN_PATH}?id=…</code>, ký OWS1 bằng partner key. CPN trả{" "}
          <code>{'{"error_code":"0"}'}</code> khi đã nhận; trả lỗi thì OnePay gửi lại 3 lần, cách
          nhau 5 phút.
        </div>
        <CfgToggle
          label="Bắt buộc chữ ký IPN hợp lệ"
          checked={signatureRequired}
          onChange={setSignatureRequired}
        />
        <CfgToggle
          label="Bỏ kiểm chứng chỉ SSL khi gọi OnePay"
          checked={insecureSsl}
          onChange={setInsecureSsl}
        />
        <div className="lab muted cfg-wide">
          Chỉ tắt chữ ký tạm thời khi dò lỗi ký với OnePay. Chỉ bật bỏ SSL khi máy chủ báo lỗi chứng
          chỉ (PKIX).
        </div>
      </div>
      <CfgActs meta={`${cfg.baseUrl} · cập nhật ${when(cfg.updatedAt)}`}>
        <button type="button" className="btn tonal" onClick={test} disabled={testing}>
          {testing ? "Đang thử…" : "Test kết nối"}
        </button>
        <button type="button" className="btn" onClick={save} disabled={saving}>
          {saving ? "Đang lưu…" : "Lưu cấu hình OnePay"}
        </button>
      </CfgActs>
    </>
  );
}

const PAGE_SIZE = 20;

function PageBar({
  page,
  size,
  total,
  busy,
  onPage,
}: {
  page: number;
  size: number;
  total: number;
  busy?: boolean;
  onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / Math.max(1, size)));
  const from = total === 0 ? 0 : page * size + 1;
  const to = Math.min(total, (page + 1) * size);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
      <span>
        {total === 0 ? "0 bản ghi" : `${from}–${to} / ${total}`} · trang {page + 1}/{pages}
      </span>
      <div className="flex gap-1">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy || page <= 0}
          onClick={() => onPage(page - 1)}
        >
          Trước
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy || page + 1 >= pages}
          onClick={() => onPage(page + 1)}
        >
          Sau
        </Button>
      </div>
    </div>
  );
}

function SearchFilterBar({
  draft,
  setDraft,
  busy,
  qPlaceholder,
  stateOptions,
  stateAllLabel,
  onSearch,
  onClear,
}: {
  draft: OnePayListFilter;
  setDraft: (f: OnePayListFilter) => void;
  busy?: boolean;
  qPlaceholder: string;
  stateOptions: { value: string; label: string }[];
  stateAllLabel: string;
  onSearch: () => void;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-md border bg-muted/20 p-2">
      <div className="min-w-[160px] flex-1 space-y-1">
        <Label className="text-xs text-muted-foreground">Tìm kiếm</Label>
        <Input
          value={draft.q ?? ""}
          onChange={(e) => setDraft({ ...draft, q: e.target.value })}
          placeholder={qPlaceholder}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSearch();
          }}
        />
      </div>
      <div className="w-[140px] space-y-1">
        <Label className="text-xs text-muted-foreground">Từ ngày</Label>
        <Input
          type="date"
          value={draft.from ?? ""}
          onChange={(e) => setDraft({ ...draft, from: e.target.value })}
        />
      </div>
      <div className="w-[140px] space-y-1">
        <Label className="text-xs text-muted-foreground">Đến ngày</Label>
        <Input
          type="date"
          value={draft.to ?? ""}
          onChange={(e) => setDraft({ ...draft, to: e.target.value })}
        />
      </div>
      <div className="w-[170px] space-y-1">
        <Label className="text-xs text-muted-foreground">Trạng thái</Label>
        <select
          className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          value={draft.state ?? ""}
          onChange={(e) => setDraft({ ...draft, state: e.target.value })}
        >
          <option value="">{stateAllLabel}</option>
          {stateOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex gap-1 pb-0.5">
        <Button type="button" size="sm" disabled={busy} onClick={onSearch}>
          Tìm kiếm
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onClear}>
          Xoá lọc
        </Button>
      </div>
    </div>
  );
}

function InvoicesPanel({ cfg }: { cfg: OnePayConfig | null }) {
  const [rows, setRows] = useState<OnePayInvoice[] | null>(null);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<OnePayListFilter>(emptyFilter);
  const [applied, setApplied] = useState<OnePayListFilter>(emptyFilter);
  const appliedRef = useRef(applied);
  appliedRef.current = applied;
  const [payerName, setPayerName] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [open, setOpen] = useState<OnePayInvoice | null>(null);
  const [sample, setSample] = useState<OnePaySampleIpn | null>(null);

  const load = useCallback(async (p = 0, filter?: OnePayListFilter) => {
    try {
      const { fetchOnePayInvoices } = await api();
      const slice = await fetchOnePayInvoices(p, PAGE_SIZE, filter ?? appliedRef.current);
      setRows(slice.content);
      setPage(slice.page);
      setTotal(slice.totalElements);
    } catch (e: any) {
      toast.error(e?.message ?? "Không tải được hoá đơn OnePay");
    }
  }, []);

  useEffect(() => {
    load(0).catch(() => undefined);
  }, [load]);

  const applySearch = () => {
    setApplied(draft);
    void load(0, draft);
  };

  const clearSearch = () => {
    const empty = emptyFilter();
    setDraft(empty);
    setApplied(empty);
    void load(0, empty);
  };

  const replace = (inv: OnePayInvoice) => {
    setRows((prev) => (prev ?? []).map((r) => (r.id === inv.id ? inv : r)));
    setOpen((o) => (o && o.id === inv.id ? inv : o));
  };

  const act = (fn: () => Promise<void>) => {
    setBusy(true);
    void (async () => {
      try {
        await fn();
      } catch (e: any) {
        toast.error(e?.message ?? "Thao tác thất bại");
      } finally {
        setBusy(false);
      }
    })();
  };

  const create = () => {
    const amt = Math.round(Number(amount));
    if (!payerName.trim()) return toast.error("Nhập tên người nộp");
    if (!Number.isFinite(amt) || amt <= 0) return toast.error("Số tiền phải là số nguyên dương");
    act(async () => {
      const { createOnePayInvoice } = await api();
      const inv = await createOnePayInvoice({
        payerName: payerName.trim(),
        amount: amt,
        description: description.trim() || undefined,
      });
      setOpen(inv);
      setPayerName("");
      setAmount("");
      setDescription("");
      await load(0);
      toast.success(`Đã tạo hoá đơn · TK ${inv.accountNumber ?? "?"}`);
    });
  };

  const refresh = (inv: OnePayInvoice) =>
    act(async () => {
      const r = await (await api()).refreshOnePayInvoice(inv.id);
      replace(r);
      if (r.lastError) toast.warning(r.lastError);
      else toast.success(`Trạng thái: ${STATE_LABEL[r.state] ?? r.state}`);
    });

  const refreshAll = async () => {
    if (
      !(await askConfirm(
        "Hỏi lại OnePay mọi hoá đơn còn chưa thanh toán (tối đa 100/lần)? Dùng khi IPN lệch domain hoặc mất callback.",
      ))
    )
      return;
    act(async () => {
      const r = await (await api()).refreshOnePayUnpaidInvoices(100);
      const parts = [
        `Đã kiểm ${r.checked}`,
        r.paid ? `${r.paid} đã thanh toán` : null,
        r.expired ? `${r.expired} hết hạn` : null,
        r.unchanged ? `${r.unchanged} chưa đổi` : null,
        r.failed ? `${r.failed} lỗi` : null,
      ].filter(Boolean);
      if (r.paid > 0) toast.success(parts.join(" · "));
      else toast.message(parts.join(" · "));
      if (r.unpaidRemaining > 0) {
        toast.message(`Còn ~${r.unpaidRemaining} chưa thanh toán — bấm lại nếu cần kiểm tiếp.`);
      }
      if (r.errors?.length) toast.warning(r.errors.slice(0, 3).join("; "));
      await load(page);
    });
  };

  const toggleAccount = async (inv: OnePayInvoice) => {
    const active = inv.vaState !== "active";
    if (
      !active &&
      !(await askConfirm(
        `Khoá tài khoản ảo ${inv.accountNumber}? Khách không chuyển vào được nữa.`,
      ))
    )
      return;
    act(async () => {
      replace(await (await api()).setOnePayAccountState(inv.id, active));
      toast.success(active ? "Đã mở tài khoản ảo" : "Đã khoá tài khoản ảo");
    });
  };

  const remove = async (inv: OnePayInvoice) => {
    if (
      !(await askConfirm(
        `Xoá hoá đơn test ${inv.invoiceReference} khỏi CPN? Tài khoản ảo bên OnePay vẫn còn — nên khoá trước.`,
      ))
    )
      return;
    act(async () => {
      await (await api()).deleteOnePayInvoice(inv.id);
      if (open?.id === inv.id) setOpen(null);
      toast.success("Đã xoá");
      const nextPage = rows && rows.length <= 1 && page > 0 ? page - 1 : page;
      await load(nextPage);
    });
  };

  const makeSample = (inv: OnePayInvoice) =>
    act(async () => {
      setSample(
        await (await api()).buildOnePaySampleIpn({ invoiceId: inv.id, apiBase: apiOrigin() }),
      );
    });

  const curl = sample
    ? [
        `curl -X ${sample.method} '${sample.url}'`,
        ...Object.entries(sample.headers).map(([k, v]) => `  -H '${k}: ${v}'`),
        `  -d '${sample.body}'`,
      ].join(" \\\n")
    : "";

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Mỗi hoá đơn CPN tạo một tài khoản ảo riêng trên OnePay, kèm QR đã có sẵn số tiền. Chờ IPN tự
        xác nhận, hoặc bấm <b>Kiểm tra</b> / <b>Kiểm tra tất cả</b> để hỏi lại OnePay (dùng khi mất
        callback / IPN lệch domain). Sandbox / Prod đều ghi vào tab Nhật ký. Cổng merchant OnePay
        (đối soát ngoài CPN): sandbox <span className="font-mono">mtf.onepay.vn</span>, thật{" "}
        <span className="font-mono">onepay.vn</span> — hỏi OnePay cấp tài khoản partner.
      </p>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_160px_1fr_auto]">
        <Input
          value={payerName}
          onChange={(e) => setPayerName(e.target.value)}
          placeholder="Tên người nộp (không dấu)"
        />
        <Input
          type="number"
          min={1}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Số tiền"
        />
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Nội dung (tuỳ chọn)"
        />
        <Button type="button" onClick={create} disabled={busy || !cfg?.enabled}>
          Tạo hoá đơn
        </Button>
      </div>
      {cfg && !cfg.enabled ? (
        <p className="text-xs text-muted-foreground">
          Bật thu hộ OnePay ở tab Kết nối để tạo hoá đơn.
        </p>
      ) : null}

      <SearchFilterBar
        draft={draft}
        setDraft={setDraft}
        busy={busy}
        qPlaceholder="Mã HĐ / TK ảo / đơn / người nộp…"
        stateAllLabel="Mọi trạng thái"
        stateOptions={INVOICE_STATES.map((s) => ({ value: s, label: STATE_LABEL[s] }))}
        onSearch={applySearch}
        onClear={clearSearch}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => load(page)}
        >
          Làm mới trang
        </Button>
        <Button type="button" size="sm" disabled={busy || !cfg?.enabled} onClick={refreshAll}>
          {busy ? "Đang kiểm…" : "Kiểm tra tất cả chưa thanh toán"}
        </Button>
      </div>

      {open ? <InvoiceCard inv={open} onClose={() => setOpen(null)} /> : null}

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Mã / TK ảo</th>
              <th className="px-3 py-2 text-left font-medium">Người nộp</th>
              <th className="px-3 py-2 text-right font-medium">Số tiền</th>
              <th className="px-3 py-2 text-left font-medium">Trạng thái</th>
              <th className="px-3 py-2 text-right font-medium">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {rows == null ? (
              <tr>
                <td colSpan={5} className="px-3 py-3 text-center text-xs text-muted-foreground">
                  Đang tải…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-3 text-center text-xs text-muted-foreground">
                  Chưa có hoá đơn OnePay
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t align-middle">
                  <td className="px-3 py-2 font-mono text-xs">
                    {r.invoiceReference}
                    <div className="text-muted-foreground">
                      {r.accountNumber ?? "—"} · {r.bankName ?? ""}{" "}
                      {r.vaState === "inactive" ? "· đã khoá" : ""}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {r.payerName}
                    {r.description ? (
                      <div className="text-xs text-muted-foreground">{r.description}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {money(r.amount)}
                    {r.paidAmount != null && Number(r.paidAmount) !== Number(r.amount) ? (
                      <div className="text-xs text-destructive">về {money(r.paidAmount)}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    <StateBadge state={r.state} />
                    {r.paidTransId ? (
                      <div className="mt-0.5 font-mono text-xs text-muted-foreground">
                        {r.paidTransId} · {when(r.paidAt)}
                      </div>
                    ) : r.state === "UNPAID" ? (
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        hạn {when(r.expiresAt)}
                      </div>
                    ) : null}
                    {r.lastError ? (
                      <div className="mt-0.5 text-xs text-destructive">{r.lastError}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap justify-end gap-1">
                      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(r)}>
                        QR
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => refresh(r)}
                      >
                        Kiểm tra
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => toggleAccount(r)}
                      >
                        {r.vaState === "active" ? "Khoá TK" : "Mở TK"}
                      </Button>
                      {cfg?.environment === "SANDBOX" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => makeSample(r)}
                        >
                          IPN mẫu
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        disabled={busy}
                        onClick={() => remove(r)}
                      >
                        Xoá
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <PageBar
        page={page}
        size={PAGE_SIZE}
        total={total}
        busy={busy}
        onPage={(p) => void load(p)}
      />

      {sample ? (
        <div className="space-y-2 rounded-md border bg-muted/30 p-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-medium">IPN mẫu đã ký (giả lập OnePay báo có tiền)</span>
            <div className="flex gap-1">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6"
                onClick={() => copy(curl)}
              >
                Copy curl
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6"
                onClick={() => setSample(null)}
              >
                Đóng
              </Button>
            </div>
          </div>
          <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded bg-background p-2 font-mono">
            {curl}
          </pre>
          <p className="text-muted-foreground">
            Chỉ có ở Sandbox. Chạy curl này sẽ ghi nhận thanh toán cho hoá đơn test — dùng khi
            OnePay chưa cấu hình URL IPN. Chữ ký gắn với URL, nên phải gọi đúng URL ở trên.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function StateBadge({ state }: { state: OnePayInvoiceState }) {
  const variant =
    state === "PAID" ? "default" : state === "AMOUNT_MISMATCH" ? "destructive" : "outline";
  return <Badge variant={variant}>{STATE_LABEL[state] ?? state}</Badge>;
}

function InvoiceCard({ inv, onClose }: { inv: OnePayInvoice; onClose: () => void }) {
  const [img, setImg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setImg(null);
    if (inv.qrData) {
      QRCode.toDataURL(inv.qrData, { margin: 1, width: 280, errorCorrectionLevel: "M" })
        .then((u) => alive && setImg(u))
        .catch(() => undefined);
    }
    return () => {
      alive = false;
    };
  }, [inv.qrData]);

  return (
    <div className="flex flex-wrap gap-4 rounded-md border p-3">
      <div className="flex h-[200px] w-[200px] items-center justify-center rounded bg-white">
        {img ? (
          <img src={img} alt="QR chuyển khoản" className="h-full w-full" />
        ) : (
          <span className="text-xs text-muted-foreground">
            {inv.qrData ? "Đang vẽ QR…" : "OnePay chưa trả QR"}
          </span>
        )}
      </div>
      <div className="min-w-[240px] flex-1 space-y-1 text-sm">
        <div className="flex items-center justify-between">
          <span className="font-medium">Hoá đơn {inv.invoiceReference}</span>
          <Button type="button" size="sm" variant="ghost" onClick={onClose}>
            Đóng
          </Button>
        </div>
        <Row label="Ngân hàng" value={inv.bankName ?? "—"} />
        <Row label="Số tài khoản ảo" value={inv.accountNumber ?? "—"} mono copyable />
        <Row label="Chủ tài khoản" value={inv.payerName} />
        <Row label="Số tiền" value={money(inv.amount)} />
        <Row label="Trạng thái" value={STATE_LABEL[inv.state] ?? inv.state} />
        <Row label="Hạn" value={when(inv.expiresAt)} />
        <p className="pt-1 text-xs text-muted-foreground">
          Quét QR hoặc chuyển khoản đúng số tài khoản ảo — CPN khớp theo tài khoản, không theo nội
          dung chuyển khoản.
        </p>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  copyable,
}: {
  label: string;
  value: string;
  mono?: boolean;
  copyable?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-32 shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className={mono ? "select-all font-mono" : ""}>{value}</span>
      {copyable && value !== "—" ? (
        <Button type="button" size="sm" variant="ghost" className="h-6" onClick={() => copy(value)}>
          Copy
        </Button>
      ) : null}
    </div>
  );
}

function LogsPanel() {
  const [logs, setLogs] = useState<OnePayCallLog[] | null>(null);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const [draft, setDraft] = useState<OnePayListFilter>(emptyFilter);
  const [applied, setApplied] = useState<OnePayListFilter>(emptyFilter);
  const appliedRef = useRef(applied);
  appliedRef.current = applied;

  const load = useCallback((p = 0, filter?: OnePayListFilter) => {
    setLoading(true);
    void (async () => {
      try {
        const { fetchOnePayLogs } = await api();
        const slice = await fetchOnePayLogs(p, PAGE_SIZE, filter ?? appliedRef.current);
        setLogs(slice.content);
        setPage(slice.page);
        setTotal(slice.totalElements);
        setOpen(null);
      } catch (e: any) {
        toast.error(e?.message ?? "Không tải được nhật ký");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    load(0);
  }, [load]);

  const applySearch = () => {
    setApplied(draft);
    load(0, draft);
  };

  const clearSearch = () => {
    const empty = emptyFilter();
    setDraft(empty);
    setApplied(empty);
    load(0, empty);
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Toàn bộ nhật ký (Sandbox + Prod), tải theo trang: CPN → OnePay (OUT) và IPN OnePay → CPN
        (IN). Mất callback thì vào tab Hoá đơn → Kiểm tra / Kiểm tra tất cả.
      </p>
      <SearchFilterBar
        draft={draft}
        setDraft={setDraft}
        busy={loading}
        qPlaceholder="Mã tham chiếu / GD / lệnh / nội dung…"
        stateAllLabel="Mọi kết quả"
        stateOptions={LOG_RESULTS.map((r) => ({ value: r, label: RESULT_LABEL[r] ?? r }))}
        onSearch={applySearch}
        onClear={clearSearch}
      />
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => load(page)}
          disabled={loading}
        >
          {loading ? "Đang tải…" : "Làm mới"}
        </Button>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Thời gian</th>
              <th className="px-3 py-2 text-left font-medium">Chiều</th>
              <th className="px-3 py-2 text-left font-medium">Lệnh</th>
              <th className="px-3 py-2 text-left font-medium">Mã tham chiếu / GD</th>
              <th className="px-3 py-2 text-right font-medium">Số tiền</th>
              <th className="px-3 py-2 text-left font-medium">Kết quả</th>
              <th className="px-3 py-2 text-right font-medium">ms</th>
            </tr>
          </thead>
          <tbody>
            {!logs || logs.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-3 text-center text-xs text-muted-foreground">
                  {logs ? "Chưa có lệnh nào" : "Đang tải…"}
                </td>
              </tr>
            ) : (
              logs.flatMap((l) => {
                const rows = [
                  <tr
                    key={l.id}
                    className="cursor-pointer border-t align-top hover:bg-muted/30"
                    onClick={() => setOpen(open === l.id ? null : l.id)}
                  >
                    <td className="whitespace-nowrap px-3 py-2">{when(l.calledAt)}</td>
                    <td className="px-3 py-2">
                      <Badge variant="outline">{l.direction}</Badge>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {l.action}
                      {l.httpStatus != null ? (
                        <div className="text-muted-foreground">HTTP {l.httpStatus}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {l.reference ?? "—"}
                      {l.transId ? <div className="text-muted-foreground">{l.transId}</div> : null}
                    </td>
                    <td className="px-3 py-2 text-right">{money(l.amount)}</td>
                    <td className="px-3 py-2">
                      <Badge variant={GOOD_RESULTS.has(l.result) ? "default" : "destructive"}>
                        {RESULT_LABEL[l.result] ?? l.result}
                      </Badge>
                      {l.message ? <div className="mt-0.5 text-xs">{l.message}</div> : null}
                    </td>
                    <td className="px-3 py-2 text-right text-xs">{l.durationMs ?? "—"}</td>
                  </tr>,
                ];
                if (open === l.id) {
                  rows.push(
                    <tr key={`${l.id}-body`} className="bg-muted/20">
                      <td colSpan={7} className="px-3 py-2">
                        <div className="grid gap-2 text-xs md:grid-cols-2">
                          <div>
                            <div className="mb-1 font-medium">Request</div>
                            <pre className="whitespace-pre-wrap break-all font-mono">
                              {l.requestBody ?? "—"}
                            </pre>
                          </div>
                          <div>
                            <div className="mb-1 font-medium">Response</div>
                            <pre className="whitespace-pre-wrap break-all font-mono">
                              {l.responseBody ?? "—"}
                            </pre>
                          </div>
                        </div>
                      </td>
                    </tr>,
                  );
                }
                return rows;
              })
            )}
          </tbody>
        </table>
      </div>
      <PageBar page={page} size={PAGE_SIZE} total={total} busy={loading} onPage={(p) => load(p)} />
      <p className="text-xs text-muted-foreground">Bấm vào dòng để xem request / response gốc.</p>
    </div>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
