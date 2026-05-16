import { loadBridgeConfig } from "./config.js";
import { BridgeRuntime } from "./runtime.js";

const runtime = new BridgeRuntime(loadBridgeConfig(), {
  onLog: (entry) => {
    const line = entry.data ? `${entry.message} ${JSON.stringify(entry.data)}` : entry.message;
    if (entry.level === "error") {
      console.error(line);
      return;
    }
    console.log(line);
  }
});

runtime.start();

function shutdown() {
  runtime.stop();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
