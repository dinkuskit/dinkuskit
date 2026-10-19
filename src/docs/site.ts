import type { DocsSite } from './catalog.ts';

/** The only site-specific docs setting. Section names match the seed's `section` options. */
export const docsSite: DocsSite = {
  origin: 'https://dinkuskit.com',
  name: 'DinkusKit',
  description: 'Documentation for store owners and developers.',
  sectionPaths: {
    'Store owners': 'store-owners',
    Developers: 'developers',
    'Product reference': 'reference',
  },
};
