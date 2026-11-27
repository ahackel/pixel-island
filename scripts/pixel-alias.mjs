// Lets `node --test` resolve Vite's `@pixel/*` alias (vite.config.ts) to the vendored engine, so game modules that
// import the engine can be tested as they are. Used by `npm test`: `node --import ./scripts/pixel-alias.mjs --test`.
import { register } from 'node:module';

register('data:text/javascript,' + encodeURIComponent(`
  const ENGINE = ${JSON.stringify(new URL('../engine/', import.meta.url).href)};
  export function resolve(spec, context, next) {
    return next(spec.startsWith('@pixel/') ? ENGINE + spec.slice('@pixel/'.length) : spec, context);
  }
`));
