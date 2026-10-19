// Shared by tests/docs.test.mjs: compares the Markdown export of random
// inline-formatted paragraphs with what an independent renderer (marked) shows.
import { marked } from 'marked';
import { markdownToPortableText, portableTextToMarkdown } from '../src/docs/portable-text.ts';

const ALPHABET = 'ab xy 12*_`\\[]()<>&#!-.|~=+:;"\'';
const HREFS = ['https://example.org/a)b', 'https://example.org/a(b', 'https://example.org/a b', '/docs/x_(y)', 'https://example.org/<q>', '/docs/start'];
const MARKS = ['strong', 'em', 'code', 'link'];

function random(seed) {
  let state = seed >>> 0;
  return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 2 ** 32; };
}

export function randomParagraph(seed, style = 'normal') {
  const next = random(seed);
  const pick = list => list[Math.floor(next() * list.length)];
  const markDefs = [];
  const children = Array.from({ length: 1 + Math.floor(next() * 5) }, (_, index) => {
    const text = Array.from({ length: 1 + Math.floor(next() * 6) }, () => pick(ALPHABET)).join('');
    const marks = MARKS.filter(() => next() < 0.3).map(mark => {
      if (mark !== 'link') return mark;
      const def = { _type: 'link', _key: `l${index}`, href: pick(HREFS) };
      markDefs.push(def);
      return def._key;
    });
    return { _type: 'span', _key: `s${index}`, text, marks };
  });
  return { _type: 'block', _key: 'p', style, markDefs, children };
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"' };
const decode = text => text.replace(/&(amp|lt|gt|quot|#\d+);/g, (_, name) => ENTITIES[name] ?? String.fromCharCode(Number(name.slice(1))));

/** Each visible character with the formatting around it: [character, 'code em link:href strong']. */
export function renderedCharacters(html) {
  const open = [];
  const result = [];
  for (const [, close, tag, attrs, text] of html.matchAll(/<(\/?)(\w+)([^>]*)>|([^<]+)/g)) {
    if (text !== undefined) {
      for (const character of decode(text)) result.push([character, [...open].sort().join(' ')]);
    } else if (tag === 'p' || /^h\d$/.test(tag)) {
      continue;
    } else if (close) {
      open.splice(open.lastIndexOf(open.findLast(item => item.split(':')[0] === tag)), 1);
    } else {
      open.push(tag === 'a' ? `link:${decode(attrs.match(/href="([^"]*)"/)?.[1] ?? '')}` : tag);
    }
  }
  return result;
}

/** What the paragraph should show: Markdown drops boundary spaces, and spaces carry no visible formatting. */
export function expectedCharacters(block) {
  const links = new Map(block.markDefs.map(def => [def._key, def.href]));
  const result = [];
  for (const span of block.children) {
    const marks = span.marks.map(mark => links.has(mark) ? `link:${encodeURI(links.get(mark)).replace(/%25/g, '%')}` : mark).sort().join(' ');
    for (const character of span.text) result.push([character, marks]);
  }
  return result;
}

export function compareParagraph(block) {
  const markdown = portableTextToMarkdown([block]);
  const html = marked.parse(markdown).trim().replace(/^<h2[^>]*>/, '<h2>');
  // Spaces outside code show no formatting, and Markdown drops them at the paragraph's ends.
  const strip = items => {
    const shown = items.map(([character, marks]) => [character, /\s/.test(character) && !marks.includes('code') ? '' : marks]);
    while (shown.length && /\s/.test(shown[0][0]) && !shown[0][1]) shown.shift();
    while (shown.length && /\s/.test(shown.at(-1)[0]) && !shown.at(-1)[1]) shown.pop();
    return shown;
  };
  return { markdown, html, reexported: portableTextToMarkdown(markdownToPortableText(markdown)), actual: strip(renderedCharacters(html)), expected: strip(expectedCharacters(block)) };
}
