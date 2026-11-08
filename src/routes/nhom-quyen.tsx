import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ProtectedPage } from "@/components/AppShell";
import { M3Page } from "@/components/M3Page";
import { EmptyState } from "@/components/PageBits";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { M3Confirm } from "@/components/m3/M3Confirm";
import { M3ConfirmActions, M3Sheet, M3SheetTitle } from "@/components/m3/M3Sheet";
import { ROLE_LABELS, type Role } from "@/lib/mock-data";
import { isApiEnabled } from "@/lib/api/client";
import {
  createPermissionGroup,
  deletePermissionGroup,
  listPermissionGroups,
  listScreens,
  updatePermissionGroup,
  type PermLevel,
  type PermissionGroup,
  type ScreenMeta,
} from "@/lib/api/permission-api";
import { toast } from "sonner";

export const Route = createFileRoute("/nhom-quyen")({
  head: () => ({ meta: [{ title: "Nhóm quyền — X.E" }] }),
  component: () => (
    <ProtectedPage title="Nhóm quyền" screen="nhom-quyen" hidePageTitle>
      <M3Page>
        <Page />
      </M3Page>
    </ProtectedPage>
  ),
});

const BASE_ROLES: Role[] = ["AD", "DH", "KT"];

const ROLE_ICON: Record<string, string> = {
  AD: "shield_person",
  DH: "inventory_2",
  KT: "calculate",
  DPHK: "groups",
  TBC: "store",
  TCN: "domain",
  TD: "headset_mic",
};

function errMsg(e: unknown, fallback: string) {
  return e instanceof Error && e.message ? e.message : fallback;
}

const LEVELS: { value: PermLevel; label: string }[] = [
  { value: "Y", label: "Sửa" },
  { value: "R", label: "Xem" },
  { value: "N", label: "Không" },
];

function Page() {
  const [screens, setScreens] = useState<ScreenMeta[]>([]);
  const [groups, setGroups] = useState<PermissionGroup[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<PermissionGroup | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<PermissionGroup | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);
  const [removing, setRemoving] = useState<PermissionGroup | null>(null);

  useEffect(() => {
    if (!isApiEnabled()) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [screenRows, groupRows] = await Promise.all([listScreens(), listPermissionGroups()]);
        if (cancelled) return;
        setScreens(screenRows);
        setGroups(groupRows);
        setSelected(groupRows[0]?.code ?? null);
        setDraft(groupRows[0] ? { ...groupRows[0], screens: { ...groupRows[0].screens } } : null);
      } catch (e: unknown) {
        if (!cancelled) toast.error(errMsg(e, "Không tải được nhóm quyền"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const modules = useMemo(() => {
    const map = new Map<string, ScreenMeta[]>();
    for (const s of screens) {
      if (s.hidden && !showHidden) continue;
      const list = map.get(s.module) ?? [];
      list.push(s);
      map.set(s.module, list);
    }
    return [...map.entries()];
  }, [screens, showHidden]);

  const hiddenCount = useMemo(() => screens.filter((s) => s.hidden).length, [screens]);

  const pick = (code: string) => {
    const g = groups.find((x) => x.code === code);
    setSelected(code);
    setDraft(g ? { ...g, screens: { ...g.screens } } : null);
  };

  const applySaved = (saved: PermissionGroup) => {
    setGroups((rows) => rows.map((r) => (r.code === saved.code ? saved : r)));
    if (selected === saved.code) setDraft({ ...saved, screens: { ...saved.screens } });
  };

  const setLevel = (screenKey: string, level: PermLevel) => {
    setDraft((d) => (d ? { ...d, screens: { ...d.screens, [screenKey]: level } } : d));
  };

  const setModuleLevel = (keys: string[], level: PermLevel) => {
    setDraft((d) => {
      if (!d) return d;
      const next = { ...d.screens };
      for (const k of keys) next[k] = level;
      return { ...d, screens: next };
    });
  };

  const savePermissions = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      applySaved(await updatePermissionGroup(draft.code, draft));
      toast.success(`Đã lưu quyền của ${draft.name}`);
    } catch (e: unknown) {
      toast.error(errMsg(e, "Lưu thất bại"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (g: PermissionGroup) => {
    try {
      await deletePermissionGroup(g.code);
      const rest = groups.filter((x) => x.code !== g.code);
      setGroups(rest);
      if (selected === g.code) {
        setSelected(rest[0]?.code ?? null);
        setDraft(rest[0] ? { ...rest[0], screens: { ...rest[0].screens } } : null);
      }
      toast.success("Đã xoá chức danh");
    } catch (e: unknown) {
      toast.error(errMsg(e, "Xoá thất bại"));
    }
  };

  if (!isApiEnabled()) {
    return <EmptyState>Cần bật API (VITE_API_BASE_URL) để quản lý nhóm quyền.</EmptyState>;
  }
  if (loading) return <EmptyState>Đang tải…</EmptyState>;

  const locked = Boolean(draft?.locked);
  const current = draft ? groups.find((g) => g.code === draft.code) : undefined;

  return (
    <>
      <div>
        <h1 className="page-title">Nhóm quyền</h1>
        <div className="lab muted">
          Mỗi tài khoản thuộc một chức danh. Sửa = xem + ghi, Xem = chỉ đọc, Không = ẩn màn.
        </div>
      </div>

      <div className="role-layout">
        <section className="card stack" style={{ padding: 16, gap: 8 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 8px",
            }}
          >
            <h2 className="group-title sec-title num">
              <span className="sec-ic" aria-hidden="true">
                <span className="ms">badge</span>
              </span>
              Chức danh ({groups.length})
            </h2>
            <button
              type="button"
              className="btn tonal"
              style={{ height: 36, padding: "0 12px" }}
              onClick={() => setCreating(true)}
            >
              <span className="ms" aria-hidden="true">
                add
              </span>
              Thêm
            </button>
          </div>
          {groups.map((g) => {
            const on = selected === g.code;
            return (
              <button
                key={g.code}
                type="button"
                className={on ? "role-btn on" : "role-btn"}
                aria-pressed={on}
                onClick={() => pick(g.code)}
              >
                <span className="who">
                  <span className="rev-ic sm" aria-hidden="true">
                    <span className="ms">{ROLE_ICON[g.code] ?? "badge"}</span>
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontWeight: 500 }}>{g.name}</span>
                    <span className="role-sub num">
                      {g.code} · {g.staffCount ?? 0} tài khoản
                      {g.active === false ? " · Khoá" : ""}
                    </span>
                  </span>
                </span>
              </button>
            );
          })}
        </section>

        {draft ? (
          <section className="card stack" style={{ minWidth: 0 }}>
            <div className="title-row sticky-bar" style={{ alignItems: "flex-start" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 22, lineHeight: "28px", fontWeight: 600 }}>
                  {draft.name}
                </h2>
                <div className="lab muted">
                  Mã {draft.code} ·{" "}
                  {draft.builtin
                    ? "Nhóm quyền dựng sẵn theo chức danh"
                    : `Chức danh gốc ${draft.baseRoleCode || "—"}${draft.description ? ` · ${draft.description}` : ""}`}
                </div>
              </div>
              {locked ? null : (
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 4 }}>
                  <button
                    type="button"
                    className="no-btn"
                    aria-label="Sửa thông tin chức danh"
                    title="Sửa thông tin chức danh"
                    onClick={() => current && setEditing(current)}
                  >
                    <span className="ms" aria-hidden="true">
                      edit
                    </span>
                  </button>
                  <button
                    type="button"
                    className="no-btn"
                    aria-label="Xoá chức danh"
                    title={draft.builtin ? "Chức danh dựng sẵn không xoá được" : "Xoá chức danh"}
                    disabled={Boolean(draft.builtin)}
                    style={draft.builtin ? { opacity: 0.38 } : undefined}
                    onClick={() => current && setRemoving(current)}
                  >
                    <span className="ms" aria-hidden="true">
                      delete
                    </span>
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={saving}
                    onClick={() => setConfirmSave(true)}
                  >
                    {saving ? "Đang lưu…" : "Lưu quyền"}
                  </button>
                </div>
              )}
            </div>

            {locked ? (
              <div className="note">
                Chức danh Admin có toàn quyền và không thể bị giới hạn, để tránh tự khoá mất quyền
                quản trị.
              </div>
            ) : null}

            {hiddenCount > 0 ? (
              <label
                className="lab"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  cursor: "pointer",
                  alignSelf: "flex-start",
                }}
              >
                <input
                  className="check"
                  type="checkbox"
                  checked={showHidden}
                  onChange={(e) => setShowHidden(e.target.checked)}
                />
                Hiện {hiddenCount} màn chưa lên menu
              </label>
            ) : null}

            {modules.map(([mod, rows]) => (
              <div key={mod} className="perm-group">
                <div className="perm-head">
                  <h3 className="group-title">{mod}</h3>
                  {locked ? null : (
                    <div style={{ display: "flex", gap: 2 }}>
                      {LEVELS.map((l) => (
                        <button
                          key={l.value}
                          type="button"
                          className="text-act"
                          onClick={() =>
                            setModuleLevel(
                              rows.map((r) => r.key),
                              l.value,
                            )
                          }
                        >
                          {l.label} tất cả
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {rows.map((s) => {
                  const level = (draft.screens[s.key] ?? "N") as PermLevel;
                  return (
                    <div key={s.key} className="perm-row">
                      <div style={{ minWidth: 0 }}>{s.label}</div>
                      <div className="perm-seg" role="radiogroup" aria-label={s.label}>
                        {LEVELS.map((l) => (
                          <button
                            key={l.value}
                            type="button"
                            role="radio"
                            aria-checked={level === l.value}
                            className={level === l.value ? "on" : ""}
                            disabled={locked}
                            onClick={() => setLevel(s.key, l.value)}
                          >
                            {l.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </section>
        ) : (
          <section className="card empty">Chọn một chức danh để xem quyền</section>
        )}
      </div>

      <M3Confirm
        open={confirmSave}
        onOpenChange={setConfirmSave}
        title={`Lưu quyền của ${draft?.name ?? ""}?`}
        body={`Thay đổi áp dụng cho tất cả tài khoản thuộc chức danh này (${current?.staffCount ?? 0} tài khoản).`}
        confirmLabel="Xác nhận lưu"
        onConfirm={() => void savePermissions()}
      />

      <M3Confirm
        open={removing != null}
        onOpenChange={(v) => !v && setRemoving(null)}
        title="Xoá chức danh này?"
        body={`${removing?.name ?? ""} (${removing?.code ?? ""}) — tài khoản thuộc chức danh này cần được gán chức danh khác.`}
        confirmLabel="Xoá"
        confirmDanger
        onConfirm={() => removing && void remove(removing)}
      />

      {creating ? (
        <GroupSheet
          mode="create"
          groups={groups}
          screens={screens}
          onClose={() => setCreating(false)}
          onSaved={(saved) => {
            setGroups((rows) => [...rows, saved]);
            setCreating(false);
            setSelected(saved.code);
            setDraft({ ...saved, screens: { ...saved.screens } });
          }}
        />
      ) : null}

      {editing ? (
        <GroupSheet
          mode="edit"
          group={editing}
          groups={groups}
          screens={screens}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            applySaved(saved);
            setEditing(null);
          }}
        />
      ) : null}
    </>
  );
}

function GroupSheet({
  mode,
  group,
  groups,
  screens,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  group?: PermissionGroup;
  groups: PermissionGroup[];
  screens: ScreenMeta[];
  onClose: () => void;
  onSaved: (g: PermissionGroup) => void;
}) {
  const isEdit = mode === "edit";
  const [code, setCode] = useState(group?.code ?? "");
  const [name, setName] = useState(group?.name ?? "");
  const [description, setDescription] = useState(group?.description ?? "");
  const [base, setBase] = useState(group?.baseRoleCode || "Q");
  const [active, setActive] = useState(group?.active !== false);
  const [copyFrom, setCopyFrom] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!isEdit && !code.trim()) return toast.error("Nhập mã chức danh");
    if (!name.trim()) return toast.error("Nhập tên chức danh");
    setBusy(true);
    try {
      if (isEdit && group) {
        // Không gửi screens → BE giữ nguyên quyền đang có (partial update).
        const saved = await updatePermissionGroup(group.code, {
          code: group.code,
          name: name.trim(),
          description: description.trim(),
          baseRoleCode: base,
          active,
        } as PermissionGroup);
        toast.success("Đã cập nhật chức danh");
        onSaved(saved);
        return;
      }
      const source = groups.find((g) => g.code === copyFrom);
      const blank: Record<string, PermLevel> = {};
      for (const s of screens) blank[s.key] = "N";
      const saved = await createPermissionGroup({
        code: code.trim().toUpperCase(),
        name: name.trim(),
        description: description.trim(),
        baseRoleCode: base,
        active,
        builtin: false,
        screens: source ? { ...blank, ...source.screens } : blank,
      });
      toast.success(`Đã tạo chức danh ${saved.name}`);
      onSaved(saved);
    } catch (e: unknown) {
      toast.error(errMsg(e, isEdit ? "Cập nhật thất bại" : "Tạo thất bại"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <M3Sheet open onOpenChange={(v) => !v && onClose()} variant="form-sheet">
      <M3SheetTitle>{isEdit ? `Sửa chức danh ${group?.code}` : "Thêm chức danh"}</M3SheetTitle>
      <p className="lab muted" style={{ margin: 0 }}>
        Chức danh gốc dùng cho nghiệp vụ ngoài màn hình (phạm vi văn phòng, chốt ngày, báo cáo).
        {isEdit ? " Sửa ở đây không đổi quyền màn hình đã cấp." : ""}
      </p>
      <div className="stack" style={{ gap: 12 }}>
        <label className="field cfg-field">
          <span className="l">Mã chức danh{isEdit ? "" : " * (A-Z, 0-9)"}</span>
          <Input
            value={code}
            disabled={isEdit}
            onChange={(e) => setCode(e.target.value)}
            placeholder="QUAY_TRUONG"
          />
        </label>
        <label className="field cfg-field">
          <span className="l">Tên chức danh *</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Quầy trưởng" />
        </label>
        <div className="field cfg-field">
          <span className="l">Chức danh gốc (nghiệp vụ)</span>
          <SearchableSelect
            value={base}
            onValueChange={setBase}
            disabled={isEdit && Boolean(group?.builtin)}
            options={BASE_ROLES.map((r) => ({ value: r, label: `${ROLE_LABELS[r]} (${r})` }))}
          />
        </div>
        <div className="field cfg-field">
          <span className="l">Trạng thái</span>
          <SearchableSelect
            value={active ? "1" : "0"}
            onValueChange={(v) => setActive(v === "1")}
            options={[
              { value: "1", label: "Đang dùng" },
              { value: "0", label: "Khoá (tài khoản mất quyền)" },
            ]}
          />
        </div>
        <label className="field cfg-field">
          <span className="l">Ghi chú</span>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        {isEdit ? null : (
          <div className="field cfg-field">
            <span className="l">Nhân bản quyền từ</span>
            <SearchableSelect
              value={copyFrom || "none"}
              onValueChange={(v) => setCopyFrom(v === "none" ? "" : v)}
              options={[
                { value: "none", label: "Không (bắt đầu trắng)" },
                ...groups.map((g) => ({ value: g.code, label: g.name })),
              ]}
            />
          </div>
        )}
      </div>
      <M3ConfirmActions>
        <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>
          Đóng
        </button>
        <button type="button" className="btn" onClick={submit} disabled={busy}>
          {busy ? "Đang lưu…" : isEdit ? "Lưu" : "Tạo"}
        </button>
      </M3ConfirmActions>
    </M3Sheet>
  );
}
