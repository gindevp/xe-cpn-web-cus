import { Section } from "@/components/PageBits";
import { SecretInput } from "@/components/SecretInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isApiEnabled } from "@/lib/api/client";
import { useStore } from "@/lib/store";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type Recipient = { id: string; name: string };

/** Parse raw BE: dòng `id|tên` / chỉ `id` / JSON. */
export function parseTelegramRecipients(raw?: string | null): Recipient[] {
  const t = (raw ?? "").trim();
  if (!t) return [];
  if (t.startsWith("[")) {
    try {
      const arr = JSON.parse(t) as Array<{ id?: string; chatId?: string; name?: string }>;
      const seen = new Set<string>();
      const out: Recipient[] = [];
      for (const row of arr) {
        const id = String(row.id ?? row.chatId ?? "").trim();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        out.push({ id, name: String(row.name ?? "").trim() });
      }
      return out;
    } catch {
      /* fallthrough */
    }
  }
  const seen = new Set<string>();
  const out: Recipient[] = [];
  for (const line of t.split(/[\r\n,;]+/)) {
    const row = line.trim();
    if (!row) continue;
    const pipe = row.indexOf("|");
    const id = (pipe >= 0 ? row.slice(0, pipe) : row).trim();
    const name = (pipe >= 0 ? row.slice(pipe + 1) : "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name });
  }
  return out;
}

export function serializeTelegramRecipients(list: Recipient[]): string {
  return list
    .filter((r) => r.id.trim())
    .map((r) => (r.name.trim() ? `${r.id.trim()}|${r.name.trim().replace(/[|\n]/g, " ")}` : r.id.trim()))
    .join("\n");
}

/**
 * Cấu hình bot Telegram + danh sách người nhận cảnh báo lỗi hệ thống.
 * BE chống spam: cùng loại + cùng nội dung tối đa 1 tin / ngày (gửi mọi người trong list).
 */
export function TelegramAlertIntegration() {
  const integrations = useStore((s) => s.integrations);
  const [token, setToken] = useState("");
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  /** null = idle; `"all"` = gửi tất cả; chatId = gửi 1 người. */
  const [testing, setTesting] = useState<string | null>(null);

  useEffect(() => {
    setRecipients(parseTelegramRecipients(integrations.telegramChatId));
    setToken("");
  }, [integrations.telegramChatId, integrations.telegramToken]);

  const configured = Boolean(integrations.telegramToken || integrations.telegramChatId);
  const serialized = useMemo(() => serializeTelegramRecipients(recipients), [recipients]);

  const addRecipient = () => {
    const id = newId.trim();
    if (!id) {
      toast.error("Nhập Chat ID");
      return;
    }
    if (recipients.some((r) => r.id === id)) {
      toast.error("Chat ID đã có trong danh sách");
      return;
    }
    setRecipients((prev) => [...prev, { id, name: newName.trim() }]);
    setNewId("");
    setNewName("");
  };

  const removeRecipient = (id: string) => {
    setRecipients((prev) => prev.filter((r) => r.id !== id));
  };

  const save = async () => {
    if (!isApiEnabled()) {
      toast.error("Chưa kết nối API");
      return;
    }
    setSaving(true);
    try {
      const { putIntegrationConfig, fetchIntegrationConfig } = await import("@/lib/api/finance-config-api");
      const patch = {
        ...integrations,
        ...(token.trim() ? { telegramToken: token.trim() } : {}),
        telegramChatId: serialized,
      };
      await putIntegrationConfig(patch);
      useStore.setState({ integrations: await fetchIntegrationConfig() });
      setToken("");
      toast.success(
        recipients.length
          ? `Đã lưu — ${recipients.length} người nhận cảnh báo`
          : "Đã lưu (chưa có người nhận — bot chưa gửi cảnh báo)",
      );
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Không lưu được");
    } finally {
      setSaving(false);
    }
  };

  const test = async (onlyId?: string) => {
    if (!isApiEnabled()) {
      toast.error("Chưa kết nối API");
      return;
    }
    if (!integrations.telegramToken && !token.trim()) {
      toast.error("Nhập Bot token (hoặc Lưu token trước) rồi gửi thử");
      return;
    }
    const target = onlyId?.trim();
    if (!target && recipients.length === 0) {
      toast.error("Thêm ít nhất một Chat ID trước khi gửi thử");
      return;
    }
    setTesting(target || "all");
    try {
      const { apiRequest } = await import("@/lib/api/client");
      const body: Record<string, string> = {};
      if (token.trim()) body.telegramToken = token.trim();
      if (target) body.telegramChatId = target;
      else body.telegramRecipients = serialized;
      const res = await apiRequest<{ ok?: boolean; message?: string }>("/api/integration-config/test-telegram", {
        method: "POST",
        body,
      });
      if (res?.ok) {
        toast.success(
          res.message ||
            (target
              ? `Đã gửi tin thử tới ${target} — kiểm tra Telegram`
              : `Đã gửi tin thử tới ${recipients.length} người — kiểm tra Telegram`),
        );
      } else toast.error(res?.message || "Gửi thử thất bại — kiểm tra token / Chat ID");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Gửi thử thất bại");
    } finally {
      setTesting(null);
    }
  };

  if (!isApiEnabled()) {
    return (
      <Section title="Telegram cảnh báo">
        <p className="text-sm text-muted-foreground">Cần kết nối API máy chủ để cấu hình Telegram.</p>
      </Section>
    );
  }

  return (
    <Section title="Telegram cảnh báo lỗi hệ thống">
      <div className="space-y-5 max-w-2xl">
        <p className="text-sm text-muted-foreground">
          Bot gửi khi có lỗi: Auto Call, HĐĐT MISA, thu hộ OnePay, tra cứu MST… Cùng loại + cùng nội
          dung tối đa <span className="font-medium text-foreground">1 tin / ngày</span>; lỗi khác vẫn
          báo tiếp. Gửi cho <span className="font-medium text-foreground">tất cả</span> người trong
          danh sách.
        </p>

        <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground space-y-2">
          <div className="font-medium text-foreground">Lấy Chat ID thế nào?</div>
          <ol className="list-decimal space-y-1 pl-4">
            <li>
              Mở bot <span className="font-mono">@cpn_xe_alerts_bot</span> → bấm <strong>Start</strong> (hoặc thêm
              bot vào group và gửi 1 tin).
            </li>
            <li>
              <strong>Cá nhân:</strong> chat <span className="font-mono">@userinfobot</span> → copy số{" "}
              <span className="font-mono">Id</span>.
            </li>
            <li>
              <strong>Group:</strong> thêm bot vào group → mở trình duyệt:{" "}
              <span className="font-mono break-all">
                https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates
              </span>{" "}
              → tìm <span className="font-mono">"chat":{"{"}"id": -100…{"}"}</span>.
            </li>
          </ol>
        </div>

        <div className="space-y-2">
          <Label>Bot token</Label>
          <SecretInput
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={configured ? "•••• đã lưu — nhập để đổi" : "123456:ABC…"}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label>Người nhận cảnh báo</Label>
            <span className="text-xs text-muted-foreground">{recipients.length} người</span>
          </div>
          {recipients.length === 0 ? (
            <p className="rounded-md border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
              Chưa có ai — thêm Chat ID bên dưới (có thể nhiều người / group).
            </p>
          ) : (
            <ul className="divide-y rounded-md border">
              {recipients.map((r) => (
                <li key={r.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{r.name || "—"}</div>
                    <div className="font-mono text-xs text-muted-foreground truncate">{r.id}</div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="shrink-0 gap-1"
                    onClick={() => void test(r.id)}
                    disabled={testing != null}
                    title="Gửi tin thử Telegram tới Chat ID này"
                  >
                    {testing === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    Gửi thử
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 shrink-0 text-destructive"
                    onClick={() => removeRecipient(r.id)}
                    disabled={testing != null}
                    title="Xoá khỏi danh sách"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Chat ID</Label>
              <Input
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
                placeholder="123456… hoặc -100…"
                className="font-mono"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addRecipient();
                  }
                }}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Tên (tuỳ chọn)</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="VD: Anh A / Group Ops"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addRecipient();
                  }
                }}
              />
            </div>
            <div className="flex items-end">
              <Button type="button" variant="outline" className="w-full sm:w-auto gap-1" onClick={addRecipient}>
                <Plus className="h-4 w-4" />
                Thêm
              </Button>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-dashed p-3 space-y-2">
          <div className="text-sm font-medium">Gửi thử — kiểm tra người nhận có nhận được không</div>
          <p className="text-xs text-muted-foreground">
            Bot sẽ gửi tin “CPN — thử Telegram OK” tới Telegram. Mỗi dòng có nút{" "}
            <strong>Gửi thử</strong> (1 người); hoặc gửi hết danh sách. Cần đã{" "}
            <strong>Start</strong> bot và đúng Chat ID.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void save()} disabled={saving || testing != null}>
              {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Lưu cấu hình
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void test()}
              disabled={testing != null || recipients.length === 0}
            >
              {testing === "all" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Gửi thử tất cả ({recipients.length})
            </Button>
            {newId.trim() ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => void test(newId.trim())}
                disabled={testing != null}
              >
                {testing === newId.trim() ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                Gửi thử Chat ID vừa nhập
              </Button>
            ) : null}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Trạng thái:{" "}
          {recipients.length > 0
            ? `Đang bật — ${recipients.length} người nhận`
            : integrations.telegramToken
              ? "Có token — chưa có người nhận"
              : "Chưa cấu hình"}
        </p>
      </div>
    </Section>
  );
}
