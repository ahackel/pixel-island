// Plays the tutorial with many random seeds at once (scripts/playthrough.mjs, SEED=<n>), to find bugs that the fixed
// seed of `npm run playthrough` never meets, and lists the seeds that failed with the first line of why. Each failing
// seed plays the same again: `SEED=<n> npm run playthrough`.
//
//   npm run playthrough:hunt                 16 seeds, 8 at a time
//   RUNS=40 JOBS=6 npm run playthrough:hunt
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'playthrough.mjs');
const RUNS = Number(process.env.RUNS) || 16;
const JOBS = Number(process.env.JOBS) || 8;
const seeds = Array.from({ length: RUNS }, () => Math.floor(Math.random() * 1e9));
const failed = [];
let done = 0;

/** Plays one seed; resolves with what it printed and whether it passed. */
const play = (seed) => new Promise((resolve) => {
  const child = spawn(process.execPath, [script], { env: { ...process.env, SEED: String(seed) }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => (out += d));
  child.stderr.on('data', (d) => (out += d));
  const timer = setTimeout(() => child.kill('SIGKILL'), 10 * 60 * 1000);
  child.on('close', (code) => { clearTimeout(timer); resolve({ ok: code === 0, out }); });
});

const started = Date.now();
async function worker() {
  while (seeds.length) {
    const seed = seeds.shift();
    const { ok, out } = await play(seed);
    done++;
    const why = ok ? '' : (out.match(/FAILED[^\n]*/)?.[0] ?? out.trim().split('\n').pop() ?? 'no output');
    if (!ok) failed.push({ seed, why });
    console.log(`[${done}/${RUNS}] seed ${seed}: ${ok ? 'passed' : why}`);
  }
}
await Promise.all(Array.from({ length: Math.min(JOBS, RUNS) }, worker));
console.log(`\n${RUNS - failed.length} of ${RUNS} seeds passed in ${Math.round((Date.now() - started) / 1000)} s.`);
for (const f of failed) console.log(`  SEED=${f.seed} npm run playthrough   # ${f.why}`);
process.exit(failed.length ? 1 : 0);
