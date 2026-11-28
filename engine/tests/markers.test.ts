// A scene's markers (markers.ts): named spots a game points at, checked when read back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanMarkers, markerOf, MARKER_NAME } from '../engine/world/markers.ts';

test('markers are read back with good names only, each name once, and inside the scene', () => {
  const raw = [{ name: 'crate', i: 3.5, j: 4.5 }, { name: 'crate', i: 1, j: 1 }, { name: '9lives', i: 2, j: 2 }, { name: 'far', i: 99, j: -4 }, { name: 'x y', i: 1, j: 1 }, { name: 'odd', i: 'x' }, 'junk', null];
  const back = cleanMarkers(JSON.parse(JSON.stringify(raw)), 12, 10);
  assert.deepEqual(back, [{ name: 'crate', i: 3.5, j: 4.5 }, { name: 'far', i: 12, j: 0 }, { name: 'odd', i: 6, j: 5 }]);
  assert.deepEqual(cleanMarkers(undefined, 12, 10), []);
  assert.deepEqual(markerOf({ markers: back }, 'crate'), { name: 'crate', i: 3.5, j: 4.5 });
  assert.equal(markerOf({ markers: back }, 'nope'), undefined);
  assert.equal(markerOf({}, 'crate'), undefined);
});

test('a marker name starts with a letter and is short', () => {
  for (const ok of ['a', 'crate', 'raft-beach', 'stone_2']) assert.ok(MARKER_NAME.test(ok), ok);
  for (const bad of ['', '2nd', 'a b', '-x', 'x'.repeat(33), 'ä']) assert.ok(!MARKER_NAME.test(bad), bad);
});
