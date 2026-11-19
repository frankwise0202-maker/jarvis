// Attachments ("Show Jarvis", SPEC §15.1) and the per-message team size in swarm mode:
// a photo through the file picker (resized, re-encoded, sent as an image block before the text),
// a PDF sent on its own (document block + default text), friendly errors (unsupported, too large,
// too many), paste and drag-and-drop, the preview lightbox, and the swarm-size control. Phone,
// small phone, desktop and a 320 px screen.

import { tid } from '../harness.mjs';
import { describeAttachmentBlock } from '../../mock/content.mjs';
import { makePdf, makePng } from '../../mock/fixtures.mjs';

const PHOTO = { name: 'desk-photo.png', mimeType: 'image/png', buffer: makePng(2400, 1800) };
const PDF = { name: 'Quarterly report.pdf', mimeType: 'application/pdf', buffer: makePdf(3) };

/** The user message of the latest lead request whose content carries an attachment block. */
function lastAttachmentMessage(t) {
  for (const r of [...t.requests('lead')].reverse()) {
    const m = r.body?.messages?.findLast?.((x) => x.role === 'user' && Array.isArray(x.content) && x.content.some((b) => b.type === 'image' || b.type === 'document'));
    if (m) return m;
  }
  return null;
}

async function chipStatuses(t) {
  return t.page.locator(tid('attachment-chip')).evaluateAll((els) => els.map((e) => e.getAttribute('data-status')));
}

async function attach(t, files, { count = Array.isArray(files) ? files.length : 1 } = {}) {
  const before = await t.count('attachment-chip');
  await t.page.locator(tid('attach-input')).setInputFiles(files);
  await t.waitFor(async () => {
    const s = await chipStatuses(t);
    return s.length >= before + count && s.every((x) => x === 'ready');
  }, { timeout: 15000, message: async () => `${count} attachment chip(s) to be ready (now: ${(await chipStatuses(t)).join(', ') || 'none'})` });
}

async function expectNotice(t, pattern, label) {
  const notice = await t.visible('attachment-error', { timeout: 10000, message: `An inline notice should explain: ${label}` });
  const text = await t.text(notice);
  t.assert(pattern.test(text), `Notice for ${label} should match ${pattern}; got "${text}"`);
  return text;
}

async function checkTapTargets(t, ids) {
  const small = [];
  for (const id of ids) {
    const loc = t.page.locator(tid(id)).first();
    if (!(await loc.isVisible().catch(() => false))) continue;
    const box = await loc.boundingBox();
    if (box && (box.width < 43.5 || box.height < 43.5)) small.push(`${id} ${Math.round(box.width)}×${Math.round(box.height)}`);
  }
  t.assert(!small.length, `Tap targets must be at least 44×44 px (SPEC §2): ${small.join(', ')}`);
}

/** A File made inside the page (for paste and drop, which setInputFiles cannot exercise). */
async function dispatchFiles(t, kind, selector) {
  await t.page.evaluate(async ({ kind, selector }) => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 400;
    const ctx = canvas.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 640, 400);
    g.addColorStop(0, '#1d6fa5');
    g.addColorStop(1, '#f2b64c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 640, 400);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 48px sans-serif';
    ctx.fillText(kind === 'paste' ? 'Pasted' : 'Dropped', 40, 220);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    const file = new File([blob], kind === 'paste' ? 'image.png' : 'whiteboard.png', { type: 'image/png' });
    const dt = new DataTransfer();
    dt.items.add(file);
    const target = document.querySelector(selector);
    if (kind === 'paste') {
      target.focus();
      target.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    } else {
      for (const type of ['dragenter', 'dragover', 'drop']) target.dispatchEvent(new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true }));
    }
  }, { kind, selector });
}

export default [
  {
    name: 'attachments',
    title: 'Photo and PDF attachments: picker, resize to ≤1568 px, image/document blocks before the text, attachment-only send, errors, preview',
    device: 'iphone13',
    timeout: 150000,
    async run(t) {
      await t.newPage();
      await t.goto('/');
      await t.visible('composer-attach', { message: 'The composer shows an attach button' });
      await t.visible('composer-camera', { message: 'Touch phones also show a camera button' });
      await checkTapTargets(t, ['composer-attach', 'composer-camera', 'composer-mic', 'composer-send']);
      const accept = await t.page.locator(tid('attach-input')).getAttribute('accept');
      t.assert(accept === 'image/*,application/pdf', `attach-input accepts photos and PDFs (got "${accept}")`);
      t.assert((await t.page.locator(tid('attach-input')).getAttribute('multiple')) !== null, 'attach-input allows several files');
      t.assert((await t.page.locator(tid('camera-input')).getAttribute('capture')) === 'environment', 'the camera input opens the rear camera');

      await t.step('attach a photo and send it with text', async () => {
        await attach(t, PHOTO);
        const chip = t.page.locator(tid('attachment-chip')).first();
        t.assert((await chip.getAttribute('data-kind')) === 'image', 'The chip is a photo');
        t.assert(await chip.locator('img').count(), 'The chip shows a thumbnail');
        t.assert(await t.page.locator(tid('composer-send')).isEnabled(), 'Send is enabled with an attachment and no text');
        await t.checkNoHorizontalOverflow('photo attached');
        await t.screenshot('1-photo-attached');
        const turn = await t.send('What is on my desk?');
        await t.waitForTurn(turn, ['done']);
        const answer = await t.text(turn.locator(tid('segment-text')).first());
        t.assert(/I can see the image you shared/.test(answer), `Jarvis should acknowledge the photo; got "${answer.slice(0, 120)}"`);
        t.assert((await t.count('attachment-chip')) === 0, 'The composer clears the attachments after a successful send');
        const user = t.page.locator(tid('turn-user')).last();
        const thumb = user.locator(tid('attachment-thumb')).first();
        await thumb.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {
          throw new Error('The user bubble should show the photo (attachment-thumb)');
        });
        t.assert(/^data:image\/jpeg;base64,/.test((await thumb.locator('img').getAttribute('src')) || ''), 'The bubble thumbnail is a data: JPEG (the CSP allows data: images)');

        const message = lastAttachmentMessage(t);
        t.assert(message, 'The lead request carries the photo');
        const types = message.content.map((b) => b.type);
        t.assert(types.join(',') === 'text,image,text', `Content order must be [turn_context, image, text] (SPEC §15.1); got [${types}]`);
        t.assert(/^<turn_context>/.test(message.content[0].text) && message.content[2].text === 'What is on my desk?', 'turn_context first, the owner\'s text last');
        const img = message.content[1];
        t.assert(img.source.type === 'base64' && img.source.media_type === 'image/jpeg', `An opaque PNG is re-encoded as JPEG (got ${img.source.media_type})`);
        t.assert(!/\s/.test(img.source.data) && !img.source.data.startsWith('data:'), 'Raw base64: no data: prefix, no line breaks');
        const seen = describeAttachmentBlock(img);
        t.assert(seen.width === 1568 && seen.height === 1176, `A 2400×1800 photo is scaled to 1568×1176 (got ${seen.width}×${seen.height})`);
        t.assert(img.source.data.length < 3.7 * 1024 * 1024, 'The processed photo stays under ~3.7 MB of base64');
        await t.checkNoHorizontalOverflow('photo sent');
        await t.screenshot('2-photo-sent');

        await thumb.click();
        const preview = await t.visible('attachment-preview', { message: 'Tapping the thumbnail opens a preview' });
        t.assert(/Preview/.test(await t.text(preview)), 'The lightbox says it is a preview');
        await t.screenshot('3-preview');
        await t.page.keyboard.press('Escape');
        await t.page.locator(tid('attachment-preview')).waitFor({ state: 'detached', timeout: 5000 });
        t.assert(await thumb.evaluate((el) => el === document.activeElement), 'Focus returns to the thumbnail when the preview closes');
      });

      await t.step('send a PDF on its own', async () => {
        await attach(t, PDF);
        const chip = t.page.locator(tid('attachment-chip')).first();
        t.assert((await chip.getAttribute('data-kind')) === 'pdf', 'The chip is a PDF');
        t.assert(/Quarterly report\.pdf/.test(await t.text(chip)), 'The PDF chip shows the file name');
        await t.screenshot('4-pdf-attached');
        const before = await t.count('turn-jarvis');
        await (await t.visible('composer-send')).click();
        await t.waitFor(async () => (await t.count('turn-jarvis')) > before, { timeout: 10000, message: 'an attachment-only message to start a turn' });
        const turn = t.page.locator(tid('turn-jarvis')).nth(before);
        await t.waitForTurn(turn, ['done']);
        const answer = await t.text(turn.locator(tid('segment-text')).first());
        t.assert(/I've read the PDF you shared/.test(answer), `Jarvis should acknowledge the PDF; got "${answer.slice(0, 120)}"`);
        const message = lastAttachmentMessage(t);
        const types = message.content.map((b) => b.type);
        t.assert(types.join(',') === 'text,document,text', `Attachment-only content is [turn_context, document, default text]; got [${types}]`);
        t.assert(message.content[2].text === 'Please look at the attached file(s).', 'The engine adds the default text');
        const doc = message.content[1];
        t.assert(doc.source.media_type === 'application/pdf' && doc.title === 'Quarterly report.pdf', 'A base64 PDF document block titled with the file name');
        const user = t.page.locator(tid('turn-user')).last();
        t.assert((await user.locator(`${tid('attachment-thumb')}[data-kind="pdf"]`).count()) === 1, 'The user bubble shows a PDF chip');
        t.assertAppendOnly();
        await t.screenshot('5-pdf-sent');
      });

      await t.step('friendly errors: unsupported, too large, too many', async () => {
        await t.page.locator(tid('attach-input')).setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('just text') });
        await expectNotice(t, /isn’t a photo or a PDF/, 'an unsupported file');
        const big = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(21 * 1024 * 1024, 0x20)]);
        await t.page.locator(tid('attach-input')).setInputFiles({ name: 'huge.pdf', mimeType: 'application/pdf', buffer: big });
        await expectNotice(t, /is 21 MB\. PDFs can be up to 20 MB/, 'a PDF over 20 MB');
        await t.screenshot('6-error-too-large');
        t.assert((await t.count('attachment-chip')) === 0, 'Rejected files leave no chips behind');
        const six = Array.from({ length: 6 }, (_, i) => ({ name: `shot-${i + 1}.png`, mimeType: 'image/png', buffer: makePng(80 + i, 60) }));
        await t.page.locator(tid('attach-input')).setInputFiles(six);
        await expectNotice(t, /up to 5 files per message/, 'more than 5 files');
        await t.waitFor(async () => (await chipStatuses(t)).filter((s) => s === 'ready').length === 5, { timeout: 15000, message: '5 ready chips' });
        await t.checkNoHorizontalOverflow('five attachments');
        await t.screenshot('7-five-attached');
        await t.page.locator(tid('attachment-remove')).first().click();
        await t.waitFor(async () => (await t.count('attachment-chip')) === 4, { timeout: 3000, message: 'removing a chip' });
        t.assert(await t.page.locator(tid('attachment-remove')).first().evaluate((el) => el === document.activeElement), 'Focus moves to the next remove button');
        while ((await t.count('attachment-remove')) > 0) await t.page.locator(tid('attachment-remove')).first().click();
        t.assert(!(await t.page.locator(tid('composer-send')).isEnabled()), 'Send is disabled again with nothing to send');
      });
    },
  },

  {
    name: 'attachments-desktop',
    title: 'Desktop: paste and drag-and-drop attach photos; the swarm team size travels as maxAgents and clamps the mission',
    device: 'desktop',
    timeout: 150000,
    async run(t) {
      await t.newPage();
      await t.goto('/');
      await t.visible('composer-attach');
      t.assert(!(await t.page.locator(tid('composer-camera')).isVisible().catch(() => false)), 'No camera button on desktop');

      await t.step('paste and drop', async () => {
        await dispatchFiles(t, 'paste', tid('composer-input'));
        await t.waitFor(async () => (await chipStatuses(t)).join() === 'ready', { timeout: 10000, message: 'a pasted image chip' });
        t.assert(/Pasted image/.test((await t.page.locator(tid('attachment-chip')).first().getAttribute('aria-label')) || ''), 'A pasted image gets a friendly name');
        await dispatchFiles(t, 'drop', '.composer');
        await t.waitFor(async () => (await chipStatuses(t)).join() === 'ready,ready', { timeout: 10000, message: 'a dropped image chip' });
        await t.screenshot('1-paste-and-drop');
      });

      await t.step('team size in swarm mode', async () => {
        t.assert(!(await t.page.locator(tid('swarm-size')).isVisible()), 'The team size control is hidden outside swarm mode');
        await t.selectMode('swarm');
        const chip = await t.visible('swarm-size', { message: 'Swarm mode shows the team size control' });
        t.assert((await chip.getAttribute('data-value')) === '10', `The default (settings.maxAgents 8) snaps to 10 (got ${await chip.getAttribute('data-value')})`);
        await chip.click();
        await t.visible('swarm-size-3', { message: 'The popover lists the sizes' });
        for (const n of [3, 6, 10, 15, 20]) t.assert(await t.page.locator(tid(`swarm-size-${n}`)).isVisible(), `swarm-size-${n} is offered`);
        t.assert((await chip.getAttribute('aria-expanded')) === 'true', 'aria-expanded reflects the open popover');
        await t.screenshot('2-team-size');
        await t.page.locator(tid('swarm-size-3')).click();
        t.assert((await chip.getAttribute('data-value')) === '3' && (await chip.getAttribute('aria-expanded')) === 'false', 'Choosing 3 closes the popover and updates the chip');

        const turn = await t.send('[[swarm:5]] Where can I buy the desk and the whiteboard in these photos?');
        const card = turn.locator(tid('mission-card')).first();
        await card.waitFor({ state: 'visible', timeout: 20000 });
        await t.waitForTurn(turn, ['done'], { timeout: 90000 });
        const agents = await card.locator(tid('agent-chip')).count();
        t.assert(agents === 3, `The mission runs at most 3 agents (got ${agents})`);
        const lead = t.requests('lead')[0].body;
        const first = lead.messages.at(-1).content;
        t.assert(first.map((b) => b.type).join(',') === 'text,image,image,text', `Both photos precede the text (got ${first.map((b) => b.type)})`);
        t.assert(/^Agent limits: up to 3 agents per wave/m.test(first[0].text), 'The turn context reflects the chosen team size');
        const tasks = t.requests('worker').map((r) => r.body.messages[0].content[0].text);
        t.assert(
          tasks.length === 3 && tasks.every((x) => /Context: the owner shared a JPEG photo \(640×400\) and a JPEG photo \(640×400\)/.test(x)),
          `Agent tasks describe both photos, re-encoded as JPEG (agents cannot see attachments); got "${(tasks[0] || '').match(/Context:[^.]*/)?.[0] || tasks[0]?.slice(0, 160)}"`,
        );
        await t.checkNoHorizontalOverflow('swarm with photos');
        await t.screenshot('3-swarm-with-photos');
      });
    },
  },

  {
    name: 'attachments-narrow',
    title: '320 px and 375×667: attach, camera, mic and team size fit the composer without overflow or layout jumps',
    device: 'small',
    timeout: 120000,
    async run(t) {
      // A 320 × 568 phone (not in the shared device list) next to the 375 × 667 one.
      const small = t.devices.small;
      t.devices = { ...t.devices, narrow: { ...small, label: '320×568', options: { ...small.options, viewport: { width: 320, height: 568 }, screen: { width: 320, height: 568 } } } };
      for (const device of ['narrow', 'small']) {
        const page = await t.newPage({ device });
        t.page = page;
        await t.goto('/', { page });
        await t.visible('composer-attach', { page });
        const sendBox = async () => (await page.locator(tid('composer-send')).boundingBox()) || {};
        const inputBox = async () => (await page.locator(tid('composer-input')).boundingBox()) || {};
        const before = { send: await sendBox(), input: await inputBox() };
        await t.selectMode('swarm', page);
        await t.visible('swarm-size', { page });
        const after = { send: await sendBox(), input: await inputBox() };
        t.assert(Math.abs(after.send.x - before.send.x) < 0.5 && Math.abs(after.input.height - before.input.height) < 0.5, `Switching to swarm must not move Send or resize the input (${device})`);
        await checkTapTargets(t, ['composer-attach', 'composer-mic', 'composer-send', 'swarm-size', 'mode-auto', 'mode-quick', 'mode-swarm']);
        await t.checkNoHorizontalOverflow(`swarm mode (${device})`, page);
        await page.locator(tid('swarm-size')).click();
        await t.visible('swarm-size-20', { page });
        const pop = await page.locator('.swarm-pop').boundingBox();
        const vw = page.viewportSize().width;
        t.assert(pop && pop.x >= 0 && pop.x + pop.width <= vw, `The team size popover fits the screen (${device})`);
        await t.screenshot(`${device}-1-team-size`, page);
        await page.keyboard.press('Escape');
        await page.locator('.swarm-pop').waitFor({ state: 'hidden', timeout: 3000 });
        await attach(t, [PHOTO, PDF]);
        await t.checkNoHorizontalOverflow(`attachments (${device})`, page);
        await t.screenshot(`${device}-2-attached`, page);
      }
    },
  },
];
