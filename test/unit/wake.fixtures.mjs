// Writes the Standby clap fixture (fixtures/wake/room-double-clap.wav) from its generator in
// wake.signals.mjs: `node test/unit/wake.fixtures.mjs`. The unit test checks the two still agree.
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { recordedRoomTake, wavBytes } from './wake.signals.mjs';

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'wake', 'room-double-clap.wav');
await writeFile(out, wavBytes(recordedRoomTake()));
console.log(`wrote ${out}`);
