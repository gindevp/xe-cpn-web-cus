import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { isNativeWebView } from "@/lib/native-shell";
import { getToken } from "@/lib/api/client";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import xeLogo from "@/assets/logo-xe.png";
import { openSiblingUi, SIBLING_UI_LABEL } from "@/lib/sibling-ui";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Đăng nhập — X.E Việt Nam" },
      { name: "description", content: "Đăng nhập nội bộ hệ thống X.E Việt Nam — nền tảng quản lý vận tải đa công ty." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { session, hydrated, login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [devicePending, setDevicePending] = useState(false);
  const [giveUpNative, setGiveUpNative] = useState(false);

  useEffect(() => {
    if (!isNativeWebView()) return;
    const t = window.setTimeout(() => setGiveUpNative(true), 6000);
    return () => window.clearTimeout(t);
  }, []);

  const routeForRole = (role: string): string => {
    switch (role) {
      case "KT":
        return "/danh-sach-phieu-thu";
      case "AD":
        return "/tai-khoan";
      default:
        return "/dashboard";
    }
  };

  useEffect(() => {
    if (!hydrated) return;
    if (session) {
      navigate({ to: isNativeWebView() ? "/tac-vu" : routeForRole(session.role), replace: true });
    }
  }, [hydrated, session, navigate]);

  const accErr = tried && !username.trim() ? "Bạn nhập tài khoản hoặc email" : "";
  const pwErr = tried && !password ? "Bạn nhập mật khẩu" : "";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setTried(true);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    setTried(true);
    try {
      const r = await login(username, password);
      if (!r.ok) {
        const msg = r.error || "Tài khoản hoặc mật khẩu không đúng.";
        if (/thiết bị|device|chờ duyệt|pending/i.test(msg)) {
          setDevicePending(true);
          setPassword("");
        } else {
          setError(msg);
          setPassword("");
        }
      } else {
        toast.success("Đăng nhập thành công");
        navigate({ to: isNativeWebView() ? "/tac-vu" : routeForRole(r.role) });
      }
    } finally {
      setLoading(false);
    }
  };

  if (isNativeWebView() && (session || getToken()) && !error && !giveUpNative) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Đang vào hệ thống…
      </div>
    );
  }

  return (
    <main className="theme-light login font-inter">
      <section className="login-side">
        <div className="login-brand">
          <img src={xeLogo} alt="X.E Việt Nam" />
          <div className="lab login-sub">Quản lý vận tải hàng hóa</div>
        </div>
        <svg className="login-ill" viewBox="0 0 520 330" aria-hidden="true">
          <ellipse className="ill-soft" cx="260" cy="304" rx="250" ry="16" />
          <rect className="ill-mid" x="44" y="108" width="170" height="192" rx="8" />
          <rect className="ill-main" x="30" y="78" width="198" height="36" rx="8" />
          <rect className="ill-paper" x="84" y="89" width="90" height="14" rx="7" />
          <path
            className="ill-main"
            d="M44 114h28v14a14 14 0 0 1-28 0zM100 114h28v14a14 14 0 0 1-28 0zM156 114h28v14a14 14 0 0 1-28 0z"
          />
          <path
            className="ill-paper"
            d="M72 114h28v14a14 14 0 0 1-28 0zM128 114h28v14a14 14 0 0 1-28 0zM184 114h30v14a15 14 0 0 1-30 0z"
          />
          <rect className="ill-paper" x="66" y="172" width="62" height="52" rx="5" />
          <rect className="ill-main" x="146" y="172" width="48" height="128" rx="5" />
          <circle className="ill-paper" cx="184" cy="240" r="3.5" />
          <rect className="ill-box" x="64" y="256" width="44" height="44" rx="4" />
          <rect className="ill-box2" x="74" y="224" width="32" height="32" rx="4" />
          <path className="ill-paper" d="M81 256h8v14h-8zM86 224h7v10h-7z" />
          <rect className="ill-main" x="246" y="156" width="170" height="122" rx="9" />
          <rect className="ill-paper" x="266" y="180" width="86" height="11" rx="5.5" />
          <rect className="ill-mid" x="266" y="202" width="54" height="11" rx="5.5" />
          <path className="ill-mid" d="M420 192h44l36 44v42h-80z" />
          <path className="ill-paper" d="M434 204h24l24 30h-48z" />
          <circle className="ill-dark" cx="294" cy="282" r="23" />
          <circle className="ill-paper" cx="294" cy="282" r="9" />
          <circle className="ill-dark" cx="456" cy="282" r="23" />
          <circle className="ill-paper" cx="456" cy="282" r="9" />
          <rect className="ill-box" x="346" y="122" width="42" height="34" rx="3" />
          <rect className="ill-box2" x="296" y="122" width="46" height="34" rx="3" />
          <path className="ill-paper" d="M362 122h10v12h-10zM314 122h10v12h-10z" />
        </svg>
      </section>

      <section className="login-main">
        <div className="login-card">
          <div className="login-brand mobile">
            <img src={xeLogo} alt="X.E Việt Nam" />
            <div className="lab login-sub">Quản lý vận tải hàng hóa</div>
          </div>

          {devicePending ? (
            <div className="stack login-wait" role="status">
              <span className="rev-ic login-wait-ic" aria-hidden="true">
                <span className="ms fill">devices</span>
              </span>
              <div>
                <h1 className="login-title">Thiết bị đang chờ duyệt</h1>
                <p className="lab muted" style={{ margin: "8px 0 0" }}>
                  Đây là trình duyệt hoặc thiết bị lạ nên cần được duyệt. Duyệt xong, bạn đăng nhập lại là vào được.
                </p>
              </div>
              <button
                type="button"
                className="btn tonal login-btn"
                onClick={() => {
                  setDevicePending(false);
                  setTried(false);
                  setError(null);
                }}
              >
                Quay lại đăng nhập
              </button>
            </div>
          ) : (
            <form className="stack login-form" onSubmit={submit} noValidate>
              <div>
                <h1 className="login-title">Đăng nhập</h1>
                <p className="lab muted" style={{ margin: "4px 0 0" }}>
                  Sử dụng tài khoản phân hệ vận tải
                </p>
              </div>

              {error ? (
                <div className="login-alert" role="alert">
                  <span className="ms fill" aria-hidden="true">
                    error
                  </span>
                  <span>{error}</span>
                </div>
              ) : null}

              <label className={`field login-field${accErr ? " has-err" : ""}`}>
                <span className="l">Tài khoản / Email</span>
                <span className="box input-box">
                  <span className="ms login-ic" aria-hidden="true">
                    person
                  </span>
                  <input
                    name="username"
                    autoComplete="username"
                    autoFocus
                    placeholder="Nhập tài khoản hoặc email"
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      setError(null);
                    }}
                  />
                </span>
                {accErr ? <span className="err-msg">{accErr}</span> : null}
              </label>

              <label className={`field login-field${pwErr ? " has-err" : ""}`}>
                <span className="l">Mật khẩu</span>
                <span className="box input-box">
                  <span className="ms login-ic" aria-hidden="true">
                    lock
                  </span>
                  <input
                    name="password"
                    type={show ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Nhập mật khẩu"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setError(null);
                    }}
                  />
                  <button
                    type="button"
                    className="login-eye"
                    aria-label={show ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                    aria-pressed={show}
                    onClick={() => setShow((s) => !s)}
                  >
                    <span className="ms" aria-hidden="true">
                      {show ? "visibility_off" : "visibility"}
                    </span>
                  </button>
                </span>
                {pwErr ? <span className="err-msg">{pwErr}</span> : null}
              </label>

              <button type="submit" className="btn login-btn" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Đang đăng nhập…
                  </>
                ) : (
                  "Đăng nhập"
                )}
              </button>
              <button
                type="button"
                className="btn tonal login-btn"
                style={{ marginTop: 4 }}
                onClick={() => openSiblingUi()}
              >
                <span className="ms" aria-hidden="true">
                  swap_horiz
                </span>
                {SIBLING_UI_LABEL}
              </button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
