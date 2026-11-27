// Island 2's first three quests, written as the content they should be (content/drafts/island2/) and checked with the
// game's own checks. The game cannot do all of it yet, and the checks say exactly what it cannot: GAPS below is that
// list. It is meant to shrink: when the vocabulary grows to cover a line, this test fails until the line is removed, and
// when the list is empty the draft is ready to move out of drafts/ into the game.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import loca from './content/loca.json' with { type: 'json' };
import loca2 from './content/drafts/island2/loca.json' with { type: 'json' };
import quests2 from './content/drafts/island2/quests.json' with { type: 'json' };
import rules2 from './content/drafts/island2/interactions.json' with { type: 'json' };
import dialogues2 from './content/drafts/island2/dialogues.json' with { type: 'json' };
import { checkEffects, type Known } from './effects.ts';
import { checkRules, RULES } from './interactions.ts';
import { checkContent, CODE_GOALS, reportedGoals, wantedGoals } from './quests.ts';
import { LOOSE } from './crafts.ts';

const texts = { ...loca, ...loca2 };
const quests = quests2 as any[];
const rules = rules2 as any[];

/** What the game cannot do yet, as the checks say it: one line each, grouped by what is missing. */
const GAPS = [
  // Items are code (BAG_ITEMS, LOOSE and FOOD in crafts.ts, their pictures in things.ts), not data: a pot, flint and fish soup need all three.
  'quest 1, effect 2: unknown wash-up in ["pot","flint"]',
  'interaction 1, effect 2: unknown item "fishSoup"',
  'interaction 1: unknown hand "pot"',
  'interaction 2: unknown hand "pot"',
  // Events keyed by item (got:pot) are not reported by anything; only what main.ts calls reach for, or a rule reaches, is.
  'quest 1: nothing reports the goal "got:pot"',
  // A person to meet: no way to bring one into the scene, to act on one, or to talk (and `talked:` is reached only inside the dialogue).
  'quest 3, effect 1: unknown effect "show"',
  'interaction 4: unknown target "person"',
  'interaction 4, effect 1: unknown effect "talk"',
  'quest 3: nothing reports the goal "talked:smuggler"',
  // Cooking: a lit campfire is not a thing a hand can act on, "the bag holds a fish" is not a condition, and a hand's item cannot be used up.
  'interaction 1: unknown target "campfire"',
  'interaction 2: unknown target "campfire"',
  'interaction 3: unknown target "campfire"',
  'interaction 1: unknown condition "has:fish" in when',
  'interaction 1, effect 1: unknown effect "take"',
  // The quest's corner pictures are a closed list of hand-drawn pictures (pictures.ts).
  'quest 1: unknown icon "pot"',
  'quest 2: unknown icon "pot"',
  'quest 3: unknown icon "talk"',
];

test('the Island 2 draft needs exactly what the game cannot do yet', () => {
  const goals = reportedGoals([...RULES, ...rules]);
  const found = [
    ...checkContent(quests, texts, ['crate', ...LOOSE], goals),
    ...checkRules(rules, texts, [...CODE_GOALS, ...wantedGoals(quests)]),
  ];
  assert.deepEqual([...found].sort(), [...GAPS].sort());
});

// There is no dialogue format in the game yet. This is the candidate: a graph of nodes, each saying one text, then
// offering replies, going on to another node, or ending; a node's `do` is effects like any other. Its checks are here
// so that a format can be judged by what it takes to keep it right.
interface Node { say: string; replies?: { text: string; go: string }[]; go?: string; end?: true; do?: unknown[] }
interface Dialogue { start: string; nodes: Record<string, Node> }

function checkDialogue(id: string, d: Dialogue, known: Known): string[] {
  const out: string[] = [];
  const ids = Object.keys(d.nodes);
  if (!ids.includes(d.start)) out.push(`${id}: starts at "${d.start}", which is no node`);
  const reached = new Set<string>();
  const visit = (n: string) => {
    if (reached.has(n) || !d.nodes[n]) return;
    reached.add(n);
    const node = d.nodes[n];
    [...(node.replies?.map((r) => r.go) ?? []), ...(node.go ? [node.go] : [])].forEach(visit);
  };
  visit(d.start);
  for (const [n, node] of Object.entries(d.nodes)) {
    const w = `${id}, node "${n}"`;
    if (!(node.say in known.loca)) out.push(`${w}: unknown text "${node.say}"`);
    if (!reached.has(n)) out.push(`${w}: can never be reached`);
    const exits = (node.replies?.length ? 1 : 0) + (node.go ? 1 : 0) + (node.end ? 1 : 0);
    if (exits !== 1) out.push(`${w}: needs exactly one of replies, go, end`);
    if (node.replies && (node.replies.length < 2 || node.replies.length > 3)) out.push(`${w}: offers 2 or 3 replies`);
    for (const r of node.replies ?? []) {
      if (!(r.text in known.loca)) out.push(`${w}: unknown reply text "${r.text}"`);
      if (!ids.includes(r.go)) out.push(`${w}: a reply goes to "${r.go}", which is no node`);
    }
    if (node.go && !ids.includes(node.go)) out.push(`${w}: goes to "${node.go}", which is no node`);
    if (node.do) out.push(...checkEffects(node.do, 'rule', w, known));
  }
  return out;
}

test('the draft dialogue is well formed, with effects checked like any other', () => {
  const known: Known = { loca: texts, goals: [...CODE_GOALS, ...wantedGoals(quests)], items: [] };
  for (const [id, d] of Object.entries(dialogues2)) assert.deepEqual(checkDialogue(id, d as Dialogue, known), []);
});

test('a malformed dialogue is caught', () => {
  const known: Known = { loca: texts, goals: ['talked:smuggler'], items: [] };
  const bad = checkDialogue('x', { start: 'nowhere', nodes: {
    a: { say: 'nope', replies: [{ text: 'smuggler.r.who', go: 'zzz' }] },
    b: { say: 'smuggler.who', go: 'a', end: true },
    c: { say: 'smuggler.who', do: [{ reach: 'dance' }], end: true },
  } }, known);
  for (const part of ['no node', 'unknown text "nope"', 'can never be reached', 'exactly one', 'offers 2 or 3', 'goal "dance"']) assert.ok(bad.some((l) => l.includes(part)), part);
});
