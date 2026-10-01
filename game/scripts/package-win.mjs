// Packages the Windows edition as a portable x64 desktop app (no installer).
import { packager } from '@electron/packager';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const electronVersion = JSON.parse(await readFile(path.join(root, 'node_modules', 'electron', 'package.json'), 'utf8')).version;
const stage = path.join(root, 'out', 'stage');

await rm(path.join(root, 'out'), { recursive: true, force: true });
await mkdir(stage, { recursive: true });
await cp(path.join(root, 'electron', 'main.cjs'), path.join(stage, 'main.cjs'));
await cp(path.join(root, 'dist', 'windows'), path.join(stage, 'game'), { recursive: true });
await writeFile(path.join(stage, 'package.json'), JSON.stringify({
  name: 'dynamite-doll-wrestling',
  productName: 'Dynamite Doll Wrestling',
  version: pkg.version,
  description: pkg.description,
  main: 'main.cjs'
}, null, 2));

const [appPath] = await packager({
  dir: stage,
  out: path.join(root, 'out'),
  platform: 'win32',
  arch: 'x64',
  electronVersion,
  name: 'Dynamite Doll Wrestling',
  executableName: 'DynamiteDollWrestling',
  appVersion: pkg.version,
  asar: true,
  overwrite: true,
  prune: false,
  win32metadata: {
    CompanyName: 'Dynamite Doll Wrestling',
    FileDescription: 'Dynamite Doll Wrestling',
    ProductName: 'Dynamite Doll Wrestling',
    InternalName: 'DynamiteDollWrestling'
  }
});

console.log('Packaged Windows build -> ' + path.relative(root, appPath));
