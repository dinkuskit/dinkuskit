// Compare ordered synthetic publisher and issue events, preserving repeated-ID
// relationships while symbolizing only known ephemeral IDs, Git SHAs and ports.
const fs = require('node:fs');
const crypto = require('node:crypto');
function normalize(path) {
  const ids = new Map();
  const shas = new Map();
  function token(map, key, kind) {
    if (!map.has(key)) map.set(key, `${kind}${map.size + 1}`);
    return map.get(key);
  }
  function text(value) {
    return value
      .replace(/127\.0\.0\.1:\d+/g, '127.0.0.1:<port>')
      .replace(/\b[0-7][0-9A-HJKMNP-TV-Z]{25}\b/g, match => token(ids, match, 'ulid'))
      .replace(/\b(Update files from )([0-9a-f]{40})\b/g, (_, prefix, sha) => prefix + token(shas, sha.slice(0, 7), 'git'))
      .replace(/\b(at )([0-9a-f]{7})\b/g, (_, prefix, sha) => prefix + token(shas, sha, 'git'))
      .replace(/(\()([0-9a-f]{7})(?=\))/g, (_, prefix, sha) => prefix + token(shas, sha, 'git'));
  }
  function walk(value) {
    if (typeof value === 'string') return text(value);
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v)]));
    return value;
  }
  return fs.readFileSync(path, 'utf8').trim().split('\n').filter(Boolean).map(line => walk(JSON.parse(line)));
}
const left = normalize(process.argv[2]);
const right = normalize(process.argv[3]);
function complete(events) {
  return events.length === 124
    && events.filter(event => event.type === 'sync').length === 45
    && events.filter(event => event.type === 'issue').length === 46
    && events.filter(event => event.type === 'docs-write').length === 33
    && events.filter(event => event.type === 'docs-write' && event.status === 409).length === 1;
}
const diffs = [];
for (let i = 0; i < Math.max(left.length, right.length); i++) {
  if (JSON.stringify(left[i]) !== JSON.stringify(right[i])) diffs.push({ index: i, left: left[i], right: right[i] });
}
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
console.log(JSON.stringify({ leftEvents: left.length, rightEvents: right.length, leftComplete: complete(left), rightComplete: complete(right), leftSha256: digest(left), rightSha256: digest(right), mismatches: diffs.length, firstMismatches: diffs.slice(0, 3) }, null, 2));
if (!complete(left) || !complete(right) || diffs.length) process.exitCode = 1;
