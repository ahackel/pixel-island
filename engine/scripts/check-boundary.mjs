// Fails when the engine reaches out of its own folder: a relative import that leaves it, or an absolute path into a game
// (the one allowed convention is a glob of /src/content/, where a game's own content overrides engine defaults).
// Run it from a game (`node engine/scripts/check-boundary.mjs`) or in the engine repo; it checks the folder above scripts/.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const SKIP = new Set(['node_modules', 'dist', '.git']);
const SOURCE = /\.(ts|mjs|js|css)$/;
const SPEC = /(?:\bfrom|\bimport\s*\(?|import\.meta\.glob\(|@import\s+(?:url\()?)\s*['"]([^'"]+)['"]/g;

const files = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    SKIP.has(e.name) ? [] : e.isDirectory() ? files(path.join(dir, e.name)) : SOURCE.test(e.name) ? [path.join(dir, e.name)] : []);

const bad = [];
for (const file of files(root)) {
  const text = readFileSync(file, 'utf8');
  for (const [, spec] of text.matchAll(SPEC)) {
    const where = `${path.relative(root, file)}: ${spec}`;
    if (spec.startsWith('.')) {
      const target = path.resolve(path.dirname(file), spec);
      if (target !== root && !target.startsWith(root + path.sep)) bad.push(`${where}  (leaves the engine folder)`);
    } else if (spec.startsWith('/') && !spec.startsWith('//') && !spec.startsWith('/src/content/')) {
      bad.push(`${where}  (absolute path into a game; only /src/content/ is allowed)`);
    }
  }
}
if (bad.length) {
  console.error(`Engine boundary broken:\n${bad.map((b) => '  ' + b).join('\n')}`);
  process.exit(1);
}
console.log('Engine boundary ok');
