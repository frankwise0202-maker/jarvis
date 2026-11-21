# Wake Jarvis test fixtures

- `hey-jarvis-george.wav`, `hey-jarvis-heart.wav`, `hey-jarvis-wake-up-michael.wav`: "Hey Jarvis." said
  by the Kokoro-82M voices George (bm_george), Heart (af_heart) and Michael (am_michael, "Hey Jarvis,
  wake up." at 1.1×); `hey-travis-george.wav` ("Hey Travis, how are you?", the nearest miss) and
  `weather-emma.wav` ("What's the weather like today in Boston?", Emma): negatives. Synthetic voices,
  not recordings of people. Made with `make-voices.mjs` (Kokoro-82M v1.0 ONNX q8, Apache-2.0, the
  app's natural voice, in Node with onnxruntime-node; it needs `vendor/kokoro/` from
  `scripts/fetch-voice-model.mjs`), then resampled 24 → 16 kHz mono 16-bit with
  `ffmpeg -f f32le -ar 24000 -ac 1 -i x.f32 -ar 16000 -ac 1 -c:a pcm_s16le x.wav`.
- `oww-reference.json`: openWakeWord v0.5.1's own streaming scores for two of them, from
  `oww_reference.py` (a numpy + onnxruntime re-implementation of `openwakeword/utils.py`
  AudioFeatures and `model.py` predict): `python3 oww_reference.py ../../../../public/models/openwakeword
  hey-jarvis-george.wav hey-travis-george.wav`.
- `room-double-clap.wav`: the recorded-style clap fixture (a living room: room tone and mains hum,
  talking, two claps 420 ms apart through a simple room response, talking), written by
  `node test/unit/wake.fixtures.mjs` from `recordedRoomTake()` in `test/unit/wake.signals.mjs`.
