import { PAGE_SIZE_OPTIONS, type Pager } from "@/lib/use-paged-rows";
import { cn } from "@/lib/utils";

function pageWindow(page: number, pageCount: number): Array<number | "…"> {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const out: Array<number | "…"> = [1];
  const from = Math.max(2, page - 1);
  const to = Math.min(pageCount - 1, page + 1);
  if (from > 2) out.push("…");
  for (let n = from; n <= to; n++) out.push(n);
  if (to < pageCount - 1) out.push("…");
  out.push(pageCount);
  return out;
}

/** Phân trang theo design M3 (.pill.sm + .pg). Ẩn khi tổng ≤ 10. */
export function TablePagination({ pager, className }: { pager: Pager; className?: string }) {
  const { page, pageCount, pageSize, total, start, setPage, setPageSize } = pager;
  if (total <= PAGE_SIZE_OPTIONS[0]) return null;
  const end = Math.min(total, start + pageSize);

  return (
    <div className={cn("pager table-pager-sticky", className)} role="navigation" aria-label="Phân trang">
      <div className="pager-left">
        <span className="muted num lab">
          {start + 1}-{end} trên {total}
        </span>
        <label className="pill sm" style={{ cursor: "pointer" }}>
          <select
            aria-label="Số dòng mỗi trang"
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            style={{
              appearance: "none",
              border: 0,
              background: "transparent",
              font: "inherit",
              color: "inherit",
              cursor: "pointer",
              padding: 0,
              outline: "none",
            }}
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n} dòng/trang
              </option>
            ))}
          </select>
          <span className="ms" aria-hidden="true">
            expand_more
          </span>
        </label>
      </div>
      {pageCount > 1 ? (
        <div className="pager-btns">
          <button
            type="button"
            className="pg"
            aria-label="Trang trước"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            <span className="ms" aria-hidden="true">
              chevron_left
            </span>
          </button>
          {pageWindow(page, pageCount).map((n, i) =>
            n === "…" ? (
              <span key={`gap-${i}`} className="muted" style={{ padding: "0 4px" }}>
                …
              </span>
            ) : (
              <button
                key={n}
                type="button"
                className={cn("pg", n === page && "on")}
                aria-label={`Trang ${n}`}
                aria-current={n === page ? "page" : undefined}
                onClick={() => setPage(n)}
              >
                {n}
              </button>
            ),
          )}
          <button
            type="button"
            className="pg"
            aria-label="Trang sau"
            disabled={page >= pageCount}
            onClick={() => setPage(page + 1)}
          >
            <span className="ms" aria-hidden="true">
              chevron_right
            </span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
