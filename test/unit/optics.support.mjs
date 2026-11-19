// Helpers for the Optics tests (not a test file itself).

/**
 * A tiny JPEG header of a given size (SOI, APP0 JFIF, optional APP1 padding, SOF0, EOI) as base64:
 * enough for every signature and size check in the engine and the strict mock, which never decode
 * the scan data. The E2E tests use real camera frames.
 */
export function fakeJpeg(width, height, { exif = 0 } = {}) {
  const parts = [Buffer.from([0xff, 0xd8])];
  parts.push(Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]));
  if (exif > 0) {
    const len = exif + 2;
    const app1 = Buffer.alloc(4 + exif);
    app1[0] = 0xff;
    app1[1] = 0xe1;
    app1.writeUInt16BE(len, 2);
    parts.push(app1);
  }
  const sof = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, 0, 0, 0, 0, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01]);
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  parts.push(sof, Buffer.from([0xff, 0xd9]));
  return Buffer.concat(parts).toString('base64');
}

/** An Optics Look's attachment, as the UI hands it to startTurn. */
export function opticsAttachment(width = 1280, height = 720) {
  return { id: `att_${width}x${height}`, kind: 'image', name: 'Optics', mediaType: 'image/jpeg', size: 1000, data: fakeJpeg(width, height), thumb: null, width, height };
}

// ---- the Optics tools in a new conversation (v7 split: temporary) ------------------------------
// Lead tools V5 (V4 + the Optics tools + open_screen) and LEAD_SYSTEM_V4 belong to the other half
// of v7 ("shell", src/engine/prompts.js). Until the halves are merged, new conversations here still
// freeze V4, so the Optics tests give their conversation the Optics tools themselves. Once V5 is
// the latest version, opticsLeadTools() returns it unchanged and these helpers change nothing.

import { leadToolsLatest } from '../../src/engine/prompts.js';
import { lookThroughCameraTool, pinLabelsTool } from '../../src/lib/optics.js';

/** The latest frozen tools, plus pin_labels and look_through_camera when they are not in it yet. */
export function opticsLeadTools() {
  const tools = leadToolsLatest();
  const names = new Set(tools.map((t) => t.name));
  return [...tools, ...[pinLabelsTool(), lookThroughCameraTool()].filter((t) => !names.has(t.name))];
}

/** jarvis.newConversation() with the Optics tools (see opticsLeadTools). */
export function newOpticsConversation(jarvis) {
  const conv = jarvis.newConversation();
  conv.tools = opticsLeadTools();
  return conv;
}
