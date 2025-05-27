// vite-plugin-go-watch.js
import { spawn, exec } from "child_process";
import chokidar from "chokidar";
import path from "path";
import fs from "fs"; // For ensuring output directory exists

/**
 * @typedef {Object} GoWatchPluginOptions
 * @property {string} [goFile='main.go'] - The main Go file to build.
 * @property {string} [outputBinary='dist/go-app'] - Path for the compiled Go binary.
 * @property {string | string[]} [watchDir='.'] - Directories to watch for .go file changes.
 * @property {string[]} [runArgs=[]] - Arguments for the Go binary.
 * @property {string[]} [buildArgs=[]] - Additional arguments for `go build`.
 * @property {string} [logPrefix='[vite-plugin-go-watch]'] - Log message prefix.
 * @property {number} [buildDelay=300] - Debounce delay for rebuilds.
 * @property {boolean} [runInitialBuild=true] - Build/run Go app on Vite start.
 * @property {RegExp} [readyPattern=null] - RegExp to match in Go app's stdout to confirm readiness.
 * @property {number} [readyTimeout=10000] - Milliseconds to wait for readyPattern before timing out.
 * @property {string[]} [preCmds=[]] - Commands to run before building.
 * @property {boolean} [remoteDebug=false] - Enable remote debugging with Delve.
 * @property {number} [remoteDebugPort=2345] - Port for Delve remote debugging.
 * @property {boolean} [dontRun=false] - Build the Go app but don't run it, just log the run command.
 */

/**
 * A Vite plugin to watch Go files, rebuild the Go application on changes,
 * run it in the background, wait for a ready signal in stdout, and trigger a Vite dev server refresh.
 * @param {GoWatchPluginOptions} [options={}] - Plugin options.
 * @returns {import("vite").Plugin} Vite plugin object.
 */
export default function goWatchPlugin(options = {}) {
  const {
    goFile = "main.go",
    outputBinary = "dist/go-app",
    watchDir = ".",
    runArgs = [],
    buildArgs = [],
    logPrefix = "[vite-plugin-go-watch]",
    buildDelay = 1000,
    runInitialBuild = true,
    readyPattern = null, // New option
    readyTimeout = 10000, // New option: 10 seconds default
    preCmds = [],
    remoteDebug = false, // Option for remote debugging with Delve
    remoteDebugPort = 2345, // Default port for Delve remote debugging
    dontRun = false // Option to build but not run the Go app
  } = options;

  let goProcess = null;
  let buildTimeout = null;
  let isKillingProcess = false;

  function log(message) {
    console.log(`${logPrefix} ${message}`);
  }

  /**
   * Formats the command that would be used to run the Go app
   * @param {string} binaryPath - Path to the Go binary
   * @returns {string} - The formatted command
   */
  function formatRunCommand(binaryPath) {
    if (remoteDebug) {
      return `dlv --listen=:${remoteDebugPort} --headless=true --api-version=2 --accept-multiclient exec ${binaryPath} -- ${runArgs.join(" ")}`;
    } else {
      return `${binaryPath} ${runArgs.join(" ")}`;
    }
  }

  function killGoProcess() {
    return new Promise((resolve) => {
      if (!goProcess || !goProcess.pid) {
        resolve();
        return;
      }
      const processToKill = goProcess;
      const pid = processToKill.pid;
      isKillingProcess = true;
      log(`Attempting to stop Go process (PID: ${pid})...`);
      let killTimeoutId = null;

      const cleanupAndResolve = (reason) => {
        clearTimeout(killTimeoutId);
        processToKill.removeAllListeners("exit");
        processToKill.removeAllListeners("error");
        // If stdout/stderr were piped, remove those listeners too
        if (processToKill.stdout) processToKill.stdout.removeAllListeners();
        if (processToKill.stderr) processToKill.stderr.removeAllListeners();

        log(`Go process (PID: ${pid}) has been dealt with (${reason}).`);
        if (goProcess === processToKill) {
          goProcess = null;
        }
        isKillingProcess = false;
        resolve();
      };

      processToKill.once("exit", (code, signal) => {
        cleanupAndResolve(`exited with code ${code}, signal ${signal}`);
      });
      processToKill.once("error", (err) => {
        log(`Error event from Go process (PID: ${pid}) during shutdown attempt: ${err.message}`);
        cleanupAndResolve(`error event: ${err.message}`);
      });

      log(`Sending SIGTERM to Go process (PID: ${pid}).`);
      const sigtermSent = processToKill.kill("SIGTERM");
      if (!sigtermSent) {
        log(`Failed to send SIGTERM to Go process (PID: ${pid}). It might have already exited.`);
        cleanupAndResolve("SIGTERM send failed, assumed exited");
        return;
      }

      killTimeoutId = setTimeout(() => {
        if (processToKill && !processToKill.killed) {
          log(`Go process (PID: ${pid}) did not respond to SIGTERM. Sending SIGKILL...`);
          processToKill.kill("SIGKILL");
        }
      }, 3000);
    });
  }

  function buildGoApp() {
    return new Promise((resolve, reject) => {
      const resolvedOutputBinary = path.resolve(outputBinary);
      const outputDir = path.dirname(resolvedOutputBinary);
      if (!fs.existsSync(outputDir)) {
        try {
          fs.mkdirSync(outputDir, { recursive: true });
          log(`Created output directory: ${outputDir}`);
        } catch (err) {
          log(`Error creating output directory ${outputDir}: ${err.message}`);
          reject(err);
          return;
        }
      }
      // Add -gcflags "all=-N -l" to buildArgs when remoteDebug is enabled
      const debugBuildArgs = remoteDebug ? ["-gcflags", "\"all=-N -l\""] : [];
      const commandParts = ["go", "build", ...buildArgs, ...debugBuildArgs, "-o", resolvedOutputBinary, goFile];
      const command = commandParts.join(" ");
      log(`Building Go app: ${command}`);
      exec(command, { cwd: process.cwd() }, (error, stdout, stderr) => {
        if (error) {
          log(`Go build failed: ${error.message}`);
          if (stderr) console.error(`${logPrefix} Go build stderr:\n${stderr}`);
          if (stdout) console.log(`${logPrefix} Go build stdout:\n${stdout}`);
          reject(error);
          return;
        }
        if (stderr) log(`Go build stderr (warnings or info):\n${stderr}`);
        log(`Go app built successfully: ${resolvedOutputBinary}`);
        if (stdout) log(`Go build stdout:\n${stdout}`);
        resolve(resolvedOutputBinary);
      });
    });
  }

  /**
   * Runs the Go application and waits for a ready pattern in stdout if specified.
   * @param {string} binaryPath - Absolute path to the Go binary.
   * @returns {Promise<void>} Resolves when the app is considered ready, or rejects on error/timeout.
   */
  function runGoApp(binaryPath) {
    return new Promise((resolve, reject) => {
      // Determine command and arguments based on debug mode
      let command, args;

      if (remoteDebug) {
        log(`Starting Go app in remote debug mode with Delve on port ${remoteDebugPort}`);
        command = "dlv";
        args = [
          "--listen=:" + remoteDebugPort,
          "--headless=true",
          "--api-version=2",
          "--accept-multiclient",
          "exec",
          binaryPath,
          "--",
          ...runArgs
        ];
        log(`Delve command: ${command} ${args.join(" ")}`);
      } else {
        log(`Starting Go app: ${binaryPath} ${runArgs.join(" ")}`);
        command = binaryPath;
        args = runArgs;
      }

      // If readyPattern is used, we need to pipe stdio to capture stdout.
      // Otherwise, we can inherit.
      const stdioConfig = readyPattern ? ["pipe", "pipe", "pipe"] : "inherit";

      const spawnedProcess = spawn(command, args, {
        stdio: stdioConfig,
        detached: false
      });

      let currentProcessPid = "pending";
      let readyTimeoutId = null;
      let appReady = false;

      const onSpawn = () => {
        currentProcessPid = spawnedProcess.pid;
        log(`Go app spawned (PID: ${currentProcessPid}).`);
        if (goProcess && goProcess.pid && goProcess !== spawnedProcess) {
          log(`Warning: Overwriting an existing tracked Go process (PID: ${goProcess.pid}) with new one (PID: ${currentProcessPid}).`);
        }
        goProcess = spawnedProcess;

        if (!readyPattern) { // If no pattern, resolve immediately after spawn
          appReady = true;
          resolve();
        } else {
          log(`Waiting for ready pattern "${readyPattern.toString()}" in stdout (timeout: ${readyTimeout}ms)...`);
          readyTimeoutId = setTimeout(() => {
            if (!appReady) {
              log(`Timeout: Go app (PID: ${currentProcessPid}) did not emit ready pattern within ${readyTimeout}ms.`);
              // Decide on behavior: reject or resolve with warning. For now, resolve to allow Vite reload.
              // reject(new Error(`Go app ready pattern timeout`));
              appReady = true; // Mark as "ready" to prevent further actions but with a warning
              resolve(); // Or potentially reject(new Error(...))
            }
          }, readyTimeout);
        }
      };

      spawnedProcess.on("spawn", onSpawn);

      // Create a write stream to the log file
      const logStream = fs.createWriteStream("/tmp/process.log", { flags: "a" });
      log(`Redirecting Go app output to /tmp/process.log`);

      if (readyPattern && spawnedProcess.stdout) {
        spawnedProcess.stdout.on("data", (data) => {
          const output = data.toString();
          // Write to log file instead of console
          logStream.write(output);
          if (!appReady && readyPattern.test(output)) {
            appReady = true;
            clearTimeout(readyTimeoutId);
            log(`Go app (PID: ${currentProcessPid}) is ready (matched pattern).`);
            resolve();
          }
        });
      }

      // Always pipe stderr if stdio is piped, so errors are visible
      if (stdioConfig !== "inherit" && spawnedProcess.stderr) {
        spawnedProcess.stderr.on("data", (data) => {
          // Write stderr to log file instead of console
          logStream.write(data.toString());
        });
      }

      // Close the log stream when the process exits
      spawnedProcess.on("close", () => {
        logStream.end();
      });


      spawnedProcess.on("error", (err) => {
        log(`Failed to start Go app (PID for attempt: ${currentProcessPid}): ${err.message}`);
        clearTimeout(readyTimeoutId);
        if (goProcess === spawnedProcess) goProcess = null;
        if (!appReady) reject(err); // Only reject if not already resolved as ready/timeout
      });

      spawnedProcess.on("exit", (code, signal) => {
        const exitedPid = currentProcessPid !== "pending" ? currentProcessPid : (spawnedProcess.pid || "unknown");
        clearTimeout(readyTimeoutId);
        if (goProcess === spawnedProcess) {
          if (!isKillingProcess) {
            log(`Go app (PID: ${exitedPid}) exited unexpectedly with code ${code}, signal ${signal}.`);
            // If the process died unexpectedly and we're not intentionally killing it, restart it
            if (appReady) {
              log(`Attempting to restart the Go app after unexpected exit...`);
              // Use setTimeout to avoid potential recursion issues
              setTimeout(() => {
                restartGoApp();
              }, 1000);
            }
          }
          goProcess = null;
        } else {
          if (!isKillingProcess) {
            log(`A Go process instance (PID: ${exitedPid}) exited (code ${code}, signal ${signal}), but was not the primary tracked process.`);
          }
        }
        // If the app exits before becoming ready, and we haven't resolved/rejected yet
        if (!appReady) {
          log(`Go app (PID: ${exitedPid}) exited before becoming ready.`);
          reject(new Error(`Go app exited with code ${code}, signal ${signal} before ready pattern was matched.`));
        }
      });
    });
  }

  /**
   * Executes a command as a Promise
   * @param {string} command - The command to execute
   * @returns {Promise<string>} - Resolves with stdout or rejects with error
   */
  function executeCommand(command) {
    return new Promise((resolve, reject) => {
      log(`Executing command: ${command}`);
      exec(command, { cwd: process.cwd() }, (error, stdout, stderr) => {
        if (error) {
          log(`Command failed: ${error.message}`);
          if (stderr) console.error(`${logPrefix} Command stderr:\n${stderr}`);
          reject(error);
          return;
        }
        if (stderr) log(`Command stderr (warnings or info):\n${stderr}`);
        if (stdout) log(`Command stdout:\n${stdout}`);
        log(`Command executed successfully: ${command}`);
        resolve(stdout);
      });
    });
  }

  /**
   * Executes all commands in the preCmds array sequentially
   * @returns {Promise<void>} - Resolves when all commands are executed
   */
  async function executePreCommands() {
    if (!preCmds || preCmds.length === 0) {
      return;
    }

    log(`Executing ${preCmds.length} pre-commands...`);
    for (const cmd of preCmds) {
      try {
        await executeCommand(cmd);
      } catch (error) {
        log(`Error executing pre-command "${cmd}": ${error.message}`);
        throw error; // Re-throw to stop the build process
      }
    }
    log(`All pre-commands executed successfully.`);
  }

  /**
   * Restarts the Go application after it has died unexpectedly
   */
  async function restartGoApp() {
    log("Attempting to restart the Go app after unexpected exit...");
    try {
      // Make sure any previous process is killed
      await killGoProcess();

      // Execute pre-commands before building
      await executePreCommands();

      // Build the Go app
      const binaryPath = await buildGoApp();

      if (dontRun) {
        // If dontRun is true, don't run the app, just log the command
        const runCommand = formatRunCommand(binaryPath);
        log("Go app built successfully but not running due to dontRun option. To run it manually, use the following command:");
        log(`\n${runCommand}\n`);
      } else {
        // Run the app as usual
        await runGoApp(binaryPath); // This now waits for the ready signal if configured
        log("Go app restarted and reported ready (or timed out).");
      }
    } catch (error) {
      const errorMessage = error.message || String(error);
      log(`Error during Go app restart: ${errorMessage}`);
      // Schedule another restart attempt after a delay
      log("Scheduling another restart attempt in 5 seconds...");
      setTimeout(() => {
        restartGoApp();
      }, 5000);
    }
  }

  async function rebuildAndRestartGoApp(server) {
    log("Change detected. Rebuilding and restarting Go app...");
    try {
      await killGoProcess();

      // Execute pre-commands before building
      await executePreCommands();

      const binaryPath = await buildGoApp();

      if (dontRun) {
        // If dontRun is true, don't run the app, just log the command
        const runCommand = formatRunCommand(binaryPath);
        log("Go app built successfully. To run it manually, use the following command:");
        log(`\n${runCommand}\n`);
        // Still trigger a reload to refresh the Vite dev server
        server.ws.send({ type: "full-reload", path: "*" });
      } else {
        // Run the app as usual
        await runGoApp(binaryPath); // This now waits for the ready signal if configured
        log("Go app reported ready (or timed out). Triggering Vite reload.");
        server.ws.send({ type: "full-reload", path: "*" });
      }
    } catch (error) {
      const errorMessage = error.message || String(error);
      log(`Error during Go app rebuild/restart/ready-check: ${errorMessage}`);
      if (server && server.ws) {
        server.ws.send({
          type: "error",
          err: {
            message: `Go app error: ${errorMessage}`,
            stack: error.stack || "",
            plugin: "vite-plugin-go-watch",
            id: goFile
          }
        });
      } else {
        console.error(`${logPrefix} WebSocket server not available to send error to client.`);
      }
    }
  }

  return {
    name: "vite-plugin-go-watch",
    apply: "serve",
    async configureServer(server) {
      const pathsToWatch = (Array.isArray(watchDir) ? watchDir : [watchDir])
        .map(dir => path.resolve(process.cwd(), dir, "**/*.go"));
      log(`Watching for .go file changes in: ${pathsToWatch.map(p => path.relative(process.cwd(), p)).join(", ")}`);
      const watcher = chokidar.watch(pathsToWatch, {
        ignored: /(^|[\/\\])\../,
        persistent: true, ignoreInitial: true, atomic: true,
        awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 70 }
      });
      const debouncedRebuild = () => {
        clearTimeout(buildTimeout);
        buildTimeout = setTimeout(() => rebuildAndRestartGoApp(server), buildDelay);
      };
      watcher
        .on("add", filePath => {
          log(`Go file added: ${path.relative(process.cwd(), filePath)}`);
          debouncedRebuild();
        })
        .on("change", filePath => {
          log(`Go file changed: ${path.relative(process.cwd(), filePath)}`);
          debouncedRebuild();
        })
        .on("unlink", filePath => {
          log(`Go file removed: ${path.relative(process.cwd(), filePath)}. Rebuilding...`);
          debouncedRebuild();
        });

      if (runInitialBuild) {
        log("Performing initial build and run of Go app...");
        setTimeout(() => rebuildAndRestartGoApp(server), 200);
      }
      const gracefulShutdown = async () => {
        log("Vite server shutting down. Stopping Go process...");
        await killGoProcess();
      };
      server.httpServer?.on("close", gracefulShutdown);
      process.on("SIGINT", async () => {
        await gracefulShutdown();
        process.exit(0);
      });
      process.on("SIGTERM", async () => {
        await gracefulShutdown();
        process.exit(0);
      });
    }
  };
}
