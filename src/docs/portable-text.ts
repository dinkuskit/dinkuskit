/**
 * Markdown <-> Portable Text for documentation articles.
 *
 * Covers the subset the articles use and EmDash's editor stores: h2-h6
 * headings, paragraphs, bullet and numbered lists, blockquotes, fenced code,
 * tables with a header row, and inline code, bold, italic and links.
 * Converting an article to Portable Text and back yields the same Markdown.
 */

export interface PortableTextSpan { _type: 'span'; _key: string; text: string; marks?: string[] }
export interface PortableTextMarkDef { _type: string; _key: string; href?: string; [key: string]: unknown }
export interface PortableTextBlock {
  _type: string;
  _key?: string;
  style?: string;
  listItem?: string;
  level?: number;
  markDefs?: PortableTextMarkDef[];
  children?: PortableTextSpan[];
  [key: string]: unknown;
}
interface TableCell { _type: 'tableCell'; _key: string; content: PortableTextSpan[]; markDefs?: PortableTextMarkDef[]; isHeader?: boolean }
interface TableRow { _type: 'tableRow'; _key: string; cells: TableCell[] }

export interface DocHeading { depth: number; slug: string; text: string }

const DECORATORS: Record<string, string> = { '**': 'strong', '_': 'em', '*': 'em', '`': 'code' };

function keyMaker(prefix: string) {
  let next = 0;
  return () => `${prefix}${(next++).toString(36)}`;
}

/** Parse inline Markdown into spans; link targets become markDefs. */
function parseInline(text: string, key: () => string) {
  const spans: PortableTextSpan[] = [];
  const markDefs: PortableTextMarkDef[] = [];
  const push = (value: string, marks: string[]) => {
    if (!value) return;
    const last = spans.at(-1);
    if (last && (last.marks ?? []).join() === marks.join()) last.text += value;
    else spans.push({ _type: 'span', _key: key(), text: value, marks: [...marks] });
  };
  const walk = (source: string, marks: string[]) => {
    let plain = '';
    let i = 0;
    while (i < source.length) {
      const rest = source.slice(i);
      const code = rest.match(/^`([^`]+)`/);
      if (code) {
        push(plain, marks); plain = '';
        push(code[1], [...marks, 'code']);
        i += code[0].length;
        continue;
      }
      const link = rest.match(/^\[((?:[^\]`]|`[^`]*`)+)\]\(([^\s)]+)\)/);
      if (link) {
        push(plain, marks); plain = '';
        const def = { _type: 'link', _key: key(), href: link[2] };
        markDefs.push(def);
        walk(link[1], [...marks, def._key]);
        i += link[0].length;
        continue;
      }
      const emphasis = rest.match(/^(\*\*)(.+?)\*\*/) ?? rest.match(/^(\*)([^*\s](?:[^*]*[^*\s])?)\*/) ?? (/\w/.test(source[i - 1] ?? '') ? null : rest.match(/^(_)([^_\s](?:[^_]*[^_\s])?)_(?!\w)/));
      if (emphasis) {
        push(plain, marks); plain = '';
        walk(emphasis[2], [...marks, DECORATORS[emphasis[1]]]);
        i += emphasis[0].length;
        continue;
      }
      plain += source[i];
      i++;
    }
    push(plain, marks);
  };
  walk(text, []);
  if (!spans.length) spans.push({ _type: 'span', _key: key(), text: '', marks: [] });
  return { spans, markDefs };
}

function textBlock(text: string, key: () => string, extra: Partial<PortableTextBlock> = {}): PortableTextBlock {
  const { spans, markDefs } = parseInline(text, key);
  return { _type: 'block', _key: key(), style: 'normal', ...extra, markDefs, children: spans };
}

function tableCells(line: string) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map(cell => cell.trim().replace(/\\\|/g, '|'));
}

/** Convert an article's Markdown body (no frontmatter) to Portable Text. */
export function markdownToPortableText(markdown: string, keyPrefix = 'k'): PortableTextBlock[] {
  const key = keyMaker(keyPrefix);
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: PortableTextBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const fence = line.match(/^```(\S*)\s*$/);
    if (fence) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) code.push(lines[i++]);
      i++;
      blocks.push({ _type: 'code', _key: key(), code: code.join('\n'), ...(fence[1] ? { language: fence[1] } : {}) });
      continue;
    }
    if (line.startsWith('|') && /^\|?\s*:?-{3,}/.test(lines[i + 1] ?? '')) {
      const rows: TableRow[] = [];
      const header = tableCells(line);
      i += 2;
      const body: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) body.push(tableCells(lines[i++]));
      for (const [index, cells] of [header, ...body].entries()) {
        rows.push({ _type: 'tableRow', _key: key(), cells: cells.map(text => {
          const { spans, markDefs } = parseInline(text, key);
          return { _type: 'tableCell', _key: key(), content: spans, ...(markDefs.length ? { markDefs } : {}), ...(index === 0 ? { isHeader: true } : {}) };
        }) });
      }
      blocks.push({ _type: 'table', _key: key(), hasHeaderRow: true, rows });
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (heading) { blocks.push(textBlock(heading[2], key, { style: `h${heading[1].length}` })); i++; continue; }
    const quote = line.match(/^>\s?(.*)$/);
    if (quote) { blocks.push(textBlock(quote[1], key, { style: 'blockquote' })); i++; continue; }
    const item = line.match(/^(\s*)([-*+]|\d+\.)\s+(.+)$/);
    if (item) {
      blocks.push(textBlock(item[3], key, { listItem: /\d/.test(item[2]) ? 'number' : 'bullet', level: Math.floor(item[1].length / 2) + 1 }));
      i++;
      continue;
    }
    // A paragraph runs until a blank line or another block starts.
    const paragraph = [line.trim()];
    i++;
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|>|\s*([-*+]|\d+\.)\s|\|)/.test(lines[i])) paragraph.push(lines[i++].trim());
    blocks.push(textBlock(paragraph.join(' '), key));
  }
  return blocks;
}

const MARK_SYNTAX: Record<string, string> = { strong: '**', em: '_', code: '`' };

function spansToMarkdown(spans: PortableTextSpan[] = [], markDefs: PortableTextMarkDef[] = []): string {
  const links = new Map(markDefs.filter(def => def._type === 'link').map(def => [def._key, def.href ?? '']));
  let out = '';
  let i = 0;
  // Consecutive spans sharing a link render inside one [text](href).
  while (i < spans.length) {
    const linkKey = (spans[i].marks ?? []).find(mark => links.has(mark));
    if (linkKey) {
      let inner = '';
      while (i < spans.length && (spans[i].marks ?? []).includes(linkKey)) {
        inner += decorate(spans[i].text, (spans[i].marks ?? []).filter(mark => mark !== linkKey));
        i++;
      }
      out += `[${inner}](${links.get(linkKey)})`;
    } else {
      out += decorate(spans[i].text, spans[i].marks ?? []);
      i++;
    }
  }
  return out;
}

function decorate(text: string, marks: string[]): string {
  // Code is innermost, so `**`x`**` round-trips.
  const ordered = [...marks].filter(mark => MARK_SYNTAX[mark]).sort((a, b) => (a === 'code' ? -1 : b === 'code' ? 1 : 0));
  return ordered.reduce((value, mark) => `${MARK_SYNTAX[mark]}${value}${MARK_SYNTAX[mark]}`, text);
}

function cellToMarkdown(cell: TableCell): string {
  return spansToMarkdown(cell.content, cell.markDefs).replace(/\|/g, '\\|');
}

/** Convert Portable Text back to Markdown for export, copy and search. */
export function portableTextToMarkdown(blocks: PortableTextBlock[] = []): string {
  const parts: string[] = [];
  let previousList = false;
  const counters: number[] = [];
  for (const block of blocks) {
    const isList = block._type === 'block' && Boolean(block.listItem);
    if (parts.length) parts.push(isList && previousList ? '\n' : '\n\n');
    if (!isList) counters.length = 0;
    previousList = isList;
    if (block._type === 'code') {
      parts.push(`\`\`\`${typeof block.language === 'string' ? block.language : ''}\n${String(block.code ?? '')}\n\`\`\``);
    } else if (block._type === 'table') {
      const rows = (block.rows as TableRow[] | undefined) ?? [];
      const lines = rows.map(row => `| ${row.cells.map(cellToMarkdown).join(' | ')} |`);
      if (lines.length) lines.splice(1, 0, `| ${rows[0].cells.map(() => '---').join(' | ')} |`);
      parts.push(lines.join('\n'));
    } else if (block._type === 'block') {
      const text = spansToMarkdown(block.children, block.markDefs);
      if (isList) {
        const level = Math.max(1, block.level ?? 1);
        counters.length = level;
        counters[level - 1] = (counters[level - 1] ?? 0) + 1;
        parts.push(`${'  '.repeat(level - 1)}${block.listItem === 'number' ? `${counters[level - 1]}.` : '-'} ${text}`);
      } else if (/^h[1-6]$/.test(block.style ?? '')) {
        parts.push(`${'#'.repeat(Number(block.style!.slice(1)))} ${text}`);
      } else if (block.style === 'blockquote') {
        parts.push(`> ${text}`);
      } else {
        parts.push(text);
      }
    }
  }
  return parts.join('');
}

/** Plain text of one block, for headings and search. */
export function blockText(block: PortableTextBlock): string {
  return (block.children ?? []).map(span => span.text).join('');
}

/** GitHub-style heading anchors, de-duplicated within one article. */
export function headingAnchors(blocks: PortableTextBlock[] = []): Map<string, DocHeading> {
  const seen = new Map<string, number>();
  const result = new Map<string, DocHeading>();
  blocks.forEach((block, index) => {
    const match = block._type === 'block' && !block.listItem ? block.style?.match(/^h([1-6])$/) : null;
    if (!match) return;
    const text = blockText(block);
    const base = text.toLowerCase().trim().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s/g, '-');
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    result.set(block._key ?? String(index), { depth: Number(match[1]), slug: count ? `${base}-${count}` : base, text });
  });
  return result;
}
