/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_TONCONNECT_MANIFEST_URL: string
  readonly VITE_PAYMENTS_PROOF_URL: string
  readonly VITE_CONTACT_SUPPORT_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.svg' {
  const content: string
  export default content
}
