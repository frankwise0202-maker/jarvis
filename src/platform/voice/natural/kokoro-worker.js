// The natural voice's module Worker (bundled on its own to dist/voice/kokoro-worker.js; never
// imported by the page). All model loading, WebAssembly compilation and inference happen here,
// so the page never stutters and the page's CSP needs no 'wasm-unsafe-eval' (see the CSP notes in
// engine-client.js). Protocol: kokoro-engine.js.

import { KokoroTTS } from 'kokoro-js';
import { env as tfEnv } from '@huggingface/transformers';
import { createKokoroEngine } from './kokoro-engine.js';

// When the page is cross-origin isolated, ONNX Runtime runs its threads as workers loading this
// same script, named 'em-pthread…': those run ONNX Runtime's code only, never the engine.
if (!String(self.name || '').startsWith('em-pthread')) {
  const engine = createKokoroEngine({
    scope: self,
    post: (msg, transfer) => self.postMessage(msg, transfer || []),
    loadModel: (modelId, opts) => KokoroTTS.from_pretrained(modelId, opts),
    tfEnv,
  });
  self.onmessage = (event) => engine.handle(event.data);
  self.postMessage({ type: 'hello' });
}
