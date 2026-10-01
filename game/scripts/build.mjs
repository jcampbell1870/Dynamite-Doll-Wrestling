// Bundles the game into a single classic script so it runs from file:// URLs
// (Chromebook offline download) as well as inside the Electron Windows build.
import { build } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const editions = ['chromebook', 'windows'];

await rm(path.join(root, 'dist'), { recursive: true, force: true });

for (const edition of editions) {
  const out = path.join(root, 'dist', edition);
  await mkdir(out, { recursive: true });
  await build({
    entryPoints: [path.join(root, 'src', 'main.js')],
    bundle: true,
    format: 'iife',
    minify: true,
    sourcemap: false,
    target: ['chrome110', 'edge110', 'firefox115', 'safari16'],
    legalComments: 'linked',
    define: {
      __EDITION__: JSON.stringify(edition),
      __VERSION__: JSON.stringify(pkg.version)
    },
    outfile: path.join(out, 'game.js'),
    logLevel: 'warning'
  });
  await cp(path.join(root, 'src', 'index.html'), path.join(out, 'index.html'));
  await cp(path.join(root, 'src', 'styles.css'), path.join(out, 'styles.css'));
  await cp(path.join(root, 'node_modules', 'three', 'LICENSE'), path.join(out, 'THREE-LICENSE.txt'));
  console.log('Built ' + edition + ' edition -> ' + path.relative(root, out));
}

await writeFile(path.join(root, 'dist', 'version.txt'), pkg.version + '\n');
