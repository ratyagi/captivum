// Bundles the TypeScript sources into extension/ so Chrome can load it unpacked.
import { build, context } from 'esbuild';
import { copyFileSync } from 'node:fs';

const watch = process.argv.includes('--watch');

const options = {
  entryPoints: {
    background: 'src/background.ts',
    reader: 'src/content/reader-entry.ts',
    panel: 'src/sidepanel/panel.ts',
  },
  outdir: 'extension',
  bundle: true,
  format: 'iife',
  target: 'chrome116',
  sourcemap: false,
  minify: false,
  logLevel: 'info',
};

function copyStatic() {
  copyFileSync('src/sidepanel/index.html', 'extension/sidepanel.html');
  copyFileSync('src/sidepanel/panel.css', 'extension/panel.css');
}

if (watch) {
  const ctx = await context(options);
  copyStatic();
  await ctx.watch();
  console.log('Watching for changes...');
} else {
  await build(options);
  copyStatic();
}
