import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ProtectedPage } from "@/components/AppShell";
import { M3Page } from "@/components/M3Page";
import { M3Confirm } from "@/components/m3/M3Confirm";
import { PodPhotoInput } from "@/components/PodPhotoInput";
import { NameInput } from "@/components/NameInput";
import { isApiEnabled } from "@/lib/api/client";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  emptyMaintenancePolicy,
  fetchDepositAccount,
  putDepositAccount,
  type DepositAccount,
  fetchInvoiceAutoIssue,
  fetchMaintenancePolicy,
  putInvoiceAutoIssue,
  type InvoiceAutoIssuePolicy,
  fetchMobileAppVersion,
  fetchSessionPolicy,
  fetchTrackLookupPolicy,
  fetchOfficeScreens,
  rotateOfficeScreen,
  putTrackLookupPolicy,
  putMaintenancePolicy,
  putMobileAppVersion,
  putSessionPolicy,
  type MaintenancePolicy,
  type MobileAppVersionPolicy,
  type SessionPolicy,
  type TrackLookupPolicy,
  type OfficeScreenLink,
} from "@/lib/api/finance-config-api";
import { useAuth } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import {
  deleteScanVoice,
  fetchScanVoiceBlob,
  listScanVoices,
  scanVoiceLabel,
  uploadScanVoice,
  type ScanVoiceMeta,
  type ScanVoiceType,
} from "@/lib/api/scan-voice-api";
import { toast } from "sonner";

export const Route = createFileRoute("/bao-tri")({
  head: () => ({ meta: [{ title: "Cấu hình — X.E" }] }),
  component: () => (
    <ProtectedPage title="Cấu hình" screen="bao-tri" hidePageTitle>
      <M3Page>
        <Page />
      </M3Page>
    </ProtectedPage>
  ),
});

const CFG_TABS = [
  { id: "bao-tri", label: "Bảo trì", icon: "build" },
  { id: "phien", label: "Phiên đăng nhập", icon: "login" },
  { id: "tra-cuu", label: "Tra cứu", icon: "qr_code_2" },
  { id: "update", label: "Update", icon: "system_update" },
  { id: "giong-quet", label: "Giọng quét", icon: "record_voice_over" },
  { id: "hoa-don", label: "Hoá đơn", icon: "description" },
  { id: "nop-tien", label: "Nộp tiền", icon: "account_balance" },
] as const;
type CfgTabId = (typeof CFG_TABS)[number]["id"];

function Page() {
  const [tab, setTab] = useState<CfgTabId>("bao-tri");
  return (
    <div className="stack" style={{ gap: 16 }}>
      <h1 className="page-title">Cấu hình</h1>
      <div
        className="seg"
        role="tablist"
        aria-label="Nhóm cấu hình"
        style={{ alignSelf: "flex-start" }}
      >
        {CFG_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            className={tab === t.id ? "on" : undefined}
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
          >
            <span className="ms" aria-hidden="true">
              {t.icon}
            </span>
            {t.label}
          </button>
        ))}
      </div>
      {tab === "bao-tri" ? <MaintenanceTab /> : null}
      {tab === "phien" ? <SessionTab /> : null}
      {tab === "tra-cuu" ? <TrackLookupTab /> : null}
      {tab === "update" ? <MobileAppVersionTab /> : null}
      {tab === "giong-quet" ? <ScanVoiceTab /> : null}
      {tab === "hoa-don" ? <InvoiceAutoIssueTab /> : null}
      {tab === "nop-tien" ? <DepositAccountTab /> : null}
    </div>
  );
}

type VietQrBank = { bin: string; shortName: string; name: string };

const DEPOSIT_TEMPLATE_VARS = [
  { key: "{MA_NV}", label: "Mã NV" },
  { key: "{TEN_NV}", label: "Tên NV" },
  { key: "{MA_PHIEU}", label: "Mã phiếu" },
  { key: "{MA_VP}", label: "ID văn phòng" },
  { key: "{NGAY}", label: "Ngày thu tiền (ddMMyy)" },
] as const;
const DEFAULT_DEPOSIT_TEMPLATE = "{MA_NV} NOP {MA_PHIEU}";

/** Giống StaffDepositService.renderContent (BE) — chỉ để xem trước. */
function renderDepositContent(template: string, vars: Record<string, string>) {
  let s = template.trim() || DEFAULT_DEPOSIT_TEMPLATE;
  for (const [k, v] of Object.entries(vars)) s = s.split(k).join(v);
  const plain = s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return plain.slice(0, 50).trim();
}

/** Tài khoản nhận tiền NV nộp trên app — app tạo QR VietQR theo STK + nội dung chuyển khoản này. */
function DepositAccountTab() {
  const { session } = useAuth();
  const writable = canWrite(session?.role, "bao-tri");
  const [f, setF] = useState<DepositAccount | null>(null);
  const [banks, setBanks] = useState<VietQrBank[] | null>(null);
  const [banksFailed, setBanksFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!isApiEnabled()) return;
    fetchDepositAccount()
      .then((a) => {
        if (!cancelled)
          setF({ ...a, contentTemplate: a.contentTemplate || DEFAULT_DEPOSIT_TEMPLATE });
      })
      .catch((e: any) => {
        if (!cancelled) toast.error(e?.message ?? "Không tải được cấu hình nộp tiền");
      });
    fetch("https://api.vietqr.io/v2/banks")
      .then((r) => r.json())
      .then((j: { data?: VietQrBank[] }) => {
        if (cancelled) return;
        const rows = (j.data ?? []).filter((b) => b.bin && b.shortName);
        if (rows.length) setBanks(rows);
        else setBanksFailed(true);
      })
      .catch(() => {
        if (!cancelled) setBanksFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const bankOptions = useMemo(
    () =>
      (banks ?? []).map((b) => ({
        value: b.bin,
        label: `${b.shortName} — ${b.name}`,
        keywords: `${b.shortName} ${b.name} ${b.bin}`,
      })),
    [banks],
  );

  const sampleContent = useMemo(() => {
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, "0");
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const yy = String(today.getFullYear()).slice(-2);
    return renderDepositContent(f?.contentTemplate ?? "", {
      "{MA_NV}": session?.username || "anhnh",
      "{TEN_NV}": "Nguyen Hoang Anh",
      "{MA_PHIEU}": `PTVP_ND${yy}${mm}${dd}-001`,
      "{MA_VP}": "12",
      "{NGAY}": `${dd}${mm}${yy}`,
    });
  }, [f?.contentTemplate, session?.username]);

  const previewQr =
    f?.bankBin && f.accountNo
      ? `https://img.vietqr.io/image/${f.bankBin}-${f.accountNo}-qr_only.png?amount=145000&addInfo=${encodeURIComponent(
          sampleContent,
        )}${f.accountName ? `&accountName=${encodeURIComponent(f.accountName)}` : ""}`
      : "";

  const insertVar = (key: string) =>
    setF((prev) => {
      if (!prev) return prev;
      const cur = prev.contentTemplate ?? "";
      return { ...prev, contentTemplate: `${cur}${cur && !cur.endsWith(" ") ? " " : ""}${key}` };
    });

  const save = async () => {
    if (!f) return;
    if (!writable) return toast.error("Tài khoản không có quyền ghi màn này");
    if (!f.bankBin || !f.accountNo?.trim() || !f.accountName?.trim()) {
      return toast.error("Nhập đủ ngân hàng, số tài khoản và chủ tài khoản");
    }
    setSaving(true);
    try {
      const saved = await putDepositAccount({
        ...f,
        accountNo: f.accountNo.trim(),
        accountName: f.accountName.trim(),
        contentTemplate: (f.contentTemplate ?? "").trim() || DEFAULT_DEPOSIT_TEMPLATE,
      });
      setF(saved);
      toast.success("Đã lưu tài khoản nhận tiền nộp");
    } catch (e: any) {
      toast.error(e?.message ?? "Lưu cấu hình nộp tiền thất bại");
    } finally {
      setSaving(false);
    }
  };

  return (
    <CfgSection icon="account_balance" title="Tài khoản nhận tiền nhân viên nộp">
      {!f ? (
        <CfgLoading />
      ) : (
        <>
          <div className="cfg-grid">
            <Field label="Ngân hàng *">
              {banksFailed ? (
                <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
                  <CfgInput
                    className="num"
                    placeholder="Mã BIN (6 số)"
                    value={f.bankBin ?? ""}
                    disabled={!writable}
                    onChange={(e) =>
                      setF({ ...f, bankBin: e.target.value.replace(/\D/g, "").slice(0, 6) })
                    }
                  />
                  <CfgInput
                    placeholder="Tên ngân hàng"
                    value={f.bankName ?? ""}
                    disabled={!writable}
                    onChange={(e) => setF({ ...f, bankName: e.target.value })}
                  />
                </div>
              ) : (
                <SearchableSelect
                  value={f.bankBin ?? ""}
                  onValueChange={(bin) => {
                    const b = banks?.find((x) => x.bin === bin);
                    setF({
                      ...f,
                      bankBin: bin,
                      bankName: b ? `${b.shortName} (${b.name})` : f.bankName,
                    });
                  }}
                  placeholder={banks ? "Chọn ngân hàng" : "Đang tải danh sách ngân hàng…"}
                  disabled={!writable || !banks}
                  options={bankOptions}
                />
              )}
            </Field>
            <Field label="Số tài khoản *">
              <CfgInput
                className="num"
                value={f.accountNo ?? ""}
                disabled={!writable}
                inputMode="numeric"
                placeholder="Nhập số tài khoản"
                onChange={(e) =>
                  setF({ ...f, accountNo: e.target.value.replace(/[^0-9A-Za-z]/g, "") })
                }
              />
            </Field>
            <Field label="Chủ tài khoản *">
              <NameInput
                value={f.accountName ?? ""}
                disabled={!writable}
                placeholder="Nhập tên chủ tài khoản"
                onChange={(accountName) => setF({ ...f, accountName })}
              />
            </Field>
            <Field label="Nội dung chuyển khoản">
              <CfgInput
                value={f.contentTemplate ?? ""}
                disabled={!writable}
                maxLength={255}
                placeholder="Nhập mẫu nội dung"
                onChange={(e) => setF({ ...f, contentTemplate: e.target.value })}
              />
            </Field>
            {banksFailed ? (
              <div className="note cfg-wide">
                Không tải được danh sách ngân hàng VietQR — nhập mã BIN thủ công.
              </div>
            ) : null}
            <div
              className="cfg-wide"
              style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}
            >
              <span className="muted lab">Chèn nhanh:</span>
              {DEPOSIT_TEMPLATE_VARS.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  className="pill sm"
                  style={{ height: 32 }}
                  title={v.label}
                  disabled={!writable}
                  onClick={() => insertVar(v.key)}
                >
                  {v.key}
                </button>
              ))}
            </div>
            <div className="upload cfg-wide">
              <span
                className="thumb"
                style={{
                  width: 96,
                  height: 96,
                  background: previewQr ? "#fff" : undefined,
                  overflow: "hidden",
                }}
              >
                {previewQr ? (
                  <img
                    src={previewQr}
                    alt="QR VietQR xem trước"
                    style={{ width: "100%", height: "100%", objectFit: "contain" }}
                  />
                ) : (
                  <span className="ms" aria-hidden="true" style={{ fontSize: 40 }}>
                    qr_code_2
                  </span>
                )}
              </span>
              <div style={{ flex: "1 1 200px" }}>
                <div style={{ fontWeight: 500 }}>Xem trước QR (145.000đ)</div>
                <div className="muted lab">
                  Nội dung tự bỏ dấu, chỉ giữ chữ và số, tối đa 50 ký tự. Ví dụ thực tế:{" "}
                  <span className="num" style={{ fontWeight: 500, color: "var(--on-surface)" }}>
                    {sampleContent || "—"}
                  </span>
                </div>
                <div className="muted lab">
                  {previewQr
                    ? "Quét thử bằng app ngân hàng để kiểm tra đúng tài khoản trước khi lưu."
                    : "Chọn ngân hàng và nhập số tài khoản để xem QR."}
                </div>
              </div>
            </div>
          </div>
          <CfgSave
            label="Lưu"
            saving={saving}
            disabled={!writable}
            confirmTitle="Lưu cấu hình nộp tiền?"
            confirmBody="Nhân viên sẽ nộp tiền vào tài khoản này từ lần tạo mã QR tiếp theo. Bạn kiểm tra kỹ số tài khoản."
            onSave={() => void save()}
          />
        </>
      )}
    </CfgSection>
  );
}

/** Bật/tắt tự xuất HĐĐT sau 3 tiếng — lưu ngay khi gạt (MISA phát hành thật, không huỷ được). */
function InvoiceAutoIssueTab() {
  const { session } = useAuth();
  const writable = canWrite(session?.role, "bao-tri");
  const [f, setF] = useState<InvoiceAutoIssuePolicy | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!isApiEnabled()) return;
    fetchInvoiceAutoIssue()
      .then((p) => {
        if (!cancelled) setF(p);
      })
      .catch((e: any) => {
        if (!cancelled) toast.error(e?.message ?? "Không tải được cấu hình hoá đơn");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const [asking, setAsking] = useState<boolean | null>(null);

  const toggle = async (enabled: boolean) => {
    if (!writable) return toast.error("Tài khoản không có quyền ghi màn này");
    setSaving(true);
    try {
      setF(await putInvoiceAutoIssue(enabled));
      toast.success(enabled ? "Đã bật tự xuất hoá đơn" : "Đã tắt tự xuất hoá đơn");
    } catch (e: any) {
      toast.error(e?.message ?? "Lưu cấu hình hoá đơn thất bại");
    } finally {
      setSaving(false);
    }
  };

  return (
    <CfgSection icon="description" title="Tự xuất hoá đơn điện tử (MISA)">
      {!f ? (
        <CfgLoading />
      ) : (
        <div className="cfg-grid">
          <CfgToggle
            label="Tự xuất hoá đơn sau 3 tiếng kể từ khi thanh toán (đơn đã giao thành công)"
            checked={f.enabled}
            disabled={saving || !writable}
            onChange={(v) => setAsking(v)}
          />
          {f.enabled && f.since ? (
            <div className="lab cfg-wide" style={{ color: "var(--success, #1b873f)" }}>
              Đang bật từ {new Date(f.since).toLocaleString("vi-VN")}.
            </div>
          ) : null}
          <ul className="note cfg-wide" style={{ margin: 0, paddingLeft: 32 }}>
            <li>
              Mốc thanh toán: gửi trả = lúc nhập kho gửi; nhận trả / COD = lúc giao thành công.
            </li>
            <li>
              Chỉ tự xuất khi đơn đã giao thành công (đơn gửi trả bị hoàn: đã hoàn xong về người
              gửi) và đã quá 3 tiếng kể từ mốc thanh toán.
            </li>
            <li>
              Khách muốn HĐ công ty phải yêu cầu trước lúc đó; quá hạn hệ thống xuất HĐ cá nhân.
            </li>
            <li>HĐ cá nhân ghi tên + SĐT người trả cước, hình thức thanh toán tiền mặt.</li>
            <li>
              Không tự xuất: đơn công nợ, đơn còn nợ cước, đơn kế toán đã tích bỏ xuất tự động, đơn
              lần trước lỗi.
            </li>
            <li>Đơn thanh toán trước lúc bật không tự xuất bù — dùng nút Xuất bù.</li>
          </ul>
        </div>
      )}
      <M3Confirm
        open={asking != null}
        onOpenChange={(v) => !v && setAsking(null)}
        title={asking ? "Bật tự xuất hoá đơn điện tử thật qua MISA?" : "Tắt tự xuất hoá đơn?"}
        body={
          asking
            ? "Từ lúc bật, đơn đã giao thành công (hoặc hoàn xong) và quá 3 tiếng kể từ khi thanh toán sẽ tự xuất: HĐ doanh nghiệp nếu khách đã yêu cầu, còn lại HĐ cá nhân. Đơn thanh toán trước lúc bật không tự xuất — dùng nút Xuất bù ở màn Quản lý hoá đơn / Giao thành công."
            : "Sau khi tắt, chỉ đơn có yêu cầu HĐ công ty tự xuất khi giao thành công (như trước)."
        }
        confirmLabel={asking ? "Bật tự xuất" : "Tắt tự xuất"}
        confirmDanger={!!asking}
        onConfirm={() => {
          if (asking != null) void toggle(asking);
        }}
      />
    </CfgSection>
  );
}

function MaintenanceTab() {
  const { session } = useAuth();
  const writable = canWrite(session?.role, "bao-tri");
  const [f, setF] = useState<MaintenancePolicy>(emptyMaintenancePolicy());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isApiEnabled()) {
        setLoading(false);
        return;
      }
      try {
        const p = await fetchMaintenancePolicy();
        if (!cancelled) setF(p);
      } catch (e: any) {
        if (!cancelled) toast.error(e?.message ?? "Không tải được cấu hình bảo trì");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setChannel = (key: keyof MaintenancePolicy, v: boolean) => {
    setF((prev) => {
      const next = { ...prev, [key]: v };
      if (key !== "blockAll" && key !== "enabled") {
        next.blockAll = false;
      }
      if (key === "blockAll" && v) {
        next.blockAppStaff = true;
        next.blockAppCustomer = true;
        next.blockWebStaff = true;
        next.blockWebCustomer = true;
      }
      return next;
    });
  };

  const save = async () => {
    if (!writable) return toast.error("Tài khoản không có quyền ghi màn này");
    setSaving(true);
    try {
      if (!isApiEnabled()) throw new Error("API chưa cấu hình — không lưu được lên máy chủ");
      const saved = await putMaintenancePolicy({
        ...f,
        title: f.title.trim() || "Hệ thống đang bảo trì",
        message: f.message.trim() || "Vui lòng quay lại sau. Xin cảm ơn.",
      });
      setF(saved);
      toast.success("Đã lưu cấu hình bảo trì");
    } catch (e: any) {
      toast.error(e?.message ?? "Lưu cấu hình bảo trì thất bại");
    } finally {
      setSaving(false);
    }
  };

  return (
    <CfgSection icon="build" title="Cấu hình bảo trì">
      {loading ? (
        <CfgLoading />
      ) : (
        <>
          <div className="cfg-grid">
            <CfgToggle
              label="Bật bảo trì"
              checked={f.enabled}
              onChange={(v) => setF({ ...f, enabled: v })}
            />
            <CfgCheck
              label="Tất cả (app + web, NV + KH)"
              checked={f.blockAll}
              onChange={(v) => setChannel("blockAll", v)}
            />
            <CfgCheck
              label="App nhân viên"
              checked={f.blockAll || f.blockAppStaff}
              disabled={f.blockAll}
              onChange={(v) => setChannel("blockAppStaff", v)}
            />
            <CfgCheck
              label="App khách hàng"
              checked={f.blockAll || f.blockAppCustomer}
              disabled={f.blockAll}
              onChange={(v) => setChannel("blockAppCustomer", v)}
            />
            <CfgCheck
              label="Web nhân viên"
              checked={f.blockAll || f.blockWebStaff}
              disabled={f.blockAll}
              onChange={(v) => setChannel("blockWebStaff", v)}
            />
            <CfgCheck
              label="Web khách hàng"
              checked={f.blockAll || f.blockWebCustomer}
              disabled={f.blockAll}
              onChange={(v) => setChannel("blockWebCustomer", v)}
            />
            <div className="note cfg-wide">
              Khi bật web nhân viên: tài khoản admin vẫn vào được để tắt bảo trì, người dùng khác bị
              chặn.
            </div>
            <Field label="Tiêu đề">
              <CfgInput
                value={f.title}
                onChange={(e) => setF({ ...f, title: e.target.value })}
                maxLength={200}
                placeholder="Hệ thống đang bảo trì"
              />
            </Field>
            <Field label="Nội dung">
              <CfgInput
                value={f.message}
                onChange={(e) => setF({ ...f, message: e.target.value })}
                maxLength={2000}
                placeholder="Vui lòng quay lại sau. Xin cảm ơn."
              />
            </Field>
            <PodPhotoInput
              variant="upload"
              title="Ảnh bảo trì (tuỳ chọn, 1 ảnh)"
              photos={f.imageUrl ? [f.imageUrl] : []}
              onChange={(next) => setF({ ...f, imageUrl: next[0] ?? null })}
              max={1}
              allowGallery
              label="Chọn ảnh"
            />
          </div>
          <CfgSave
            saving={saving}
            disabled={!writable || loading}
            confirmTitle="Lưu cấu hình bảo trì?"
            confirmBody="Bật bảo trì sẽ chặn người dùng ở các kênh đã chọn. Tài khoản admin vẫn vào được để tắt."
            onSave={() => void save()}
          />
        </>
      )}
    </CfgSection>
  );
}

function SessionTab() {
  const { session } = useAuth();
  const writable = canWrite(session?.role, "bao-tri");
  const [f, setF] = useState<SessionPolicy>({ enabled: true, logoutTime: "21:00" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isApiEnabled()) {
        setLoading(false);
        return;
      }
      try {
        const p = await fetchSessionPolicy();
        if (!cancelled) setF(p);
      } catch (e: any) {
        if (!cancelled) toast.error(e?.message ?? "Không tải được giờ đăng xuất");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    if (!writable) return toast.error("Tài khoản không có quyền ghi màn này");
    if (!/^\d{2}:\d{2}$/.test(f.logoutTime.trim())) {
      return toast.error("Giờ đăng xuất phải dạng HH:mm, ví dụ 21:00");
    }
    setSaving(true);
    try {
      if (!isApiEnabled()) throw new Error("API chưa cấu hình — không lưu được lên máy chủ");
      const saved = await putSessionPolicy({ ...f, logoutTime: f.logoutTime.trim() });
      setF(saved);
      toast.success("Đã lưu giờ tự đăng xuất");
    } catch (e: any) {
      toast.error(e?.message ?? "Lưu giờ tự đăng xuất thất bại");
    } finally {
      setSaving(false);
    }
  };

  return (
    <CfgSection
      icon="login"
      title="Tự đăng xuất theo giờ"
      desc="Đăng nhập sau giờ đó vẫn được, phiên mới kéo đến cùng giờ ngày hôm sau."
    >
      {loading ? (
        <CfgLoading />
      ) : (
        <>
          <div className="cfg-grid">
            <CfgToggle
              label="Bật tự đăng xuất"
              checked={f.enabled}
              onChange={(v) => setF({ ...f, enabled: v })}
            />
            <Field label="Giờ đăng xuất (giờ Việt Nam)">
              <CfgInput
                type="time"
                className="num"
                value={f.logoutTime}
                onChange={(e) => setF({ ...f, logoutTime: e.target.value })}
              />
            </Field>
          </div>
          <CfgSave
            saving={saving}
            disabled={!writable || loading}
            confirmTitle="Lưu cấu hình phiên đăng nhập?"
            confirmBody="Đến giờ đã đặt, mọi tài khoản đang đăng nhập sẽ bị đăng xuất."
            onSave={() => void save()}
          />
        </>
      )}
    </CfgSection>
  );
}

const SCAN_VOICE_TYPES: ScanVoiceType[] = ["ok", "err"];
const MAX_SCAN_VOICE_BYTES = 500 * 1024;

/** Giọng người khi quét trên app — upload trên web, app cache theo etag. */
function ScanVoiceTab() {
  const { session } = useAuth();
  const writable = canWrite(session?.role, "bao-tri");
  const [voices, setVoices] = useState<ScanVoiceMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<ScanVoiceType | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const reload = async () => {
    const rows = await listScanVoices();
    setVoices(rows);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isApiEnabled()) {
        setLoading(false);
        return;
      }
      try {
        await reload();
      } catch (e: any) {
        if (!cancelled) toast.error(e?.message ?? "Không tải được giọng quét");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const of = (type: ScanVoiceType) => voices.find((v) => v.type === type);

  const onUpload = async (type: ScanVoiceType, file: File | undefined) => {
    if (!writable) return toast.error("Tài khoản không có quyền ghi màn này");
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!["mp3", "wav", "m4a", "aac", "ogg"].includes(ext)) {
      return toast.error("Chỉ nhận mp3, wav, m4a, aac, ogg");
    }
    if (file.size > MAX_SCAN_VOICE_BYTES) return toast.error("File tối đa 500 KB");
    setBusy(type);
    try {
      await uploadScanVoice(type, file);
      await reload();
      toast.success(`Đã lưu giọng «${scanVoiceLabel(type)}»`);
    } catch (e: any) {
      toast.error(e?.message ?? "Không tải lên được");
    } finally {
      setBusy(null);
    }
  };

  const onListen = async (type: ScanVoiceType) => {
    setBusy(type);
    try {
      const blob = await fetchScanVoiceBlob(type);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (e: any) {
      toast.error(e?.message ?? "Không nghe được");
    } finally {
      setBusy(null);
    }
  };

  const [resetting, setResetting] = useState<ScanVoiceType | null>(null);

  const onReset = async (type: ScanVoiceType) => {
    if (!writable) return toast.error("Tài khoản không có quyền ghi màn này");
    setBusy(type);
    try {
      await deleteScanVoice(type);
      await reload();
      toast.success("Đã về giọng mặc định");
    } catch (e: any) {
      toast.error(e?.message ?? "Không xóa được");
    } finally {
      setBusy(null);
    }
  };

  return (
    <CfgSection
      icon="record_voice_over"
      title="Giọng quét trên app"
      desc="App mở máy chỉ kiểm tra 1 lần: tệp không đổi thì dùng bản đã lưu. Không cấu hình thì dùng giọng mặc định trong app."
    >
      {loading ? (
        <CfgLoading />
      ) : (
        <div className="cfg-grid">
          {SCAN_VOICE_TYPES.map((type) => {
            const row = of(type);
            const configured = !!row?.configured;
            const working = busy === type;
            return (
              <div key={type} className="file-row cfg-wide">
                <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                  <div style={{ fontWeight: 500 }}>{scanVoiceLabel(type)}</div>
                  <div className="muted" style={{ fontSize: 12, lineHeight: "16px" }}>
                    {configured
                      ? `${row?.fileName || type} · ${Math.round((row?.byteSize ?? 0) / 1024)} KB`
                      : "Đang dùng giọng mặc định trên app"}
                  </div>
                </div>
                <div className="act" style={{ flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="text-act"
                    disabled={!configured || working}
                    onClick={() => void onListen(type)}
                  >
                    Nghe
                  </button>
                  <button
                    type="button"
                    className="text-act"
                    disabled={!writable || !configured || working}
                    onClick={() => setResetting(type)}
                  >
                    Mặc định
                  </button>
                  <label
                    className="ok"
                    style={{ display: "inline-flex", alignItems: "center", cursor: "pointer" }}
                  >
                    <input
                      type="file"
                      accept=".mp3,.wav,.m4a,.aac,.ogg,audio/*"
                      className="hidden"
                      disabled={!writable || working}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        void onUpload(type, f);
                      }}
                    />
                    {working ? "Đang xử lý…" : "Tải lên"}
                  </label>
                </div>
              </div>
            );
          })}
          {previewUrl ? (
            <audio
              controls
              autoPlay
              src={previewUrl}
              className="cfg-wide"
              style={{ width: "100%" }}
            />
          ) : null}
        </div>
      )}
      <M3Confirm
        open={resetting != null}
        onOpenChange={(v) => !v && setResetting(null)}
        title={`Xoá giọng tuỳ chỉnh «${resetting ? scanVoiceLabel(resetting) : ""}»?`}
        body="App sẽ dùng giọng mặc định."
        confirmLabel="Về mặc định"
        confirmDanger
        onConfirm={() => {
          if (resetting) void onReset(resetting);
        }}
      />
    </CfgSection>
  );
}

/** Bắt buộc cập nhật app mobile — app hỏi GET /api/mobile/app-version mỗi lần mở/quay lại. */
function MobileAppVersionTab() {
  const { session } = useAuth();
  const writable = canWrite(session?.role, "bao-tri");
  const [f, setF] = useState<MobileAppVersionPolicy>({
    minimumVersion: "1.0.0",
    minimumAndroidVersionCode: null,
    mandatoryUpdateEnabled: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isApiEnabled()) {
        setLoading(false);
        return;
      }
      try {
        const p = await fetchMobileAppVersion();
        if (!cancelled) setF(p);
      } catch (e: any) {
        if (!cancelled) toast.error(e?.message ?? "Không tải được chính sách phiên bản app");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    if (!writable) return toast.error("Tài khoản không có quyền ghi màn này");
    if (!/^\d+(\.\d+){0,3}$/.test(f.minimumVersion.trim())) {
      return toast.error("Phiên bản tối thiểu phải dạng số chấm số, ví dụ 1.40.0");
    }
    setSaving(true);
    try {
      if (!isApiEnabled()) throw new Error("API chưa cấu hình — không lưu được lên máy chủ");
      const saved = await putMobileAppVersion({ ...f, minimumVersion: f.minimumVersion.trim() });
      setF({
        minimumVersion: saved.minimumVersion,
        minimumAndroidVersionCode: saved.minimumAndroidVersionCode ?? null,
        mandatoryUpdateEnabled: saved.mandatoryUpdateEnabled !== false,
      });
      toast.success("Đã lưu chính sách phiên bản app");
    } catch (e: any) {
      toast.error(e?.message ?? "Lưu chính sách phiên bản app thất bại");
    } finally {
      setSaving(false);
    }
  };

  return (
    <CfgSection icon="system_update" title="Bắt buộc cập nhật app mobile">
      {loading ? (
        <CfgLoading text="Đang tải chính sách từ máy chủ…" />
      ) : (
        <>
          <div className="cfg-grid">
            <Field label="Phiên bản tối thiểu">
              <CfgInput
                className="num"
                value={f.minimumVersion}
                onChange={(e) => setF({ ...f, minimumVersion: e.target.value })}
                placeholder="Ví dụ 1.40.0"
              />
            </Field>
            <Field label="Android versionCode tối thiểu">
              <CfgInput
                className="num"
                inputMode="numeric"
                value={f.minimumAndroidVersionCode ?? ""}
                onChange={(e) => {
                  const raw = e.target.value.trim();
                  setF({ ...f, minimumAndroidVersionCode: raw === "" ? null : Number(raw) });
                }}
                placeholder="Bỏ trống = không xét"
              />
            </Field>
            <CfgToggle
              label="Bật chặn app cũ (tắt = không chặn ai, dùng khi cần gỡ gấp)"
              checked={f.mandatoryUpdateEnabled}
              onChange={(v) => setF({ ...f, mandatoryUpdateEnabled: v })}
            />
            <div className="note cfg-wide">
              App mobile đang cài bản thấp hơn sẽ bị chặn ở màn hình cập nhật ngay lần mở tiếp theo.
              Máy chủ lỗi hoặc quá 10 giây thì app vẫn vào bình thường.
            </div>
          </div>
          <CfgSave
            label="Lưu chính sách app"
            saving={saving}
            disabled={!writable}
            confirmTitle="Lưu cấu hình update?"
            confirmBody="App bản thấp hơn sẽ bị chặn ở màn hình cập nhật ngay lần mở tiếp theo."
            onSave={() => void save()}
          />
        </>
      )}
    </CfgSection>
  );
}

function TrackLookupTab() {
  const { session } = useAuth();
  const writable = canWrite(session?.role, "bao-tri");
  const [f, setF] = useState<TrackLookupPolicy>({
    enabled: true,
    dailyLimit: 30,
    qrAutoRefresh: true,
    qrRefreshSeconds: 60,
    qrQuietEnabled: true,
    qrQuietFrom: "21:00",
    qrQuietTo: "07:00",
  });
  const [links, setLinks] = useState<OfficeScreenLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadLinks = async () => {
    const rows = await fetchOfficeScreens();
    setLinks(rows);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isApiEnabled()) {
        setLoading(false);
        return;
      }
      try {
        const [p, rows] = await Promise.all([fetchTrackLookupPolicy(), fetchOfficeScreens()]);
        if (cancelled) return;
        setF(p);
        setLinks(rows);
      } catch (e: any) {
        if (!cancelled) toast.error(e?.message ?? "Không tải được cấu hình tra cứu");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    if (!writable) return toast.error("Tài khoản không có quyền ghi màn này");
    const n = Math.round(Number(f.dailyLimit));
    const refresh = Math.round(Number(f.qrRefreshSeconds));
    if (!Number.isFinite(n) || n < 0 || n > 10000) {
      return toast.error("Số lần mỗi ngày phải từ 0 đến 10000. Nhập 0 nếu không giới hạn.");
    }
    if (!Number.isFinite(refresh) || refresh < 15 || refresh > 36000) {
      return toast.error("Thời gian làm mới QR phải từ 15 đến 36000 giây.");
    }
    if (
      f.qrQuietEnabled &&
      (!/^\d{2}:\d{2}$/.test(f.qrQuietFrom) || !/^\d{2}:\d{2}$/.test(f.qrQuietTo))
    ) {
      return toast.error("Giờ tắt và giờ bật lại phải dạng HH:mm, ví dụ 21:00");
    }
    if (f.qrQuietEnabled && f.qrQuietFrom === f.qrQuietTo) {
      return toast.error("Giờ tắt QR và giờ bật lại phải khác nhau.");
    }
    setSaving(true);
    try {
      if (!isApiEnabled()) throw new Error("API chưa cấu hình — không lưu được lên máy chủ");
      const saved = await putTrackLookupPolicy({
        enabled: f.enabled,
        dailyLimit: n,
        qrAutoRefresh: f.qrAutoRefresh,
        qrRefreshSeconds: refresh,
        qrQuietEnabled: f.qrQuietEnabled,
        qrQuietFrom: f.qrQuietFrom,
        qrQuietTo: f.qrQuietTo,
      });
      setF(saved);
      toast.success("Đã lưu cấu hình tra cứu");
    } catch (e: any) {
      toast.error(e?.message ?? "Lưu cấu hình tra cứu thất bại");
    } finally {
      setSaving(false);
    }
  };

  const copyLink = async (displayKey: string) => {
    const url = `${window.location.origin}/man-hinh-qr/${displayKey}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Đã chép link màn hình");
    } catch {
      toast.message(url);
    }
  };

  const rotate = async (officeCode: string) => {
    if (!writable) return toast.error("Tài khoản không có quyền ghi màn này");
    try {
      await rotateOfficeScreen(officeCode);
      await loadLinks();
      toast.success("Đã tạo link mới. Link cũ không mở được nữa.");
    } catch (e: any) {
      toast.error(e?.message ?? "Không tạo lại được link");
    }
  };

  return (
    <CfgSection
      icon="qr_code_2"
      title="Giới hạn tra cứu mỗi thiết bị"
      desc="Mỗi văn phòng chỉ một máy được chiếu QR. Khi tự làm mới, ảnh chụp mang về nhà sẽ hết hạn."
    >
      {loading ? (
        <CfgLoading />
      ) : (
        <>
          <div className="cfg-grid">
            <CfgToggle
              label="Chặn khi tra cứu quá nhiều lần"
              checked={f.enabled}
              onChange={(v) => setF({ ...f, enabled: v })}
            />
            <Field label="Số lần tối đa trong một ngày">
              <CfgInput
                type="number"
                className="num"
                min={0}
                max={10000}
                value={f.dailyLimit}
                onChange={(e) => setF({ ...f, dailyLimit: Number(e.target.value) })}
              />
            </Field>
            <Field label="QR văn phòng làm mới sau (giây)">
              <CfgInput
                type="number"
                className="num"
                min={15}
                max={36000}
                value={f.qrRefreshSeconds}
                disabled={!f.qrAutoRefresh}
                onChange={(e) => setF({ ...f, qrRefreshSeconds: Number(e.target.value) })}
              />
            </Field>
            <CfgToggle
              label="Tự làm mới QR văn phòng khi tra cứu"
              checked={f.qrAutoRefresh}
              onChange={(v) => setF({ ...f, qrAutoRefresh: v })}
            />
            <CfgToggle
              label="Tắt QR ngoài giờ, hết giờ tự phát mã mới"
              checked={f.qrQuietEnabled}
              onChange={(v) => setF({ ...f, qrQuietEnabled: v })}
            />
            <Field label="Tắt từ">
              <CfgInput
                type="time"
                className="num"
                value={f.qrQuietFrom}
                onChange={(e) => setF({ ...f, qrQuietFrom: e.target.value })}
              />
            </Field>
            <Field label="Bật lại">
              <CfgInput
                type="time"
                className="num"
                value={f.qrQuietTo}
                onChange={(e) => setF({ ...f, qrQuietTo: e.target.value })}
              />
            </Field>
            <div className="note cfg-wide">
              Giờ Việt Nam. Ví dụ 21:00 đến 07:00: mã đang chiếu hết hạn lúc 21:00, sáng hôm sau
              đúng 07:00 màn hình tự hiện mã mới. Nhập 0 lần tra cứu hoặc tắt công tắc số lần nếu
              không muốn chặn số lần.
            </div>
            {links.length === 0 ? (
              <div className="lab muted cfg-wide">Chưa có văn phòng đang hoạt động.</div>
            ) : (
              <div className="scroller cfg-wide">
                <table className="tbl" style={{ ["--tbl-min" as string]: "560px" }}>
                  <thead>
                    <tr>
                      <th>Văn phòng</th>
                      <th>Đang chiếu</th>
                      <th>Link</th>
                    </tr>
                  </thead>
                  <tbody>
                    {links.map((row) => (
                      <tr key={row.officeCode}>
                        <td style={{ fontWeight: 500 }}>
                          {row.officeName}
                          <span className="sub">{row.officeCode}</span>
                        </td>
                        <td>
                          <span className={row.showing ? "tag ok" : "tag warn"}>
                            {row.showing ? "Đang chiếu" : "Chưa chiếu"}
                          </span>
                        </td>
                        <td>
                          <div className="act" style={{ justifyContent: "flex-start" }}>
                            <button
                              type="button"
                              className="text-act"
                              onClick={() => void copyLink(row.displayKey)}
                            >
                              Copy link
                            </button>
                            <button
                              type="button"
                              className="text-act"
                              onClick={() => void rotate(row.officeCode)}
                            >
                              Tạo link mới
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <CfgSave
            saving={saving}
            disabled={!writable || loading}
            confirmTitle="Lưu cấu hình tra cứu?"
            confirmBody="Thay đổi áp dụng ngay cho các thiết bị đang tra cứu và máy chiếu QR."
            onSave={() => void save()}
          />
        </>
      )}
    </CfgSection>
  );
}

function CfgSection({
  icon,
  title,
  desc,
  children,
}: {
  icon: string;
  title: string;
  desc?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="card stack">
      <h2 className="group-title sec-title">
        <span className="sec-ic" aria-hidden="true">
          <span className="ms">{icon}</span>
        </span>
        {title}
      </h2>
      {desc ? (
        <div className="lab muted" style={{ maxWidth: 860, marginTop: -8 }}>
          {desc}
        </div>
      ) : null}
      {children}
    </section>
  );
}

function CfgLoading({ text = "Đang tải…" }: { text?: string }) {
  return <div className="lab muted">{text}</div>;
}

function CfgToggle({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: React.ReactNode;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="toggle cfg-wide">
      <input
        className="switch"
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

function CfgCheck({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="choice" style={disabled ? { opacity: 0.6, cursor: "default" } : undefined}>
      <input
        className="check"
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

function Field({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={wide ? "field cfg-field cfg-wide" : "field cfg-field"}>
      <span className="l">{label}</span>
      {children}
    </div>
  );
}

function CfgInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <span className="box input-box">
      <input {...props} />
    </span>
  );
}

function CfgSave({
  label = "Lưu cấu hình",
  saving,
  disabled,
  confirmTitle,
  confirmBody,
  onSave,
}: {
  label?: string;
  saving: boolean;
  disabled?: boolean;
  confirmTitle: string;
  confirmBody: string;
  onSave: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          className="btn"
          disabled={saving || disabled}
          onClick={() => setOpen(true)}
        >
          {saving ? "Đang lưu…" : label}
        </button>
      </div>
      <M3Confirm
        open={open}
        onOpenChange={setOpen}
        title={confirmTitle}
        body={confirmBody}
        confirmLabel="Xác nhận lưu"
        onConfirm={onSave}
      />
    </>
  );
}
