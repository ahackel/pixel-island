// A scene's markers (`Scene.markers`): named spots a game can point at (a quest laying a crate at `crateSpot`, say),
// set with the scene editor's Marker tool. What a name means is the game's. Plain rules, no drawing, so tests can load them.

/** A named spot of a scene, in scene coordinates. */
export interface Marker { name: string; i: number; j: number }

/** What a marker may be called: a letter, then letters, digits, `-` or `_`, up to 32 in all. */
export const MARKER_NAME = /^[A-Za-z][\w-]{0,31}$/;

/** A scene's marker by name, if it has one. */
export const markerOf = (scene: { markers?: readonly Marker[] }, name: string): Marker | undefined => scene.markers?.find((m) => m.name === name);

/** Markers read back from storage or a file, for a scene `w` by `h`: good names only, each name once (the first kept), inside the scene. */
export function cleanMarkers(raw: unknown, w: number, h: number): Marker[] {
  const out: Marker[] = [];
  const at = (n: unknown, hi: number) => (typeof n === 'number' && Number.isFinite(n) ? Math.min(hi, Math.max(0, n)) : hi / 2);
  for (const m of Array.isArray(raw) ? raw : []) {
    if (!m || typeof m !== 'object' || typeof m.name !== 'string' || !MARKER_NAME.test(m.name) || out.some((o) => o.name === m.name)) continue;
    out.push({ name: m.name, i: at(m.i, w), j: at(m.j, h) });
  }
  return out;
}
