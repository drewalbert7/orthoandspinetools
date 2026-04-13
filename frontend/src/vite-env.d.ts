/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_SITE_URL?: string
  /** GA4 measurement ID (e.g. G-XXXXXXXXXX). Omit or leave empty to disable analytics. */
  readonly VITE_GA_MEASUREMENT_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
