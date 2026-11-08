import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePagedRows } from "@/lib/use-paged-rows";
import { TablePagination } from "@/components/TablePagination";
import { ProtectedPage } from "@/components/AppShell";
import { M3Page } from "@/components/M3Page";
import { M3Confirm } from "@/components/m3/M3Confirm";
import { StaffInfoPopover } from "@/components/StaffInfoPopover";
import { toast } from "sonner";
import {
  decideLoginTrust,
  listLoginTrusts,
  listUserSessions,
  revokeUserSession,
  type LoginTrustRow,
  type UserSessionRow,
} from "@/lib/api/login-control-api";

export const Route = createFileRoute("/phien-dang-nhap")({
  head: () => ({ meta: [{ title: "Phiên đăng nhập & thiết bị — X.E" }] }),
  component: () => (
    <ProtectedPage title="Phiên đăng nhập & thiết bị" screen="phien-dang-nhap" hidePageTitle>
      <M3Page>
        <Page />
      </M3Page>
    </ProtectedPage>
  ),
});

type Tab = "PENDING" | "TRUSTED" | "SESSIONS";

const TABS: { key: Tab; label: string; icon: string; hint: string }[] = [
  {
    key: "PENDING",
    label: "Chờ duyệt",
    icon: "pending_actions",
    hint: "Điều phối / Kế toán đăng nhập web trên trình duyệt lạ, hoặc tài khoản đăng nhập app trên thiết bị lạ. Duyệt xong người dùng đăng nhập lại là vào được (không khóa theo IP).",
  },
  {
    key: "TRUSTED",
    label: "Thiết bị đã duyệt",
    icon: "verified",
    hint: "Thu hồi: máy/trình duyệt đó bị đăng xuất ngay và lần sau phải xin duyệt lại.",
  },
  {
    key: "SESSIONS",
    label: "Phiên đang đăng nhập",
    icon: "devices",
    hint: "Mỗi tài khoản tối đa 1 phiên web + 1 phiên app; đăng nhập nơi mới thì phiên cũ tự bị đăng xuất. Admin / Điều phối được mở nhiều phiên web cùng lúc.",
  },
];

const ROLE_LABEL: Record<string, string> = {
  DH: "Điều phối",
  KT: "Kế toán",
  AD: "Admin",
  Q: "Quầy",
  TCN: "Trưởng CN",
  BX: "Bốc xếp",
  G: "Giao hàng",
  BL: "Ban lãnh đạo",
  KH: "Khách hàng",
};

function fmt(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
}

function who(r: { userLogin: string; displayName?: string | null; roleCode?: string | null }) {
  return (
    <>
      <StaffInfoPopover staffKey={r.userLogin}>{r.displayName || r.userLogin}</StaffInfoPopover>
      <span className="sub">
        {r.userLogin}
        {r.roleCode ? ` · ${ROLE_LABEL[r.roleCode] ?? r.roleCode}` : ""}
      </span>
    </>
  );
}

function shortAgent(ua?: string | null) {
  if (!ua) return "";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : "";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Android/.test(ua)
      ? "Android"
      : /iPhone|iPad/.test(ua)
        ? "iOS"
        : /Mac OS/.test(ua)
          ? "macOS"
          : "";
  return [browser, os].filter(Boolean).join(" · ") || ua.slice(0, 60);
}

function devIcon(label?: string | null) {
  return /android|ios|iphone|ipad|điện thoại/i.test(label ?? "") ? "smartphone" : "computer";
}

function Page() {
  const [tab, setTab] = useState<Tab>("PENDING");
  const [ask, setAsk] = useState<{
    title: string;
    body: string;
    label: string;
    run: () => void;
  } | null>(null);
  const [trusts, setTrusts] = useState<LoginTrustRow[]>([]);
  const [sessions, setSessions] = useState<UserSessionRow[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [t, s] = await Promise.all([listLoginTrusts(), listUserSessions()]);
      setTrusts(t ?? []);
      setSessions(s ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không tải được dữ liệu");
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 20_000);
    return () => window.clearInterval(id);
  }, [load]);

  const kw = q.trim().toLowerCase();
  const match = (r: { userLogin: string; displayName?: string | null }, extra: string) =>
    !kw || `${r.userLogin} ${r.displayName ?? ""} ${extra}`.toLowerCase().includes(kw);

  const pending = useMemo(
    () => trusts.filter((t) => t.status === "PENDING" && match(t, `${t.value} ${t.label ?? ""}`)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trusts, kw],
  );
  const trusted = useMemo(
    () =>
      trusts.filter(
        (t) =>
          (t.status === "APPROVED" || t.status === "REJECTED") &&
          match(t, `${t.value} ${t.label ?? ""}`),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trusts, kw],
  );
  const activeSessions = useMemo(
    () => sessions.filter((s) => match(s, `${s.ip ?? ""} ${s.deviceName ?? ""}`)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessions, kw],
  );
  const pendingPage = usePagedRows(pending, "phien-dang-nhap.pending");
  const trustedPage = usePagedRows(trusted, "phien-dang-nhap.trusted");
  const sessionsPage = usePagedRows(activeSessions, "phien-dang-nhap.sessions");

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không thực hiện được");
    } finally {
      setBusy(false);
    }
  };

  const counts: Record<Tab, number> = {
    PENDING: trusts.filter((t) => t.status === "PENDING").length,
    TRUSTED: trusts.filter((t) => t.status === "APPROVED" || t.status === "REJECTED").length,
    SESSIONS: sessions.length,
  };
  const trustTarget = (t: LoginTrustRow) => (
    <span className="who">
      <span className="rev-ic sm" aria-hidden="true">
        <span className="ms">{devIcon(t.label)}</span>
      </span>
      {t.kind === "IP" ? (
        <span>
          <span className="num">IP {t.value}</span>
          <span className="sub">Web (cũ) · {shortAgent(t.label)}</span>
        </span>
      ) : (
        <span>
          {t.label || "Thiết bị không tên"}
          <span className="sub">
            Mã {t.value.slice(0, 8)}…{t.lastIp ? ` · IP gần nhất ${t.lastIp}` : ""}
          </span>
        </span>
      )}
    </span>
  );

  const sessionTarget = (s: UserSessionRow) => (
    <span className="who">
      <span className="rev-ic sm" aria-hidden="true">
        <span className="ms">{s.channel === "APP" ? "smartphone" : "computer"}</span>
      </span>
      <span>
        {s.channel === "APP"
          ? s.deviceName || "Thiết bị không tên"
          : shortAgent(s.userAgent) || "Trình duyệt"}
        <span className="sub num">{s.ip ? `IP ${s.ip}` : "—"}</span>
      </span>
    </span>
  );

  const empty = (icon: string, text: string) => (
    <div className="empty" style={{ padding: "48px 16px" }}>
      <span className="ms muted" aria-hidden="true" style={{ fontSize: 40 }}>
        {icon}
      </span>
      <h2 className="group-title" style={{ marginTop: 12 }}>
        {text}
      </h2>
    </div>
  );

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="title-row">
        <div style={{ flex: "1 1 480px", minWidth: 0 }}>
          <h1 className="page-title">Phiên đăng nhập &amp; thiết bị</h1>
          <div className="lab muted" style={{ maxWidth: 760 }}>
            Đăng nhập trên trình duyệt hoặc thiết bị lạ cần được duyệt. Duyệt xong người dùng đăng
            nhập lại là vào được.
          </div>
        </div>
        <button type="button" className="btn tonal" onClick={() => void load()}>
          <span className="ms" aria-hidden="true">
            refresh
          </span>
          Tải lại
        </button>
      </div>
      <div
        className="seg"
        role="tablist"
        aria-label="Loại danh sách"
        style={{ alignSelf: "flex-start" }}
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            title={t.hint}
            className={tab === t.key ? "on" : undefined}
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
          >
            <span className="ms" aria-hidden="true">
              {t.icon}
            </span>
            {t.label}
            <span className="count num">{counts[t.key]}</span>
          </button>
        ))}
      </div>

      <section className="card stack">
        <label className="box input-box" style={{ maxWidth: 360 }}>
          <span className="ms muted" aria-hidden="true">
            search
          </span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tài khoản / thiết bị / IP"
            aria-label="Tìm tài khoản, thiết bị, IP"
          />
        </label>

        {tab === "PENDING" ? (
          pending.length === 0 ? (
            empty("verified_user", "Không có yêu cầu chờ duyệt")
          ) : (
            <div className="scroller">
              <table className="tbl" style={{ ["--tbl-min" as string]: "760px" }}>
                <thead>
                  <tr>
                    <th>Tài khoản</th>
                    <th>Thiết bị</th>
                    <th>Yêu cầu lúc</th>
                    <th className="r">Tác vụ</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingPage.pageRows.map((t) => (
                    <tr key={t.id}>
                      <td className="main">{who(t)}</td>
                      <td>{trustTarget(t)}</td>
                      <td className="num">{fmt(t.requestedAt)}</td>
                      <td>
                        <div className="act">
                          <button
                            type="button"
                            className="text-act danger"
                            disabled={busy}
                            onClick={() =>
                              void act(
                                () => decideLoginTrust(t.id, "reject"),
                                `Đã từ chối ${t.userLogin}`,
                              )
                            }
                          >
                            Từ chối
                          </button>
                          <button
                            type="button"
                            className="ok"
                            disabled={busy}
                            onClick={() =>
                              void act(
                                () => decideLoginTrust(t.id, "approve"),
                                `Đã duyệt cho ${t.userLogin}`,
                              )
                            }
                          >
                            Duyệt
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}

        {tab === "TRUSTED" ? (
          trusted.length === 0 ? (
            empty("devices", "Chưa có thiết bị nào được duyệt")
          ) : (
            <div className="scroller">
              <table className="tbl" style={{ ["--tbl-min" as string]: "760px" }}>
                <thead>
                  <tr>
                    <th>Tài khoản</th>
                    <th>Thiết bị</th>
                    <th>Trạng thái</th>
                    <th>Dùng gần nhất</th>
                    <th className="r">Tác vụ</th>
                  </tr>
                </thead>
                <tbody>
                  {trustedPage.pageRows.map((t) => (
                    <tr key={t.id}>
                      <td className="main">{who(t)}</td>
                      <td>{trustTarget(t)}</td>
                      <td>
                        <span className={t.status === "APPROVED" ? "tag ok" : "tag err"}>
                          {t.status === "APPROVED" ? "Đã duyệt" : "Từ chối"}
                        </span>
                        <span className="sub">
                          {t.decidedBy ?? ""} · {fmt(t.decidedAt)}
                        </span>
                      </td>
                      <td className="num">{fmt(t.lastSeenAt)}</td>
                      <td>
                        <div className="act">
                          {t.status === "APPROVED" ? (
                            <button
                              type="button"
                              className="text-act danger"
                              disabled={busy}
                              onClick={() =>
                                setAsk({
                                  title: `Thu hồi ${t.kind === "IP" ? "IP " + t.value : "thiết bị"} của ${t.userLogin}?`,
                                  body: "Máy đó sẽ bị đăng xuất ngay và lần sau phải xin duyệt lại.",
                                  label: "Thu hồi",
                                  run: () =>
                                    void act(() => decideLoginTrust(t.id, "revoke"), "Đã thu hồi"),
                                })
                              }
                            >
                              Thu hồi
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="ok"
                              disabled={busy}
                              onClick={() =>
                                void act(() => decideLoginTrust(t.id, "approve"), "Đã duyệt lại")
                              }
                            >
                              Duyệt lại
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}

        {tab === "SESSIONS" ? (
          activeSessions.length === 0 ? (
            empty("devices", "Không có phiên nào")
          ) : (
            <div className="scroller">
              <table className="tbl" style={{ ["--tbl-min" as string]: "860px" }}>
                <thead>
                  <tr>
                    <th>Tài khoản</th>
                    <th>Kênh</th>
                    <th>Thiết bị</th>
                    <th>Đăng nhập lúc</th>
                    <th>Hoạt động gần nhất</th>
                    <th className="r">Tác vụ</th>
                  </tr>
                </thead>
                <tbody>
                  {sessionsPage.pageRows.map((s) => (
                    <tr key={s.id}>
                      <td className="main">{who(s)}</td>
                      <td>{s.channel === "APP" ? "App" : "Web"}</td>
                      <td>{sessionTarget(s)}</td>
                      <td className="num">{fmt(s.createdAt)}</td>
                      <td className="num muted">{fmt(s.lastSeenAt)}</td>
                      <td>
                        <div className="act">
                          <button
                            type="button"
                            className="text-act danger"
                            disabled={busy}
                            onClick={() =>
                              setAsk({
                                title: `Đăng xuất ${s.userLogin} khỏi ${s.channel === "APP" ? "app" : "web"}?`,
                                body: "Phiên này sẽ kết thúc ngay; người dùng phải đăng nhập lại.",
                                label: "Đăng xuất",
                                run: () =>
                                  void act(
                                    () => revokeUserSession(s.id),
                                    `Đã đăng xuất ${s.userLogin}`,
                                  ),
                              })
                            }
                          >
                            Đăng xuất
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}

        {tab === "PENDING" && pending.length > 0 ? (
          <TablePagination pager={pendingPage.pager} />
        ) : null}
        {tab === "TRUSTED" && trusted.length > 0 ? (
          <TablePagination pager={trustedPage.pager} />
        ) : null}
        {tab === "SESSIONS" && activeSessions.length > 0 ? (
          <TablePagination pager={sessionsPage.pager} />
        ) : null}
      </section>

      <M3Confirm
        open={ask != null}
        onOpenChange={(v) => !v && setAsk(null)}
        title={ask?.title ?? ""}
        body={ask?.body}
        confirmLabel={ask?.label ?? "Xác nhận"}
        confirmDanger
        onConfirm={() => ask?.run()}
      />
    </div>
  );
}
