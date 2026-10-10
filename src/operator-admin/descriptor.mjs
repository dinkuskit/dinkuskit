import { fileURLToPath } from 'node:url';

/** Keep in step with ADMIN_PAGES in ./pages.ts. */
export const OPERATOR_ADMIN_PAGES = [
  { path: '/approvals', label: 'Business approvals', icon: 'seal-check' },
  { path: '/people', label: 'People', icon: 'users' },
  { path: '/stores', label: 'Stores and services', icon: 'storefront' },
];

/** In-process operator admin for this site only; see ./plugin.ts. */
export function operatorAdminPlugin() {
  return {
    id: 'dinkuskit-operator', // OPERATOR_ADMIN_PLUGIN_ID in ./paths.ts
    version: '0.1.0',
    format: 'standard',
    entrypoint: fileURLToPath(new URL('./plugin.ts', import.meta.url)),
    adminPages: OPERATOR_ADMIN_PAGES,
    capabilities: [],
  };
}
