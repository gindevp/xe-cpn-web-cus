import { Link } from "@tanstack/react-router";
import { ArrowLeft, Loader2, MessageSquare, Package, Phone, Search, Smartphone } from "lucide-react";
import { useEffect, useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent } from "react";
import {
  normalizeCustomerPhone,
  sendCustomerOtp,
  setCustomerSession,
  verifyCustomerOtp,
  type CustomerSession,
} from "@/lib/api/customer-portal-api";

type Step = "phone" | "otp";

const OTP_LEN = 6;

function formatPhoneInput(raw: string) {
  const d = raw.replace(/\D/g, "").slice(0, 10);
  if (d.length <= 4) return d;
  if (d.length <= 7) return `${d.slice(0, 4)} ${d.slice(4)}`;
  return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
}

function formatPhoneDisplay(p: string) {
  const d = p.replace(/\D/g, "");
  if (d.length === 10) return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
  return p;
}

function errorText(e: unknown) {
  return e instanceof Error && e.message ? e.message : "Không kết nối được máy chủ — thử lại sau";
}

/** Trang khách chưa đăng nhập — phone → OTP (Desktop.dc / Main.dc). */
export function CustomerLogin({ onLoggedIn }: { onLoggedIn: (s: CustomerSession) => void }) {
  const [step, setStep] = useState<Step>("phone");
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

  const phoneField = (
    <div className={`field ${phoneError ? "error" : ""}`}>
      <label htmlFor="kh-phone">Số điện thoại</label>
      <div className="field-box">
        <Phone size={20} strokeWidth={1.8} aria-hidden />
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
        {phoneInput ? (
          <button
            type="button"
            className="field-clear"
            aria-label="Xoá số đã nhập"
            onClick={() => setPhoneInput("")}
          >
            ×
          </button>
        ) : null}
      </div>
      {phoneError ? <p className="err">{phoneError}</p> : <span className="field-hint">Dùng số bạn thường gửi hàng để xem lại các đơn cũ.</span>}
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
            ) : (
              <form onSubmit={submitPhone} noValidate className="login-phone-form">
                <button type="button" className="text-back" onClick={() => window.history.back()}>
                  <ArrowLeft size={18} strokeWidth={2} /> Quay lại
                </button>
                <div className="login-title-block">
                  <h1>Đăng nhập bằng số điện thoại</h1>
                  <p className="sub desktop-sub">Chúng tôi sẽ gửi mã xác minh gồm 6 chữ số qua tin nhắn tới số của bạn.</p>
                </div>
                {phoneField}
                <div className="login-actions">
                  <button type="submit" className="btn-primary" disabled={sending}>
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Nhận mã xác minh
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
              </form>
            )}
          </section>
        </div>
      </div>

      <div className="login-mobile">
        <header className="login-mobile-head">
          {step === "otp" ? (
            <button type="button" className="icon-back" aria-label="Quay lại" onClick={() => setStep("phone")}>
              <ArrowLeft size={24} />
            </button>
          ) : (
            <button type="button" className="icon-back" aria-label="Quay lại" onClick={() => window.history.back()}>
              <ArrowLeft size={24} />
            </button>
          )}
        </header>
        <main className="login-mobile-main">
          {step === "otp" ? (
            otpEl
          ) : (
            <form onSubmit={submitPhone} noValidate className="login-phone-form mobile">
              <div className="flex flex-col gap-4">
                <div className="login-icon">
                  <Smartphone size={28} strokeWidth={1.8} />
                </div>
                <div className="login-title-block">
                  <p className="eyebrow">CHUYỂN PHÁT NHANH XE.VN</p>
                  <h1>Đăng nhập bằng số điện thoại</h1>
                  <p className="sub">Chúng tôi sẽ gửi mã xác minh gồm 6 chữ số qua tin nhắn tới số của bạn.</p>
                </div>
              </div>
              {phoneField}
              <div className="login-actions mobile-actions">
                <button type="submit" className="btn-primary" disabled={sending}>
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Nhận mã xác minh
                </button>
                <Link to="/tao-don" className="btn-secondary">
                  Tạo đơn không cần đăng nhập
                </Link>
              </div>
            </form>
          )}
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

  const setDigit = (i: number, v: string) => {
    const d = v.replace(/\D/g, "").slice(-1);
    setDigits((prev) => {
      const next = [...prev];
      next[i] = d;
      return next;
    });
    if (d && i < OTP_LEN - 1) refs.current[i + 1]?.focus();
  };

  const onKey = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      refs.current[i - 1]?.focus();
    }
  };

  const onPaste = (e: ClipboardEvent) => {
    e.preventDefault();
    const raw = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LEN);
    if (!raw) return;
    setDigits(Array.from({ length: OTP_LEN }, (_, i) => raw[i] ?? ""));
    refs.current[Math.min(raw.length, OTP_LEN) - 1]?.focus();
  };

  const verify = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!complete || verifying) return;
    setVerifying(true);
    setError("");
    try {
      const s = await verifyCustomerOtp(phone, code);
      onVerified(s);
    } catch (err) {
      setError(errorText(err));
      setDigits(Array(OTP_LEN).fill(""));
      refs.current[0]?.focus();
    } finally {
      setVerifying(false);
    }
  };

  useEffect(() => {
    if (complete) void verify();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- auto-submit when 6 digits filled
  }, [complete]);

  return (
    <form onSubmit={verify} className="login-otp-form" noValidate>
      <button type="button" className="text-back desktop-only" onClick={onBack}>
        <ArrowLeft size={18} strokeWidth={2} /> Quay lại
      </button>
      <div className="flex flex-col gap-4">
        <div className="login-icon mobile-only">
          <MessageSquare size={28} strokeWidth={1.8} />
        </div>
        <div className="login-title-block">
          <h1>Nhập mã xác minh</h1>
          <p className="sub">Mã gồm 6 chữ số đã được gửi tới</p>
          <div className="otp-phone-row">
            <strong>{formatPhoneDisplay(phone)}</strong>
            <button type="button" className="link-pill" onClick={onBack}>
              Đổi số
            </button>
          </div>
        </div>
      </div>
      <fieldset className="otp-fieldset">
        <legend>Mã xác minh</legend>
        <div className="otp-row" onPaste={onPaste}>
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => {
                refs.current[i] = el;
              }}
              className={`otp-box ${hasError ? "error" : ""}`}
              inputMode="numeric"
              maxLength={1}
              aria-label={`Số thứ ${i + 1}`}
              value={d}
              onChange={(e) => setDigit(i, e.target.value)}
              onKeyDown={(e) => onKey(i, e)}
            />
          ))}
        </div>
        {hasError ? <p className="err">{error || resendError}</p> : null}
        {wait > 0 ? (
          <p className="resend">Gửi lại mã sau <strong>{wait}s</strong></p>
        ) : (
          <div className="resend-row">
            <span>Chưa nhận được mã?</span>
            <button type="button" className="btn-resend" disabled={resending} onClick={() => void onResend()}>
              {resending ? "Đang gửi…" : "Gửi lại mã"}
            </button>
          </div>
        )}
      </fieldset>
      <button type="submit" className="btn-primary" disabled={!complete || verifying}>
        {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Xác nhận
      </button>
    </form>
  );
}
