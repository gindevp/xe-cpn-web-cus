import { Link } from "@tanstack/react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useEffect, useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import xeLogo from "@/assets/xe-logo.png";
import {
  normalizeCustomerPhone,
  sendCustomerOtp,
  setCustomerSession,
  verifyCustomerOtp,
  type CustomerSession,
} from "@/lib/api/customer-portal-api";

type Step = "landing" | "phone" | "otp";

const OTP_LEN = 6;

const CARD =
  "w-full rounded-2xl bg-white p-4 shadow-[0_4px_12px_3px_rgba(15,23,42,0.1)]";
const PRIMARY_BTN =
  "inline-flex h-8 w-full items-center justify-center gap-2 rounded-lg bg-[#274EA1] text-sm font-medium text-white transition-colors hover:bg-[#1f4088] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-[#274EA1]";
const OUTLINE_BTN =
  "inline-flex h-8 items-center justify-center rounded-lg border border-[#DDE3EB] bg-white text-sm font-medium text-[#10192E] transition-colors hover:bg-[#F8FAFC]";

function formatPhoneInput(raw: string) {
  const d = raw.replace(/\D/g, "").slice(0, 10);
  if (d.length <= 4) return d;
  if (d.length <= 7) return `${d.slice(0, 4)} ${d.slice(4)}`;
  return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
}

function errorText(e: unknown) {
  return e instanceof Error && e.message ? e.message : "Không kết nối được máy chủ — thử lại sau";
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-sm text-[#5A687D] hover:text-[#10192E]"
    >
      <ArrowLeft className="h-4 w-4" />
      Quay lại
    </button>
  );
}

function Heading({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-4">
      <h1 className="text-xl font-bold leading-7 text-[#10192E]">{title}</h1>
      <p className="mt-1 text-sm leading-5 text-[#475569]">{children}</p>
    </div>
  );
}

/** Trang khách chưa đăng nhập: chào → nhập SĐT → xác minh OTP. */
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F3F4F6] px-4 py-8">
      {step === "landing" && (
        <div className={`${CARD} max-w-[480px]`}>
          <img src={xeLogo} alt="X.E Việt Nam" width={56} height={56} className="h-14 w-14 object-contain" />
          <p className="mt-4 text-sm font-bold tracking-[0.02em] text-[#274EA1]">CHUYỂN PHÁT NHANH XE.VN</p>
          <h1 className="mt-1 text-2xl font-bold leading-8 text-[#10192E]">Xin chào</h1>
          <p className="mt-1 text-sm leading-5 text-[#475569]">
            Đăng nhập để theo dõi đơn hàng, tạo đơn nhanh và quản lý thông tin gửi hàng của bạn.
          </p>
          <button type="button" className={`${PRIMARY_BTN} mt-4`} onClick={() => setStep("phone")}>
            Đăng nhập bằng SĐT
          </button>
          <div className="my-4 flex items-center gap-3 text-xs text-[#475569]">
            <span className="h-px flex-1 bg-[#DDE3EB]" />
            Hoặc
            <span className="h-px flex-1 bg-[#DDE3EB]" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Link to="/tao-don" className={OUTLINE_BTN}>
              Tạo đơn nhanh
            </Link>
            <Link to="/tra-cuu" className={OUTLINE_BTN}>
              Tra cứu đơn
            </Link>
          </div>
        </div>
      )}

      {step === "phone" && (
        <form className={`${CARD} max-w-[480px]`} onSubmit={submitPhone} noValidate>
          <BackButton onClick={() => setStep("landing")} />
          <Heading title="Nhập số điện thoại">
            Chúng tôi sẽ gửi mã xác minh gồm 6 chữ số tới số điện thoại của bạn.
          </Heading>
          <label className="mt-4 block">
            <span className="text-sm font-medium text-[#10192E]">Số điện thoại</span>
            <input
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
              className={`mt-1.5 h-8 w-full rounded-lg border bg-white px-3 text-sm text-[#10192E] outline-none placeholder:text-[#475569] focus:border-[#274EA1] focus:ring-2 focus:ring-[#274EA1]/15 ${phoneError ? "border-[#DE3A3A]" : "border-[#DDE3EB]"}`}
            />
          </label>
          {phoneError ? <p className="mt-1.5 text-xs text-[#DE3A3A]">{phoneError}</p> : null}
          <button type="submit" className={`${PRIMARY_BTN} mt-4`} disabled={sending}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Tiếp tục
          </button>
        </form>
      )}

      {step === "otp" && (
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
      )}
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

  const fill = (start: number, text: string) => {
    const chars = text.replace(/\D/g, "").slice(0, OTP_LEN - start).split("");
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
    <form className={`${CARD} max-w-[396px]`} onSubmit={submit} noValidate>
      <BackButton onClick={onBack} />
      <Heading title="Xác minh OTP">
        Nhập mã gồm 6 chữ số đã được gửi tới số điện thoại{" "}
        <span className="font-medium text-[#10192E]">{formatPhoneInput(phone)}</span>
      </Heading>
      <div className="mt-4 grid grid-cols-6 gap-2">
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
            className={`aspect-square w-full rounded-xl border bg-[#F8FAFC] text-center text-xl font-semibold text-[#10192E] outline-none focus:border-[#274EA1] focus:bg-white focus:ring-2 focus:ring-[#274EA1]/15 ${error ? "border-[#DE3A3A]" : "border-[#E2E8F0]"}`}
          />
        ))}
      </div>
      {error || resendError ? (
        <p className="mt-2 text-xs text-[#DE3A3A]">{error || resendError}</p>
      ) : null}
      <button type="submit" className={`${PRIMARY_BTN} mt-4`} disabled={!complete || verifying}>
        {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Tiếp tục
      </button>
      <div className="mt-4 text-center text-sm text-[#475569]">
        <button
          type="button"
          onClick={() => void resend()}
          disabled={wait > 0 || resending}
          className="font-medium text-[#475569] hover:text-[#274EA1] disabled:cursor-default disabled:hover:text-[#475569]"
        >
          {resending ? "Đang gửi lại…" : wait > 0 ? `Gửi lại mã (${wait}s)` : "Gửi lại mã"}
        </button>
      </div>
    </form>
  );
}
