# A faithful re-implementation of openWakeWord v0.5.1's streaming prediction (utils.AudioFeatures
# + model.Model.predict) with numpy + onnxruntime, for 1280-sample chunks, used as the reference.
import sys, wave, json, collections
import numpy as np, onnxruntime as ort

class OWW:
    def __init__(self, d, seed=0):
        so = ort.SessionOptions(); so.inter_op_num_threads = 1; so.intra_op_num_threads = 1
        self.mel = ort.InferenceSession(d + '/melspectrogram.onnx', sess_options=so, providers=['CPUExecutionProvider'])
        self.emb = ort.InferenceSession(d + '/embedding_model.onnx', sess_options=so, providers=['CPUExecutionProvider'])
        self.ww = ort.InferenceSession(d + '/hey_jarvis_v0.1.onnx', sess_options=so, providers=['CPUExecutionProvider'])
        self.raw = collections.deque(maxlen=16000 * 10)
        self.melbuf = np.ones((76, 32))
        rs = np.random.RandomState(seed)
        self.feat = self._embeddings(rs.randint(-1000, 1000, 16000 * 4).astype(np.int16))
        self.preds = collections.deque(maxlen=30)
    def _melspec(self, x):
        x = np.asarray(x, dtype=np.float32)[None, :]
        out = self.mel.run(None, {'input': x})[0]
        return np.squeeze(out) / 10 + 2
    def _embeddings(self, x):
        spec = self._melspec(x)
        wins = [spec[i:i + 76] for i in range(0, spec.shape[0], 8) if spec[i:i + 76].shape[0] == 76]
        batch = np.expand_dims(np.array(wins), axis=-1).astype(np.float32)
        return self.emb.run(None, {'input_1': batch})[0].squeeze()
    def predict(self, chunk):
        assert len(chunk) == 1280
        self.raw.extend(chunk.tolist())
        spec = self._melspec(list(self.raw)[-1280 - 160 * 3:])
        self.melbuf = np.vstack((self.melbuf, spec))[-970:]
        x = self.melbuf[-76:].astype(np.float32)[None, :, :, None]
        e = self.emb.run(None, {'input_1': x})[0].squeeze()
        self.feat = np.vstack((self.feat, e))[-120:]
        score = float(self.ww.run(None, {'x.1': self.feat[-16:][None].astype(np.float32)})[0][0][0])
        if len(self.preds) < 5: score = 0.0
        self.preds.append(score)
        return score

def read_wav(p):
    with wave.open(p, 'rb') as w:
        assert w.getframerate() == 16000 and w.getnchannels() == 1 and w.getsampwidth() == 2
        return np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)

if __name__ == '__main__':
    d = sys.argv[1]
    out = {}
    for p in sys.argv[2:]:
        m = OWW(d)
        x = read_wav(p)
        pad = np.zeros(16000, dtype=np.int16)
        x = np.concatenate((pad, x, pad))
        n = len(x) // 1280
        scores = [m.predict(x[i * 1280:(i + 1) * 1280]) for i in range(n)]
        out[p.split('/')[-1]] = scores
    json.dump(out, sys.stdout)
