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

/** A code span: an opening backtick run closed by a run of the same length (CommonMark). */
function codeSpan(source: string): { text: string; length: number } | null {
  const open = source.match(/^`+/)?.[0];
  if (!open) return null;
  const run = new RegExp(`(?<!\`)${open}(?!\`)`, 'g');
  run.lastIndex = open.length;
  const close = run.exec(source);
  if (!close) return null;
  let text = source.slice(open.length, close.index);
  if (/^ [\s\S]* $/.test(text) && /[^ ]/.test(text)) text = text.slice(1, -1);
  return { text, length: close.index + open.length };
}

function longestRun(text: string, character: string): number {
  return Math.max(0, ...(text.match(new RegExp(`${character}+`, 'g')) ?? []).map(run => run.length));
}

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
      const code = codeSpan(rest);
      if (code) {
        push(plain, marks); plain = '';
        push(code.text, [...marks, 'code']);
        i += code.length;
        continue;
      }
      const link = rest.match(/^\[((?:\\.|[^\]`\\]|(`+)[^`](?:[\s\S]*?[^`])??\2(?!`)|`)+?)\]\((<(?:\\.|[^\\<>\n])*>|(?:\\.|[^\s()\\])+)\)/);
      if (link) {
        push(plain, marks); plain = '';
        const href = link[3].replace(/^<([\s\S]*)>$/, '$1').replace(/\\([!-/:-@[-`{-~])/g, '$1');
        const def = { _type: 'link', _key: key(), href };
        markDefs.push(def);
        walk(link[1], [...marks, def._key]);
        i += link[0].length;
        continue;
      }
      const htmlCode = rest.match(/^<code>([\s\S]*?)<\/code>/);
      if (htmlCode) {
        push(plain, marks); plain = '';
        push(htmlCode[1].replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code))), [...marks, 'code']);
        i += htmlCode[0].length;
        continue;
      }
      const tag = rest.match(/^<(strong|em)>([\s\S]+?)<\/\1>/);
      if (tag) {
        push(plain, marks); plain = '';
        walk(tag[2], [...marks, tag[1]]);
        i += tag[0].length;
        continue;
      }
      const emphasis = rest.match(/^(\*\*)(.+?)\*\*/)
        ?? rest.match(/^(\*)((?:\\.|[^*\s\\])(?:(?:\\.|[^*\\])*(?:\\.|[^*\s\\]))?)\*/)
        ?? (/\w/.test(source[i - 1] ?? '') ? null : rest.match(/^(_)((?:\\.|[^_\s\\])(?:(?:\\.|[^_\\])*(?:\\.|[^_\s\\]))?)_(?!\w)/));
      if (emphasis) {
        push(plain, marks); plain = '';
        walk(emphasis[2], [...marks, DECORATORS[emphasis[1]]]);
        i += emphasis[0].length;
        continue;
      }
      // A backslash keeps the next punctuation character literal.
      if (source[i] === '\\' && /[!-/:-@[-`{-~]/.test(source[i + 1] ?? '')) {
        plain += source[i + 1];
        i += 2;
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
  // Indents of the open list items; a deeper indent nests, an equal or shallower one closes items.
  const listIndents: number[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const item = line.match(/^(\s*)([-*+]|\d+\.)\s+(.+)$/);
    if (!item) listIndents.length = 0;
    const fence = line.match(/^(`{3,})([^`\s]*)\s*$/);
    if (fence) {
      // The fence closes on a backtick run at least as long as the one that opened it.
      const close = new RegExp(`^${fence[1]}\`*\\s*$`);
      const code: string[] = [];
      i++;
      while (i < lines.length && !close.test(lines[i])) code.push(lines[i++]);
      i++;
      blocks.push({ _type: 'code', _key: key(), code: code.join('\n'), ...(fence[2] ? { language: fence[2] } : {}) });
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
    const heading = line.match(/^(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/);
    if (heading) { blocks.push(textBlock(heading[2] ?? '', key, { style: `h${heading[1].length}` })); i++; continue; }
    const quote = line.match(/^>\s?(.*)$/);
    if (quote) { blocks.push(textBlock(quote[1], key, { style: 'blockquote' })); i++; continue; }
    if (item) {
      while (listIndents.length && listIndents.at(-1)! >= item[1].length) listIndents.pop();
      listIndents.push(item[1].length);
      blocks.push(textBlock(item[3], key, { listItem: /\d/.test(item[2]) ? 'number' : 'bullet', level: listIndents.length }));
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

const MARK_SYNTAX: Record<string, string> = { strong: '**', em: '_' };

/** Delimit code with a backtick run longer than any inside it, padded where the text touches a backtick or space. */
function codeToMarkdown(text: string): string {
  const ticks = '`'.repeat(longestRun(text, '`') + 1);
  const pad = /^[` ]|[` ]$/.test(text) && /[^ ]/.test(text) ? ' ' : '';
  return `${ticks}${pad}${text}${pad}${ticks}`;
}

function spansToMarkdown(source: PortableTextSpan[] = [], markDefs: PortableTextMarkDef[] = []): string {
  // Adjacent spans with the same marks render as one, so their delimiters never meet.
  const spans: PortableTextSpan[] = [];
  for (const span of source) {
    const last = spans.at(-1);
    if (last && (last.marks ?? []).join() === (span.marks ?? []).join()) spans[spans.length - 1] = { ...last, text: last.text + span.text };
    else spans.push(span);
  }
  const links = new Map(markDefs.filter(def => def._type === 'link').map(def => [def._key, def.href ?? '']));
  const linkOf = (span?: PortableTextSpan) => (span?.marks ?? []).find(mark => links.has(mark));
  // The first character the span at j will render as, so delimiters can be checked against it.
  const startOf = (j: number, linkKey?: string): string => {
    const span = spans[j];
    if (!span) return linkKey ? ']' : '';
    const nextLink = linkOf(span);
    if (nextLink !== linkKey) return linkKey ? ']' : '[';
    const marks = span.marks ?? [];
    if (marks.includes('code')) return marks.some(mark => MARK_SYNTAX[mark]) ? '*' : '`';
    if (marks.some(mark => MARK_SYNTAX[mark]) && /^\S/.test(span.text)) return '*';
    return escapeInline(span.text)[0] ?? startOf(j + 1, linkKey);
  };
  let out = '';
  let i = 0;
  // Consecutive spans sharing a link render inside one [text](href).
  while (i < spans.length) {
    const linkKey = linkOf(spans[i]);
    if (linkKey) {
      let inner = '';
      while (i < spans.length && (spans[i].marks ?? []).includes(linkKey)) {
        const marks = (spans[i].marks ?? []).filter(mark => mark !== linkKey);
        inner += decorate(spans[i].text, marks, (inner || '[').at(-1)!, startOf(i + 1, linkKey), true);
        i++;
      }
      // A `!` right before the link would make it an image.
      out = out.replace(/!$/, '\\!') + `[${inner}](${linkDestination(links.get(linkKey)!)})`;
    } else {
      out += decorate(spans[i].text, spans[i].marks ?? [], out.at(-1) ?? '', startOf(i + 1));
      i++;
    }
  }
  return out;
}

/** Backslash-escape characters that would otherwise read as inline Markdown, HTML or entities. */
function escapeInline(text: string): string {
  return text.replace(/[\\`*_[\]<>&~]/g, '\\$&');
}

/**
 * Keep text that would start a block (heading, list item, rule, setext underline,
 * fence, table or indented code) literal at the start of each line.
 */
function escapeBlockStart(text: string): string {
  return text.replace(/^[ \t]+|[ \t]+$/gm, '').replace(/^([#>+=~|-])/gm, '\\$1').replace(/^(\d{1,9})([.)])(?=\s|$)/gm, '$1\\$2');
}

/** A link destination with its parentheses, angle brackets and backslashes escaped and its spaces percent-encoded. */
function linkDestination(href: string): string {
  return href.replace(/[\\()<>]/g, '\\$&').replace(/\s/g, character => encodeURIComponent(character));
}

// Text between HTML tags is still read as Markdown, so every ASCII punctuation character becomes a character reference.
const escapeHtml = (text: string) => text.replace(/[!-/:-@[-`{-~]/g, character => `&#${character.charCodeAt(0)};`);

const isSpace = (character: string) => !character || /\s/.test(character);
const isPunctuation = (character: string) => /[\p{P}\p{S}]/u.test(character);

/** Whether a delimiter run between `before` and `after` can open (or, swapped, close) emphasis, per CommonMark flanking rules. */
function canOpen(syntax: string, before: string, after: string): boolean {
  const left = !isSpace(after) && (!isPunctuation(after) || isSpace(before) || isPunctuation(before));
  const right = !isSpace(before) && (!isPunctuation(before) || isSpace(after) || isPunctuation(after));
  return syntax.startsWith('_') ? left && (!right || isPunctuation(before)) : left;
}
function canClose(syntax: string, before: string, after: string): boolean {
  const left = !isSpace(after) && (!isPunctuation(after) || isSpace(before) || isPunctuation(before));
  const right = !isSpace(before) && (!isPunctuation(before) || isSpace(after) || isPunctuation(after));
  return syntax.startsWith('_') ? right && (!left || isPunctuation(after)) : right;
}

const HTML_TAG: Record<string, string> = { strong: 'strong', em: 'em' };

/**
 * One span with its bold, italic and code marks. `before` and `after` are the
 * rendered characters around it. Boundary spaces move outside the delimiters,
 * italic uses `_` unless that cannot open and close here, and a span no
 * Markdown delimiter can wrap uses <strong>/<em>.
 */
function decorate(raw: string, marks: string[], before: string, after: string, inLink = false): string {
  // Bold sits inside italic whatever order the marks were applied in, so the export is stable.
  const wrappers = ['strong', 'em'].filter(mark => marks.includes(mark));
  // Code is innermost, so `**`x`**` round-trips.
  const isCode = marks.includes('code');
  const [, lead, core, trail] = isCode ? ['', '', raw, ''] : raw.match(/^(\s*)([\s\S]*?)(\s*)$/)!;
  // Renderers disagree on code holding backticks, backslashes or brackets in link text, or delimiters in bold or italic, so that code is HTML.
  const htmlCode = isCode && ((inLink && /[`\\[\]]/.test(raw)) || (wrappers.length > 0 && /[`*_]/.test(raw)));
  const body = !isCode ? escapeInline(core) : htmlCode ? `<code>${escapeHtml(raw)}</code>` : codeToMarkdown(raw);
  if (!core || !wrappers.length) return isCode ? body : escapeInline(raw);
  const outside = [lead.at(-1) || before, trail[0] || after];
  // Delimiters touching another span's delimiters, or code ending in a backslash, read differently across renderers.
  const crowded = /[*_`>)\]]/.test(outside[0]) || /[*_`<[]/.test(outside[1]) || (isCode && /\\$/.test(raw)) || (!isCode && /^[*_~]|[*_~]$/.test(core));
  const wrap = (emSyntax: string) => wrappers.reduce((value, mark) => {
    const syntax = mark === 'em' ? emSyntax : MARK_SYNTAX[mark];
    return `${syntax}${value}${syntax}`;
  }, body);
  for (const emSyntax of crowded ? [] : ['_', '*']) {
    const outer = wrappers.at(-1) === 'em' ? emSyntax : MARK_SYNTAX[wrappers.at(-1)!];
    const first = wrappers.length > 1 ? (wrappers.at(-2) === 'em' ? emSyntax : '*') : body[0];
    const last = wrappers.length > 1 ? first : body.at(-1)!;
    // A delimiter right after the same character would join the previous span's run.
    if (outside[0] !== outer[0] && canOpen(outer, outside[0], first) && canClose(outer, last, outside[1])) return lead + wrap(emSyntax) + trail;
  }
  return lead + wrappers.reduce((value, mark) => `<${HTML_TAG[mark]}>${value}</${HTML_TAG[mark]}>`, body) + trail;
}

function cellToMarkdown(cell: TableCell): string {
  return spansToMarkdown(cell.content, cell.markDefs).replace(/\|/g, '\\|');
}

/** Convert Portable Text back to Markdown for export, copy and search. */
export function portableTextToMarkdown(blocks: PortableTextBlock[] = []): string {
  const parts: string[] = [];
  let previousList = false;
  const counters: number[] = [];
  // Content column of the latest item at each level; a nested item starts there.
  const columns: number[] = [];
  for (const block of blocks) {
    const isList = block._type === 'block' && Boolean(block.listItem);
    if (parts.length) parts.push(isList && previousList ? '\n' : '\n\n');
    if (!isList) { counters.length = 0; columns.length = 0; }
    previousList = isList;
    if (block._type === 'code') {
      const code = String(block.code ?? '');
      const fence = '`'.repeat(Math.max(3, longestRun(code, '`') + 1));
      parts.push(`${fence}${typeof block.language === 'string' ? block.language : ''}\n${code}\n${fence}`);
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
        columns.length = level - 1;
        const indent = columns[level - 2] ?? 2 * (level - 1);
        const marker = block.listItem === 'number' ? `${counters[level - 1]}.` : '-';
        columns[level - 1] = indent + marker.length + 1;
        parts.push(`${' '.repeat(indent)}${marker} ${escapeBlockStart(text)}`);
      } else if (/^h[1-6]$/.test(block.style ?? '')) {
        // A trailing run of # would be read as the heading's closing sequence.
        parts.push(`${'#'.repeat(Number(block.style!.slice(1)))} ${text.trim().replace(/#+$/, '\\$&')}`);
      } else if (block.style === 'blockquote') {
        parts.push(`> ${escapeBlockStart(text)}`);
      } else {
        parts.push(escapeBlockStart(text));
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
