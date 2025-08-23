import { spawnSync } from "child_process";
// Updated to use the new RPCHandler implementation from /src
import { RPCHandler } from "../src";

class Anvil {
  rpcs: string[] = [];
  rpcHandler: RPCHandler | null = null;

  async init() {
    this.rpcHandler = new RPCHandler({
      networkId: "100", // Gnosis
      proxySettings: {
        retryCount: 3,
        retryDelay: 100,
        rpcCallTimeout: 5_000,
      },
      strategy: "fastest",
    });
    await this.rpcHandler.init();

    const latencies = this.rpcHandler.getLatencies();
    const sorted = Object.entries(latencies).sort(([, a], [, b]) => a - b);
    console.log(
      `Fetched ${sorted.length} RPCs.\nFastest: ${sorted[0][0]} (${sorted[0][1]}ms)\nSlowest: ${sorted[sorted.length - 1][0]} (${sorted[sorted.length - 1][1]}ms)`
    );
    this.rpcs = sorted.map(([url]) => url);
  }

  async run() {
    await this.init();
    console.log(`Starting Anvil...`);
    const isSuccess = await this.spawner(this.rpcs.shift());

    if (!isSuccess) {
      throw new Error(`Anvil failed to start`);
    }
  }

  async spawner(rpc?: string): Promise<boolean> {
    if (!rpc) {
      console.log(`No RPCs left to try`);
      return false;
    }

    console.log(`Forking with RPC: ${rpc}`);

    const anvil = spawnSync("anvil", ["--chain-id", "31337", "--fork-url", rpc, "--host", "127.0.0.1", "--port", "8545"], {
      stdio: "inherit",
    });

    if (anvil.status !== 0) {
      console.log(`Anvil failed to start with RPC: ${rpc}`);
      console.log(`Retrying with next RPC...`);
      return this.spawner(this.rpcs.shift());
    }

    return true;
  }
}

async function main() {
  const anvil = new Anvil();
  await anvil.run();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
