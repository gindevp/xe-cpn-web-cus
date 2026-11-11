/**
 * URL bản FE kia (Pixel Perfect ↔ M3) để nút đổi giao diện.
 * Ưu tiên VITE_SIBLING_UI_URL; không set thì đoán theo host/port DEV + Vercel + docker 133.
 */
export function siblingUiBaseUrl(): string | null {
  const fromEnv = ((import.meta.env.VITE_SIBLING_UI_URL as string | undefined) ?? "").trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;

  if (typeof window === "undefined") return null;
  const { protocol, hostname, port } = window.location;
  const host = hostname.toLowerCase();

  if (host === "localhost" || host === "127.0.0.1") {
    // cus M3 = 7182 → cũ 7081
    if (port === "7182") return `${protocol}//${hostname}:7081`;
    if (port === "7081") return `${protocol}//${hostname}:7182`;
    return null;
  }

  // Docker 133: cũ :8088, cus :8089
  if (port === "8089") return `${protocol}//${hostname}:8088`;
  if (port === "8088") return `${protocol}//${hostname}:8089`;

  if (host.includes("xe-cpn-web-cus")) {
    return `${protocol}//${host.replace("xe-cpn-web-cus", "xe-cpn-web")}`;
  }
  if (host === "xe-cpn-web.vercel.app") {
    return `${protocol}//xe-cpn-web-cus.vercel.app`;
  }

  // Domain riêng (vd. cpn.xevietnam.com): set VITE_SIBLING_UI_URL trên Vercel/docker.
  return null;
}

/** Mở bản FE kia, giữ path + query hiện tại nếu route trùng tên. */
export function openSiblingUi(): void {
  const base = siblingUiBaseUrl();
  if (!base) return;
  const path = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  window.location.assign(`${base}${path === "/" ? "" : path}`);
}
