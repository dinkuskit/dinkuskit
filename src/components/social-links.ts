// Discord and GitHub show as their logos in the header and the footer (issue
// #106). Editors keep both links in the DinkusKit footer menu; EmDash's "CSS
// classes" field on a menu item marks it as one. Header and footer read the
// same items, so each link has one URL and the two places cannot drift apart.
export const SOCIAL_MENU = 'footer-dinkuskit';

const KINDS = {
  'social-discord': { icon: 'simple-icons:discord', name: 'Join DinkusKit on Discord' },
  'social-github': { icon: 'simple-icons:github', name: 'DinkusKit on GitHub' },
} as const;
type Kind = keyof typeof KINDS;

interface MenuLink { url: string; target?: string; cssClasses?: string }
export interface SocialLink { kind: Kind; url: string; icon: string; name: string; newTab: boolean }

function kindOf(item: MenuLink): Kind | undefined {
  return (item.cssClasses ?? '').split(/\s+/).find((name): name is Kind => Object.hasOwn(KINDS, name));
}

export function isSocialLink(item: MenuLink): boolean {
  return kindOf(item) !== undefined;
}

// In menu order, the first item of each kind; a second one is ignored rather
// than shown twice.
export function socialLinks(items: readonly MenuLink[]): SocialLink[] {
  const links: SocialLink[] = [];
  for (const item of items) {
    const kind = kindOf(item);
    if (!kind || links.some(link => link.kind === kind)) continue;
    links.push({ kind, url: item.url, ...KINDS[kind], newTab: item.target === '_blank' });
  }
  return links;
}
