import { createFileRoute } from "@tanstack/react-router";
import { ProtectedPage } from "@/components/AppShell";
import { StaffInfoPopover } from "@/components/StaffInfoPopover";
import { Input } from "@/components/ui/input";
import { NameInput } from "@/components/NameInput";
import { Badge } from "@/components/ui/badge";
import { M3Confirm } from "@/components/m3/M3Confirm";
import { M3ConfirmActions, M3Sheet, M3SheetTitle } from "@/components/m3/M3Sheet";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  ROLE_LABELS,
  findOfficeByToken,
  officeOptionValue,
  officeSelectLabel,
  officeSelectOption,
  type OfficeRec,
  type Role,
} from "@/lib/mock-data";
import { useStore, type UserRec } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { isApiEnabled } from "@/lib/api/client";
import { listPermissionGroups, type PermissionGroup } from "@/lib/api/permission-api";
import { useEffect, useMemo, useState } from "react";
import { usePagedRows } from "@/lib/use-paged-rows";
import { TablePagination } from "@/components/TablePagination";
import { toast } from "sonner";

export const Route = createFileRoute("/tai-khoan")({
  head: () => ({ meta: [{ title: "Tài khoản — X.E" }] }),
  component: () => (
    <ProtectedPage title="Tài khoản" screen="tai-khoan" hidePageTitle>
      <Page />
    </ProtectedPage>
  ),
});

const ALL_ROLES: Role[] = ["AD", "DH", "KT"];

function officeOfUser(u: UserRec, offices: OfficeRec[]): OfficeRec | undefined {
  if (u.office === "ALL") return undefined;
  return (
    (u.officeId != null ? offices.find((o) => o.id === u.officeId) : undefined) ??
    offices.find((o) => o.code === u.office)
  );
}

/** Nhóm quyền đang gắn tài khoản (chức danh); không có thì dùng role nền. */
function userRoleCode(u: UserRec): string {
  return (u.roleGroup ?? u.role ?? "").trim();
}

function Page() {
  const { session } = useAuth();
  const users = useStore((s) => s.users);
  const offices = useStore((s) => s.offices);
  const upsertUser = useStore((s) => s.upsertUser);
  const removeUser = useStore((s) => s.removeUser);
  const [editing, setEditing] = useState<UserRec | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [groups, setGroups] = useState<PermissionGroup[]>([]);
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [removing, setRemoving] = useState<UserRec | null>(null);

  useEffect(() => {
    if (!isApiEnabled()) return;
    listPermissionGroups()
      .then(setGroups)
      .catch(() => undefined);
  }, []);

  const roleOptions = useMemo(() => {
    const byCode = new Map<string, string>();
    for (const g of groups) {
      byCode.set(g.code, `${g.name} (${g.code})`);
    }
    for (const r of ALL_ROLES) {
      if (!byCode.has(r)) byCode.set(r, ROLE_LABELS[r]);
    }
    for (const u of users) {
      const code = userRoleCode(u);
      if (code && !byCode.has(code)) {
        byCode.set(code, ROLE_LABELS[code as Role] ?? code);
      }
    }
    return [...byCode.entries()]
      .map(([value, label]) => ({ value, label, keywords: value }))
      .sort((a, b) => a.label.localeCompare(b.label, "vi"));
  }, [groups, users]);

  const filtered = useMemo(() => {
    const kw = q.trim().toLocaleLowerCase("vi-VN");
    return users.filter((u) => {
      if (roleFilter && userRoleCode(u) !== roleFilter) return false;
      if (!kw) return true;
      const hay = `${u.username} ${u.staffCode ?? ""} ${u.displayName ?? ""}`.toLocaleLowerCase(
        "vi-VN",
      );
      return hay.includes(kw);
    });
  }, [users, q, roleFilter]);

  const { pageRows, pager } = usePagedRows(filtered, "tai-khoan");

  useEffect(() => {
    pager.setPage(1);
    // Chỉ về trang 1 khi đổi từ khóa / vai trò.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, roleFilter]);

  const isSelf = (u: UserRec) => session?.username?.toLowerCase() === u.username.toLowerCase();

  return (
    <div className="m3-page stack" style={{ gap: 16 }}>
      <div className="title-row">
        <div>
          <h1 className="page-title">Tài khoản</h1>
          <div className="lab muted num">
            {filtered.length !== users.length
              ? `${filtered.length} / ${users.length} người dùng`
              : `${users.length} người dùng`}
          </div>
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setIsNew(true);
            setEditing({
              username: "",
              role: "DH",
              office: offices[0]?.code ?? "",
              officeId: offices[0]?.id,
              active: true,
              allowedOfficeIds: [],
            });
          }}
        >
          <span className="ms" aria-hidden="true">
            add
          </span>
          Tạo tài khoản
        </button>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        <label className="field" style={{ flex: "1 1 320px", maxWidth: 480 }}>
          <span className="l">Tìm kiếm</span>
          <span className="box input-box">
            <span className="ms muted" aria-hidden="true">
              search
            </span>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Tài khoản, mã NV, tên nhân viên…"
            />
          </span>
        </label>
        <div className="field">
          <span className="l">Vai trò</span>
          <SearchableSelect
            value={roleFilter || "all"}
            onValueChange={(v) => setRoleFilter(v === "all" ? "" : v)}
            placeholder="Tất cả"
            searchPlaceholder="Tìm vai trò…"
            options={[{ value: "all", label: "Tất cả" }, ...roleOptions]}
          />
        </div>
      </div>

      <section className="card stack">
        {filtered.length === 0 ? (
          <div className="empty" style={{ padding: "48px 16px" }}>
            <h2 className="group-title">Không có tài khoản khớp bộ lọc</h2>
          </div>
        ) : (
          <div className="scroller">
            <table className="tbl" style={{ ["--tbl-min" as string]: "880px" }}>
              <thead>
                <tr>
                  <th>Tài khoản</th>
                  <th>Mã NV</th>
                  <th>Tên nhân viên</th>
                  <th>Nhóm quyền</th>
                  <th>VP</th>
                  <th>Trạng thái</th>
                  <th className="r">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((u) => (
                  <tr key={u.username}>
                    <td className="main">
                      <StaffInfoPopover staffKey={u.username} />
                    </td>
                    <td className="muted">{u.staffCode || "—"}</td>
                    <td>
                      <span className="who">
                        <span className="rev-ic sm" aria-hidden="true">
                          <span className="ms fill">person</span>
                        </span>
                        {u.displayName || "—"}
                      </span>
                    </td>
                    <td>
                      {groups.find((g) => g.code === userRoleCode(u))?.name ??
                        (userRoleCode(u) || "—")}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {u.office === "ALL"
                        ? "Toàn hệ thống"
                        : (() => {
                            const o = officeOfUser(u, offices);
                            const extra = (u.allowedOfficeIds ?? [])
                              .map((id) => offices.find((x) => x.id === id))
                              .filter((x): x is OfficeRec => !!x);
                            return (
                              <>
                                {o ? officeSelectLabel(o) : u.office}
                                {extra.length > 0 && (
                                  <span
                                    className="sub"
                                    title={`Được chuyển sang: ${extra.map(officeSelectLabel).join(", ")}`}
                                  >
                                    +{extra.length} VP
                                  </span>
                                )}
                              </>
                            );
                          })()}
                    </td>
                    <td>
                      <span className={u.active ? "tag ok" : "tag warn"}>
                        {u.active ? "Hoạt động" : "Đã khoá"}
                      </span>
                    </td>
                    <td>
                      <div className="act">
                        <button
                          type="button"
                          className="no"
                          title="Sửa"
                          aria-label={`Sửa tài khoản ${u.username}`}
                          onClick={() => {
                            setIsNew(false);
                            setEditing(u);
                          }}
                        >
                          <span className="ms" aria-hidden="true">
                            edit
                          </span>
                        </button>
                        <button
                          type="button"
                          className="no"
                          title={u.active ? "Khoá" : "Mở khoá"}
                          aria-label={`${u.active ? "Khoá" : "Mở khoá"} tài khoản ${u.username}`}
                          onClick={() => {
                            upsertUser({ ...u, active: !u.active });
                            toast.success(u.active ? "Đã khóa" : "Đã mở khóa");
                          }}
                        >
                          <span className="ms" aria-hidden="true">
                            {u.active ? "lock" : "lock_open"}
                          </span>
                        </button>
                        <button
                          type="button"
                          className="no"
                          title={isSelf(u) ? "Không xoá được tài khoản đang đăng nhập" : "Xoá"}
                          aria-label={`Xoá tài khoản ${u.username}`}
                          disabled={isSelf(u)}
                          style={isSelf(u) ? { opacity: 0.38 } : undefined}
                          onClick={() => setRemoving(u)}
                        >
                          <span className="ms" aria-hidden="true">
                            delete
                          </span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {filtered.length > 10 ? <TablePagination pager={pager} /> : null}
      </section>

      <M3Confirm
        open={removing != null}
        onOpenChange={(v) => !v && setRemoving(null)}
        title={`Xoá tài khoản ${removing?.username ?? ""}?`}
        body="Tài khoản sẽ không đăng nhập được nữa. Nếu chỉ muốn tạm ngừng, bạn nên khoá tài khoản."
        confirmLabel="Xoá tài khoản"
        confirmDanger
        onConfirm={() => {
          const u = removing;
          if (!u) return;
          void removeUser(u.username).then((r) => {
            if (!r.ok) return toast.error(r.error);
            toast.success("Đã xóa tài khoản");
          });
        }}
      />

      {editing && (
        <UserDialog
          user={editing}
          isNew={isNew}
          offices={offices}
          groups={groups}
          existing={users}
          onClose={() => setEditing(null)}
          onSave={(u) => {
            const r = upsertUser(u);
            if (!r.ok) return toast.error(r.error);
            toast.success(isNew ? "Đã tạo user" : "Đã lưu");
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function UserDialog({
  user,
  isNew,
  offices,
  groups,
  existing,
  onClose,
  onSave,
}: {
  user: UserRec;
  isNew: boolean;
  offices: OfficeRec[];
  groups: PermissionGroup[];
  existing: UserRec[];
  onClose: () => void;
  onSave: (u: UserRec) => void;
}) {
  const [f, setF] = useState(user);
  const [password, setPassword] = useState("");

  const submit = () => {
    if (!f.username) return toast.error("Nhập tài khoản");
    if (isNew && !password) return toast.error("Nhập mật khẩu");
    if (isNew && existing.some((x) => x.username === f.username))
      return toast.error("Trùng username");
    const code = f.staffCode?.trim().toUpperCase();
    const dup = code
      ? existing.find((x) => x.username !== f.username && x.staffCode?.toUpperCase() === code)
      : undefined;
    if (dup) return toast.error(`Mã nhân viên ${code} đã dùng cho tài khoản ${dup.username}`);
    // Chỉ gửi mật khẩu khi người dùng nhập mới — bỏ trống thì giữ mật khẩu hiện tại.
    const homeId = officeOfUser(f, offices)?.id;
    const extras =
      f.office === "ALL"
        ? []
        : (f.allowedOfficeIds ?? []).filter((id) => id != null && id !== homeId);
    const out = {
      ...f,
      staffCode: code || f.staffCode,
      displayName: f.displayName?.trim() || f.displayName,
      passwordHash: password ? btoa(password) : undefined,
      allowedOfficeIds: extras,
    };
    onSave(out);
  };

  const homeOffice = officeOfUser(f, offices);

  return (
    <M3Sheet open onOpenChange={(v) => !v && onClose()} variant="form-sheet">
      <M3SheetTitle>{isNew ? "Tạo tài khoản" : "Sửa tài khoản"}</M3SheetTitle>
      <div className="grid gap-3 sm:grid-cols-2">
        <F label="Tài khoản *">
          <Input
            value={f.username}
            autoComplete="off"
            disabled={!isNew}
            onChange={(e) => setF({ ...f, username: e.target.value })}
          />
        </F>
        <F label={isNew ? "Mật khẩu *" : "Đổi mật khẩu (bỏ trống để giữ)"}>
          <Input
            type="password"
            name="new-account-password"
            autoComplete="new-password"
            placeholder={isNew ? "" : "Bỏ trống để giữ mật khẩu"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </F>
        <F label="Mã nhân viên">
          <Input
            value={f.staffCode ?? ""}
            maxLength={30}
            autoComplete="off"
            placeholder={isNew ? "Bỏ trống = theo tài khoản" : ""}
            onChange={(e) => setF({ ...f, staffCode: e.target.value })}
          />
        </F>
        <F label="Tên nhân viên">
          <NameInput
            preserveCase
            value={f.displayName ?? ""}
            maxLength={100}
            onChange={(displayName) => setF({ ...f, displayName })}
          />
        </F>
        <F label="Nhóm quyền (chức danh)">
          <SearchableSelect
            value={f.roleGroup ?? f.role}
            onValueChange={(v) => {
              const g = groups.find((x) => x.code === v);
              setF({
                ...f,
                roleGroup: v,
                role: (g?.baseRoleCode as Role) ?? (v as Role) ?? f.role,
              });
            }}
            options={
              groups.length
                ? groups.map((g) => ({
                    value: g.code,
                    label: `${g.name} (${g.code})`,
                    keywords: g.code,
                  }))
                : ALL_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))
            }
          />
        </F>
        <F label="Trạng thái">
          <SearchableSelect
            value={f.active ? "1" : "0"}
            onValueChange={(v) => setF({ ...f, active: v === "1" })}
            options={[
              { value: "1", label: "Hoạt động" },
              { value: "0", label: "Khóa" },
            ]}
          />
        </F>
        <div className="sm:col-span-2">
          <F label="VP đang dùng">
            <SearchableSelect
              value={(() => {
                if (f.office === "ALL") return "ALL";
                return homeOffice ? officeOptionValue(homeOffice) : f.office;
              })()}
              onValueChange={(v) => {
                if (v === "ALL") {
                  setF({ ...f, office: "ALL", officeId: undefined, allowedOfficeIds: [] });
                  return;
                }
                const o = findOfficeByToken(v, offices);
                const nextHomeId = o?.id;
                setF({
                  ...f,
                  office: o?.code ?? v,
                  officeId: nextHomeId,
                  allowedOfficeIds: (f.allowedOfficeIds ?? []).filter((id) => id !== nextHomeId),
                });
              }}
              options={[
                { value: "ALL", label: "Toàn hệ thống" },
                ...offices.map(officeSelectOption),
              ]}
            />
          </F>
        </div>
        {f.office !== "ALL" ? (
          <div className="sm:col-span-2">
            <AllowedOfficesField
              offices={offices}
              homeId={homeOffice?.id}
              value={f.allowedOfficeIds ?? []}
              onChange={(ids) => setF({ ...f, allowedOfficeIds: ids })}
            />
          </div>
        ) : (
          <p className="lab muted sm:col-span-2" style={{ margin: 0 }}>
            Tài khoản toàn hệ thống chọn VP xem ở đầu trang — không cần gán VP chuyển thêm.
          </p>
        )}
      </div>
      <M3ConfirmActions>
        <button type="button" className="btn ghost" onClick={onClose}>
          Đóng
        </button>
        <button type="button" className="btn" onClick={submit}>
          {isNew ? "Tạo" : "Lưu"}
        </button>
      </M3ConfirmActions>
    </M3Sheet>
  );
}

function AllowedOfficesField({
  offices,
  homeId,
  value,
  onChange,
}: {
  offices: OfficeRec[];
  homeId?: number;
  value: number[];
  onChange: (ids: number[]) => void;
}) {
  const picked = value.filter((id) => id !== homeId);
  const pickedOffices = picked
    .map((id) => offices.find((o) => o.id === id))
    .filter((o): o is OfficeRec => !!o);
  const candidates = offices.filter(
    (o) => o.id != null && o.id !== homeId && !picked.includes(o.id),
  );
  return (
    <div className="field cfg-field">
      <span className="l">VP được chuyển sang thêm</span>
      <p className="lab muted" style={{ margin: 0 }}>
        Nhân viên tự chuyển giữa VP ở trên và các VP này. Mỗi lúc chỉ làm việc ở một VP, mọi danh
        sách, quét và thu tiền tính theo VP đang chọn.
      </p>
      {pickedOffices.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {pickedOffices.map((o) => (
            <Badge key={o.id} variant="secondary" className="gap-1 pr-1">
              {officeSelectLabel(o)}
              <button
                type="button"
                className="rounded px-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Bỏ VP này"
                onClick={() => onChange(picked.filter((id) => id !== o.id))}
              >
                ×
              </button>
            </Badge>
          ))}
        </div>
      )}
      <SearchableSelect
        value=""
        placeholder={candidates.length ? "Thêm VP…" : "Không còn VP để thêm"}
        searchPlaceholder="Tìm văn phòng…"
        disabled={!candidates.length}
        onValueChange={(v) => {
          const o = findOfficeByToken(v, offices);
          if (o?.id != null && !picked.includes(o.id)) onChange([...picked, o.id]);
        }}
        options={candidates.map(officeSelectOption)}
      />
    </div>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="field cfg-field">
      <span className="l">{label}</span>
      {children}
    </div>
  );
}
