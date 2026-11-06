import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { ProtectedPage } from "@/components/AppShell";
import { M3Page } from "@/components/M3Page";
import { EmptyState } from "@/components/PageBits";
import { TablePagination } from "@/components/TablePagination";
import { OrderCodeLink } from "@/components/OrderHistoryDialog";
import { PhoneInput } from "@/components/PhoneInput";
import { TaxCodeInput } from "@/components/TaxCodeInput";
import { M3Confirm } from "@/components/m3/M3Confirm";
import { M3ConfirmActions, M3Sheet, M3SheetTitle } from "@/components/m3/M3Sheet";
import { Input } from "@/components/ui/input";
import {
  createPhoneTax,
  deletePhoneTax,
  isPhoneTaxAutoIssue,
  listBuyerDirectory,
  setPhoneTaxAutoIssue,
  updatePhoneTax,
  type BuyerDirectoryEntry,
  type InvoiceBuyerProfile,
} from "@/lib/api/domain-api";
import { isApiEnabled } from "@/lib/api/client";
import { useAuth } from "@/lib/auth";
import { formatDateTime } from "@/lib/mock-data";
import { canWrite } from "@/lib/rbac";
import { usePagedRows } from "@/lib/use-paged-rows";
import { toast } from "sonner";

export const Route = createFileRoute("/crm-sdt")({
  head: () => ({
    meta: [
      { title: "CRM SĐT — MST — X.E" },
      {
        name: "description",
        content: "Gắn, sửa, xóa MST theo số điện thoại. Mỗi số tối đa 5 MST.",
      },
    ],
  }),
  component: () => (
    <ProtectedPage title="CRM SĐT — MST" screen="crm-sdt" hidePageTitle>
      <M3Page>
        <Page />
      </M3Page>
    </ProtectedPage>
  ),
});

type Draft = {
  id?: string;
  /** Số lấy từ dòng đang chọn — không sửa trong popup. */
  phoneLocked: boolean;
  phone: string;
  contactName: string;
  taxCode: string;
  companyName: string;
  address: string;
  email: string;
  /** MST đã gắn của số này, để khỏi thêm trùng. */
  existingTaxes: string[];
};

const emptyDraft = (phone = "", locked = false): Draft => ({
  phoneLocked: locked && phone.trim().length > 0,
  phone,
  contactName: "",
  taxCode: "",
  companyName: "",
  address: "",
  email: "",
  existingTaxes: [],
});

function Page() {
  const { session } = useAuth();
  const writable = canWrite(session?.role, "crm-sdt");
  const [q, setQ] = useState("");
  const [applied, setApplied] = useState("");
  const [rows, setRows] = useState<BuyerDirectoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [askDelete, setAskDelete] = useState<InvoiceBuyerProfile | null>(null);
  const { pageRows, pager } = usePagedRows(rows, "crm-sdt");

  const load = useCallback(async (query: string) => {
    if (!isApiEnabled()) {
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      setRows(await listBuyerDirectory(query));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không tải được danh sách SĐT");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load("");
  }, [load]);

  const taxesOf = (phone: string) =>
    rows.find((r) => r.phone === phone)?.profiles?.map((p) => p.taxCode ?? "").filter(Boolean) ?? [];

  const openCreate = (phone: string, contactName = "", locked = false) => {
    setDraft({
      ...emptyDraft(phone, locked),
      contactName,
      existingTaxes: taxesOf(phone),
    });
  };

  const openEdit = (phone: string, contactName: string, profile: InvoiceBuyerProfile) => {
    setDraft({
      id: profile.id,
      phoneLocked: true,
      phone,
      contactName: contactName || "",
      taxCode: profile.taxCode ?? "",
      companyName: profile.companyName ?? "",
      address: profile.address ?? "",
      email: profile.email ?? "",
      existingTaxes: taxesOf(phone).filter((t) => t !== profile.taxCode),
    });
  };

  const save = async () => {
    if (!draft) return;
    if (!draft.companyName.trim()) {
      toast.error("Tra MST để lấy tên công ty trước khi lưu");
      return;
    }
    setSaving(true);
    try {
      const body = {
        phone: draft.phone,
        taxCode: draft.taxCode,
        companyName: draft.companyName,
        address: draft.address,
        email: draft.email,
        contactName: draft.contactName,
      };
      if (draft.id) await updatePhoneTax(draft.id, body);
      else await createPhoneTax(body);
      toast.success(draft.id ? "Đã sửa MST" : "Đã gắn MST");
      setDraft(null);
      await load(applied);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không lưu được MST");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (profile: InvoiceBuyerProfile) => {
    if (!profile.id) return;
    try {
      await deletePhoneTax(profile.id);
      toast.success("Đã gỡ MST");
      setAskDelete(null);
      await load(applied);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không gỡ được MST");
    }
  };

  const toggleAutoIssue = async (phone: string, profile: InvoiceBuyerProfile, enabled: boolean) => {
    if (!profile.id) return;
    const prev = isPhoneTaxAutoIssue(profile);
    setRows((list) =>
      list.map((r) =>
        r.phone !== phone
          ? r
          : {
              ...r,
              profiles: (r.profiles ?? []).map((p) =>
                p.id === profile.id ? { ...p, autoIssue: enabled ? "true" : "false" } : p,
              ),
            },
      ),
    );
    try {
      await setPhoneTaxAutoIssue(profile.id, enabled);
      const stillOn =
        enabled ||
        (rows.find((r) => r.phone === phone)?.profiles ?? [])
          .filter((p) => p.id !== profile.id)
          .some(isPhoneTaxAutoIssue);
      if (!enabled && !stillOn) {
        toast.message(`Đã tắt hết MST của ${phone} — đơn mới sẽ xuất HĐ cá nhân (không auto công ty).`);
      } else {
        toast.success(enabled ? `Bật auto HĐ công ty · MST ${profile.taxCode}` : `Tắt auto · MST ${profile.taxCode}`);
      }
    } catch (e) {
      setRows((list) =>
        list.map((r) =>
          r.phone !== phone
            ? r
            : {
                ...r,
                profiles: (r.profiles ?? []).map((p) =>
                  p.id === profile.id ? { ...p, autoIssue: prev ? "true" : "false" } : p,
                ),
              },
        ),
      );
      toast.error(e instanceof Error ? e.message : "Không cập nhật được tick MST");
    }
  };

  const addFromToolbar = () => {
    const asPhone = looksLikePhone(applied);
    const hit = asPhone ? rows.find((r) => digits(r.phone) === digits(applied)) : undefined;
    if (hit && (hit.profiles?.length ?? 0) >= 5) {
      toast.error("Số này đã đủ 5 MST. Xóa bớt rồi thêm.");
      return;
    }
    openCreate(asPhone ? applied : "", hit?.name ?? "", asPhone);
  };

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="title-row">
        <div style={{ flex: "1 1 480px", minWidth: 0 }}>
          <h1 className="page-title">CRM SĐT - MST</h1>
          <div className="lab muted" style={{ maxWidth: 760 }}>
            Mỗi số tối đa 5 MST. Tick Auto HĐ để MST được gợi ý khi tạo đơn và tự xuất HĐ công ty. Bỏ hết tick của một SĐT
            thì xuất cá nhân.
            {applied ? ` Đang lọc ${applied}.` : " Đang xem các số vừa cập nhật."}
          </div>
        </div>
        {writable ? (
          <button type="button" className="btn" onClick={addFromToolbar}>
            <span className="ms" aria-hidden="true">
              add
            </span>
            Thêm MST
          </button>
        ) : null}
      </div>

      <section className="card stack">
        <form
          style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 8 }}
          onSubmit={(e) => {
            e.preventDefault();
            const next = q.trim();
            setApplied(next);
            void load(next);
          }}
        >
          <label className="field" style={{ flex: "1 1 280px", maxWidth: 480 }}>
            <span className="l">SĐT hoặc tên công ty</span>
            <span className="box input-box">
              <span className="ms muted" aria-hidden="true">
                search
              </span>
              <input
                type="search"
                placeholder="SĐT, tên công ty, hoặc để trống"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </span>
          </label>
          <button type="submit" className="btn tonal" disabled={loading}>
            {loading ? "Đang tải…" : "Tìm"}
          </button>
        </form>

        <h2 className="group-title sec-title num">
          <span className="sec-ic" aria-hidden="true">
            <span className="ms">contact_phone</span>
          </span>
          SĐT và MST ({rows.length})
        </h2>

        {pager.total === 0 ? (
          <EmptyState>
            {loading ? (
              "Đang tải…"
            ) : applied && looksLikePhone(applied) ? (
              <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <span>Số {applied} chưa gắn MST</span>
                {writable ? (
                  <button type="button" className="btn" onClick={() => openCreate(applied, "", true)}>
                    Gắn MST cho số này
                  </button>
                ) : null}
              </span>
            ) : applied ? (
              <span>Không thấy công ty khớp «{applied}»</span>
            ) : (
              "Chưa có số nào gắn MST"
            )}
          </EmptyState>
        ) : (
          <>
            <div className="scroller">
              <table className="tbl" style={{ ["--tbl-min" as string]: "780px" }}>
                <thead>
                  <tr>
                    <th style={{ width: 140 }}>Số điện thoại</th>
                    <th style={{ width: 180 }}>Tên</th>
                    <th>MST đang gắn · Auto HĐ công ty</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => {
                    const profiles = row.profiles ?? [];
                    return (
                      <tr key={row.phone}>
                        <td className="main" style={{ whiteSpace: "nowrap" }}>
                          {row.phone}
                        </td>
                        <td>
                          <span className="who">
                            <span className="rev-ic sm" aria-hidden="true">
                              <span className="ms fill">person</span>
                            </span>
                            {row.name || "—"}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {profiles.map((p, i) => {
                              const autoOn = isPhoneTaxAutoIssue(p);
                              return (
                                <div key={p.id ?? p.taxCode} className="mst" style={autoOn ? undefined : { opacity: 0.6 }}>
                                  <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                                    <span style={{ fontWeight: 500 }}>{p.companyName || "—"}</span>
                                    <span className="sub">
                                      {i === 0 ? "Gần nhất · " : ""}
                                      MST {p.taxCode}
                                      {p.fromOrderCode ? (
                                        <>
                                          {" · "}
                                          <OrderCodeLink code={p.fromOrderCode} />
                                        </>
                                      ) : (
                                        " · Gắn tay"
                                      )}
                                      {p.issuedAt ? ` · ${formatDateTime(p.issuedAt)}` : ""}
                                      {!autoOn ? " · không auto / không gợi ý tạo đơn" : ""}
                                    </span>
                                  </div>
                                  <label
                                    className="lab"
                                    style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer" }}
                                  >
                                    <input
                                      className="check"
                                      type="checkbox"
                                      checked={autoOn}
                                      disabled={!writable || !p.id}
                                      onChange={(e) => {
                                        if (!p.id) return;
                                        void toggleAutoIssue(row.phone, p, e.target.checked);
                                      }}
                                    />
                                    Auto HĐ
                                  </label>
                                  {writable ? (
                                    <div className="act">
                                      <button
                                        type="button"
                                        className="text-act"
                                        onClick={() => openEdit(row.phone, row.name ?? "", p)}
                                      >
                                        Sửa
                                      </button>
                                      <button type="button" className="text-act danger" onClick={() => setAskDelete(p)}>
                                        Xoá
                                      </button>
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })}
                            {writable && profiles.length < 5 ? (
                              <button
                                type="button"
                                className="text-act"
                                style={{ alignSelf: "flex-start" }}
                                onClick={() => openCreate(row.phone, row.name ?? "", true)}
                              >
                                + Thêm MST ({profiles.length}/5)
                              </button>
                            ) : profiles.length >= 5 ? (
                              <p className="lab muted">Đã đủ 5 MST</p>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <TablePagination pager={pager} />
          </>
        )}
      </section>

      <PhoneTaxDialog
        draft={draft}
        rows={rows}
        saving={saving}
        onChange={setDraft}
        onClose={() => {
          if (!saving) setDraft(null);
        }}
        onSave={() => void save()}
      />

      <M3Confirm
        open={askDelete != null}
        onOpenChange={(v) => {
          if (!v) setAskDelete(null);
        }}
        title="Xoá MST này khỏi số điện thoại?"
        body="MST sẽ không còn được gợi ý khi tạo đơn."
        cancelLabel="Đóng"
        confirmLabel="Xoá"
        confirmDanger
        onConfirm={() => {
          if (askDelete) void remove(askDelete);
        }}
      />
    </div>
  );
}

function digits(phone: string) {
  return phone.replace(/\D/g, "");
}

/** Khớp cách BE nhận một SĐT: đủ số, không phải tên công ty. */
function looksLikePhone(raw: string) {
  const d = digits(raw);
  return d.length >= 10 && d.startsWith("0");
}

function PhoneTaxDialog({
  draft,
  rows,
  saving,
  onChange,
  onClose,
  onSave,
}: {
  draft: Draft | null;
  rows: BuyerDirectoryEntry[];
  saving: boolean;
  onChange: Dispatch<SetStateAction<Draft | null>>;
  onClose: () => void;
  onSave: () => void;
}) {
  const known = draft
    ? rows.find((r) => digits(r.phone) === digits(draft.phone) && digits(draft.phone).length >= 9)
    : undefined;
  const compact = (s: string) => s.replace(/\D/g, "");
  const taken = (known?.profiles ?? [])
    .map((p) => p.taxCode ?? "")
    .filter((t) => t && compact(t) !== compact(draft?.taxCode ?? ""));
  const duplicate = Boolean(
    draft?.taxCode &&
      (known?.profiles ?? []).some((p) => compact(p.taxCode ?? "") === compact(draft.taxCode) && p.id !== draft.id),
  );
  const slots = known?.profiles?.length ?? 0;

  return (
    <M3Sheet open={draft != null} onOpenChange={(open) => { if (!open) onClose(); }} variant="form-sheet">
      {draft ? (
        <>
          <M3SheetTitle>{draft.id ? "Sửa MST" : "Gắn MST"}</M3SheetTitle>
          <p className="lab muted" style={{ margin: 0 }}>
            {draft.phoneLocked
              ? `Số ${draft.phone} đang có ${slots}/5 MST. Nhập MST, hệ thống tự điền tên công ty.`
              : "Nhập số điện thoại trước, rồi nhập MST để tra tên công ty. Mỗi số tối đa 5 MST."}
          </p>

          <div className="stack" style={{ gap: 12 }}>
            {draft.phoneLocked ? (
              <div className="field view-field">
                <span className="l">Số điện thoại</span>
                <div className="view-val" style={{ fontFamily: "ui-monospace, monospace", fontWeight: 600 }}>
                  {draft.phone}
                </div>
                {draft.contactName ? <div className="sub">{draft.contactName}</div> : null}
              </div>
            ) : (
              <label className="field cfg-field">
                <span className="l">Số điện thoại</span>
                <PhoneInput
                  value={draft.phone}
                  autoFocus
                  onChange={(phone) => onChange((d) => (d ? { ...d, phone } : d))}
                />
              </label>
            )}

            <label className="field cfg-field">
              <span className="l">MST</span>
              <TaxCodeInput
                value={draft.taxCode}
                onChange={(taxCode) =>
                  onChange((d) => (d ? { ...d, taxCode, companyName: "", address: "" } : d))
                }
                onFound={(info) =>
                  onChange((d) => (d ? { ...d, companyName: info.companyName, address: info.address } : d))
                }
              />
              {duplicate ? <p className="lab" style={{ color: "var(--error)" }}>Số này đã gắn MST {draft.taxCode}.</p> : null}
              {taken.length > 0 ? <p className="lab muted">Đã gắn: {taken.join(", ")}</p> : null}
            </label>

            <label className="field cfg-field">
              <span className="l">Tên công ty</span>
              <Input value={draft.companyName} readOnly placeholder="Hiện sau khi tra được MST" />
            </label>
            <label className="field cfg-field">
              <span className="l">Địa chỉ</span>
              <Input value={draft.address} readOnly placeholder="Hiện sau khi tra được MST" />
            </label>
            <label className="field cfg-field">
              <span className="l">Email nhận hóa đơn</span>
              <Input
                value={draft.email}
                inputMode="email"
                placeholder="Không bắt buộc"
                onChange={(e) => onChange((d) => (d ? { ...d, email: e.target.value } : d))}
              />
            </label>
          </div>

          <M3ConfirmActions>
            <button type="button" className="btn ghost" disabled={saving} onClick={onClose}>
              Huỷ
            </button>
            <button
              type="button"
              className="btn"
              disabled={saving || duplicate || !draft.phone.trim() || !draft.companyName.trim()}
              onClick={onSave}
            >
              {saving ? "Đang lưu…" : "Lưu"}
            </button>
          </M3ConfirmActions>
        </>
      ) : null}
    </M3Sheet>
  );
}
