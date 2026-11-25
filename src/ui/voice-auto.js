// George from the home base, on by default, once (v7.8, SPEC §26).
//
// The owner never heard the better voices: George on the home base (v7.7) and George on this device
// (v7) were both off until he found their switches. Now, when a home base is linked and answers, its
// Core has a voice (Jarvis Core 1.2 or later), and nobody has switched "George's voice from the home
// base" on this device before, the app turns it on by itself: this device's setting (homeBaseSpeak)
// and the home base's part (PUT api/senses { speak: { enabled: true } }, which starts George's download
// and warm-up there). It records that it did so (homeBaseSpeakBy 'auto') and never does it again; once
// the owner switches it himself, on or off, it is his ('owner'). Until the home base's George is
// ready, replies keep today's voices (the router only uses a voice that is ready).
//
//   const auto = createVoiceAuto({ senses, getSettings, saveSettings, demo, onEnabled });
//   auto.check({ force }) -> Promise<{ act, why }>   at launch, when the app comes to the front, when a
//                                                    home base is linked, when Voice Mode opens
//   setHomeBaseVoice(senses, on, { commit })         the owner's own switch (Settings, the notice)

import { autoSpeakDecision } from '../lib/voice-choice.js';

function report(err) {
  try {
    console.error('[jarvis] voice auto:', err);
  } catch {
    /* ignore */
  }
}

/**
 * The owner switches George's voice from the home base on or off himself. Off: this device stops using
 * it at once, whatever the home base answers. On: only once the home base accepts. Either way it is
 * now his choice (homeBaseSpeakBy 'owner'): the app never switches it by itself again.
 */
export async function setHomeBaseVoice(senses, on, { commit }) {
  if (!on) commit({ homeBaseSpeak: false, homeBaseSpeakBy: 'owner' });
  let r;
  try {
    r = await senses.save({ speak: { enabled: !!on } });
  } catch {
    r = { ok: false, kind: 'error' };
  }
  if (on && r && r.ok) commit({ homeBaseSpeak: true, homeBaseSpeakBy: 'owner' });
  return r;
}

export function createVoiceAuto({ senses, getSettings, saveSettings, demo = () => false, onEnabled = () => {} }) {
  let busy = null;
  const settings = () => {
    try {
      return getSettings() || {};
    } catch {
      return {};
    }
  };
  const isDemo = () => {
    try {
      return !!demo();
    } catch {
      return true;
    }
  };

  function check({ force = false } = {}) {
    if (busy) return busy;
    // Nothing to ask the home base: not linked, already on, the owner's choice, done once, the demo.
    const pre = autoSpeakDecision({ settings: settings(), demo: isDemo() });
    if (pre.why !== 'unknown' || !senses) return Promise.resolve(pre);
    busy = (async () => {
      const st = await senses.load({ force });
      const d = autoSpeakDecision({ settings: settings(), view: st && st.senses, problem: st && st.problem, demo: isDemo() });
      if (!d.act) return d;
      const r = await senses.save({ speak: { enabled: true } });
      if (!r || !r.ok) return { act: false, why: 'refused' }; // the next launch or return tries again
      const now = settings();
      if (now.homeBaseSpeak === true || now.homeBaseSpeakBy) return { act: false, why: 'chosen' }; // he chose meanwhile
      saveSettings({ homeBaseSpeak: true, homeBaseSpeakBy: 'auto' });
      try {
        onEnabled();
      } catch (err) {
        report(err);
      }
      return { act: true, why: 'ok' };
    })()
      .catch((err) => {
        report(err);
        return { act: false, why: 'error' };
      })
      .finally(() => {
        busy = null;
      });
    return busy;
  }

  return { check };
}
