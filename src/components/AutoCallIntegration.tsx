import { AutoCallCallsPanel, AutoCallTestPanel } from "@/components/AutoCallCalls";
import { askConfirm } from "@/components/m3/askConfirm";
import {
  CfgCard,
  CfgCheck,
  CfgField,
  CfgHead,
  CfgInput,
  CfgNote,
  CfgSeg,
  CfgSentence,
  CfgSubTabs,
  CfgToggle,
  CfgUrl,
  type CfgTag,
} from "@/components/m3/CfgKit";
import { SecretInput } from "@/components/SecretInput";
import { getApiBase, isApiEnabled } from "@/lib/api/client";
import type { AutoCallAudio, AutoCallResult, AutoCallType } from "@/lib/api/finance-config-api";
import { resolveAutoCallRates } from "@/lib/phone-carrier";
import { useStore, type AutoCallProvider, type AutoCallRetryConfig } from "@/lib/store";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

const DEFAULT_BASE_URL = "https://api.quanlydon.vn/partner/v1";
const VTECH_DEFAULT_BASE_URL = "https://api.tongdai.ai/api/external/v1";
const PROVIDER_LABEL: Record<AutoCallProvider, string> = {
  HHVN: "HHVN Tech",
  VTECH: "Vtech (tongdai.ai)",
};
const TYPE_LABEL: Record<AutoCallType, string> = { giao: "Gọi giao", hoan: "Gọi hoàn" };
const MAX_AUDIO_BYTES = 5 * 1024 * 1024;

function detectMode(key: string): "SANDBOX" | "LIVE" | "UNKNOWN" | undefined {
  const k = key.trim();
  if (!k) return undefined;
  if (k.startsWith("xk_test_")) return "SANDBOX";
  if (k.startsWith("xk_live_")) return "LIVE";
  return "UNKNOWN";
}

function modeTag(
  mode: "SANDBOX" | "LIVE" | "UNKNOWN" | undefined,
  provider: AutoCallProvider,
): CfgTag | null {
  if (provider === "VTECH") return { label: "Vtech · gọi thật", tone: "err" };
  if (!mode) return null;
  if (mode === "SANDBOX") return { label: "Sandbox · không gọi thật", tone: "info" };
  if (mode === "LIVE") return { label: "Live · gọi thật", tone: "err" };
  return { label: "Key không rõ loại", tone: "warn" };
}

type AutoCallSub = "ket-noi" | "goi-lai" | "file" | "cuoc-goi" | "goi-thu";

export function AutoCallIntegration() {
  const integrations = useStore((s) => s.integrations);
  const [enabled, setEnabled] = useState(integrations.autocallEnabled === true);
  const [baseUrl, setBaseUrl] = useState(integrations.autocallBaseUrl ?? "");
  const [apiKey, setApiKey] = useState("");
  const [secret, setSecret] = useState("");
  const savedProvider: AutoCallProvider = integrations.autocallProvider ?? "HHVN";
  const [provider, setProvider] = useState<AutoCallProvider>(savedProvider);
  const [vtechBaseUrl, setVtechBaseUrl] = useState(integrations.autocallVtechBaseUrl ?? "");
  const [vtechKey, setVtechKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<AutoCallResult | null>(null);
  const [audios, setAudios] = useState<AutoCallAudio[] | null>(null);
  const [audioBusy, setAudioBusy] = useState<AutoCallType | null>(null);
  const [preview, setPreview] = useState<{ type: AutoCallType; url: string } | null>(null);
  const fileRefs = { giao: useRef<HTMLInputElement>(null), hoan: useRef<HTMLInputElement>(null) };
  const savedRates = resolveAutoCallRates(integrations.autocallRates);
  const [big3PerMin, setBig3PerMin] = useState(String(savedRates.big3PerMin));
  const [otherFirstFee, setOtherFirstFee] = useState(String(savedRates.otherFirstFee));
  const [otherFirstSec, setOtherFirstSec] = useState(String(savedRates.otherFirstSec));
  const [otherPerSec, setOtherPerSec] = useState(String(savedRates.otherPerSec));

  const hhvnKeySaved = integrations.autocallApiKeyConfigured === true;
  const vtechKeySaved = integrations.autocallVtechApiKeyConfigured === true;
  /** Key của nhà cung cấp đang lưu (đang chạy) — quyết định các tab Cuộc gọi / Gọi thử / File. */
  const keySaved = savedProvider === "VTECH" ? vtechKeySaved : hhvnKeySaved;
  const mode = detectMode(apiKey) ?? integrations.autocallApiKeyMode;
  const vtechWebhookUrl = integrations.autocallVtechWebhookToken
    ? `${getApiBase()}/api/public/vtech/webhook?token=${integrations.autocallVtechWebhookToken}`
    : null;

  useEffect(() => {
    setEnabled(integrations.autocallEnabled === true);
    setBaseUrl((prev) => prev || integrations.autocallBaseUrl || "");
    setVtechBaseUrl((prev) => prev || integrations.autocallVtechBaseUrl || "");
  }, [
    integrations.autocallEnabled,
    integrations.autocallBaseUrl,
    integrations.autocallVtechBaseUrl,
  ]);

  useEffect(() => {
    setProvider(savedProvider);
  }, [savedProvider]);

  useEffect(() => {
    const r = resolveAutoCallRates(integrations.autocallRates);
    setBig3PerMin(String(r.big3PerMin));
    setOtherFirstFee(String(r.otherFirstFee));
    setOtherFirstSec(String(r.otherFirstSec));
    setOtherPerSec(String(r.otherPerSec));
  }, [integrations.autocallRates]);

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview.url);
    },
    [preview],
  );

  const loadAudios = useCallback(async () => {
    const { fetchAutoCallAudios } = await import("@/lib/api/finance-config-api");
    const r = await fetchAutoCallAudios();
    if (r.ok) {
      setAudios(r.audios ?? []);
    } else {
      setAudios(null);
      setResult(r);
    }
  }, []);

  useEffect(() => {
    if (!isApiEnabled() || !hhvnKeySaved || savedProvider !== "HHVN") return;
    loadAudios().catch(() => undefined);
  }, [hhvnKeySaved, savedProvider, loadAudios]);

  const save = async () => {
    const hasKey =
      provider === "VTECH" ? vtechKeySaved || !!vtechKey.trim() : hhvnKeySaved || !!apiKey.trim();
    if (enabled && !hasKey) {
      return toast.error(`Bật Auto Call cần API key ${PROVIDER_LABEL[provider]}`);
    }
    if (
      provider !== savedProvider &&
      !(await askConfirm(
        `Chuyển Auto Call sang ${PROVIDER_LABEL[provider]}? Cuộc gọi mới (kể cả cuộc gọi đang chờ khung giờ / gọi lại) sẽ gửi qua ${PROVIDER_LABEL[provider]}.`,
      ))
    ) {
      return;
    }
    setSaving(true);
    void (async () => {
      try {
        const { putIntegrationConfig } = await import("@/lib/api/finance-config-api");
        const saved = await putIntegrationConfig({
          autocallEnabled: enabled,
          autocallProvider: provider,
          autocallBaseUrl: baseUrl.trim() || undefined,
          autocallApiKey: apiKey.trim() || undefined,
          autocallWebhookSecret: secret.trim() || undefined,
          autocallVtechBaseUrl: vtechBaseUrl.trim() || undefined,
          autocallVtechApiKey: vtechKey.trim() || undefined,
          autocallRates: resolveAutoCallRates({
            big3PerMin: big3PerMin.trim() ? Number(big3PerMin) : undefined,
            otherFirstFee: otherFirstFee.trim() ? Number(otherFirstFee) : undefined,
            otherFirstSec: otherFirstSec.trim() ? Number(otherFirstSec) : undefined,
            otherPerSec: otherPerSec.trim() ? Number(otherPerSec) : undefined,
          }),
        });
        useStore.setState({ integrations: saved });
        setApiKey("");
        setSecret("");
        setVtechKey("");
        toast.success(
          `Đã lưu cấu hình Auto Call · ${PROVIDER_LABEL[saved.autocallProvider ?? "HHVN"]}`,
        );
      } catch (e: any) {
        toast.error(e?.message ?? "Lưu Auto Call thất bại");
      } finally {
        setSaving(false);
      }
    })();
  };

  const formKey = provider === "VTECH" ? vtechKey.trim() : apiKey.trim();
  const test = () => {
    const saved = provider === "VTECH" ? vtechKeySaved : hhvnKeySaved;
    if (!formKey && !saved)
      return toast.error(`Nhập API key ${PROVIDER_LABEL[provider]} (hoặc Lưu key trước)`);
    setTesting(true);
    void (async () => {
      try {
        const { testAutoCall } = await import("@/lib/api/finance-config-api");
        const r = await testAutoCall(
          provider === "VTECH"
            ? {
                autocallProvider: "VTECH",
                autocallVtechApiKey: vtechKey.trim() || undefined,
                autocallVtechBaseUrl: vtechBaseUrl.trim() || undefined,
              }
            : {
                autocallProvider: "HHVN",
                autocallApiKey: apiKey.trim() || undefined,
                autocallBaseUrl: baseUrl.trim() || undefined,
              },
        );
        setResult(r);
        if (r.ok) {
          if (provider === "HHVN") setAudios(r.audios ?? []);
          toast.success(
            formKey
              ? "Kết nối OK — bấm Lưu để giữ key này"
              : `Kết nối ${PROVIDER_LABEL[provider]} OK`,
          );
        } else {
          toast.error(r.message ?? "Test Auto Call thất bại");
        }
      } catch (e: any) {
        toast.error(e?.message ?? "Test Auto Call thất bại");
      } finally {
        setTesting(false);
      }
    })();
  };

  const upload = (type: AutoCallType, file: File | undefined) => {
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!["mp3", "wav", "m4a"].includes(ext)) return toast.error("Chỉ nhận file MP3, WAV hoặc M4A");
    if (file.size > MAX_AUDIO_BYTES) return toast.error("File audio lớn hơn 5 MB");
    setAudioBusy(type);
    void (async () => {
      try {
        const { uploadAutoCallAudio } = await import("@/lib/api/finance-config-api");
        const r = await uploadAutoCallAudio(type, file);
        if (!r.ok) {
          toast.error(r.message ?? "Tải audio thất bại");
          return;
        }
        toast.success(`Đã thay file ${TYPE_LABEL[type].toLowerCase()}`);
        setPreview(null);
        await loadAudios();
      } catch (e: any) {
        toast.error(e?.message ?? "Tải audio thất bại");
      } finally {
        setAudioBusy(null);
        const input = fileRefs[type].current;
        if (input) input.value = "";
      }
    })();
  };

  const resetDefault = async (type: AutoCallType) => {
    if (
      !(await askConfirm(
        `Xoá file riêng, quay về file mặc định của tổng đài cho "${TYPE_LABEL[type]}"?`,
      ))
    )
      return;
    setAudioBusy(type);
    void (async () => {
      try {
        const { deleteAutoCallAudio } = await import("@/lib/api/finance-config-api");
        const r = await deleteAutoCallAudio(type);
        if (!r.ok) {
          toast.error(r.message ?? "Xoá audio thất bại");
          return;
        }
        toast.success("Đã quay về file mặc định");
        setPreview(null);
        await loadAudios();
      } catch (e: any) {
        toast.error(e?.message ?? "Xoá audio thất bại");
      } finally {
        setAudioBusy(null);
      }
    })();
  };

  const listen = (type: AutoCallType) => {
    setAudioBusy(type);
    void (async () => {
      try {
        const { fetchAutoCallAudioBlob } = await import("@/lib/api/finance-config-api");
        const blob = await fetchAutoCallAudioBlob(type);
        setPreview({ type, url: URL.createObjectURL(blob) });
      } catch (e: any) {
        toast.error(e?.message ?? "Không tải được file audio");
      } finally {
        setAudioBusy(null);
      }
    })();
  };

  const [sub, setSub] = useState<AutoCallSub>("ket-noi");

  if (!isApiEnabled()) {
    return (
      <CfgCard
        icon="phone_in_talk"
        title="Auto Call"
        desc="Cần kết nối API máy chủ để cấu hình Auto Call."
      />
    );
  }

  const needKey = <div className="note">Lưu API key ở mục Kết nối trước.</div>;
  const activeSub: AutoCallSub = sub === "file" && savedProvider !== "HHVN" ? "ket-noi" : sub;
  const subTabs: { id: AutoCallSub; label: string }[] = [
    { id: "ket-noi", label: "Kết nối" },
    { id: "goi-lai", label: "Lịch gọi" },
    ...(savedProvider === "HHVN" ? [{ id: "file" as const, label: "File thông báo" }] : []),
    { id: "cuoc-goi", label: "Cuộc gọi" },
    { id: "goi-thu", label: "Gọi thử" },
  ];
  const saveBtn = (
    <button type="button" className="btn" onClick={save} disabled={saving}>
      {saving ? "Đang lưu…" : "Lưu Auto Call"}
    </button>
  );
  const rateInput = (
    value: string,
    onChange: (v: string) => void,
    size: "short" | "tiny",
    max: number,
    label: string,
  ) => (
    <input
      type="number"
      className={`cell-input ${size}`}
      min={1}
      max={max}
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );

  return (
    <div className="stack" style={{ gap: 16 }}>
      <CfgSubTabs tabs={subTabs} value={activeSub} onChange={setSub} />

      {activeSub === "ket-noi" ? (
        <>
          <CfgCard
            icon="phone_in_talk"
            title={`Auto Call · ${PROVIDER_LABEL[savedProvider]}`}
            tags={[
              integrations.autocallEnabled
                ? { label: "Đang bật", tone: "ok" }
                : { label: "Đang tắt", tone: "warn" },
              modeTag(mode, savedProvider),
            ]}
            desc="Đơn nhập kho giao (hoặc quay về kho sau giao thất bại) tự gọi người nhận. Đơn giao tận nơi không gọi."
            acts={
              <>
                <button type="button" className="btn tonal" onClick={test} disabled={testing}>
                  {testing ? "Đang test…" : formKey ? "Test key vừa nhập" : "Test kết nối"}
                </button>
                {saveBtn}
              </>
            }
          >
            <CfgToggle label="Bật Auto Call" checked={enabled} onChange={setEnabled} />
            <CfgSeg
              label="Nhà cung cấp"
              value={provider}
              options={[
                { value: "VTECH", label: PROVIDER_LABEL.VTECH },
                { value: "HHVN", label: PROVIDER_LABEL.HHVN },
              ]}
              onChange={(p) => {
                setProvider(p);
                setResult(null);
              }}
            />
            {provider !== savedProvider ? (
              <div className="lab cfg-wide" style={{ color: "var(--on-warning-container)" }}>
                Bấm Lưu để chuyển sang {PROVIDER_LABEL[provider]}
              </div>
            ) : null}
            {provider === "VTECH" ? (
              <>
                <CfgNote>
                  Vtech chỉ gọi và trả kết quả: CPN đẩy SĐT người nhận vào chiến dịch callbot kèm
                  biến <code>ten_san_pham</code> (tên hàng hoá), <code>diem_nhan</code> (tên VP
                  nhận), <code>ma_don</code>. Không huỷ được cuộc gọi đã gửi, không dùng file thông
                  báo.
                </CfgNote>
                <CfgUrl
                  label="URL webhook cấu hình trong chiến dịch Vtech"
                  url={vtechWebhookUrl}
                  emptyText="Bấm Lưu với nhà cung cấp Vtech để tạo URL"
                  copiedText="Đã copy URL webhook"
                />
                <CfgField label="Base URL">
                  <CfgInput
                    value={vtechBaseUrl}
                    onChange={(e) => setVtechBaseUrl(e.target.value)}
                    placeholder={VTECH_DEFAULT_BASE_URL}
                  />
                </CfgField>
                <CfgField
                  label={`API Key chiến dịch${vtechKeySaved && integrations.autocallVtechApiKeySuffix ? ` (…${integrations.autocallVtechApiKeySuffix})` : ""}`}
                  saved={vtechKeySaved}
                >
                  <SecretInput
                    name="autocall-vtech-api-key"
                    value={vtechKey}
                    onChange={(e) => setVtechKey(e.target.value)}
                    placeholder={vtechKeySaved ? "Nhập key mới để thay" : "tdai_…"}
                  />
                </CfgField>
              </>
            ) : (
              <>
                <CfgUrl
                  label="URL webhook gửi HHVN Tech"
                  url={`${getApiBase()}/api/public/hhvn/webhook`}
                  emptyText=""
                  copiedText="Đã copy URL webhook"
                />
                <CfgField label="Base URL">
                  <CfgInput
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder={DEFAULT_BASE_URL}
                  />
                </CfgField>
                <CfgField
                  label={`API Key${keySaved && integrations.autocallApiKeySuffix ? ` (…${integrations.autocallApiKeySuffix})` : ""}`}
                  saved={keySaved}
                >
                  <SecretInput
                    name="autocall-api-key"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={keySaved ? "Nhập key mới để thay" : "xk_test_… hoặc xk_live_…"}
                  />
                </CfgField>
                <CfgField
                  label="Webhook secret"
                  saved={integrations.autocallWebhookSecretConfigured === true}
                >
                  <SecretInput
                    name="autocall-webhook-secret"
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                    placeholder={
                      integrations.autocallWebhookSecretConfigured
                        ? "Nhập secret mới để thay"
                        : "whsec_…"
                    }
                  />
                </CfgField>
              </>
            )}
            {result ? (
              <div className="cfg-wide">
                <TestResult r={result} />
              </div>
            ) : null}
          </CfgCard>

          <CfgCard
            icon="phone_in_talk"
            title="Cách tính tiền ước tính"
            desc="Dùng cho cột Ước tính ở mục Cuộc gọi, theo thời lượng nghe. Không trừ tiền thật."
            acts={saveBtn}
          >
            <CfgHead>Viettel / Vinaphone / Mobifone</CfgHead>
            <CfgSentence>
              {rateInput(big3PerMin, setBig3PerMin, "short", 100000, "Giá mỗi phút")}
              <span>đ / phút đã bắt đầu (dưới 1 phút tính 1 phút)</span>
            </CfgSentence>
            <CfgHead>Nhà mạng còn lại</CfgHead>
            <CfgSentence>
              {rateInput(otherFirstFee, setOtherFirstFee, "short", 100000, "Giá các giây đầu")}
              <span>đ cho</span>
              {rateInput(otherFirstSec, setOtherFirstSec, "tiny", 60, "Số giây đầu")}
              <span>giây đầu; mỗi giây sau +</span>
              {rateInput(otherPerSec, setOtherPerSec, "short", 100000, "Giá mỗi giây sau")}
              <span>đ</span>
            </CfgSentence>
          </CfgCard>
        </>
      ) : null}

      {activeSub === "goi-lai" ? <AutoCallRetrySettings /> : null}

      {activeSub === "file" ? (
        <CfgCard
          icon="phone_in_talk"
          title="File thông báo"
          desc="MP3 / WAV / M4A, tối đa 5 MB, dài 2–60 giây. Tối đa 10 lần tải lên mỗi giờ. File mới áp dụng cho lượt gọi bắt đầu sau khi tải lên."
          grid={false}
        >
          {mode === "SANDBOX" ? (
            <div className="note">
              Key sandbox: file lưu cấu hình test riêng, không ảnh hưởng cuộc gọi thật
            </div>
          ) : null}
          {!keySaved ? (
            needKey
          ) : audios == null ? (
            <div className="note">Chưa tải được danh sách audio — bấm Test kết nối.</div>
          ) : (
            <div className="scroller">
              <table className="tbl" style={{ "--tbl-min": "820px" } as React.CSSProperties}>
                <thead>
                  <tr>
                    <th>Loại</th>
                    <th>Nguồn</th>
                    <th>Thời lượng</th>
                    <th>File gốc</th>
                    <th>Cập nhật</th>
                    <th style={{ textAlign: "right" }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {(["giao", "hoan"] as AutoCallType[]).map((type) => {
                    const a = audios.find((x) => x.type === type);
                    const busy = audioBusy === type;
                    return (
                      <tr key={type}>
                        <td style={{ fontWeight: 500 }}>
                          {TYPE_LABEL[type]}
                          {type === "hoan" ? <span className="muted"> (không ghi âm)</span> : null}
                        </td>
                        <td>
                          {a?.source === "custom" ? (
                            <span className="tag info">Tự tải lên</span>
                          ) : (
                            <span className="tag ok">Mặc định tổng đài</span>
                          )}
                        </td>
                        <td className="num">{a?.duration != null ? `${a.duration}s` : "—"}</td>
                        <td>{a?.originalName ?? "—"}</td>
                        <td className="num">
                          {a?.updatedAt ? new Date(a.updatedAt).toLocaleString("vi-VN") : "—"}
                        </td>
                        <td>
                          <div className="act">
                            {a?.source === "custom" ? (
                              <button
                                type="button"
                                className="text-act"
                                disabled={busy}
                                onClick={() => listen(type)}
                              >
                                Nghe
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="text-act"
                              disabled={busy}
                              onClick={() => fileRefs[type].current?.click()}
                            >
                              {busy ? "Đang xử lý…" : "Tải file mới"}
                            </button>
                            {a?.source === "custom" ? (
                              <button
                                type="button"
                                className="text-act danger"
                                disabled={busy}
                                onClick={() => resetDefault(type)}
                              >
                                Về mặc định
                              </button>
                            ) : null}
                            <input
                              ref={fileRefs[type]}
                              type="file"
                              accept=".mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/x-m4a,audio/mp4"
                              className="hidden"
                              onChange={(e) => upload(type, e.target.files?.[0])}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {preview ? (
            <div className="file-row">
              <span className="lab muted">{TYPE_LABEL[preview.type]} (sau chuyển đổi 8 kHz):</span>
              <audio controls autoPlay src={preview.url} className="h-8" />
            </div>
          ) : null}
        </CfgCard>
      ) : null}

      {activeSub === "cuoc-goi" ? (
        <CfgCard icon="phone_in_talk" title="Cuộc gọi" grid={false}>
          {keySaved ? <AutoCallCallsPanel key={savedProvider} provider={savedProvider} /> : needKey}
        </CfgCard>
      ) : null}

      {/* Giữ danh sách gọi thử khi chuyển mục con. */}
      <div style={activeSub === "goi-thu" ? undefined : { display: "none" }}>
        <CfgCard icon="phone_in_talk" title="Gọi thử" grid={false}>
          {keySaved ? (
            <AutoCallTestPanel
              key={savedProvider}
              provider={savedProvider}
              mode={savedProvider === "VTECH" ? "LIVE" : integrations.autocallApiKeyMode}
            />
          ) : (
            needKey
          )}
        </CfgCard>
      </div>
    </div>
  );
}

const DEFAULT_RETRY: AutoCallRetryConfig = {
  enabled: false,
  intervals: [60, 120],
  days: 1,
  onNoAnswer: true,
  onCarrierError: true,
  onSendError: true,
  callFrom: "08:00",
  callTo: "20:00",
};
const MAX_RETRIES = 10;

function minutesLabel(m: number) {
  if (m >= 60 && m % 60 === 0) return `${m / 60} tiếng`;
  if (m > 60) return `${Math.floor(m / 60)} tiếng ${m % 60} phút`;
  return `${m} phút`;
}

function AutoCallRetrySettings() {
  const saved = useStore((s) => s.integrations.autocallRetry);
  const [cfg, setCfg] = useState<AutoCallRetryConfig>(saved ?? DEFAULT_RETRY);
  const [saving, setSaving] = useState(false);
  const [daysText, setDaysText] = useState(String((saved ?? DEFAULT_RETRY).days));

  useEffect(() => {
    if (saved) {
      setCfg(saved);
      setDaysText(String(saved.days));
    }
  }, [saved]);

  const commitDays = () => {
    const d = Math.min(7, Math.max(1, Math.round(Number(daysText) || 1)));
    setDaysText(String(d));
    set("days", d);
  };

  const set = <K extends keyof AutoCallRetryConfig>(k: K, v: AutoCallRetryConfig[K]) =>
    setCfg((c) => ({ ...c, [k]: v }));
  const setGap = (i: number, raw: string) =>
    set(
      "intervals",
      cfg.intervals.map((m, j) =>
        j === i ? Math.min(1440, Math.max(0, Math.round(Number(raw) || 0))) : m,
      ),
    );

  const save = () => {
    if (cfg.callFrom >= cfg.callTo) return toast.error("Giờ bắt đầu gọi phải trước giờ kết thúc");
    if (cfg.enabled && !cfg.onNoAnswer && !cfg.onCarrierError && !cfg.onSendError)
      return toast.error("Chọn ít nhất 1 trường hợp gọi lại");
    if (cfg.intervals.some((m) => m < 5))
      return toast.error("Mỗi lần gọi lại phải cách ít nhất 5 phút");
    setSaving(true);
    void (async () => {
      try {
        const { putIntegrationConfig } = await import("@/lib/api/finance-config-api");
        const days = cfg.days > 1 ? Math.min(7, Math.max(1, Math.round(Number(daysText) || 1))) : 1;
        const res = await putIntegrationConfig({ autocallRetry: { ...cfg, days } });
        useStore.setState({ integrations: res });
        toast.success("Đã lưu lịch gọi");
      } catch (e: any) {
        toast.error(e?.message ?? "Lưu lịch gọi thất bại");
      } finally {
        setSaving(false);
      }
    })();
  };

  const callWindow = `${cfg.callFrom}–${cfg.callTo}`;
  const summary =
    `Cuộc 1 gọi ngay khi nhận lệnh nếu trong khung ${callWindow}, ngoài khung thì chờ đến ${cfg.callFrom} hôm sau.` +
    (!cfg.enabled
      ? " Gọi lại đang tắt: cuộc gọi thất bại sẽ không được CPN gọi lại."
      : cfg.intervals.length === 0
        ? " Không có lần gọi lại nào."
        : " " +
          cfg.intervals
            .map((m, i) => `cuộc ${i + 2} cách cuộc ${i + 1} ${minutesLabel(m)}`)
            .join(", ")
            .replace(/^c/, "C") +
          `. Giờ gọi lại rơi sau ${cfg.callTo} thì dời sang ${cfg.callFrom} sáng hôm sau, các cuộc sau tính tiếp từ đó.`) +
    (cfg.enabled && cfg.days > 1
      ? ` Gọi hết ${cfg.intervals.length + 1} cuộc vẫn chưa được thì ${cfg.callFrom} hôm sau gọi lại từ cuộc 1 theo lịch trên, tối đa ${cfg.days} ngày.`
      : "");

  const timeInput = (value: string, onChange: (v: string) => void, label: string) => (
    <input
      type="time"
      className="cell-input"
      style={{ width: 120, textAlign: "left" }}
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );

  return (
    <>
      <CfgCard
        icon="phone_in_talk"
        title="Khung giờ gọi"
        desc={
          <>
            Áp dụng mọi cuộc gọi. Nhắc Zalo ZNS sau hết vòng gọi ngày 1 (không nghe máy) cấu hình
            tại <strong>Tích hợp → Zalo ZNS → Tự động</strong>.
          </>
        }
      >
        <CfgSentence>
          {timeInput(cfg.callFrom, (v) => set("callFrom", v), "Giờ bắt đầu")}
          <span>đến</span>
          {timeInput(cfg.callTo, (v) => set("callTo", v), "Giờ kết thúc")}
        </CfgSentence>
      </CfgCard>

      <CfgCard
        icon="phone_in_talk"
        title="Tự gọi lại khi chưa gọi được"
        acts={
          <button type="button" className="btn" onClick={save} disabled={saving}>
            {saving ? "Đang lưu…" : "Lưu lịch gọi"}
          </button>
        }
      >
        <CfgToggle
          label="Tự gọi lại khi chưa gọi được"
          checked={cfg.enabled}
          onChange={(v) => set("enabled", v)}
        />
        <div
          className="cfg-wide stack"
          style={{ gap: 12, ...(cfg.enabled ? {} : { pointerEvents: "none", opacity: 0.5 }) }}
        >
          <div className="title-small" style={{ fontWeight: 600 }}>
            Gọi lại khi
          </div>
          <div className="cfg-grid">
            <CfgCheck
              label="Khách không nghe máy / máy bận"
              checked={cfg.onNoAnswer}
              onChange={(v) => set("onNoAnswer", v)}
            />
            <CfgCheck
              label="Tổng đài / nhà mạng lỗi"
              checked={cfg.onCarrierError}
              onChange={(v) => set("onCarrierError", v)}
            />
            <CfgCheck
              label="Gửi cuộc gọi sang tổng đài không thành công"
              checked={cfg.onSendError}
              onChange={(v) => set("onSendError", v)}
            />
          </div>

          <div className="title-small" style={{ fontWeight: 600, marginTop: 4 }}>
            Lịch gọi lại
          </div>
          <div className="stack" style={{ gap: 8 }}>
            {cfg.intervals.map((m, i) => (
              <div key={i} className="file-row num" style={{ padding: "8px 12px 8px 16px" }}>
                <span style={{ fontWeight: 500 }}>Cuộc {i + 2}</span>
                <span className="muted">sau cuộc {i + 1}</span>
                <input
                  type="number"
                  min={5}
                  max={1440}
                  className="cell-input short"
                  aria-label={`Số phút trước cuộc ${i + 2}`}
                  value={m || ""}
                  onChange={(e) => setGap(i, e.target.value)}
                />
                <span className="muted">phút</span>
                {m >= 60 ? <span className="lab muted">({minutesLabel(m)})</span> : null}
                <button
                  type="button"
                  className="icon-btn"
                  style={{ marginLeft: "auto" }}
                  aria-label={`Xoá cuộc ${i + 2}`}
                  title="Xoá"
                  onClick={() =>
                    set(
                      "intervals",
                      cfg.intervals.filter((_, j) => j !== i),
                    )
                  }
                >
                  <span className="ms" aria-hidden="true">
                    delete
                  </span>
                </button>
              </div>
            ))}
            {cfg.intervals.length < MAX_RETRIES ? (
              <button
                type="button"
                className="btn tonal"
                style={{ alignSelf: "flex-start", height: 36 }}
                onClick={() =>
                  set("intervals", [
                    ...cfg.intervals,
                    cfg.intervals[cfg.intervals.length - 1] ?? 60,
                  ])
                }
              >
                <span className="ms" aria-hidden="true">
                  add
                </span>
                Thêm lần gọi lại
              </button>
            ) : null}
          </div>

          <label className="toggle">
            <input
              className="switch"
              type="checkbox"
              checked={cfg.days > 1}
              onChange={(e) => {
                const d = e.target.checked ? Math.max(2, cfg.days) : 1;
                set("days", d);
                setDaysText(String(d));
              }}
            />
            <span>Gọi hết lịch vẫn chưa được thì hôm sau lặp lại từ cuộc 1</span>
          </label>
          {cfg.days > 1 ? (
            <div className="sentence num">
              <span>Tối đa</span>
              <input
                type="number"
                min={1}
                max={7}
                className="cell-input tiny"
                aria-label="Số ngày tối đa"
                value={daysText}
                onChange={(e) => setDaysText(e.target.value)}
                onBlur={commitDays}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitDays();
                }}
              />
              <span>ngày (1–7)</span>
            </div>
          ) : null}
        </div>

        <CfgNote>
          {summary} Khách đã nghe máy, đơn đã giao thành công / huỷ / hoàn thì không gọi lại nữa.
          Mỗi lần gọi lại, tổng đài có thể tự đổ chuông thêm theo cấu hình riêng của nhà cung cấp.
        </CfgNote>
      </CfgCard>
    </>
  );
}

function TestResult({ r }: { r: AutoCallResult }) {
  if (r.ok) {
    return (
      <p className="mt-2 text-xs text-emerald-600">
        ✓ {r.message ?? "Kết nối OK"} · {r.baseUrl}
        {r.testedAt ? ` · ${new Date(r.testedAt).toLocaleString("vi-VN")}` : ""}
      </p>
    );
  }
  return (
    <div className="mt-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
      <div>
        {r.message ?? "Kết nối thất bại"}
        {r.httpStatus ? ` · HTTP ${r.httpStatus}` : ""}
      </div>
      {r.code === "IP_NOT_ALLOWED" ? (
        <div className="mt-1 text-foreground">
          IP ra của máy chủ:{" "}
          <span className="font-mono font-medium">{r.serverOutboundIp ?? "không xác định"}</span> —
          gửi IP này cho HHVN Tech để whitelist. Railway cần bật Static Outbound IP, nếu không IP sẽ
          đổi sau mỗi lần deploy.
        </div>
      ) : null}
    </div>
  );
}
