// Smoke test for the generated single-file build.
//   node tools/standalone.test.js     (skips cleanly if it was never built)
//
// The bundle is a *classic* script, so the real signal is that it evaluates
// at all: any leftover `import`/`export` would be a SyntaxError here.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installDomStub } from './dom-stub.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'standalone.html');

let failures = 0;
function check(name, cond, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  [' + extra + ']' : ''}`);
  if (!cond) failures++;
}

if (!fs.existsSync(file)) {
  console.log('SKIP  standalone.html is not built — run: npm run build');
  process.exit(0);
}

const dom = installDomStub({ width: 390, height: 844, dpr: 2 });
const html = fs.readFileSync(file, 'utf8');

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

game._onConfirm();
for (let i = 0; i < 60; i++) game.update(1 / 60);
for (let i = 0; i < 5; i++) game.render(0, 1 / 60);
check('plays 60 steps + renders 5 frames', game.state === 'playing', game.state);

const s = game.ship;
check('no NaN in the ship', Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.stats.heat),
  `x=${s.x.toFixed(1)} heat=${s.stats.heat.toFixed(1)}`);
check('cargo hold (DOM) is built', !!game.inventoryUI, '');
check('debug pad is built', !!game.debugPad, '');

console.log(`\n${failures === 0 ? 'ALL GREEN' : failures + ' FAILURE(S)'}`);
process.exit(failures ? 1 : 0);
