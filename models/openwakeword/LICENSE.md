# openWakeWord models ("Hey Jarvis")

These three files are the pre-trained models of **openWakeWord** by **David Scripka**
(<https://github.com/dscripka/openWakeWord>), downloaded unmodified from the assets of its
release **v0.5.1** (<https://github.com/dscripka/openWakeWord/releases/tag/v0.5.1>):

| File | Bytes | SHA-256 |
|---|---|---|
| `melspectrogram.onnx` | 1,087,958 | `ba2b0e0f8b7b875369a2c89cb13360ff53bac436f2895cced9f479fa65eb176f` |
| `embedding_model.onnx` | 1,326,578 | `70d164290c1d095d1d4ee149bc5e00543250a7316b59f31d056cff7bd3075c1f` |
| `hey_jarvis_v0.1.onnx` | 1,271,370 | `94a13cfe60075b132f6a472e7e462e8123ee70861bc3fb58434a73712ee0d2cb` |

## License

openWakeWord's code is Apache-2.0. Its pre-trained models, these files included, are licensed
under the **Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International** license
(**CC BY-NC-SA 4.0**, <https://creativecommons.org/licenses/by-nc-sa/4.0/>), "due to the
inclusion of datasets with unknown or restrictive licensing as part of the training data"
(openWakeWord's README). In short:

- **Attribution**: openWakeWord, by David Scripka (credited here, in Jarvis's README and in the app).
- **NonCommercial**: personal, non-commercial use only. Jarvis is a personal assistant that its
  owner runs for themselves; do not use these models in anything you sell or run for profit.
- **ShareAlike**: if you change these models and share the result, share it under the same license.

The embedding model is openWakeWord's re-implementation of Google's `speech_embedding` model
(<https://tfhub.dev/google/speech_embedding/1>, Apache-2.0).

Jarvis downloads these files only when its owner turns on **Settings → Voice → Wake Jarvis →
Say "Hey Jarvis"**, checks each one against the SHA-256 above, and runs them on the device: the
microphone's sound never leaves it.
