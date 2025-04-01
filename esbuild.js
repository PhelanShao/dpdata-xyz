const esbuild = require('esbuild');
const { join } = require('path');

const isProduction = process.argv.includes('--production');
const isWatch = process.argv.includes('--watch');

// Configure esbuild
const config = {
  entryPoints: [join('src', 'extension.ts')],
  bundle: true,
  outfile: join('dist', 'extension.js'),
  external: ['vscode'],
  platform: 'node',
  target: 'node16',
  sourcemap: !isProduction,
  minify: isProduction,
  logLevel: 'info',
};

async function build() {
  try {
    if (isWatch) {
      const context = await esbuild.context(config);
      await context.watch();
      console.log('Watching for changes...');
    } else {
      await esbuild.build(config);
    }
  } catch (err) {
    process.exit(1);
  }
}

build();
