const esbuild = require('esbuild');

esbuild.build({
  entryPoints: ['src/ecv-player.js'],
  bundle: true,
  minify: true,
  format: 'iife',
  outfile: 'dist/player.js',
  target: ['es2020'],
  define: {
    'process.env.NODE_ENV': '"production"'
  }
}).then(() => {
  console.log('Player built successfully → dist/player.js');
}).catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
