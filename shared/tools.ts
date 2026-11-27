// The pages of the dev tools, for the pixel header's switcher. `icon` is a name of the pixel icon library (ui/icons.json).
export type ToolId = 'home' | 'wardrobe' | 'parts' | 'animals' | 'props' | 'objects' | 'flora' | 'walls' | 'particles' | 'scene' | 'icons' | 'ui';
export const TOOLS: { id: ToolId; icon: string; name: string }[] = [
  { id: 'home', icon: 'home', name: 'Home' },
  { id: 'wardrobe', icon: 'clothes', name: 'Wardrobe' },
  { id: 'parts', icon: 'scissors', name: 'Parts' },
  { id: 'animals', icon: 'paw', name: 'Animals' },
  { id: 'props', icon: 'tool', name: 'Props' },
  { id: 'objects', icon: 'chair', name: 'Objects' },
  { id: 'flora', icon: 'sprout', name: 'Flora' },
  { id: 'walls', icon: 'wall', name: 'Walls' },
  { id: 'particles', icon: 'sparks', name: 'Particles' },
  { id: 'scene', icon: 'mountain', name: 'Scene' },
  { id: 'icons', icon: 'pencil', name: 'Icons' },
  { id: 'ui', icon: 'grid', name: 'Interface' },
];

/** Where a page is, written from this page's own address (so a missing trailing slash or a game serving the tools under /engine does not matter). */
export function toolHref(id: ToolId): string {
  const path = location.pathname;
  const at = path.indexOf('/tools/');
  const root = at >= 0 ? path.slice(0, at + 1) : path.replace(/[^/]*$/, '');
  return id === 'home' ? root : `${root}tools/${id}/`;
}
