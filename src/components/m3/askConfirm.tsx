import { useEffect, useRef, useState } from "react";
import { M3Confirm } from "@/components/m3/M3Confirm";

export type ConfirmRequest = {
  title: string;
  body?: string;
  confirmLabel?: string;
  danger?: boolean;
};

type Pending = ConfirmRequest & { resolve: (ok: boolean) => void };

let enqueue: ((p: Pending) => void) | null = null;

const DANGER_RE = /xoá|xóa|huỷ|hủy|thu hồi|từ chối|đăng xuất|gỡ|khoá|khóa|force/i;

const VERB_RE = /^(Xoá|Xóa|Huỷ|Hủy|Gỡ|Khoá|Khóa|Duyệt|Dừng|Chuyển|Tạo|Bỏ)(?=\s|$)/u;

function verbOf(title: string) {
  return VERB_RE.exec(title.trim())?.[1] ?? "Xác nhận";
}

/** Tách thông báo kiểu `confirm()` cũ: dòng đầu là tiêu đề, phần còn lại là nội dung. */
function fromMessage(message: string): ConfirmRequest {
  const [head, ...rest] = message.split("\n");
  const body = rest.join("\n").trim();
  return { title: head.trim(), body: body || undefined };
}

/**
 * Hỏi xác nhận bằng sheet M3 (`.sheet.confirm`) thay `window.confirm`.
 * Chưa gắn `ConfirmHost` (ngoài shell) thì rơi về `window.confirm`.
 */
export function askConfirm(input: string | ConfirmRequest): Promise<boolean> {
  const req = typeof input === "string" ? fromMessage(input) : input;
  if (!enqueue) {
    return Promise.resolve(window.confirm([req.title, req.body].filter(Boolean).join("\n\n")));
  }
  return new Promise((resolve) => enqueue?.({ ...req, resolve }));
}

export function ConfirmHost() {
  const [queue, setQueue] = useState<Pending[]>([]);
  const settled = useRef(false);
  const current = queue[0];

  useEffect(() => {
    enqueue = (p) => setQueue((q) => [...q, p]);
    return () => {
      enqueue = null;
    };
  }, []);

  useEffect(() => {
    settled.current = false;
  }, [current]);

  const finish = (ok: boolean) => {
    if (!current || settled.current) return;
    settled.current = true;
    current.resolve(ok);
    setQueue((q) => q.slice(1));
  };

  return (
    <M3Confirm
      open={!!current}
      onOpenChange={(v) => {
        if (!v) finish(false);
      }}
      title={current?.title ?? ""}
      body={
        current?.body ? <span style={{ whiteSpace: "pre-line" }}>{current.body}</span> : undefined
      }
      confirmLabel={current?.confirmLabel ?? verbOf(current?.title ?? "")}
      confirmDanger={current?.danger ?? DANGER_RE.test(current?.title ?? "")}
      onConfirm={() => finish(true)}
    />
  );
}
