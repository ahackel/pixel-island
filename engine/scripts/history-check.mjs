// Run with: node scripts/history-check.mjs
import assert from 'node:assert/strict';
import { history } from '../shared/history.ts';

let state = { n: 0 };
const hist = history(() => state, (v) => (state = v));
hist.commit();
assert.equal(hist.canUndo(), false, 'no change, nothing to undo');
state.n = 1; hist.commit();
state.n = 2; hist.commit();
hist.undo(); assert.equal(state.n, 1);
hist.undo(); assert.equal(state.n, 0);
hist.undo(); assert.equal(state.n, 0, 'undo past the start does nothing');
hist.redo(); assert.equal(state.n, 1);
state.n = 5; hist.commit();
assert.equal(hist.canRedo(), false, 'a new change drops redo');
hist.undo(); assert.equal(state.n, 1);
hist.reset(); assert.equal(hist.canUndo(), false);
console.log('history ok');
