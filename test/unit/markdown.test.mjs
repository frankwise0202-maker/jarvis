// Unit tests for src/lib/markdown.js (SPEC §9.1), run in real Chromium (see platform.harness.test.mjs).
// DOM approach: the module is bundled with esbuild and executed in headless Chromium via
// Playwright; assertions inspect the rendered DOM through page.evaluate.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './platform.harness.test.mjs';

let h;
let page;

before(async () => {
  h = await createHarness({ markdown: 'src/lib/markdown.js' });
  page = await h.newPage();
  await page.evaluate(() => {
    const { renderMarkdown } = window.__mods.markdown;
    window.__html = (md, streaming) => {
      const div = document.createElement('div');
      div.appendChild(renderMarkdown(md, { streaming }));
      return div.innerHTML;
    };
  });
});

after(async () => {
  if (h) await h.close();
});

const html = (md, streaming = false) => page.evaluate(([m, s]) => window.__html(m, s), [md, streaming]);
const plain = (md, opts) => page.evaluate(([m, o]) => window.__mods.markdown.markdownToPlainText(m, o), [md, opts]);
const A = (href, text, extra = '') => `<a class="md-link${extra}" href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;
const AUTO = (href, text) => A(href, text, ' md-autolink');

// ---- block structure ------------------------------------------------------------------

test('headings: h1/h2 render at h3/h4 level with md-h classes; closing hashes and non-headings', async () => {
  assert.equal(
    await html('# One\n## Two ##\n### Three\n#### Four\n##### Five\n###### Six'),
    '<h3 class="md-h md-h1">One</h3><h4 class="md-h md-h2">Two</h4><h5 class="md-h md-h3">Three</h5>' +
      '<h6 class="md-h md-h4">Four</h6><h6 class="md-h md-h5">Five</h6><h6 class="md-h md-h6">Six</h6>',
  );
  assert.equal(await html('#hashtag\n####### seven'), '<p class="md-p">#hashtag<br>####### seven</p>');
  assert.equal(await html('## C# **rocks**'), '<h4 class="md-h md-h2">C# <strong class="md-strong">rocks</strong></h4>');
});

test('paragraphs, soft and hard line breaks, thematic breaks', async () => {
  assert.equal(await html('one\ntwo  \nthree\\\nfour\n\nnext'), '<p class="md-p">one<br>two<br>three<br>four</p><p class="md-p">next</p>');
  assert.equal(await html('a\n\n---\n***\n_ _ _\nb'), '<p class="md-p">a</p><hr class="md-hr"><hr class="md-hr"><hr class="md-hr"><p class="md-p">b</p>');
});

test('inline formatting: bold, italic, strike, code, nesting, intraword rules, escapes', async () => {
  assert.equal(
    await html('**b** *i* _i_ __b__ ~~s~~ `c` ***bi*** **b *i* b**'),
    '<p class="md-p"><strong class="md-strong">b</strong> <em class="md-em">i</em> <em class="md-em">i</em> ' +
      '<strong class="md-strong">b</strong> <del class="md-del">s</del> <code class="md-code">c</code> ' +
      '<em class="md-em"><strong class="md-strong">bi</strong></em> <strong class="md-strong">b <em class="md-em">i</em> b</strong></p>',
  );
  assert.equal(await html('snake_case_name foo__bar__ 5 * 3 ~approx~'), '<p class="md-p">snake_case_name foo__bar__ 5 * 3 ~approx~</p>');
  assert.equal(await html('\\*not\\* \\_not\\_ \\`not\\` \\# \\[x\\](y)'), '<p class="md-p">*not* _not_ `not` # [x](y)</p>');
  assert.equal(await html('``code with ` tick`` and `<b>`'), '<p class="md-p"><code class="md-code">code with ` tick</code> and <code class="md-code">&lt;b&gt;</code></p>');
});

test('fenced and indented code blocks keep their text exactly and get a Copy button', async () => {
  const out = await page.evaluate(() => {
    const div = document.createElement('div');
    div.appendChild(window.__mods.markdown.renderMarkdown('```js\nif (a < b && c) {\n  <b>x</b>\n}\n```\n\n~~~\n```inner```\n~~~\n\n    indented\n      more'));
    return [...div.querySelectorAll('.md-codeblock')].map((b) => ({
      lang: b.getAttribute('data-lang'),
      label: b.querySelector('.md-code-lang').textContent,
      code: b.querySelector('pre.md-pre > code.md-code-block').textContent,
      copy: b.querySelector('button.md-copy').getAttribute('data-code'),
      type: b.querySelector('button.md-copy').getAttribute('type'),
      text: b.querySelector('button.md-copy').textContent,
      elementsInCode: b.querySelector('code').children.length,
    }));
  });
  assert.deepEqual(out, [
    { lang: 'js', label: 'js', code: 'if (a < b && c) {\n  <b>x</b>\n}', copy: 'if (a < b && c) {\n  <b>x</b>\n}', type: 'button', text: 'Copy', elementsInCode: 0 },
    { lang: null, label: 'code', code: '```inner```', copy: '```inner```', type: 'button', text: 'Copy', elementsInCode: 0 },
    { lang: null, label: 'code', code: 'indented\n  more', copy: 'indented\n  more', type: 'button', text: 'Copy', elementsInCode: 0 },
  ]);
  // Unsafe-looking info strings never reach attributes.
  assert.equal(await page.evaluate(() => window.__html('```" onclick="x\ncode\n```').includes('onclick')), false);
});

test('Copy button copies the code, shows "Copied", and does not bubble to delegated handlers', async () => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: h.url });
  const result = await page.evaluate(async () => {
    const host = document.createElement('div');
    let bubbled = 0;
    host.addEventListener('click', () => bubbled++);
    document.body.appendChild(host);
    host.appendChild(window.__mods.markdown.renderMarkdown('```sh\nnpm install && npm start\n```'));
    const btn = host.querySelector('button.md-copy');
    btn.click();
    await new Promise((r) => setTimeout(r, 100));
    const state = { text: btn.textContent, state: btn.getAttribute('data-state'), clip: await navigator.clipboard.readText(), bubbled };
    host.remove();
    return state;
  });
  assert.deepEqual(result, { text: 'Copied', state: 'copied', clip: 'npm install && npm start', bubbled: 0 });
});

test('lists: bullets, ordered with start, nesting (incl. 2-space under "1."), tight and loose, tasks', async () => {
  assert.equal(
    await html('- a\n- b\n  - c\n\n3. x\n4. y'),
    '<ul class="md-list md-ul md-tight"><li class="md-li">a</li><li class="md-li">b<ul class="md-list md-ul md-tight"><li class="md-li">c</li></ul></li></ul>' +
      '<ol class="md-list md-ol md-tight" start="3"><li class="md-li">x</li><li class="md-li">y</li></ol>',
  );
  assert.equal(
    await html('1. Step\n  - detail\n2. Next'),
    '<ol class="md-list md-ol md-tight"><li class="md-li">Step<ul class="md-list md-ul md-tight"><li class="md-li">detail</li></ul></li><li class="md-li">Next</li></ol>',
  );
  assert.equal(
    await html('- one\n\n- two\n  continued'),
    '<ul class="md-list md-ul md-loose"><li class="md-li"><p class="md-p">one</p></li><li class="md-li"><p class="md-p">two<br>continued</p></li></ul>',
  );
  assert.equal(
    await html('- [x] done\n- [ ] todo\n- [link](https://a.example)'),
    '<ul class="md-list md-ul md-tight md-task-list"><li class="md-li md-task md-task-done"><input class="md-task-box" type="checkbox" disabled="" checked=""> done</li>' +
      '<li class="md-li md-task"><input class="md-task-box" type="checkbox" disabled=""> todo</li><li class="md-li">' + A('https://a.example/', 'link') + '</li></ul>',
  );
  const boxes = await page.evaluate(() => {
    const div = document.createElement('div');
    div.appendChild(window.__mods.markdown.renderMarkdown('- [x] a\n- [ ] b'));
    return [...div.querySelectorAll('input')].map((i) => [i.type, i.disabled, i.checked]);
  });
  assert.deepEqual(boxes, [['checkbox', true, true], ['checkbox', true, false]]);
  // "1999." mid-paragraph is not a list; a list needs a marker at line start.
  assert.equal(await html('The year\n1999. Then'), '<p class="md-p">The year<br>1999. Then</p>');
});

test('blockquotes: nesting, lazy continuation, blocks inside', async () => {
  assert.equal(
    await html('> quote\nlazy line\n> > nested\n\n> - item\n>\n> para'),
    '<blockquote class="md-quote"><p class="md-p">quote<br>lazy line</p><blockquote class="md-quote"><p class="md-p">nested</p></blockquote></blockquote>' +
      '<blockquote class="md-quote"><ul class="md-list md-ul md-tight"><li class="md-li">item</li></ul><p class="md-p">para</p></blockquote>',
  );
});

test('GFM tables: alignment, escaped pipes, inline formatting, ragged rows, wrapper', async () => {
  assert.equal(
    await html('Intro\n| Name | Qty | Note |\n|:-----|:---:|-----:|\n| **A** | 1 | x \\| y |\n| B |'),
    '<p class="md-p">Intro</p><div class="md-table-wrap" tabindex="0"><table class="md-table"><thead><tr>' +
      '<th class="md-align-left" scope="col" style="text-align: left;">Name</th><th class="md-align-center" scope="col" style="text-align: center;">Qty</th>' +
      '<th class="md-align-right" scope="col" style="text-align: right;">Note</th></tr></thead><tbody>' +
      '<tr><td class="md-align-left" style="text-align: left;"><strong class="md-strong">A</strong></td><td class="md-align-center" style="text-align: center;">1</td><td class="md-align-right" style="text-align: right;">x | y</td></tr>' +
      '<tr><td class="md-align-left" style="text-align: left;">B</td><td class="md-align-center" style="text-align: center;"></td><td class="md-align-right" style="text-align: right;"></td></tr>' +
      '</tbody></table></div>',
  );
  // Header/delimiter cell counts must match; otherwise it is a paragraph.
  assert.equal(await html('| a | b |\n|---|'), '<p class="md-p">| a | b |<br>|---|</p>');
});

// ---- links ------------------------------------------------------------------------------

test('links, titles, reference links and images-as-links', async () => {
  assert.equal(
    await html('[Docs](https://example.com/docs "The docs") [ref][r] [r] ![Chart](https://img.example/c.png)\n\n[r]: https://ref.example/x'),
    '<p class="md-p"><a class="md-link" href="https://example.com/docs" target="_blank" rel="noopener noreferrer" title="The docs">Docs</a> ' +
      A('https://ref.example/x', 'ref') + ' ' + A('https://ref.example/x', 'r') + ' ' +
      '<a class="md-link md-image-link" href="https://img.example/c.png" target="_blank" rel="noopener noreferrer" title="Image: Chart">Image: Chart</a></p>',
  );
  assert.equal(await html('[mail](mailto:me@example.com) <me@example.com>'), '<p class="md-p">' + A('mailto:me@example.com', 'mail') + ' ' + AUTO('mailto:me@example.com', 'me@example.com') + '</p>');
  assert.equal(await html('[a [b] c](https://x.example) [[n]](https://y.example)'), '<p class="md-p">' + A('https://x.example/', 'a [b] c') + ' ' + A('https://y.example/', '[n]') + '</p>');
  assert.equal(await html('[**bold** text](https://x.example)'), '<p class="md-p">' + A('https://x.example/', '<strong class="md-strong">bold</strong> text') + '</p>');
  assert.equal(await html('[https://x.example](https://x.example)'), '<p class="md-p">' + A('https://x.example/', 'https://x.example') + '</p>');
  // Relative and protocol-relative links have no base: plain text.
  assert.equal(await html('[rel](/path) [proto](//evil.example) [frag](#x)'), '<p class="md-p">rel proto frag</p>');
});

test('autolinks: angle brackets, bare URLs, www., trailing punctuation and parentheses', async () => {
  assert.equal(
    await html('<https://a.example/x?q=1&b=2> see https://b.example/path. Or (https://c.example/a_(b)) and www.d.example, https://e.example/x?! and **https://f.example**'),
    '<p class="md-p">' + AUTO('https://a.example/x?q=1&amp;b=2', 'https://a.example/x?q=1&amp;b=2') +
      ' see ' + AUTO('https://b.example/path', 'https://b.example/path') + '. Or (' + AUTO('https://c.example/a_(b)', 'https://c.example/a_(b)') + ') and ' +
      AUTO('https://www.d.example/', 'www.d.example') + ', ' + AUTO('https://e.example/x', 'https://e.example/x') + '?! and <strong class="md-strong">' +
      AUTO('https://f.example/', 'https://f.example') + '</strong></p>',
  );
  // Underscores inside a bare URL are not emphasis; URLs inside code stay code.
  assert.equal(await html('https://x.example/__init__.py `https://y.example`'), '<p class="md-p">' + AUTO('https://x.example/__init__.py', 'https://x.example/__init__.py') + ' <code class="md-code">https://y.example</code></p>');
  // Not after a word character; other schemes are not linked.
  assert.equal(await html('xhttps://no.example ftp://no.example <ftp://no.example>'), '<p class="md-p">xhttps://no.example ftp://no.example &lt;ftp://no.example&gt;</p>');
});

test('entities are decoded as text; unknown ones stay literal', async () => {
  assert.equal(await html('AT&amp;T &copy; &#169; &#x1F600; &mdash; &bogus; &#0;'), '<p class="md-p">AT&amp;T © © 😀 — &amp;bogus; �</p>');
});

// ---- security ---------------------------------------------------------------------------

const XSS_VECTORS = [
  '<script>window.__xss = 1</script>',
  '<img src=x onerror="window.__xss = 1">',
  '<svg onload="window.__xss = 1"><circle r=1></circle></svg>',
  '<iframe src="javascript:window.__xss = 1"></iframe>',
  '<a href="javascript:window.__xss = 1">raw anchor</a>',
  '<div style="background:url(javascript:alert(1))" onclick="window.__xss=1">x</div>',
  '<style>body{display:none}</style><object data="x"></object><embed src="x">',
  '<math><mtext></form><form><mglyph><style></math><img src onerror=alert(1)>',
  '[js](javascript:window.__xss=1)',
  '[mixed case](JaVaScRiPt:window.__xss=1)',
  '[leading space](  javascript:window.__xss=1)',
  '[angle](<javascript:window.__xss=1>)',
  '[entity](jav&#x61;script:window.__xss=1)',
  '[decimal entity](&#106;avascript:window.__xss=1)',
  '[colon entity](javascript&colon;window.__xss=1)',
  '[tab](java\tscript:window.__xss=1)',
  '[newline](java\nscript:window.__xss=1)',
  '[ctrl](\u0001javascript:window.__xss=1)',
  '[nul](java\u0000script:window.__xss=1)',
  '[zero width](java\u200Bscript:window.__xss=1)',
  '[pct](java%0ascript:window.__xss=1)',
  '[escaped](javascript\\:window.__xss=1)',
  '[data](data:text/html;base64,PHNjcmlwdD53aW5kb3cuX194c3M9MTwvc2NyaXB0Pg==)',
  '[DATA](DATA:text/html,<script>window.__xss=1</script>)',
  '[vb](vbscript:msgbox(1))',
  '[VB](VBScript:msgbox(1))',
  '[file](file:///etc/passwd)',
  '<javascript:window.__xss=1>',
  '<JAVASCRIPT:window.__xss=1>',
  '<data:text/html,<script>window.__xss=1</script>>',
  '![img js](javascript:window.__xss=1)',
  '![remote](https://evil.example/pixel.png)',
  '![svg data](data:image/svg+xml,<svg onload=alert(1)>)',
  '[nested [x](javascript:window.__xss=1)](https://ok.example)',
  '[[x](javascript:window.__xss=1)](javascript:window.__xss=1)',
  '[title break](https://ok.example "x\\" onmouseover=\\"window.__xss=1")',
  '[quote break](https://ok.example/"><script>window.__xss=1</script>)',
  '[ref xss][r]\n\n[r]: javascript:window.__xss=1',
  '&lt;script&gt;window.__xss=1&lt;/script&gt; &#60;img src=x onerror=window.__xss=1&#62;',
  '```html\n<script>window.__xss = 1</script>\n```',
  '`<img src=x onerror=window.__xss=1>`',
  '| <img src=x onerror=window.__xss=1> | [x](javascript:alert(1)) |\n|---|---|\n| <script>x</script> | ok |',
  '- [ ] <img src=x onerror=window.__xss=1>\n> <script>window.__xss=1</script>',
  '[unclosed](javascript:window.__xss=1',
];

test('XSS: raw HTML is literal text, unsafe URLs are never links, nothing executes or loads', async () => {
  const requests = [];
  const onRequest = (r) => requests.push(r.url());
  page.on('request', onRequest);
  const report = await page.evaluate(async (vectors) => {
    const { renderMarkdown } = window.__mods.markdown;
    const host = document.createElement('div');
    document.body.appendChild(host);
    const problems = [];
    for (const streaming of [false, true]) {
      for (const md of vectors) {
        const box = document.createElement('section');
        box.appendChild(renderMarkdown(md, { streaming }));
        host.appendChild(box); // live in the document: scripts would run, images would load
        for (const el of box.querySelectorAll('*')) {
          const tag = el.tagName.toLowerCase();
          if (!['p', 'a', 'strong', 'em', 'del', 'code', 'pre', 'br', 'hr', 'ul', 'ol', 'li', 'input', 'blockquote', 'div', 'span', 'button', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'h3', 'h4', 'h5', 'h6'].includes(tag)) problems.push(`${md}: <${tag}>`);
          for (const attr of el.attributes) {
            if (/^on/i.test(attr.name)) problems.push(`${md}: ${attr.name}`);
            if (!['class', 'href', 'target', 'rel', 'title', 'type', 'disabled', 'checked', 'data-code', 'data-lang', 'data-open', 'aria-label', 'tabindex', 'scope', 'style', 'start'].includes(attr.name)) problems.push(`${md}: attr ${attr.name}`);
            if (/javascript|vbscript|data:/i.test(attr.value) && attr.name !== 'data-code' && attr.name !== 'title') problems.push(`${md}: ${attr.name}=${attr.value}`);
          }
          if (tag === 'a') {
            const href = el.getAttribute('href') || '';
            if (!/^(https?:\/\/|mailto:)/.test(href)) problems.push(`${md}: href ${href}`);
            if (el.getAttribute('target') !== '_blank' || el.getAttribute('rel') !== 'noopener noreferrer') problems.push(`${md}: link attrs`);
          }
        }
      }
    }
    // Click every link-ish element too: nothing may run.
    for (const a of host.querySelectorAll('a')) a.addEventListener('click', (e) => e.preventDefault());
    for (const a of host.querySelectorAll('a')) a.click();
    await new Promise((r) => setTimeout(r, 300));
    const text = host.textContent;
    host.remove();
    return { problems, xss: window.__xss === undefined ? null : window.__xss, text };
  }, XSS_VECTORS);
  page.off('request', onRequest);
  assert.deepEqual(report.problems, []);
  assert.equal(report.xss, null);
  assert.deepEqual(requests.filter((u) => !u.startsWith(h.url)), []);
  // Raw HTML stayed visible as text (it is shown, not swallowed).
  assert.ok(report.text.includes('<script>window.__xss = 1</script>'));
  assert.ok(report.text.includes('<img src=x onerror="window.__xss = 1">'));
  assert.deepEqual(await page.cspViolations(), []);
});

test('XSS: specific vectors render as the expected safe text', async () => {
  assert.equal(await html('[x](javascript:alert(1)) [y](JaVaScRiPt:alert(1)) [d](data:text/html,hi) [v](vbscript:x)'), '<p class="md-p">x y d v</p>');
  assert.equal(await html('<javascript:alert(1)>'), '<p class="md-p">&lt;javascript:alert(1)&gt;</p>');
  assert.equal(await html('<b onclick="alert(1)">hi</b>'), '<p class="md-p">&lt;b onclick="alert(1)"&gt;hi&lt;/b&gt;</p>');
  assert.equal(await html('![x](https://evil.example/a.png)').then((s) => s.includes('<img')), false);
  assert.equal(
    await html('[t](https://ok.example "a\\" onmouseover=\\"alert(1)")'),
    '<p class="md-p"><a class="md-link" href="https://ok.example/" target="_blank" rel="noopener noreferrer" title="a&quot; onmouseover=&quot;alert(1)">t</a></p>',
  );
  // Bidi override characters (link-text spoofing) are removed.
  assert.equal(await html('[\u202Egnp.exe](https://ok.example)'), '<p class="md-p">' + A('https://ok.example/', 'gnp.exe') + '</p>');
});

// ---- streaming --------------------------------------------------------------------------

test('streaming: unclosed fence, emphasis, code span, link and table render best-effort', async () => {
  assert.equal(
    await html('```py\nprint(1)', true),
    '<div class="md-codeblock" data-lang="py" data-open="true"><div class="md-code-head"><span class="md-code-lang">py</span>' +
      '<button class="md-copy" type="button" aria-label="Copy py code" data-code="print(1)">Copy</button></div><pre class="md-pre" tabindex="0"><code class="md-code-block">print(1)</code></pre></div>',
  );
  assert.equal(await html('Hello **wor', true), '<p class="md-p">Hello <strong class="md-strong">wor</strong></p>');
  assert.equal(await html('Hello **wor', false), '<p class="md-p">Hello **wor</p>');
  assert.equal(await html('An *italic and **bold', true), '<p class="md-p">An <em class="md-em">italic and <strong class="md-strong">bold</strong></em></p>');
  assert.equal(await html('Run `npm st', true), '<p class="md-p">Run <code class="md-code">npm st</code></p>');
  assert.equal(await html('See [the docs](https://exa', true), '<p class="md-p">See <span class="md-link-pending">the docs</span></p>');
  assert.equal(await html('Next **', true), '<p class="md-p">Next </p>');
  assert.equal(await html('Code:\n``', true), '<p class="md-p">Code:</p>');
  assert.equal(
    await html('| Model | Pri', true),
    '<div class="md-table-wrap" tabindex="0"><table class="md-table"><thead><tr><th scope="col">Model</th><th scope="col">Pri</th></tr></thead></table></div>',
  );
  assert.equal(
    await html('| A | B |\n|:--|-', true),
    '<div class="md-table-wrap" tabindex="0"><table class="md-table"><thead><tr><th class="md-align-left" scope="col" style="text-align: left;">A</th><th scope="col">B</th></tr></thead></table></div>',
  );
  // Only the open tail is affected: complete earlier blocks render normally.
  assert.equal(await html('Done *a\n\nTail *b', true), '<p class="md-p">Done *a</p><p class="md-p">Tail <em class="md-em">b</em></p>');
  // A finished paragraph (followed by a blank line) is not "open" any more.
  assert.equal(await html('Closed **x\n\n', true), '<p class="md-p">Closed **x</p>');
});

test('streaming: every prefix of a rich answer renders without throwing', async () => {
  const md = '# Title\n\nIntro with **bold**, `code` and [a link](https://example.com "t").\n\n| A | B |\n|:-|-:|\n| 1 | 2 |\n\n```js\nconst x = 1;\n```\n\n- [x] one\n  - two\n> quote';
  const result = await page.evaluate((src) => {
    const { renderMarkdown } = window.__mods.markdown;
    let count = 0;
    for (let i = 0; i <= src.length; i++) {
      const frag = renderMarkdown(src.slice(0, i), { streaming: true });
      count += frag.childNodes.length >= 0 ? 1 : 0;
    }
    return count;
  }, md);
  assert.equal(result, md.length + 1);
  assert.deepEqual(page.problems, []);
});

// ---- plain text -------------------------------------------------------------------------

test('markdownToPlainText: syntax stripped, link text kept, URLs and fences dropped', async () => {
  assert.equal(
    await plain('# Title\n\nSome **bold** and [a link](https://example.com) and `code` &amp; ![alt](https://x/y.png).\n\n- one\n- two\n  1. nested\n\n```js\nconst x = 1;\n```\n\n> quoted\n\n| A | B |\n|---|---|\n| 1 | 2 |'),
    'Title\n\nSome bold and a link and code & alt.\n\n- one\n- two\n  1. nested\n\nconst x = 1;\n\nquoted\n\nA | B\n1 | 2',
  );
  assert.equal(await plain('- [x] done\n- [ ] todo'), '- ☑ done\n- ☐ todo');
  assert.equal(await plain(''), '');
  assert.equal(await plain(null), '');
});

test('markdownToPlainText speech mode and first paragraph', async () => {
  assert.equal(
    await plain('## Plan\n\nRead https://www.example.com/docs now → done 🚀\n\n```sh\nrm -rf /\n```\n\n- first item\n- second', { speech: true }),
    'Plan.\nRead example.com now to done.\nfirst item.\nsecond.',
  );
  assert.equal(await plain('# Heading\n\nThe **summary** paragraph.\n\nMore detail.', { firstParagraph: true }), 'The summary paragraph.');
  assert.equal(await plain('- only a list', { firstParagraph: true }), '- only a list');
});

// ---- robustness and performance ---------------------------------------------------------

test('robustness: odd inputs and pathological nesting never throw', async () => {
  const out = await page.evaluate(() => {
    const { renderMarkdown, markdownToPlainText } = window.__mods.markdown;
    const inputs = [undefined, null, 42, {}, '', '\u0000', '>'.repeat(5000) + ' deep', '- '.repeat(3000) + 'x', '*'.repeat(20000), '['.repeat(10000) + ']'.repeat(10000), '`'.repeat(5000) + 'x', '_a '.repeat(5000), '\t- a\n\t\t- b', '\r\n# CRLF\r\ntext\r\n'];
    const t = performance.now();
    const sizes = inputs.map((m) => renderMarkdown(m).childNodes.length + markdownToPlainText(m).length * 0);
    return { sizes, ms: performance.now() - t, crlf: (() => { const d = document.createElement('div'); d.appendChild(renderMarkdown('\r\n# CRLF\r\ntext\r\n')); return d.innerHTML; })() };
  });
  assert.equal(out.sizes.length, 14);
  assert.ok(out.ms < 2000, `pathological inputs took ${out.ms} ms`);
  assert.equal(out.crlf, '<h3 class="md-h md-h1">CRLF</h3><p class="md-p">text</p>');
});

test('performance: a 20 KB answer renders in under 15 ms (median) in Chromium', async () => {
  const parts = [];
  for (let i = 1; parts.join('\n\n').length < 20 * 1024; i++) {
    parts.push(`## Section ${i}: battery *outlook* and **key players**`);
    parts.push(`Solid-state cells promise **higher energy density** and _better safety_, per [Reuters](https://www.reuters.com/a-${i}) and https://example.com/r-${i}?ref=x. See \`model.py\` &mdash; caveats apply.`);
    parts.push(`- **Toyota** targets 2027 ([source](https://global.toyota/en/${i}))\n- QuantumScape B-samples\n  - [x] verified\n- Samsung SDI pilot line`);
    parts.push('| Company | Chemistry | Range | Status |\n|:--|:--:|--:|---|\n| Toyota | Sulfide | 1,000 | Pilot |\n| QuantumScape | Oxide | 800 | B-samples |');
    parts.push('```python\ndef energy(wh, kg):\n    return wh / kg\n```');
    parts.push('> Analysts caution that *timelines often slip*.');
  }
  const md = parts.join('\n\n');
  assert.ok(md.length >= 20 * 1024);
  const r = await page.evaluate((src) => {
    const { renderMarkdown } = window.__mods.markdown;
    for (let k = 0; k < 5; k++) renderMarkdown(src);
    const times = [];
    for (let k = 0; k < 21; k++) {
      const t = performance.now();
      renderMarkdown(src);
      times.push(performance.now() - t);
    }
    times.sort((a, b) => a - b);
    return { median: times[10], nodes: renderMarkdown(src).querySelectorAll('*').length };
  }, md);
  assert.ok(r.nodes > 500, 'the document is substantial');
  assert.ok(r.median < 15, `median render time ${r.median} ms`);
});
