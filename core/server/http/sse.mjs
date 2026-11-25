// Server-Sent Events hub for GET /api/stream.
//
// Frames:   event: status | tick | event | info      data: one line of JSON
// Only "event" frames carry an id (the event-log id), so a reconnecting EventSource sends
// Last-Event-ID and gets the events it missed. A slow client is never buffered without bound: while its
// socket is backed up, frames are dropped for it (the next tick replaces them anyway), and a client stuck
// for 30 s is disconnected. A comment line every 15 s keeps proxies from closing a quiet stream.

export function createSseHub({ maxClients = 16, heartbeatMs = 15_000, maxBlockedMs = 30_000, now = () => Date.now() } = {}) {
  const clients = new Set();
  let heartbeat = null;
  let dropped = 0;

  const frame = (event, data, id = null) => `${id !== null ? `id: ${id}\n` : ''}event: ${event}\ndata: ${data}\n\n`;

  function write(c, text) {
    if (c.blockedSince !== null) {
      if (now() - c.blockedSince > maxBlockedMs) c.res.destroy();
      dropped += 1;
      return;
    }
    if (!c.res.write(text)) c.blockedSince = now();
  }

  function ensureHeartbeat() {
    if (heartbeat || !clients.size) return;
    heartbeat = setInterval(() => {
      for (const c of clients) write(c, ': ping\n\n');
    }, heartbeatMs);
    heartbeat.unref?.();
  }

  /** Accept a client. Returns false when full (the caller answers 503). */
  function add(req, res, { headers = {}, initial = [] } = {}) {
    if (clients.size >= maxClients) return false;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    });
    req.socket?.setTimeout?.(0);
    req.socket?.setNoDelay?.(true);
    const c = { res, blockedSince: null, since: now() };
    clients.add(c);
    const drop = () => {
      clients.delete(c);
      if (!clients.size && heartbeat) {
        clearInterval(heartbeat);
        heartbeat = null;
      }
    };
    req.on('close', drop);
    res.on('close', drop);
    res.on('error', drop);
    res.on('drain', () => {
      c.blockedSince = null;
    });
    write(c, 'retry: 3000\n\n');
    for (const f of initial) write(c, frame(f.event, f.data, f.id ?? null));
    ensureHeartbeat();
    return true;
  }

  /** Send to every client. `data` may be a function, called once and only when someone listens. */
  function broadcast(event, data, id = null) {
    if (!clients.size) return 0;
    const text = frame(event, typeof data === 'function' ? data() : data, id);
    for (const c of clients) write(c, text);
    return clients.size;
  }

  function closeAll() {
    for (const c of clients) c.res.end();
    clients.clear();
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = null;
  }

  return {
    add,
    broadcast,
    closeAll,
    frame,
    get size() {
      return clients.size;
    },
    get dropped() {
      return dropped;
    },
  };
}
