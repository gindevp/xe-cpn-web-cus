import { Link } from "@tanstack/react-router";
import { ArrowLeft, Loader2, Package, Search, Smartphone } from "lucide-react";
import { useEffect, useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent } from "react";
import {
  normalizeCustomerPhone,
  sendCustomerOtp,
  setCustomerSession,
  verifyCustomerOtp,
  type CustomerSession,
} from "@/lib/api/customer-portal-api";

type Step = "landing" | "phone" | "otp";

const OTP_LEN = 6;

function formatPhoneInput(raw: string) {
  const d = raw.replace(/\D/g, "").slice(0, 10);
  if (d.length <= 4) return d;
  if (d.length <= 7) return `${d.slice(0, 4)} ${d.slice(4)}`;
  return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
}

function errorText(e: unknown) {
  return e instanceof Error && e.message ? e.message : "Không kết nối được máy chủ — thử lại sau";
}

/** Trang khách chưa đăng nhập: chào → nhập SĐT → OTP (mobile + desktop theo design). */
export function CustomerLogin({ onLoggedIn }: { onLoggedIn: (s: CustomerSession) => void }) {
  const [step, setStep] = useState<Step>("landing");
  const [phoneInput, setPhoneInput] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [sending, setSending] = useState(false);
  const [resendAt, setResendAt] = useState(0);

  const sendOtp = async (target: string) => {
    setSending(true);
    try {
      const r = await sendCustomerOtp(target);
      setResendAt(Date.now() + (r.resendAfterSeconds ?? 60) * 1000);
      return true;
    } catch (e) {
      setPhoneError(errorText(e));
      return false;
    } finally {
      setSending(false);
    }
  };

  const submitPhone = async (e: FormEvent) => {
    e.preventDefault();
    const p = normalizeCustomerPhone(phoneInput);
    if (!p) {
      setPhoneError("Số điện thoại không hợp lệ (10 số, bắt đầu bằng 03, 05, 07, 08 hoặc 09)");
      return;
    }
    setPhoneError("");
    if (p === phone && resendAt > Date.now()) {
      setStep("otp");
      return;
    }
    setPhone(p);
    if (await sendOtp(p)) setStep("otp");
  };

  const phoneForm = (
    <form onSubmit={submitPhone} noValidate className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <div className="login-icon">
          <Smartphone size={28} strokeWidth={1.8} />
        </div>
        <div>
          <p className="eyebrow">CHUYỂN PHÁT NHANH XE.VN</p>
          <h1>Đăng nhập bằng số điện thoại</h1>
          <p className="sub">Chúng tôi sẽ gửi mã xác minh gồm 6 chữ số qua tin nhắn tới số của bạn.</p>
        </div>
      </div>
      <div className={`field ${phoneError ? "error" : ""}`}>
        <label htmlFor="kh-phone">Số điện thoại</label>
        <input
          id="kh-phone"
          autoFocus
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          placeholder="09xx xxx xxx"
          value={phoneInput}
          onChange={(e) => {
            setPhoneInput(formatPhoneInput(e.target.value));
            if (phoneError) setPhoneError("");
          }}
        />
        {phoneError ? <p className="err">{phoneError}</p> : null}
      </div>
      <button type="submit" className="btn-primary" disabled={sending}>
        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Tiếp tục
      </button>
    </form>
  );

  const landingBody = (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <div className="login-icon">
          <Package size={28} strokeWidth={1.8} />
        </div>
        <div>
          <p className="eyebrow">CHUYỂN PHÁT NHANH XE.VN</p>
          <h1>Xin chào</h1>
          <p className="sub">Đăng nhập để theo dõi đơn hàng, tạo đơn nhanh và quản lý thông tin gửi hàng của bạn.</p>
        </div>
      </div>
      <button type="button" className="btn-primary" onClick={() => setStep("phone")}>
        Đăng nhập bằng SĐT
      </button>
      <div className="divider">Hoặc</div>
      <div className="btn-row">
        <Link to="/tao-don" className="btn-ghost">
          Tạo đơn nhanh
        </Link>
        <Link to="/tra-cuu" className="btn-ghost">
          Tra cứu đơn
        </Link>
      </div>
    </div>
  );

  const otpEl =
    step === "otp" ? (
      <OtpStep
        phone={phone}
        resendAt={resendAt}
        resending={sending}
        onBack={() => setStep("phone")}
        onResend={async () => {
          setPhoneError("");
          const ok = await sendOtp(phone);
          return ok ? null : "resend-failed";
        }}
        resendError={phoneError}
        onVerified={(s) => {
          setCustomerSession(s);
          onLoggedIn(s);
        }}
      />
    ) : null;

  return (
    <div className="kh-login">
      {/* Desktop split */}
      <div className="login-desktop">
        <div className="login-desktop-grid">
          <section className="login-hero">
            <p className="eyebrow" style={{ color: "#dae2ff" }}>
              CHUYỂN PHÁT NHANH XE.VN
            </p>
            <div>
              <h2>Gửi hàng Hà Nội và các tỉnh, theo dõi đơn ngay trên web</h2>
              <p>Đăng nhập để tạo đơn nhanh hơn, xem hành trình và lịch sử gửi hàng của bạn.</p>
            </div>
            <div className="login-chips">
              <span>
                <Package size={16} /> Tạo đơn
              </span>
              <span>
                <Search size={16} /> Tra cứu đơn
              </span>
              <span>
                <Smartphone size={16} /> Lịch sử gửi hàng
              </span>
            </div>
          </section>
          <section className="login-card">
            {step === "otp" ? (
              otpEl
            ) : step === "phone" ? (
              <>
                <button type="button" className="icon-back" aria-label="Quay lại" onClick={() => setStep("landing")} style={{ alignSelf: "flex-start" }}>
                  <ArrowLeft size={22} />
                </button>
                {phoneForm}
              </>
            ) : (
              landingBody
            )}
          </section>
        </div>
      </div>

      {/* Mobile stack */}
      <div className="login-mobile">
        <header className="login-mobile-head">
          {step !== "landing" ? (
            <button
              type="button"
              className="icon-back"
              aria-label="Quay lại"
              onClick={() => setStep(step === "otp" ? "phone" : "landing")}
            >
              <ArrowLeft size={24} />
            </button>
          ) : (
            <span style={{ width: 48 }} />
          )}
        </header>
        <main className="login-mobile-main">
          {step === "otp" ? otpEl : step === "phone" ? phoneForm : landingBody}
        </main>
      </div>
    </div>
  );
}

function OtpStep({
  phone,
  resendAt,
  resending,
  resendError,
  onBack,
  onResend,
  onVerified,
}: {
  phone: string;
  resendAt: number;
  resending: boolean;
  resendError: string;
  onBack: () => void;
  onResend: () => Promise<string | null>;
  onVerified: (s: CustomerSession) => void;
}) {
  const [digits, setDigits] = useState<string[]>(() => Array(OTP_LEN).fill(""));
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    refs.current[0]?.focus();
  }, []);

  const code = digits.join("");
  const complete = code.length === OTP_LEN && digits.every((d) => d !== "");
  const wait = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const hasError = !!(error || resendError);

  const fill = (start: number, text: string) => {
    const chars = text
      .replace(/\D/g, "")
      .slice(0, OTP_LEN - start)
      .split("");
    if (!chars.length) return;
    setDigits((prev) => {
      const next = [...prev];
      chars.forEach((c, i) => (next[start + i] = c));
      return next;
    });
    setError("");
    refs.current[Math.min(start + chars.length, OTP_LEN - 1)]?.focus();
  };

  const onKeyDown = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      setError("");
      setDigits((prev) => {
        const next = [...prev];
        if (next[i]) {
          next[i] = "";
        } else if (i > 0) {
          next[i - 1] = "";
          refs.current[i - 1]?.focus();
        }
        return next;
      });
    } else if (e.key === "ArrowLeft" && i > 0) {
      refs.current[i - 1]?.focus();
    } else if (e.key === "ArrowRight" && i < OTP_LEN - 1) {
      refs.current[i + 1]?.focus();
    }
  };

  const onPaste = (i: number, e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    fill(i, e.clipboardData.getData("text"));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!complete || verifying) return;
    setVerifying(true);
    setError("");
    try {
      onVerified(await verifyCustomerOtp(phone, code));
    } catch (err) {
      setError(errorText(err));
      setDigits(Array(OTP_LEN).fill(""));
      refs.current[0]?.focus();
    } finally {
      setVerifying(false);
    }
  };

  const resend = async () => {
    if (wait > 0 || resending) return;
    setError("");
    setDigits(Array(OTP_LEN).fill(""));
    await onResend();
    refs.current[0]?.focus();
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <div className="login-icon">
          <Smartphone size={28} strokeWidth={1.8} />
        </div>
        <div>
          <p className="eyebrow">XÁC MINH OTP</p>
          <h1>Nhập mã xác minh</h1>
          <p className="sub">
            Mã 6 chữ số đã gửi tới <strong style={{ color: "#1a1b21" }}>{formatPhoneInput(phone)}</strong>
          </p>
        </div>
      </div>
      <div className="otp-row">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            value={d}
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            maxLength={OTP_LEN}
            aria-label={`Chữ số ${i + 1}`}
            onChange={(e) => fill(i, e.target.value.slice(-OTP_LEN))}
            onKeyDown={(e) => onKeyDown(i, e)}
            onPaste={(e) => onPaste(i, e)}
            onFocus={(e) => e.currentTarget.select()}
            className={`otp-box ${hasError ? "error" : ""}`}
          />
        ))}
      </div>
      {hasError ? <div className="alert">{error || resendError}</div> : null}
      <button type="submit" className="btn-primary" disabled={!complete || verifying}>
        {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Xác nhận
      </button>
      <div className="resend">
        <button type="button" onClick={() => void resend()} disabled={wait > 0 || resending}>
          {resending ? "Đang gửi lại…" : wait > 0 ? `Gửi lại mã (${wait}s)` : "Gửi lại mã"}
        </button>
        <div style={{ marginTop: 8 }}>
          <button type="button" onClick={onBack} style={{ fontWeight: 500, color: "#45464f" }}>
            Đổi số điện thoại
          </button>
        </div>
      </div>
    </form>
  );
}
