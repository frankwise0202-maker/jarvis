// The "Hey Jarvis" wake word's module Worker (bundled on its own to dist/wake/wake-word-worker.js;
// never imported by the page). ONNX Runtime Web's WebAssembly build runs openWakeWord's three
// models here. Protocol and CSP notes: wake-word-engine.js.

import * as ort from 'onnxruntime-web/wasm';
import { createWakeWordEngine } from './wake-word-engine.js';

const engine = createWakeWordEngine({ scope: self, post: (msg) => self.postMessage(msg), ort });
self.onmessage = (event) => engine.handle(event.data, event.ports);
self.postMessage({ type: 'hello' });
