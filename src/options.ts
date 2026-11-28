// The debug options in the page's address (README: Debug URL options), read once at the start. Plain functions of the
// query string, so the tests can use them (options.test.ts).

export interface Options {
  /** `?speed=20`: the game clock 20 times faster (0.1 at least). */
  speed: number;
  /** `?quest=5`: a new game from the fifth quest, with what the ones before brought; never saved, so the real save is kept. */
  tryout: boolean;
  /** The quest a new game starts at, by index: 0, or the tryout's. */
  startQuest: number;
  /** `?cave`: straight into the rocky island's cave, lantern in hand, with no menu, editor or intro. */
  cave: boolean;
  /** `?island=2` (or `?cave`): the first try at the rocky island and its cave, with a lantern in the bag; never saved. */
  island2: boolean;
  /** `?scene=<name>`: a scene saved from the editor played as the island; never saved. */
  scene: string | null;
  /** `?new`: a new game, not saved until its first sleep. */
  fresh: boolean;
  /** `?cheats`: the orange cheat buttons. */
  cheats: boolean;
  /**
   * `?seed=42`: what is left to chance in a new game (where the sea leaves things without a marker, the fish, the crabs,
   * a grab's luck) the same every time; null, a new seed for each new game. A saved game keeps its own seed (with
   * `?new` the seed given starts a new one). The playthrough plays with a fixed one.
   */
  seed: number | null;
}

export function optionsOf(search: string, quests: number): Options {
  const params = new URLSearchParams(search);
  const cave = params.has('cave');
  return {
    speed: Math.max(0.1, Number(params.get('speed')) || 1),
    tryout: params.has('quest'),
    startQuest: Math.min(quests, Math.max(1, Math.floor(Number(params.get('quest'))) || 1)) - 1,
    cave,
    island2: params.get('island') === '2' || cave,
    scene: params.get('scene') || null,
    fresh: params.has('new'),
    cheats: params.has('cheats'),
    seed: /^\d{1,9}$/.test(params.get('seed') ?? '') ? Number(params.get('seed')) : null,
  };
}

/** The query string without the tryout's `quest`, flags like `cheats` kept in their bare form (not `cheats=`). */
export function withoutQuest(search: string): string {
  const params = new URLSearchParams(search);
  params.delete('quest');
  const rest = `${params}`.replace(/=(?=&|$)/g, '');
  return rest ? `?${rest}` : '';
}
