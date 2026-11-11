/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  /** URL gốc FE kia (bản cũ Pixel Perfect) — nút đổi giao diện. */
  readonly VITE_SIBLING_UI_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
