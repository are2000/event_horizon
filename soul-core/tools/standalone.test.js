// Smoke test for the generated single-file builds.
//   node tools/standalone.test.js     (skips cleanly if they were never built)
//
// The bundles are *classic* scripts, so the real signal is that they evaluate
// at all: any leftover `import`/`export` would be a SyntaxError here.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installDomStub } from './dom-stub.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const builds = [
  { file: 'standalone.html', debug: false },
  { file: 'standalone-debug.html', debug: true },
].map((b) => ({ ...b, path: path.join(root, b.file) }));

let failures = 0;
function check(name, cond, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  [' + extra + ']' : ''}`);
  if (!cond) failures++;
}

if (!builds.every((b) => fs.existsSync(b.path))) {
  console.log('SKIP  standalone builds are missing — run: npm run build');
  process.exit(0);
}

for (const build of builds) {
  console.log(`\n--- ${build.file} ---`);

  // A fresh DOM per build: each one boots a whole Game.
  const dom = installDomStub({ width: 390, height: 844, dpr: 2 });
  const html = fs.readFileSync(build.path, 'utf8');

  const start = html.indexOf('/* bundled game');
  const end = html.lastIndexOf('</script>');
  check('bundle is inlined in the page', start > 0 && end > start, '');
  if (start < 0 || end < 0) process.exit(1);
  const code = html.slice(start, end);

  // Real module specifiers would mean something failed to bundle. (JSDoc type
  // annotations look like `import('../x.js')`, so match specifiers only.)
  check('no unresolved module specifiers', !/\bfrom\s+["']\.\.?\//.test(code), '');
  check('no export statements', !/^\s*export\s+(default|const|class|function|\{)/m.test(code), '');
  check('stylesheet is inlined, not linked', !/<link rel="stylesheet"/.test(html), '');
  check('no module script tag (this is what file:// blocks)', !/<script[^>]+type="module"/.test(html), '');
  check('carries the file:// aware fatal panel',
    html.includes('fatal-hint-standalone') && html.includes('__soulcoreShowFatal'), '');
  check('fatal panel offers Reload / Play anyway / Copy error',
    html.includes('fatal-dismiss') && html.includes('fatal-copy') && html.includes('fatal-reload'), '');

  // The debug build ships an inline flag script that runs BEFORE the bundle
  // (a file:// page cannot be given a ?debug=1 query string). Assert it is
  // there, then apply it the same way the browser would.
  const hasFlag = html.includes('__SOULCORE_FORCE_DEBUG = true');
  check(build.debug ? 'ships the forced-debug flag' : 'has no forced-debug flag', hasFlag === build.debug, '');
  global.window.__SOULCORE_FORCE_DEBUG = hasFlag;

  try {
    new Function(code)();
    check('evaluates as a classic script', true, '');
  } catch (err) {
    check('evaluates as a classic script', false, err.message);
    process.exit(1);
  }

  const game = global.window.SoulCore;
  check('exposes the debug handle', !!game, '');
  check('boots to the title screen', game?.state === 'title', game?.state);
  check(`debug is ${build.debug ? 'ON' : 'OFF'} for this build`, game?.debug === build.debug, String(game?.debug));
  check('debug pad visibility follows the flag', game?.debugPad?.visible === build.debug, '');

  game._onConfirm();
  for (let i = 0; i < 60; i++) game.update(1 / 60);
  for (let i = 0; i < 5; i++) game.render(0, 1 / 60);
  check('plays 60 steps + renders 5 frames', game.state === 'playing', game.state);

  const s = game.ship;
  check('no NaN in the ship', Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.stats.heat),
    `x=${s.x.toFixed(1)} heat=${s.stats.heat.toFixed(1)}`);
  check('cargo hold (DOM) is built', !!game.inventoryUI, '');

  game.destroy();
}

console.log(`\n${failures === 0 ? 'ALL GREEN' : failures + ' FAILURE(S)'}`);
process.exit(failures ? 1 : 0);
