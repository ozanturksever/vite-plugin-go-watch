# vite-plugin-go-watch

A Vite plugin to watch Go files, rebuild the Go application on changes, run it in the background, wait for a ready signal in stdout, and trigger a Vite dev server refresh.

## Installation

```bash
npm install vite-plugin-go-watch --save-dev
```

## Usage

Add the plugin to your Vite configuration:

```javascript
// vite.config.js
import { defineConfig } from 'vite';
import goWatchPlugin from 'vite-plugin-go-watch';

export default defineConfig({
  plugins: [
    goWatchPlugin({
      // options (see below)
    })
  ]
});
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `goFile` | `string` | `"main.go"` | The main Go file to build |
| `outputBinary` | `string` | `"dist/go-app"` | Path for the compiled Go binary |
| `watchDir` | `string \| string[]` | `"."` | Directories to watch for .go file changes |
| `runArgs` | `string[]` | `[]` | Arguments for the Go binary |
| `buildArgs` | `string[]` | `[]` | Additional arguments for `go build` |
| `logPrefix` | `string` | `"[vite-plugin-go-watch]"` | Log message prefix |
| `buildDelay` | `number` | `1000` | Debounce delay for rebuilds (ms) |
| `runInitialBuild` | `boolean` | `true` | Build/run Go app on Vite start |
| `readyPattern` | `RegExp` | `null` | RegExp to match in Go app's stdout to confirm readiness |
| `readyTimeout` | `number` | `10000` | Milliseconds to wait for readyPattern before timing out |
| `preCmds` | `string[]` | `[]` | Commands to run before building |
| `remoteDebug` | `boolean` | `false` | Enable remote debugging with Delve |
| `remoteDebugPort` | `number` | `2345` | Port for Delve remote debugging |
| `dontRun` | `boolean` | `false` | Build the Go app but don't run it, just log the run command |

## Example

```javascript
// vite.config.js
import { defineConfig } from 'vite';
import goWatchPlugin from 'vite-plugin-go-watch';

export default defineConfig({
  plugins: [
    goWatchPlugin({
      goFile: 'cmd/server/main.go',
      outputBinary: 'dist/server',
      watchDir: ['cmd', 'internal', 'pkg'],
      runArgs: ['--port', '8080'],
      readyPattern: /Server started on port/,
      preCmds: ['go generate ./...']
    })
  ]
});
```

## Features

- Watches Go files for changes and rebuilds the Go application
- Runs the Go application in the background
- Waits for a ready signal in stdout before triggering a Vite dev server refresh
- Supports remote debugging with Delve
- Handles graceful shutdown of the Go process when Vite server stops

## Requirements

- Node.js >= 14.0.0
- Go installed and available in PATH
- Vite 2.x, 3.x, or 4.x

## License

MIT