/**
 * build-standalone.mjs
 * ----------------------------------------------------------------------------
 * Bundle the whole game into ONE self-contained HTML file: `standalone.html`,
 * plus `standalone-debug.html` (same file, debug overlay + pad forced on).
 *
 *   npm run build
 *
 * Why it exists: the real game is 45 ES modules, which means it needs an
 * http(s) origin — `file://` is blocked by CORS, and the GitHub mobile app
 * renders files, it does not execute them. A single classic-script file has
 * neither problem: download it, email it to yourself, drop it on any host, or
 * open it straight from the phone's file manager and it just runs.
 *
 * Trade-offs, stated so nobody is surprised:
 *  - It is a GENERATED artifact. Edit `src/`, then re-run `npm run build`.
 *  - No web manifest, so "Add to Home Screen" needs the normal `index.html`
 *    served over http(s) (that is where the manifest lives).
 *  - esbuild is NOT a dependency of this project (the game ships zero deps);
 *    the command below fetches it on demand via npx.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entry = path.join(root, 'src', 'main.js');
const tmpJs = path.join(root, '.standalone.bundle.js');

function bundle() {
  const local = path.join(root, 'node_modules', '.bin', 'esbuild');
  if (fs.existsSync(local)) {
    execFileSync(local, [entry, '--bundle', '--format=iife', '--target=es2020', `--outfile=${tmpJs}`], { stdio: 'inherit' });
  } else {
    execFileSync('npx', ['--yes', 'esbuild', entry, '--bundle', '--format=iife', '--target=es2020', `--outfile=${tmpJs}`], { stdio: 'inherit' });
  }
  return fs.readFileSync(tmpJs, 'utf8');
}

function main() {
  const js = bundle();
  const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
  let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

  // Inline the stylesheet...
  html = html.replace('  <link rel="stylesheet" href="style.css" />', `  <style>\n${css}\n  </style>`);

  // ...and the bundle, replacing the module script (no imports => file:// safe).
  const moduleTag = '  <script type="module" src="src/main.js"></script>';
  if (!html.includes(moduleTag)) throw new Error('index.html changed: no module script tag to replace');
  html = html.replace(moduleTag, `  <script>\n  /* bundled game — generated, do not edit */\n${js}\n  </script>`);

  // The manifest / icon files are not part of a single file, so drop the links
  // rather than ship a page that 404s on them.
  for (const line of [
    '  <link rel="manifest" href="manifest.webmanifest" />\n',
    '  <link rel="icon" href="icon-192.png" />\n',
    '  <link rel="apple-touch-icon" href="icon-192.png" />\n',
    '  <meta name="apple-mobile-web-app-title" content="Soul Core" />\n',
  ]) html = html.replace(line, '');

  const banner = [
    '  <!--',
    '    GENERATED FILE — do not edit. Rebuild with:  npm run build',
    '    CSS + all modules inlined; no imports, so it runs from file:// too.',
    '    No web manifest here: "Add to Home Screen" needs the served index.html.',
    '  -->',
  ].join('\n');
  html = html.replace('</head>', `${banner}\n</head>`);

  // Two flavours: clean, and one with the debug overlay + pad pre-enabled
  // (an offline file cannot be given a ?debug=1 query string).
  const forceDebug = '  <script>window.__SOULCORE_FORCE_DEBUG = true;</script>\n';
  const debugBuild = html.replace('  <script>\n  /* bundled game',
    forceDebug + '  <script>\n  /* bundled game');
  if (debugBuild === html) throw new Error('could not inject the debug flag');

  fs.writeFileSync(path.join(root, 'standalone.html'), html);
  fs.writeFileSync(path.join(root, 'standalone-debug.html'), debugBuild);
  fs.unlinkSync(tmpJs);
  console.log(`standalone.html        ${(html.length / 1024).toFixed(0)} kb`);
  console.log(`standalone-debug.html  ${(debugBuild.length / 1024).toFixed(0)} kb  (debug overlay + pad on)`);
}

main();
