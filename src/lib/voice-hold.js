// Voice Mode's hold (v8.1 contract (a) api.hold / api.release), pure: the clock is injected.
//
//   const hold = createVoiceHold({ capMs: 120000, now })
//   hold.hold('tour'); hold.release('tour'); hold.heard()   // the owner's words (any)
//   hold.held()          -> true while something holds the session and the cap hasn't passed
//   hold.remainingMs()   -> how long it still holds (0 when it doesn't)
//
// While held, a woken session doesn't go back to Standby, for at most `capMs` (2 minutes) after the
// owner's last words (or the hold's start, whichever is later). Then it returns to Standby; whatever
// held it (a tour) stays where it was, and the hold's reasons stay too: the next words start the
// 2 minutes again.

export const HOLD_CAP_MS = 120000;

export function createVoiceHold({ capMs = HOLD_CAP_MS, now = () => Date.now() } = {}) {
  const reasons = new Set();
  let since = 0; // the later of the owner's last words and the newest hold

  return {
    hold(reason = 'held') {
      const r = String(reason || 'held');
      reasons.add(r);
      since = Math.max(since, now());
    },
    release(reason = 'held') {
      reasons.delete(String(reason || 'held'));
      return reasons.size === 0;
    },
    /** The owner said something (or tapped to talk): the cap counts from now. */
    heard() {
      since = now();
    },
    held() {
      return reasons.size > 0 && now() - since < capMs;
    },
    remainingMs() {
      return reasons.size > 0 ? Math.max(0, capMs - (now() - since)) : 0;
    },
    reasons: () => [...reasons],
  };
}
