/// <reference types="emdash/locals" />

interface ImportMetaEnv {
  readonly EMDASH_ACCESS_TEAM_DOMAIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
