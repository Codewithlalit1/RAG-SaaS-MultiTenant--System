// esbuild bundler for the widget.
// Output: dist/widget.min.js  (target <20 KB gzipped)
//
// Usage:
//   node build.js           # one-shot build
//   node build.js --watch   # rebuild on file change (dev)

const esbuild = require('esbuild');
const path    = require('path');
const fs      = require('fs');

const watch   = process.argv.includes('--watch');
const outfile = path.join(__dirname, 'dist', 'widget.min.js');

// Ensure dist/ exists
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });

const ctx = esbuild.context({
  entryPoints: [path.join(__dirname, 'src', 'widget.js')],
  outfile,
  bundle:   true,
  minify:   true,
  format:   'iife',   // self-executing — safe to drop into any page
  target:   ['es2017', 'chrome70', 'firefox65', 'safari12'],
  logLevel: 'info',
});

ctx.then(async (c) => {
  await c.rebuild();

  const bytes = fs.statSync(outfile).size;
  console.log(`✓ dist/widget.min.js  ${(bytes / 1024).toFixed(1)} KB`);

  if (bytes > 20 * 1024) {
    console.warn(`⚠  bundle exceeds 20 KB target (${(bytes / 1024).toFixed(1)} KB)`);
  }

  if (watch) {
    console.log('Watching for changes…');
    await c.watch();
  } else {
    await c.dispose();
  }
}).catch(() => process.exit(1));
