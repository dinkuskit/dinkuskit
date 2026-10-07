/// <reference types="emdash/locals" />
/// <reference path="../worker-configuration.d.ts" />

type D1PreparedStatement = {
  bind: (...values: unknown[]) => D1PreparedStatement;
  first: <T = unknown>() => Promise<T | null>;
  run: () => Promise<unknown>;
  all: <T = unknown>() => Promise<{ results?: T[] }>;
};

declare global {
  type D1Database = {
    prepare: (query: string) => D1PreparedStatement;
    batch: (statements: D1PreparedStatement[]) => Promise<unknown>;
  };

  namespace App {
    interface Locals {
      merchant: import('./account/session').ResolvedMerchant | null;
      login: import('./account/session').AuthenticatedLogin | null;
    }
  }
}

interface ImportMetaEnv {
  readonly EMDASH_ACCESS_TEAM_DOMAIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

export {};
