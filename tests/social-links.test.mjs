import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { isSocialLink, socialLinks } from '../src/components/social-links.ts';

const seed = JSON.parse(readFileSync(new URL('../seed/seed.json', import.meta.url), 'utf8'));
const github = { url: 'https://github.com/dinkuskit', cssClasses: 'social-github' };
const discord = { url: 'https://discord.gg/example', cssClasses: 'social-discord' };

test('picks the marked links in menu order with their names', () => {
  const links = socialLinks([{ url: '/terms' }, discord, { url: 'https://github.com/dinkuskit/dinkuskit' }, github]);
  assert.deepEqual(links.map(link => [link.url, link.name, link.icon, link.newTab]), [
    ['https://discord.gg/example', 'Join DinkusKit on Discord', 'simple-icons:discord', false],
    ['https://github.com/dinkuskit', 'DinkusKit on GitHub', 'simple-icons:github', false],
  ]);
});

test('reads the class among others and ignores look-alikes', () => {
  assert.ok(isSocialLink({ url: 'x', cssClasses: 'wide  social-github' }));
  assert.ok(!isSocialLink({ url: 'x', cssClasses: 'social-githubx' }));
  assert.ok(!isSocialLink({ url: 'x', cssClasses: 'social-' }));
  assert.ok(!isSocialLink({ url: 'x' }));
});

test('shows a second link of the same kind once', () => {
  const links = socialLinks([github, { ...github, url: 'https://github.com/other' }]);
  assert.deepEqual(links.map(link => link.url), ['https://github.com/dinkuskit']);
});

test('keeps a new-tab choice from the menu', () => {
  assert.equal(socialLinks([{ ...github, target: '_blank' }])[0].newTab, true);
});

test('the seed marks the GitHub organization link, not Website source', () => {
  const items = seed.menus.find(menu => menu.name === 'footer-dinkuskit').items;
  assert.deepEqual(socialLinks(items).filter(link => link.kind === 'social-github').map(link => link.url), ['https://github.com/dinkuskit']);
  assert.ok(items.some(item => item.label === 'Website source' && !isSocialLink(item)));
});
