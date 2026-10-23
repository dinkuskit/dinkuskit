// The plugin logos an editor can pick on a card or a plugin row, in the
// order a row shows them; the files are in public/brand.
export const PLUGIN_LOGOS: Record<string, string> = {
  Commerce: '/brand/commerce.webp',
  Payments: '/brand/payments.webp',
  Inventory: '/brand/inventory.webp',
  Ship: '/brand/ship.webp',
};

// Binary glTF 2.0 (.glb) 3D models for each plugin cube, rendered by
// PluginCube3D.astro and src/fx/plugin-cubes-3d.ts.
export const PLUGIN_MODELS: Record<string, string> = {
  Commerce: '/models/plugins/commerce.glb',
  Payments: '/models/plugins/payments.glb',
  Inventory: '/models/plugins/inventory.glb',
  Ship: '/models/plugins/ship.glb',
};

