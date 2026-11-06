import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useOrderHistoryOptional } from "@/components/OrderHistoryDialog";
import { realVehiclePlate } from "@/components/AssignVehiclePicker";
import { toast } from "sonner";
import { useStore, type OrderX } from "@/lib/store";
import { formatVND, officeName, orderReceiverOffice } from "@/lib/mock-data";
import { orderDueAmount, senderFareTreatedCollected } from "@/lib/finance-debt";
import { orderTabStatusLabel } from "@/lib/customer-track-status";
import { orderGoodsLabel } from "@/lib/package-label";
import { isApiEnabled } from "@/lib/api/client";
import { listOrders } from "@/lib/api/domain-api";
import { compareSearchResults, keywordSearchVariants, orderMatchesQuery } from "@/lib/order-search";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { canRead, useRbacVersion } from "@/lib/rbac";
import { hasAllOfficeScope } from "@/lib/office-scope";
import { pendingHandoverOrders } from "@/lib/pending-handover";
import { ACTIVITY_TOP_NAV } from "@/lib/activity-nav";
import { useActivityFilters } from "@/lib/activity-filters";
import { StageTabFilters } from "@/components/StageTabs";

function mergeOrdersIntoStore(rows: OrderX[]) {
  if (!rows.length) return;
  useStore.setState((st) => {
    const byCode = new Map(st.orders.map((o) => [o.code, o]));
    for (const r of rows) {
      const prev = byCode.get(r.code);
      byCode.set(
        r.code,
        prev ? { ...prev, ...r, events: r.events?.length ? r.events : prev.events } : r,
      );
    }
    return { orders: [...byCode.values()] };
  });
}

const REMOTE_SIZE = 30;
const REMOTE_DEBOUNCE_MS = 400;
const REMOTE_CACHE_MS = 60_000;

/** Ô tìm đơn — đặt giữa header cạnh title. */
export function GlobalHeaderSearch() {
  const orderHistory = useOrderHistoryOptional();

  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<OrderX[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const reqSeq = useRef(0);
  /** keyword (lower) → kết quả server; đủ (< REMOTE_SIZE) thì từ khoá dài hơn lọc tại chỗ, không gọi lại. */
  const remoteCache = useRef(new Map<string, { rows: OrderX[]; at: number }>());

  const cachedRemote = useCallback((s: string): OrderX[] | null => {
    const key = s.toLocaleLowerCase("vi-VN");
    const now = Date.now();
    for (const [k, v] of remoteCache.current) {
      if (now - v.at > REMOTE_CACHE_MS) {
        remoteCache.current.delete(k);
        continue;
      }
      if (k === key) return v.rows;
      if (key.startsWith(k) && v.rows.length < REMOTE_SIZE)
        return v.rows.filter((o) => orderMatchesQuery(o, s));
    }
    return null;
  }, []);

  const showMerged = useCallback((s: string, remote: OrderX[]) => {
    const local = useStore.getState().orders.filter((o) => orderMatchesQuery(o, s));
    const byCode = new Map<string, OrderX>();
    for (const o of [...remote, ...local]) {
      const prev = byCode.get(o.code);
      if (!prev) {
        byCode.set(o.code, o);
        continue;
      }
      const prevAt = Date.parse(prev.updatedAt ?? "") || 0;
      const nextAt = Date.parse(o.updatedAt ?? "") || 0;
      if (nextAt >= prevAt) byCode.set(o.code, o);
    }
    const merged = [...byCode.values()]
      .filter((o) => orderMatchesQuery(o, s))
      .sort(compareSearchResults)
      .slice(0, 20);
    setResults(merged);
    setActiveIdx(0);
    return merged;
  }, []);

  const fetchRemote = useCallback(
    async (s: string): Promise<OrderX[]> => {
      const hit = cachedRemote(s);
      if (hit || !isApiEnabled()) return hit ?? [];
      try {
        // "0T12" + biến thể "T12" — BE LIKE exact không khớp mã dạng …01T12…
        const variants = keywordSearchVariants(s);
        const pages = await Promise.all(
          variants.map((kw) => listOrders({ keyword: kw, size: REMOTE_SIZE, searchAllOffices: true })),
        );
        const byCode = new Map<string, OrderX>();
        for (const rows of pages) {
          for (const r of rows) byCode.set(r.code, r);
        }
        const rows = [...byCode.values()];
        remoteCache.current.set(s.toLocaleLowerCase("vi-VN"), { rows, at: Date.now() });
        if (rows.length) mergeOrdersIntoStore(rows);
        return rows;
      } catch {
        return [];
      }
    },
    [cachedRemote],
  );

  useEffect(() => {
    const s = q.trim();
    if (s.length < 2) {
      reqSeq.current++;
      setResults([]);
      setOpen(false);
      setLoading(false);
      return;
    }
    const seq = ++reqSeq.current;
    setOpen(true);
    const hit = cachedRemote(s);
    showMerged(s, hit ?? []);
    if (hit || !isApiEnabled()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = window.setTimeout(() => {
      void fetchRemote(s).then((remote) => {
        if (seq !== reqSeq.current) return;
        showMerged(s, remote);
        setLoading(false);
      });
    }, REMOTE_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [q, cachedRemote, showMerged, fetchRemote]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const openOrder = (code: string) => {
    setOpen(false);
    orderHistory?.openOrderHistory(code);
  };

  const onSearch = async () => {
    const s = q.trim();
    if (!s) return;

    let pool = results;
    if (!pool.length) {
      setLoading(true);
      pool = showMerged(s, await fetchRemote(s));
      setLoading(false);
    }

    if (!pool.length) {
      toast.error("Không tìm thấy đơn khớp");
      setOpen(true);
      return;
    }

    const qLower = s.toLocaleLowerCase("vi-VN");
    const exact = pool.find(
      (o) =>
        o.code.toLocaleLowerCase("vi-VN") === qLower ||
        o.draftCode?.toLocaleLowerCase("vi-VN") === qLower,
    );
    if (exact) {
      await openOrder(exact.code);
      return;
    }
    if (pool.length === 1) {
      await openOrder(pool[0].code);
      return;
    }
    setOpen(true);
    setActiveIdx(0);
  };

  return (
    <div className="search-wrap" ref={wrapRef} style={{ maxWidth: "100%", flex: "1 1 100%" }}>
      <label className="pill search">
        <span className="ms" aria-hidden="true">
          search
        </span>
        <input
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-controls="sr-list"
          autoComplete="off"
          placeholder="Tìm mã đơn, SĐT…"
          aria-label="Tìm mã đơn, SĐT"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => {
            if (q.trim().length >= 2 && results.length) setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setActiveIdx((i) => Math.min(i + 1, Math.max(0, results.length - 1)));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActiveIdx((i) => Math.max(0, i - 1));
            } else if (e.key === "Escape") {
              setOpen(false);
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (open && results.length > 1) {
                const pick = results[activeIdx] ?? results[0];
                if (pick) void openOrder(pick.code);
              } else {
                void onSearch();
              }
            }
          }}
        />
        {loading ? (
          <span className="ms" aria-hidden="true" style={{ opacity: 0.5 }}>
            progress_activity
          </span>
        ) : null}
      </label>

      {open && q.trim().length >= 2 ? (
        <div className="sr-pop" id="sr-list" role="listbox" aria-label="Kết quả tìm kiếm">
          <div className="sr-count lab muted num">
            {loading && results.length === 0
              ? "Đang tìm…"
              : `${results.length} kết quả`}
          </div>
          {results.length === 0 && !loading ? (
            <div className="sr-none">
              <span className="ms" aria-hidden="true">
                search_off
              </span>
              <div>Không tìm thấy đơn phù hợp. Thử mã đơn hoặc SĐT khác.</div>
            </div>
          ) : (
            results.map((o, i) => (
              <SearchResultItem
                key={o.code}
                order={o}
                query={q.trim()}
                active={i === activeIdx}
                onHover={() => setActiveIdx(i)}
                onOpen={() => void openOrder(o.code)}
              />
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

/** Tô phần khớp từ khoá (không phân biệt hoa thường). */
function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q || !text) return <>{text}</>;
  const idx = text.toLocaleLowerCase("vi-VN").indexOf(q.toLocaleLowerCase("vi-VN"));
  if (idx < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark>{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

/** "HH:mm dd/MM" */
function shortDateTime(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())} ${p(d.getDate())}/${p(d.getMonth() + 1)}`;
}

const SEARCH_STATUS_RED = new Set(["Giao hàng không thành công", "Đơn huỷ"]);
const SEARCH_STATUS_AMBER = new Set([
  "Ngoại lệ",
  "Thất lạc",
  "Hư hỏng",
  "Đang hoàn",
  "Hoàn thành công",
]);

function searchStatusTone(label: string): string {
  if (SEARCH_STATUS_RED.has(label)) return "tag err";
  if (SEARCH_STATUS_AMBER.has(label) || label.startsWith("Hoàn ·")) return "tag warn";
  if (label === "Giao thành công") return "tag ok";
  return "tag info";
}

function SearchResultItem({
  order: o,
  query,
  active,
  onHover,
  onOpen,
}: {
  order: OrderX;
  query: string;
  active: boolean;
  onHover: () => void;
  onOpen: () => void;
}) {
  const fare = Math.max(0, o.fare ?? 0);
  const paidRaw = Math.max(0, o.paidAmount ?? 0);
  const due = orderDueAmount(o);
  const balance = Math.max(0, fare - paidRaw);
  // Không bơm đã thu = đủ cước khi còn phí tồn / phần chênh chưa thu (fare > paid).
  const paid =
    senderFareTreatedCollected(o) && balance <= 0
      ? Math.max(paidRaw, fare)
      : senderFareTreatedCollected(o) && o.onePayAwaitingTransfer && paidRaw === 0 && balance > 0
        ? Math.max(paidRaw, fare - Math.max(0, o.storageFee ?? 0))
        : paidRaw;
  const createdAt = shortDateTime(o.createdAt);
  const loadedAt = shortDateTime(o.driverSignedAt);
  const plate = realVehiclePlate(o.vehiclePlate);
  const statusLabel = orderTabStatusLabel(o);
  return (
    <button
      type="button"
      className={cn("sr-item", active && "on")}
      role="option"
      aria-selected={active}
      onMouseEnter={onHover}
      onMouseDown={(e) => {
        e.preventDefault();
        onOpen();
      }}
    >
      <span className="sr-top">
        <span className="sr-code num">
          <Highlight text={o.code} query={query} />
        </span>
        {o.invoiceStatus === "ISSUED" || o.invoiceStatus === "DUPLICATE" ? (
          <span className="ms" title="Đã xuất hoá đơn" aria-label="Đã xuất hoá đơn">
            description
          </span>
        ) : null}
        <span className={searchStatusTone(statusLabel)}>{statusLabel}</span>
        {createdAt ? <span className="sr-time num">Tạo {createdAt}</span> : null}
        <span className={cn("sr-money", due > 0 ? "unpaid" : "paid")}>
          {due > 0 ? `Chưa thu: ${formatVND(due)}` : `Đã thu: ${formatVND(paid || fare)}`}
        </span>
        {plate ? (
          <span className="sr-time num" title="Biển kiểm soát">
            BKS {plate}
            {loadedAt ? ` · Lên xe ${loadedAt}` : ""}
          </span>
        ) : null}
      </span>
      <span className="sr-line sr-strong">
        <span className="ms" aria-hidden="true">
          person
        </span>
        <span className="num">
          <Highlight text={o.receiverName || "—"} query={query} />
          {o.receiverPhone ? (
            <>
              {" • "}
              <Highlight text={o.receiverPhone} query={query} />
            </>
          ) : null}
        </span>
      </span>
      <span className="sr-line">
        <span className="ms" aria-hidden="true">
          inventory_2
        </span>
        <span>{orderGoodsLabel(o)}</span>
      </span>
      <span className="sr-line">
        <span className="ms" aria-hidden="true">
          location_on
        </span>
        <span className="sr-route">
          {officeName(o.fromOffice)}
          <span className="ms sr-arrow" aria-hidden="true">
            arrow_right_alt
          </span>
          {officeName(orderReceiverOffice(o))}
        </span>
        <span className="sr-from num">
          <span className="ms" aria-hidden="true">
            call
          </span>
          Gửi:{" "}
          <b>
            <Highlight text={o.senderPhone || "—"} query={query} />
          </b>
        </span>
      </span>
    </button>
  );
}

/** Lối tắt hoạt động — nút đậm (primary / outline), rõ hơn tab màn. */
export function GlobalTopBar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { session } = useAuth();
  useRbacVersion();
  const storeOrders = useStore((s) => s.orders);
  const admin = hasAllOfficeScope(session);
  const handoverCount = pendingHandoverOrders(storeOrders, {
    allOffices: admin,
    office: session?.office,
  }).length;

  const quickNav = ACTIVITY_TOP_NAV.filter((i) => canRead(session?.role, i.screen));
  const navBadges: Record<string, number> = {
    "/cho-ban-giao": handoverCount,
  };
  const filters = useActivityFilters();
  const onActivityScreen = ACTIVITY_TOP_NAV.some((i) => pathname === i.to);

  if (!quickNav.length) return null;

  return (
    <nav
      className="hero-links flex min-w-0 flex-wrap items-center gap-2 px-3 py-2.5 md:gap-2 md:px-6"
      aria-label="Lối tắt đơn hàng"
    >
      {quickNav.map((i) => {
        const active =
          pathname === i.to || (i.to !== "/dashboard" && pathname.startsWith(`${i.to}/`));
        const badge = navBadges[i.to] ?? 0;
        const label = i.shortLabel ?? i.label;
        return (
          <Link
            key={i.to}
            to={i.to}
            title={i.label}
            className={cn("pill", active && "on")}
          >
            <span className="min-w-0 text-left leading-snug">{label}</span>
            {badge > 0 ? <span className="count num">{badge > 99 ? "99+" : badge}</span> : null}
          </Link>
        );
      })}
      {onActivityScreen ? (
        <StageTabFilters
          from={filters.from}
          to={filters.to}
          q={filters.q}
          onFrom={filters.setFrom}
          onTo={filters.setTo}
          onQ={filters.setQ}
          placeholder="Lọc mã đơn, SĐT, tên khách…"
        />
      ) : null}
    </nav>
  );
}
