import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';

/** Files that are served by Cloudflare but must never be precached. */
const SKIP = new Set(['_headers', '_redirects', 'sw.js']);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

/**
 * Minimal, dependency-free replacement for a PWA plugin: after the build,
 * list every output file and write `sw.js` from `scripts/sw-template.js`
 * with that precache list and a content hash as the cache version. Any
 * change to any shipped file yields a new sw.js, which triggers an update.
 */
export function serviceWorkerPlugin(): Plugin {
  let config: ResolvedConfig;
  return {
    name: 'pinochle-service-worker',
    apply: 'build',
    configResolved(c) {
      config = c;
    },
    closeBundle() {
      const outDir = resolve(config.root, config.build.outDir);
      const files = walk(outDir)
        .map((f) => relative(outDir, f).split(sep).join('/'))
        .filter((f) => !SKIP.has(f) && !f.endsWith('.map'))
        .sort();

      const hash = createHash('sha256');
      for (const f of files) {
        hash.update(f);
        hash.update(readFileSync(join(outDir, f)));
      }
      const version = hash.digest('hex').slice(0, 16);

      // '/' is the navigation fallback; index.html is fetched under that key.
      const precache = ['./', ...files.filter((f) => f !== 'index.html')];
      const template = readFileSync(resolve(config.root, 'scripts/sw-template.js'), 'utf8');
      const sw = template
        .replace('__CACHE_VERSION__', JSON.stringify(version))
        .replace('__PRECACHE__', JSON.stringify(precache));
      writeFileSync(join(outDir, 'sw.js'), sw);
    },
  };
}
