/** Bản FE này = M3/cus → sibling mặc định = FE cũ. */
const DEFAULT_SIBLING = "https://cpn.xevietnam.com";

/**
 * URL bản FE kia (Pixel Perfect).
 * Ưu tiên VITE_SIBLING_UI_URL; không set thì đoán DEV/docker/domain; cuối cùng dùng mặc định.
 */
export function siblingUiBaseUrl(): string {
  const fromEnv = ((import.meta.env.VITE_SIBLING_UI_URL as string | undefined) ?? "").trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;

  if (typeof window === "undefined") return DEFAULT_SIBLING;
  const { protocol, hostname, port } = window.location;
  const host = hostname.toLowerCase();

  if (host === "localhost" || host === "127.0.0.1") {
    if (port === "7182" || !port) return `${protocol}//${hostname}:7081`;
    if (port === "7081") return `${protocol}//${hostname}:7182`;
    return `${protocol}//${hostname}:7081`;
  }

  // Docker 133: cus :8089 → cũ :8088
  if (port === "8089") return `${protocol}//${hostname}:8088`;
  if (port === "8088") return `${protocol}//${hostname}:8089`;

  // cus.cpn.xevietnam.com → cpn.xevietnam.com
  if (host === "cus.cpn.xevietnam.com" || host.startsWith("cus.")) {
    return `${protocol}//${host.replace(/^cus\./, "")}`;
  }
  if (host.includes("xe-cpn-web-cus")) {
    return `${protocol}//${host.replace("xe-cpn-web-cus", "xe-cpn-web")}`;
  }

  return DEFAULT_SIBLING;
}

/** Nhãn nút trên bản M3. */
export const SIBLING_UI_LABEL = "Chuyển giao diện cũ";

/** Mở bản FE kia, giữ path + query hiện tại nếu route trùng tên. */
export function openSiblingUi(): void {
  const base = siblingUiBaseUrl();
  const path = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  window.location.assign(`${base}${path === "/" ? "" : path}`);
}
