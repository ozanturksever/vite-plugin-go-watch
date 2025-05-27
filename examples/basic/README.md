# Basic Example: Vite + Go

This is a basic example of using `vite-plugin-go-watch` to integrate a Go backend with a Vite frontend.

## Structure

- `vite.config.js` - Vite configuration with the Go watch plugin
- `main.go` - Simple Go HTTP server
- `index.html` - HTML frontend
- `main.js` - JavaScript to interact with the Go backend

## Running the Example

1. Make sure you have Go and Node.js installed

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the Vite dev server:
   ```bash
   npx vite
   ```

4. The plugin will:
   - Build the Go application
   - Run it in the background
   - Watch for changes to Go files
   - Rebuild and restart the Go app when changes are detected
   - Trigger a Vite reload when the Go app is ready

5. Open your browser at http://localhost:5173

6. Click the "Fetch from Go API" button to test the connection to the Go backend

## Making Changes

Try making changes to the Go code (e.g., change the response message in `main.go`). The plugin will:

1. Detect the change
2. Rebuild the Go application
3. Restart the Go server
4. Reload the Vite dev server

This provides a seamless development experience when working with Go backends and Vite frontends.