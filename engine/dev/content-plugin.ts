import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

/** Server-side checks for files whose shape matters, by file name. Others only have to be JSON. */
const rows = (v: unknown) => Array.isArray(v) && v.length <= 8 && v.every((r) => typeof r === 'string' && r.length <= 12 && /^[.ICTM%e]*$/.test(r));
export const VALIDATORS: Record<string, (data: any) => boolean> = {
  'face-shapes.json': (data) =>
    data && typeof data === 'object' && ['eyes', 'mouths', 'brows'].every((k) => data[k] && typeof data[k] === 'object') &&
    Object.values(data.eyes).every((view: any) => Object.values(view).every((shape: any) => Object.values(shape).every(rows))) &&
    Object.values(data.mouths).every((view: any) => Object.values(view).every(rows)) &&
    Object.values(data.brows).every((view: any) => Object.values(view).every((style: any) => Object.values(style).every(rows))),
};

/** Only plain relative `a/b-c.json` names: no `..`, no absolute paths, no dot files. */
const NAME = /^[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)*\.json$/i;

/**
 * Lets the editors save into the project while developing: `POST /__save/<name>.json` writes the JSON body to
 * `<dir>/<name>.json`, and `DELETE /__save/<name>.json` removes that file (a scene saved under a name it no longer
 * has). A game passes its content folder (`src/content`), so everything an editor saves is a file in the game's repo
 * to commit. Dev server only: the published build has no such endpoint and `import.meta.env.DEV` is
 * false there. The editor already shows what it saved, so its own saves do not reload the page; an edit by hand still does.
 */
export function contentSave(options: { dir: string }): Plugin {
  const written = new Map<string, string>();
  /** Files the editors removed: their going does not reload the page either. */
  const removed = new Set<string>();
  let root = process.cwd();
  return {
    name: 'content-save',
    configResolved: (config) => void (root = config.root),
    // Vite 6 and later: called for files made, changed and removed. A folder read with import.meta.glob would otherwise
    // reload the page when the editor adds a file to it or removes one; last, so it comes after Vite's own glob update.
    hotUpdate: {
      order: 'post',
      handler({ type, file, read }) {
        if (type === 'delete') return removed.has(file) ? [] : undefined;
        const text = written.get(file);
        if (text === undefined) return;
        return Promise.resolve(read()).then((now) => (now === text ? [] : undefined));
      },
    },
    // Older Vite: called for changed files only.
    handleHotUpdate({ file, read }) {
      if (removed.has(file) && !existsSync(file)) return [];
      const text = written.get(file);
      if (text === undefined) return;
      return Promise.resolve(read()).then((now) => (now === text ? [] : undefined));
    },
    configureServer(server) {
      const base = path.resolve(root, options.dir);
      server.middlewares.use('/__save', (req, res) => {
        if (req.method !== 'POST' && req.method !== 'DELETE') return void ((res.statusCode = 405), res.end());
        const name = decodeURIComponent((req.url ?? '').split('?')[0].slice(1));
        const file = path.resolve(base, name);
        if (!NAME.test(name) || !file.startsWith(base + path.sep)) return void ((res.statusCode = 400), res.end('bad name'));
        if (req.method === 'DELETE') {
          try {
            written.delete(file);
            removed.add(file);
            if (existsSync(file)) unlinkSync(file);
            res.end('ok');
          } catch (error) {
            res.statusCode = 500;
            res.end(String(error));
          }
          return;
        }
        removed.delete(file);
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
          if (body.length > 5_000_000) req.destroy();
        });
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            const valid = VALIDATORS[path.basename(name)];
            if (valid && !valid(data)) throw new Error(`not a ${path.basename(name)}`);
            const text = JSON.stringify(data, null, 1) + '\n';
            mkdirSync(path.dirname(file), { recursive: true });
            written.set(file, text);
            writeFileSync(file, text);
            res.end('ok');
          } catch (error) {
            res.statusCode = 400;
            res.end(String(error));
          }
        });
      });
    },
  };
}
