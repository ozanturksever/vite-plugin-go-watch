// vite.config.js
import { defineConfig } from 'vite';
import goWatchPlugin from '../../vite-plugin-go-watch.js';

export default defineConfig({
  plugins: [
    goWatchPlugin({
      goFile: 'main.go',
      outputBinary: 'dist/app',
      watchDir: '.',
      runArgs: ['--port', '8080'],
      readyPattern: /Server started/,
      buildDelay: 500
    })
  ]
});