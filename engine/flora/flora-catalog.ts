import { recolorPlant, tryPlant, type Category, type Plant } from './flora.ts';
import { readStore } from '../../shared/files.ts';
import { PALETTE, type PaletteKey } from '../core/palette.ts';

/** One plant as the model wrote it, compiled. */
export interface PlantEntry {
  id: string;
  label: string;
  category: Category;
  plant: Plant;
  /** The model's JSON, unedited, for the recipe editor. */
  raw: unknown;
  repairs: string[];
}

const files = import.meta.glob<unknown[]>('./data/plant-*.json', { eager: true, import: 'default' });

const sentence = (text: string) =>
  text.split(' ').map((word, i) => (i > 0 && /^[A-Z][a-z]+$/.test(word) ? word.toLowerCase() : word)).join(' ').replace(/^./, (c) => c.toUpperCase());

function build() {
  const entries: PlantEntry[] = [];
  const rejected: { id: string; error: string }[] = [];
  for (const [path, list] of Object.entries(files)) {
    const set = path.match(/plant-([\w-]+)\.json$/)![1];
    list.forEach((raw, index) => {
      const id = `plant-${set}-${index}`;
      const result = tryPlant(raw);
      if (!result.ok) {
        rejected.push({ id, error: result.error });
        return;
      }
      const { plant, repairs } = result.compiled;
      entries.push({ id, label: sentence(plant.name), category: plant.category, plant, raw, repairs });
    });
  }
  return { entries, rejected, calls: Object.keys(files).length };
}

const built = build();
export const FLORA: PlantEntry[] = built.entries;
export const FLORA_REJECTED = built.rejected;
export const FLORA_CALLS = built.calls;
export const plantById = (id: string | null | undefined) => FLORA.find((e) => e.id === id);

/**
 * Where the flora tool keeps its work on this device. Its `custom` (per plant, the recipe as edited
 * there, as text) and `colors` (per plant, a colour swap) are read by the scene editor too, so a
 * plant looks the same in both.
 */
export const FLORA_STORE = 'island-flora';
/** A colour swap from storage: which of a plant's own colours is replaced by which. Anything that is not a palette colour is left out. */
export const cleanSwap = (swap: unknown): Partial<Record<PaletteKey, PaletteKey>> =>
  Object.fromEntries(Object.entries(swap ?? {}).filter(([from, to]) => from in PALETTE && to && (to as string) in PALETTE));

/**
 * Plants as the flora tool shows them: a recipe edited there, and colours swapped there, are kept
 * in that tool's storage and used here too. Read once per page load.
 */
const floraEdits = readStore<{ custom?: Record<string, unknown>; colors?: Record<string, unknown> } | null>(FLORA_STORE, null);
const plantCache = new Map<string, Plant>();
export function plantOf(entry: PlantEntry): Plant {
  let plant = plantCache.get(entry.id);
  if (plant) return plant;
  plant = entry.plant;
  const text = floraEdits?.custom?.[entry.id];
  if (typeof text === 'string') {
    try {
      const parsed = tryPlant(JSON.parse(text));
      if (parsed.ok) plant = parsed.compiled.plant;
    } catch {
      // A broken edit in the flora tool falls back to the original recipe, as it does there.
    }
  }
  plant = recolorPlant(plant, cleanSwap(floraEdits?.colors?.[entry.id]));
  plantCache.set(entry.id, plant);
  return plant;
}

