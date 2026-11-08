import { cn } from "@/lib/utils";
import { forwardRef, useState, type CSSProperties, type ComponentProps } from "react";

/**
 * Ô nhập API key / token. Không dùng type="password": Chrome bỏ qua autoComplete="off" với ô mật khẩu
 * và tự điền mật khẩu đăng nhập đã lưu vào đây.
 */
export const SecretInput = forwardRef<HTMLInputElement, Omit<ComponentProps<"input">, "type">>(
  ({ className, style, ...props }, ref) => {
    const [show, setShow] = useState(false);
    return (
      <span className={cn("box input-box", className)}>
        <span className="ms muted" aria-hidden="true">
          key
        </span>
        <input
          ref={ref}
          type="text"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          data-1p-ignore
          data-lpignore="true"
          data-form-type="other"
          style={{ ...(show ? null : ({ WebkitTextSecurity: "disc" } as CSSProperties)), ...style }}
          {...props}
        />
        <button
          type="button"
          tabIndex={-1}
          className="muted"
          style={{
            display: "grid",
            placeItems: "center",
            padding: 0,
            border: 0,
            background: "none",
            cursor: "pointer",
          }}
          onClick={() => setShow((v) => !v)}
          aria-label={show ? "Ẩn" : "Hiện"}
        >
          <span className="ms" aria-hidden="true">
            {show ? "visibility_off" : "visibility"}
          </span>
        </button>
      </span>
    );
  },
);
SecretInput.displayName = "SecretInput";
