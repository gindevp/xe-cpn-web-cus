import { createFileRoute } from "@tanstack/react-router";
import { ProtectedPage } from "@/components/AppShell";
import { M3Page } from "@/components/M3Page";
import { AutoCallIntegration } from "@/components/AutoCallIntegration";
import { BidvCollectionIntegration } from "@/components/BidvCollectionIntegration";
import { OnePayCollectionIntegration } from "@/components/OnePayCollectionIntegration";
import { Section } from "@/components/PageBits";
import {
  CfgActs as Acts,
  CfgField as F,
  CfgInput as TInput,
  CfgSeg as Seg,
  CfgSubTabs,
  CfgUrl as CallbackUrl,
  type CollectSub,
} from "@/components/m3/CfgKit";
import { SecretInput } from "@/components/SecretInput";
import { TelegramAlertIntegration } from "@/components/TelegramAlertIntegration";
import { ZaloZnsIntegration } from "@/components/ZaloZnsIntegration";
import { getApiBase, isApiEnabled } from "@/lib/api/client";
import { useStore, type Integrations } from "@/lib/store";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const TABS = [
  "van-chuyen",
  "ban-do",
  "luu-tru",
  "autocall",
  "zalo-zns",
  "thu-ho",
  "telegram",
] as const;
type TabKey = (typeof TABS)[number];

/** Tab shell khớp design-ref TichHop.dc.html (`.seg` + icon). */
const TAB_META: { id: TabKey; label: string; icon: string }[] = [
  { id: "van-chuyen", label: "Vận chuyển", icon: "local_shipping" },
  { id: "ban-do", label: "Bản đồ", icon: "map" },
  { id: "luu-tru", label: "Lưu trữ", icon: "cloud" },
  { id: "autocall", label: "Auto Call", icon: "phone_in_talk" },
  { id: "zalo-zns", label: "Zalo ZNS", icon: "chat" },
  { id: "thu-ho", label: "Thu hộ", icon: "payments" },
  { id: "telegram", label: "Telegram", icon: "send" },
];

function daysInput(v: number | null | undefined) {
  return v != null && v > 0 ? String(v) : "";
}

function parseDays(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(Math.floor(n), 3650);
}

export const Route = createFileRoute("/tich-hop")({
  head: () => ({ meta: [{ title: "Tích hợp — X.E" }] }),
  validateSearch: (search: Record<string, unknown>): { tab?: TabKey } => {
    // Tab cũ "ttl-anh" gộp vào "luu-tru".
    if (search.tab === "ttl-anh") return { tab: "luu-tru" };
    return TABS.includes(search.tab as TabKey) ? { tab: search.tab as TabKey } : {};
  },
  component: () => (
    <ProtectedPage title="Cấu hình tích hợp" screen="tich-hop" hidePageTitle>
      <M3Page>
        <Page />
      </M3Page>
    </ProtectedPage>
  ),
});

function Page() {
  const { tab = "van-chuyen" } = Route.useSearch();
  const navigate = Route.useNavigate();
  const tabIcon = TAB_META.find((t) => t.id === tab)?.icon ?? "tune";
  const [collectSub, setCollectSub] = useState<CollectSub>("ket-noi");
  const integrations = useStore((s) => s.integrations);
  const setIntegrations = useStore((s) => s.setIntegrations);
  const [f, setF] = useState<Integrations>({
    ahamoveApiKey: "",
    ahamoveMobile: integrations.ahamoveMobile ?? "",
    ahamoveSenderMobile: integrations.ahamoveSenderMobile ?? "",
    ahamovePaymentMethod: integrations.ahamovePaymentMethod ?? "BALANCE",
    grabToken: "",
    grabClientId: integrations.grabClientId ?? "",
    grabClientSecret: "",
    grabPartnerId: integrations.grabPartnerId ?? "",
    grabSandbox: integrations.grabSandbox === true,
    grabPaymentMethod: integrations.grabPaymentMethod ?? "BALANCE",
    goongToken: "",
    goongMapTilesKey: "",
    mapProvider: integrations.mapProvider ?? "OSM",
    telegramToken: "",
    telegramChatId: integrations.telegramChatId ?? "",
    webhookUrl: integrations.webhookUrl ?? "",
    webhookSecret: "",
    minioEndpoint: integrations.minioEndpoint ?? "",
    minioBucket: integrations.minioBucket ?? "cpn",
    minioRegion: integrations.minioRegion ?? "us-east-1",
    minioAccessKey: integrations.minioAccessKey ?? "",
    minioSecretKey: "",
    mediaRetentionAttendanceDays: integrations.mediaRetentionAttendanceDays ?? null,
    mediaRetentionVehicleDays: integrations.mediaRetentionVehicleDays ?? null,
    mediaRetentionInventoryDays: integrations.mediaRetentionInventoryDays ?? null,
  });
  const [testing, setTesting] = useState(false);
  const [testingAhamove, setTestingAhamove] = useState(false);
  const [testingGrab, setTestingGrab] = useState(false);
  const [testingMinio, setTestingMinio] = useState(false);
  const [migratingMinio, setMigratingMinio] = useState(false);
  const [saving, setSaving] = useState(false);
  const [apiKeyFocused, setApiKeyFocused] = useState(false);
  const SECRET_MASK = "••••••••••••";
  const hasSavedApiKey = Boolean(integrations.ahamoveApiKey?.trim());
  // Load cấu hình từ BE khi vào màn — tránh store trống / lệch DB.
  useEffect(() => {
    if (!isApiEnabled()) return;
    void (async () => {
      try {
        const { fetchIntegrationConfig } = await import("@/lib/api/finance-config-api");
        const saved = await fetchIntegrationConfig();
        useStore.setState({ integrations: saved });
        setF((prev) => ({
          ...prev,
          ahamoveMobile: saved.ahamoveMobile ?? prev.ahamoveMobile ?? "",
          ahamoveSenderMobile: saved.ahamoveSenderMobile ?? prev.ahamoveSenderMobile ?? "",
          ahamovePaymentMethod:
            saved.ahamovePaymentMethod ?? prev.ahamovePaymentMethod ?? "BALANCE",
          grabClientId: saved.grabClientId ?? prev.grabClientId ?? "",
          grabPartnerId: saved.grabPartnerId ?? prev.grabPartnerId ?? "",
          grabSandbox: saved.grabSandbox === true,
          grabPaymentMethod: saved.grabPaymentMethod ?? prev.grabPaymentMethod ?? "BALANCE",
          mapProvider: saved.mapProvider ?? prev.mapProvider ?? "OSM",
          telegramChatId: saved.telegramChatId ?? prev.telegramChatId ?? "",
          webhookUrl: saved.webhookUrl ?? prev.webhookUrl ?? "",
          minioEndpoint: saved.minioEndpoint ?? prev.minioEndpoint ?? "",
          minioBucket: saved.minioBucket ?? prev.minioBucket ?? "cpn",
          minioRegion: saved.minioRegion ?? prev.minioRegion ?? "us-east-1",
          minioAccessKey: saved.minioAccessKey ?? prev.minioAccessKey ?? "",
          mediaRetentionAttendanceDays: saved.mediaRetentionAttendanceDays ?? null,
          mediaRetentionVehicleDays: saved.mediaRetentionVehicleDays ?? null,
          mediaRetentionInventoryDays: saved.mediaRetentionInventoryDays ?? null,
        }));
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const save = () => {
    const typedKey = f.ahamoveApiKey?.trim() || "";
    const isNewKey = Boolean(typedKey) && typedKey !== SECRET_MASK;
    const apiKey = isNewKey ? typedKey : "";
    const mobile = f.ahamoveMobile?.trim() || integrations.ahamoveMobile?.trim() || "";
    if (apiKey && !mobile) {
      return toast.error("Lưu Ahamove cần thêm SĐT (API key + SĐT mới lấy được token)");
    }
    if (f.ahamoveMobile?.trim() && !apiKey && !hasSavedApiKey) {
      return toast.error("Lưu Ahamove cần thêm API Key");
    }
    const patch: Integrations = {};
    (Object.keys(f) as (keyof Integrations)[]).forEach((k) => {
      if (k === "ahamoveApiKey") return;
      if (k === "mapProvider") return;
      const val = (f as any)[k];
      if (val && val !== SECRET_MASK) (patch as any)[k] = val;
    });
    patch.mapProvider = f.mapProvider === "GOONG" ? "GOONG" : "OSM";
    if (apiKey && mobile) {
      patch.ahamoveApiKey = apiKey;
      patch.ahamoveMobile = mobile;
    } else if (f.ahamoveMobile?.trim()) {
      patch.ahamoveMobile = mobile;
    }
    patch.ahamoveSenderMobile = f.ahamoveSenderMobile?.trim() ?? "";
    patch.grabSandbox = f.grabSandbox === true;
    patch.grabPaymentMethod = f.grabPaymentMethod === "CASH" ? "CASH" : "BALANCE";
    // Luôn gửi TTL (null/0 = không xóa) — forEach bỏ qua null vì falsy.
    patch.mediaRetentionAttendanceDays = f.mediaRetentionAttendanceDays ?? null;
    patch.mediaRetentionVehicleDays = f.mediaRetentionVehicleDays ?? null;
    patch.mediaRetentionInventoryDays = f.mediaRetentionInventoryDays ?? null;
    setSaving(true);
    void (async () => {
      try {
        if (!isApiEnabled()) {
          setIntegrations(patch);
          toast.success("Đã lưu (local)");
          return;
        }
        const { putIntegrationConfig, fetchIntegrationConfig } =
          await import("@/lib/api/finance-config-api");
        const saved = await putIntegrationConfig(patch);
        useStore.setState({ integrations: saved });
        // Đồng bộ lại từ GET — xác nhận key đã nằm DB.
        try {
          const fresh = await fetchIntegrationConfig();
          useStore.setState({ integrations: fresh });
        } catch {
          /* keep saved */
        }
        setF((prev) => ({
          ...prev,
          ahamoveApiKey: "",
          grabToken: "",
          grabClientSecret: "",
          goongToken: "",
          goongMapTilesKey: "",
          mapProvider: saved.mapProvider ?? prev.mapProvider ?? "OSM",
          telegramToken: "",
          webhookSecret: "",
          minioSecretKey: "",
          ahamoveMobile: mobile || prev.ahamoveMobile,
          ahamoveSenderMobile: saved.ahamoveSenderMobile ?? "",
          mediaRetentionAttendanceDays: saved.mediaRetentionAttendanceDays ?? null,
          mediaRetentionVehicleDays: saved.mediaRetentionVehicleDays ?? null,
          mediaRetentionInventoryDays: saved.mediaRetentionInventoryDays ?? null,
        }));
        setApiKeyFocused(false);
        toast.success(saved.ahamoveApiKey ? "Đã lưu API key + SĐT Ahamove" : "Đã lưu");
      } catch (e: any) {
        toast.error(e?.message ?? "Lưu thất bại");
      } finally {
        setSaving(false);
      }
    })();
  };

  const testAhamove = () => {
    const typedKey = f.ahamoveApiKey?.trim() || "";
    const isNewKey = Boolean(typedKey) && typedKey !== SECRET_MASK;
    const apiKey = isNewKey ? typedKey : undefined;
    const mobile = f.ahamoveMobile?.trim() || integrations.ahamoveMobile?.trim() || undefined;
    if (!apiKey && !hasSavedApiKey) {
      return toast.error("Nhập API Key Ahamove (hoặc Lưu key trước)");
    }
    if (!mobile) {
      return toast.error("Nhập SĐT Ahamove (bắt buộc cùng API key để lấy token)");
    }
    setTestingAhamove(true);
    void (async () => {
      try {
        if (!isApiEnabled()) throw new Error("API chưa cấu hình");
        const { testAhamoveApiKey, fetchIntegrationConfig } =
          await import("@/lib/api/finance-config-api");
        // Có key mới trên input → gửi kèm; không thì BE dùng key đã lưu.
        const body: { ahamoveApiKey?: string; ahamoveMobile: string } = { ahamoveMobile: mobile };
        if (apiKey) body.ahamoveApiKey = apiKey;
        const r = await testAhamoveApiKey(body);
        if (r.ok === false || r.ahamoveTokenOk === false) {
          toast.error(r.ahamoveError || r.message || "Lấy token Ahamove thất bại");
        } else {
          toast.success(
            apiKey
              ? r.message || "API key OK — đã lưu & lấy token"
              : (r.message || "OK") + " (dùng API key đã lưu)",
          );
          setF((prev) => ({ ...prev, ahamoveApiKey: "", ahamoveMobile: mobile }));
          setApiKeyFocused(false);
          try {
            const saved = await fetchIntegrationConfig();
            useStore.setState({ integrations: saved });
          } catch {
            /* ignore */
          }
        }
      } catch (e: any) {
        toast.error(e?.message ?? "Test Ahamove thất bại");
      } finally {
        setTestingAhamove(false);
      }
    })();
  };

  const testGrab = () => {
    setTestingGrab(true);
    void (async () => {
      try {
        if (!isApiEnabled()) throw new Error("API chưa cấu hình");
        const { testGrabApi } = await import("@/lib/api/finance-config-api");
        const r = await testGrabApi();
        if (r.ok === false || r.grabTokenOk === false)
          toast.error(r.grabError || "Grab từ chối token");
        else toast.success("Grab đã cấp token");
      } catch (e: any) {
        toast.error(e?.message ?? "Test Grab thất bại");
      } finally {
        setTestingGrab(false);
      }
    })();
  };

  const minioSecretReady =
    Boolean(f.minioSecretKey?.trim()) || Boolean(integrations.minioSecretConfigured);
  const minioTestReady = Boolean(
    f.minioEndpoint?.trim() &&
    f.minioBucket?.trim() &&
    f.minioAccessKey?.trim() &&
    minioSecretReady,
  );

  const testMinio = () => {
    if (!minioTestReady) return toast.error("Điền đủ endpoint, bucket, access key và secret");
    setTestingMinio(true);
    void (async () => {
      try {
        const { testMinio: run } = await import("@/lib/api/finance-config-api");
        const r = await run({
          minioEndpoint: f.minioEndpoint,
          minioBucket: f.minioBucket,
          minioRegion: f.minioRegion,
          minioAccessKey: f.minioAccessKey,
          minioSecretKey: f.minioSecretKey?.trim() || undefined,
        });
        if (r.ok === false) toast.error(r.message || "Test MinIO thất bại");
        else toast.success(r.message || "Kết nối MinIO OK");
      } catch (e: any) {
        toast.error(e?.message ?? "Test MinIO thất bại");
      } finally {
        setTestingMinio(false);
      }
    })();
  };

  const migrateMinio = () => {
    if (!integrations.minioConfigured)
      return toast.error("Lưu cấu hình MinIO trước khi chuyển ảnh cũ");
    setMigratingMinio(true);
    void (async () => {
      try {
        const { migrateMinioBlobs } = await import("@/lib/api/finance-config-api");
        let total = 0;
        for (let i = 0; i < 500; i++) {
          const r = await migrateMinioBlobs();
          if (r.ok === false) throw new Error(r.message || "Chuyển ảnh thất bại");
          const moved = r.moved ?? 0;
          total += moved;
          if (!r.hasMore || moved === 0) {
            if (r.hasMore && moved === 0)
              toast.message("Còn ảnh không chuyển được — giữ nguyên trong database");
            break;
          }
        }
        toast.success(
          total > 0
            ? `Đã chuyển ${total} ảnh/file lên MinIO`
            : "Không còn ảnh data-URL trong database",
        );
      } catch (e: any) {
        toast.error(e?.message ?? "Chuyển ảnh thất bại");
      } finally {
        setMigratingMinio(false);
      }
    })();
  };

  const test = () => {
    const anyFilled = Object.values(f).some((v) => v) || Object.values(integrations).some((v) => v);
    if (!anyFilled) return toast.error("Chưa cấu hình gì");
    setTesting(true);
    void (async () => {
      try {
        const { isApiEnabled } = await import("@/lib/api/client");
        if (isApiEnabled()) {
          const { testIntegrationConfig } = await import("@/lib/api/finance-config-api");
          const r = await testIntegrationConfig();
          if ((r as any)?.ok === false) {
            toast.error((r as any)?.ahamoveError ?? "Test thất bại");
          } else {
            toast.success("Test kết nối OK");
          }
        } else {
          toast.success("Test kết nối OK");
        }
      } catch (e: any) {
        toast.error(e?.message ?? "Test kết nối thất bại");
      } finally {
        setTesting(false);
      }
    })();
  };

  return (
    <div className="stack" style={{ gap: 16 }}>
      <h1 className="page-title">Tích hợp</h1>
      <div
        className="seg"
        role="tablist"
        aria-label="Nhóm tích hợp"
        style={{ alignSelf: "flex-start" }}
      >
        {TAB_META.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            className={tab === t.id ? "on" : undefined}
            aria-selected={tab === t.id}
            onClick={() => navigate({ search: { tab: t.id }, replace: true })}
          >
            <span className="ms" aria-hidden="true">
              {t.icon}
            </span>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "van-chuyen" ? (
        <div className="stack" style={{ gap: 16 }}>
          <Section title="Ahamove" icon={tabIcon}>
            <div className="cfg-grid">
              <F label="API Key" saved={hasSavedApiKey}>
                <SecretInput
                  name="ahamove-api-key"
                  placeholder={hasSavedApiKey ? "Nhập giá trị mới để thay" : "API key Partner"}
                  value={
                    f.ahamoveApiKey
                      ? f.ahamoveApiKey
                      : !apiKeyFocused && hasSavedApiKey
                        ? SECRET_MASK
                        : ""
                  }
                  onFocus={() => {
                    setApiKeyFocused(true);
                    if (!f.ahamoveApiKey && hasSavedApiKey) {
                      setF((prev) => ({ ...prev, ahamoveApiKey: "" }));
                    }
                  }}
                  onBlur={() => {
                    if (!f.ahamoveApiKey?.trim()) setApiKeyFocused(false);
                  }}
                  onChange={(e) => setF({ ...f, ahamoveApiKey: e.target.value })}
                />
              </F>
              <F label="SĐT tài khoản" saved={!!integrations.ahamoveMobile}>
                <TInput
                  className="num"
                  placeholder={integrations.ahamoveMobile || "84xxxxxxxxx (vd 84901234567)"}
                  value={f.ahamoveMobile ?? ""}
                  onChange={(e) => setF({ ...f, ahamoveMobile: e.target.value })}
                />
              </F>
              <F label="SĐT người gửi (tài xế gọi)" saved={!!integrations.ahamoveSenderMobile}>
                <TInput
                  className="num"
                  placeholder="Bỏ trống = gọi SĐT tài khoản Ahamove"
                  value={f.ahamoveSenderMobile ?? ""}
                  onChange={(e) => setF({ ...f, ahamoveSenderMobile: e.target.value })}
                />
              </F>
              <Seg
                label="Thanh toán phí"
                value={f.ahamovePaymentMethod === "CASH" ? "CASH" : "BALANCE"}
                options={[
                  { value: "BALANCE", label: "Trừ ví Ahamove" },
                  { value: "CASH", label: "Trả tiền mặt cho tài xế" },
                ]}
                onChange={(v) =>
                  setF({ ...f, ahamovePaymentMethod: v === "CASH" ? "CASH" : "BALANCE" })
                }
              />
              <CallbackUrl
                label="URL callback (đăng ký với Ahamove)"
                url={
                  integrations.ahamoveWebhookToken
                    ? `${getApiBase()}/api/public/ahamove/webhook?token=${integrations.ahamoveWebhookToken}`
                    : ""
                }
                emptyText="Bấm Lưu để sinh URL callback."
              />
              {integrations.ahamoveTokenFetchedAt ? (
                <div className="lab muted cfg-wide">
                  Token lấy lúc{" "}
                  {new Date(integrations.ahamoveTokenFetchedAt).toLocaleString("vi-VN")} · tự làm
                  mới mỗi tuần
                </div>
              ) : null}
            </div>
            <Acts>
              <button
                type="button"
                className="btn tonal"
                title="Chỉ kiểm tra API key và SĐT Ahamove, không gọi Grab."
                onClick={testAhamove}
                disabled={testingAhamove}
              >
                {testingAhamove ? "Đang lấy token…" : "Test Ahamove"}
              </button>
              <button type="button" className="btn" onClick={save} disabled={saving}>
                {saving ? "Đang lưu…" : "Lưu"}
              </button>
            </Acts>
          </Section>

          <Section title="Grab Express" icon={tabIcon}>
            <div className="cfg-grid">
              <F label="Client ID" saved={!!integrations.grabClientId}>
                <TInput
                  value={f.grabClientId ?? ""}
                  placeholder="Nhập Client ID"
                  onChange={(e) => setF({ ...f, grabClientId: e.target.value })}
                  autoComplete="off"
                />
              </F>
              <F label="Client Secret" saved={!!integrations.grabClientSecretConfigured}>
                <SecretInput
                  placeholder={
                    integrations.grabClientSecretConfigured
                      ? "Nhập giá trị mới để thay"
                      : "Nhập secret"
                  }
                  value={f.grabClientSecret ?? ""}
                  onChange={(e) => setF({ ...f, grabClientSecret: e.target.value })}
                />
              </F>
              <F label="Partner ID">
                <TInput
                  value={f.grabPartnerId ?? ""}
                  placeholder="Nhập Partner ID"
                  onChange={(e) => setF({ ...f, grabPartnerId: e.target.value })}
                  autoComplete="off"
                />
              </F>
              <Seg
                label="Môi trường"
                value={f.grabSandbox === true ? "stg" : "prod"}
                options={[
                  { value: "prod", label: "Production" },
                  { value: "stg", label: "Staging (sandbox)" },
                ]}
                onChange={(v) => setF({ ...f, grabSandbox: v === "stg" })}
              />
              <Seg
                label="Thanh toán phí"
                value={f.grabPaymentMethod === "CASH" ? "CASH" : "BALANCE"}
                options={[
                  { value: "BALANCE", label: "Trừ ví Grab" },
                  { value: "CASH", label: "Trả tiền mặt cho tài xế" },
                ]}
                onChange={(v) =>
                  setF({ ...f, grabPaymentMethod: v === "CASH" ? "CASH" : "BALANCE" })
                }
              />
              <CallbackUrl
                label="URL callback (dán vào Grab Express Integration)"
                url={
                  integrations.grabWebhookToken
                    ? `${getApiBase()}/api/public/grab/webhook?token=${integrations.grabWebhookToken}`
                    : ""
                }
                emptyText="Bấm Lưu để sinh URL callback Grab."
              />
            </div>
            <Acts updatedAt={integrations.updatedAt}>
              <button
                type="button"
                className="btn tonal"
                title="Chỉ lấy token Grab bằng client đã lưu, không gọi Ahamove."
                onClick={testGrab}
                disabled={testingGrab}
              >
                {testingGrab ? "Đang lấy token…" : "Test Grab"}
              </button>
              <button type="button" className="btn" onClick={save} disabled={saving}>
                {saving ? "Đang lưu…" : "Lưu"}
              </button>
            </Acts>
          </Section>
        </div>
      ) : null}

      {tab === "ban-do" ? (
        <div className="stack" style={{ gap: 16 }}>
          <Section
            title={
              <span
                style={{
                  display: "inline-flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: "8px 12px",
                }}
              >
                Bản đồ / Khoảng cách
                <span
                  className={
                    integrations.mapProvider === "GOONG" && !integrations.goongMapTilesKey
                      ? "tag warn"
                      : "tag info"
                  }
                >
                  Đang dùng: {integrations.mapProvider === "GOONG" ? "Goong" : "OpenStreetMap"}
                  {integrations.mapProvider === "GOONG" && !integrations.goongMapTilesKey
                    ? " · thiếu Map tiles key"
                    : ""}
                </span>
              </span>
            }
            icon={tabIcon}
          >
            <div className="cfg-grid">
              <Seg
                label="Nhà cung cấp bản đồ pin"
                value={f.mapProvider === "GOONG" ? "GOONG" : "OSM"}
                options={[
                  { value: "OSM", label: "OpenStreetMap" },
                  { value: "GOONG", label: "Goong Map" },
                ]}
                onChange={(v) => setF({ ...f, mapProvider: v === "GOONG" ? "GOONG" : "OSM" })}
              />
              <F label="Goong REST / Places key" saved={!!integrations.goongToken}>
                <SecretInput
                  placeholder={
                    integrations.goongToken
                      ? "Nhập giá trị mới để thay"
                      : "API key (rsapi.goong.io)"
                  }
                  value={f.goongToken}
                  onChange={(e) => setF({ ...f, goongToken: e.target.value })}
                />
              </F>
              <F label="Goong Map tiles key" saved={!!integrations.goongMapTilesKey}>
                <SecretInput
                  placeholder={
                    integrations.goongMapTilesKey
                      ? "Nhập giá trị mới để thay"
                      : "Maptiles key (goong-js)"
                  }
                  value={f.goongMapTilesKey}
                  onChange={(e) => setF({ ...f, goongMapTilesKey: e.target.value })}
                />
              </F>
              <div className="note cfg-wide">
                REST key dùng geocode/places; Map tiles key dùng hiển thị bản đồ. Đây là hai key
                khác nhau trên{" "}
                <a
                  href="https://account.goong.io"
                  target="_blank"
                  rel="noreferrer"
                  style={{ textDecoration: "underline" }}
                >
                  account.goong.io
                </a>
                , dùng nhầm REST key cho bản đồ sẽ ra nền trắng. OSM không cần key.
              </div>
            </div>
            <Acts updatedAt={integrations.updatedAt}>
              <button type="button" className="btn tonal" onClick={test} disabled={testing}>
                {testing ? "Đang test…" : "Test kết nối"}
              </button>
              <button type="button" className="btn" onClick={save} disabled={saving}>
                {saving ? "Đang lưu…" : "Lưu"}
              </button>
            </Acts>
          </Section>
        </div>
      ) : null}

      {tab === "luu-tru" ? (
        <div className="stack" style={{ gap: 16 }}>
          <Section title="MinIO - ảnh và file" icon={tabIcon}>
            <div className="lab muted" style={{ maxWidth: 860, marginTop: -8 }}>
              Ảnh POD, ảnh hàng, phiếu thu, chấm công, kiểm kho, ảnh xe lưu trên MinIO. Database chỉ
              giữ mã file. Path-style luôn bật. Web tải ảnh qua API (HTTPS), không mở thẳng MinIO
              HTTP.
            </div>
            <div className="cfg-grid">
              <F label="Endpoint">
                <TInput
                  value={f.minioEndpoint ?? ""}
                  placeholder="http://host:9000"
                  onChange={(e) => setF({ ...f, minioEndpoint: e.target.value })}
                />
              </F>
              <F label="Bucket">
                <TInput
                  value={f.minioBucket ?? ""}
                  placeholder="cpn"
                  onChange={(e) => setF({ ...f, minioBucket: e.target.value })}
                />
              </F>
              <F label="Region">
                <TInput
                  value={f.minioRegion ?? ""}
                  placeholder="us-east-1"
                  onChange={(e) => setF({ ...f, minioRegion: e.target.value })}
                />
              </F>
              <F label="Access key" saved={!!integrations.minioAccessKey}>
                <TInput
                  value={f.minioAccessKey ?? ""}
                  placeholder="Nhập access key"
                  onChange={(e) => setF({ ...f, minioAccessKey: e.target.value })}
                />
              </F>
              <F label="Secret key" saved={!!integrations.minioSecretConfigured}>
                <SecretInput
                  placeholder={
                    integrations.minioSecretConfigured ? "Nhập giá trị mới để thay" : "Secret key"
                  }
                  value={f.minioSecretKey ?? ""}
                  onChange={(e) => setF({ ...f, minioSecretKey: e.target.value })}
                />
              </F>
              {!minioTestReady ? (
                <div className="lab muted cfg-wide">
                  Điền đủ endpoint, bucket, access key và secret (hoặc secret đã lưu) thì bấm được
                  Test.
                </div>
              ) : null}
            </div>
            <Acts>
              <button
                type="button"
                className="btn tonal"
                disabled={!integrations.minioConfigured || migratingMinio}
                onClick={migrateMinio}
              >
                {migratingMinio ? "Đang chuyển…" : "Chuyển ảnh cũ lên MinIO"}
              </button>
              <button
                type="button"
                className="btn tonal"
                disabled={!minioTestReady || testingMinio}
                onClick={testMinio}
              >
                {testingMinio ? "Đang thử…" : "Test kết nối"}
              </button>
              <button type="button" className="btn" onClick={save} disabled={saving}>
                {saving ? "Đang lưu…" : "Lưu"}
              </button>
            </Acts>
          </Section>

          <Section title="TTL ảnh - xoá theo số ngày" icon={tabIcon}>
            <div className="lab muted" style={{ maxWidth: 860, marginTop: -8 }}>
              Job chạy mỗi ngày 03:30 (giờ VN). Để trống = không xoá loại đó. Chỉ áp dụng chấm công,
              chấm xe, kiểm kho — không đụng POD / ảnh hàng / phiếu thu / sự cố.
            </div>
            <div className="cfg-grid">
              <F label="Chấm công (ngày)">
                <TInput
                  type="number"
                  className="num"
                  min={1}
                  max={3650}
                  inputMode="numeric"
                  placeholder="Trống = không xoá"
                  value={daysInput(f.mediaRetentionAttendanceDays)}
                  onChange={(e) =>
                    setF({ ...f, mediaRetentionAttendanceDays: parseDays(e.target.value) })
                  }
                />
              </F>
              <F label="Chấm xe (ngày)">
                <TInput
                  type="number"
                  className="num"
                  min={1}
                  max={3650}
                  inputMode="numeric"
                  placeholder="Trống = không xoá"
                  value={daysInput(f.mediaRetentionVehicleDays)}
                  onChange={(e) =>
                    setF({ ...f, mediaRetentionVehicleDays: parseDays(e.target.value) })
                  }
                />
              </F>
              <F label="Kiểm kho (ngày)">
                <TInput
                  type="number"
                  className="num"
                  min={1}
                  max={3650}
                  inputMode="numeric"
                  placeholder="Trống = không xoá"
                  value={daysInput(f.mediaRetentionInventoryDays)}
                  onChange={(e) =>
                    setF({ ...f, mediaRetentionInventoryDays: parseDays(e.target.value) })
                  }
                />
              </F>
            </div>
            <Acts updatedAt={integrations.updatedAt}>
              <button type="button" className="btn" onClick={save} disabled={saving}>
                {saving ? "Đang lưu…" : "Lưu"}
              </button>
            </Acts>
          </Section>
        </div>
      ) : null}

      {tab === "autocall" ? <AutoCallIntegration /> : null}
      {tab === "zalo-zns" ? <ZaloZnsIntegration /> : null}
      {tab === "thu-ho" ? (
        <div className="stack" style={{ gap: 16 }}>
          <CfgSubTabs
            tabs={[
              { id: "ket-noi", label: "Kết nối" },
              { id: "hoa-don", label: "Hoá đơn test" },
              { id: "nhat-ky", label: "Nhật ký" },
            ]}
            value={collectSub}
            onChange={setCollectSub}
          />
          <OnePayCollectionIntegration sub={collectSub} />
          <BidvCollectionIntegration sub={collectSub} />
        </div>
      ) : null}
      {tab === "telegram" ? <TelegramAlertIntegration /> : null}
    </div>
  );
}
