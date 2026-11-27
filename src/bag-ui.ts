// The bag along the bottom: a pixel slot for each thing in it, tapped to eat or to take in hand, dragged onto another
// slot to tie the two together (crafts.ts `recipeOnto`), or dragged out over the island to put the thing down. While a
// slot is dragged, the slots it goes with light up. The game's state comes in through `BagHooks`.
import { slot } from '@pixel/shared/game-ui.ts';
import { BAG_SLOTS } from './save.ts';
import { partsOf, recipeOnto, type BagItem, type Recipe } from './crafts.ts';
import type { Rows } from './rows.ts';

export interface BagHooks {
  /** What is in the bag now. */
  items(): readonly BagItem[];
  /** The thing in hand; the first of its kind in the bag shows lifted. */
  hand(): BagItem | null;
  /** Whether the survivor can use the bag now (not paused or asleep). */
  canAct(): boolean;
  picture(item: BagItem): Rows;
  /** What a slot says, for its label and tooltip. */
  words(item: BagItem): string;
  /** Tapped: eaten, if the thing is food (then true), else nothing. */
  eat(n: number, item: BagItem): boolean;
  /** Tapped and not food: taken in hand, or put away when already there. */
  hold(item: BagItem | null): void;
  /** Dropped onto a slot it ties with. */
  tie(recipe: Recipe): void;
  /** Dropped onto a thing it does not tie with. */
  noMatch(): void;
  /** Dropped out over the island, at a point on the screen. */
  putDown(n: number, x: number, y: number): void;
  /** Where the thing being dragged is shown under the finger. */
  ghostParent: HTMLElement;
}

export function bagView(h: BagHooks): { el: HTMLElement; show(): void } {
  const bag = Object.assign(document.createElement('div'), { className: 'bag' });

  /** The slot being dragged, where the drag began, the thing shown under the finger once it moved, and the slot under it. */
  let dragging: { n: number; x: number; y: number; ghost: HTMLElement | null; over?: number } | null = null;
  const slots = () => [...bag.children] as HTMLElement[];
  /** The bag slot under a point, or -1. */
  const slotAt = (x: number, y: number) => slots().findIndex((b) => { const r = b.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; });

  function show(): void {
    const items = h.items();
    const hand = h.hand();
    bag.replaceChildren(...Array.from({ length: BAG_SLOTS }, (_, n) => {
      const item = items[n];
      const b = Object.assign(document.createElement('button'), { className: 'pbtn' });
      b.append(slot(item ? h.picture(item) : null));
      // The first of the kind in hand is shown lifted.
      if (item && item === hand && items.indexOf(item) === n) b.classList.add('held');
      if (item) {
        b.addEventListener('pointerdown', (e) => { if (h.canAct()) dragging = { n, x: e.clientX, y: e.clientY, ghost: null }; });
        const words = h.words(item);
        b.setAttribute('aria-label', words);
        b.title = words;
        b.addEventListener('click', () => {
          if (!h.canAct() || h.eat(n, item)) return;
          h.hold(item === h.hand() ? null : item);
        });
      } else b.disabled = true;
      return b;
    }));
  }

  /** Lights the slots the dragged thing goes with, and under the finger the other parts it would use. */
  function markSlots(n: number | null, over = -1): void {
    const items = h.items();
    const parts = n === null ? new Set<number>() : partsOf(items, n, over);
    slots().forEach((b, m) => {
      const fits = n !== null && !!recipeOnto(items, n, m);
      b.classList.toggle('fits', fits || parts.has(m));
      b.classList.toggle('dim', n !== null && m !== n && !fits && !parts.has(m));
    });
  }

  window.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    if (!dragging.ghost && Math.hypot(e.clientX - dragging.x, e.clientY - dragging.y) > 12) {
      dragging.ghost = Object.assign(document.createElement('div'), { className: 'ghost' });
      dragging.ghost.append(slot(h.picture(h.items()[dragging.n])));
      h.ghostParent.append(dragging.ghost);
    }
    if (!dragging.ghost) return;
    dragging.ghost.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -50%)`;
    const over = slotAt(e.clientX, e.clientY);
    if (over !== dragging.over) markSlots(dragging.n, (dragging.over = over));
  });
  const endDrag = (e: PointerEvent) => {
    const d = dragging;
    dragging = null;
    if (!d?.ghost) return;
    d.ghost.remove();
    markSlots(null);
    if (e.type !== 'pointerup' || !h.canAct()) return;
    const over = slotAt(e.clientX, e.clientY);
    if (over >= 0) {
      if (over === d.n) return;
      const recipe = recipeOnto(h.items(), d.n, over);
      if (recipe) h.tie(recipe);
      else if (h.items()[over]) h.noMatch();
      return;
    }
    const r = bag.getBoundingClientRect();
    const overBag = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top - 16 && e.clientY <= r.bottom;
    if (!overBag) h.putDown(d.n, e.clientX, e.clientY);
  };
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);

  return { el: bag, show };
}
