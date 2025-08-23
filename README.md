# Web3 RPC Handler

A small, pragmatic TypeScript helper for picking, using and cross‑checking multiple public (or private) Ethereum JSON‑RPC endpoints.

It does 4 things for you:

1. Discovers & filters RPC URLs for a chain (plus any you inject) respecting your tracking/privacy preference.
2. Measures them (block sync + a known contract bytecode probe) to pick an initial provider.
3. Wraps the provider with latency‑ordered, batched retry logic (races fastest 3 at a time, with timeouts) so transient failures/rate limits hurt less.
4. (Optional) Runs lightweight quorum / BFT style consensus checks across many RPCs when you really care about result integrity.

No magic. Just a bit of glue you would otherwise rewrite.

---
## Install

```bash
npm install web3-rpcs
# or
yarn add web3-rpcs
```

Requires Node >= 20.10 (uses global fetch & AbortController).

---
## Quick Start

```ts
import { RPCHandler } from 'web3-rpcs';

const handler = new RPCHandler({
  networkId: '1',                 // chain id as string for autocomplete (ships with 2k+ chains)
});

await handler.init(); 
const provider = handler.getProvider(); 
const block = await provider.send('eth_blockNumber', []); 
console.log('block', parseInt(block));
```
---
## Strategies

- fastest (default): measure all candidates in parallel then pick the lowest latency among those that are in‑sync and return valid bytecode for a known contract (currently Permit2). Stores latencies for ordered retries.
- firstHealthy: shuffle the list and pick the first endpoint that passes a single health probe (useful when you just need something alive quickly, maybe with fewer concurrent outbound requests).

---
## Consensus Calls (Optional)

Some RPC methods (e.g. state reads right after a reorg, or endpoints behind different archive nodes) can disagree briefly. For critical reads you can ask a quorum of endpoints:

```ts
import type { JsonRpcRequest } from 'web3-rpcs/calls';

const req: JsonRpcRequest = { jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 };
const value = await handler.calls.consensus(req, '0.60', { concurrency: 5 });
// requires >=60% identical responses among processed successes
```

Need to be more forgiving? Use BFT descent:

```ts
const majority = await handler.calls.bftConsensus(req, '0.90', '0.50');
// Tries 90%, 85%, 80% ... down to 50% on the SAME collected result set.
```

Features:
- Stable structural comparison (objects get JSON sorted by keys so different key order still matches).
- Per‑endpoint cooldown after 429 / 5xx with exponential backoff so you do not keep hammering rate‑limited nodes.
- Early abort (for basic consensus) once a quorum is mathematically unreachable or already satisfied.

If you only have one RPC url, consensus will purposely throw (can’t form a quorum).

---
## Retry Wrapper

Every `provider.send` (or any method off the underlying `JsonRpcProvider`) is proxied:
- Keeps an ordered list: fastest -> slowest from the last measurement.
- Races up to 3 endpoints at a time (batch) for the call.
- On batch failure backs off (`retryDelay`) then moves to next batch.
- Loops `retryCount` times through all batches before throwing.
- Adds per call hard timeout (`rpcCallTimeout`) so a hung node doesn’t stall your entire request path.

You still get a normal `JsonRpcProvider` interface.

---
## Configuration Summary

The only required param is the `NetworkId`.

HandlerConstructorConfig (abridged):
- `networkId`: string (chain id)
- `strategy`?: 'fastest' | 'firstHealthy'
- `settings.tracking`: 'none' | 'limited' | 'yes' (filters providers by declared tracking footprint)
- `settings.networkRpcs`: custom `Rpc[]` you inject (localhost, private, paid)
- `settings.rpcTimeout`: ms for initial latency tests
- `settings.browserLocalStorage`: persist latencies in the browser
- `settings.logLevel`: 'none' | 'error' | 'info' | 'debug' | 'verbose'
- `proxySettings.retryCount / retryDelay / rpcCallTimeout`: retry behavior

Rpc shape:
```ts
{ url: string; tracking?: 'none' | 'limited' | 'yes'; trackingDetails?: string; isOpenSource?: boolean; }
```

---
## Privacy / Tracking Filter

Public RPC lists sometimes include commercial endpoints that collect more telemetry. You choose your comfort level via `settings.tracking`:
- none: only endpoints explicitly marked as "none"
- limited: allows those marked "limited" or "none"
- yes: no filtering

This reduces accidental leakage for highly sensitive tooling and is especially useful when prototyping in browsers.

---
## Persisted Latencies (Browser Only)

If `browserLocalStorage: true`, the latency map is stored under key `rpcLatencies-<networkId>` so reloads don’t trigger a full warmup every time. Fallback to in‑memory otherwise.


## Error Handling

Common throws:
- Provider not initialized (call `init` first)
- No RPC available / fastest not found (all probes failed / timed out)
- Consensus: "No RPCs available", "Only one RPC available", or quorum failure messages
- Retry exhaustion after all batches & cycles fail

All retries & consensus failures emit structured logs when `logLevel` >= appropriate threshold.

---
## Logging

A tiny logger with levels & symbols. Set `logLevel` to `none` in production if you centralize logs elsewhere. `verbose` sprays everything (including per attempt debug). `ok` internal level is normalized to `info` for output.

---
## Contributing

Open to PRs that keep the surface minimal.

Clone, install, test:
```bash
yarn install
yarn test
```

Lint & format:
```bash
yarn format
```

Benchmarks (optional local anvil setup required):
```bash
yarn bench:compare
```

---
## License

MIT

---
## FAQ (Quick)

Q: Write requests safe behind retry race?  
A: Nonce & chain rules make duplicated state changes unlikely; still, consensus helpers are read‑oriented.

Q: Can I plug my own selection strategy?  
A: Not yet but I welcome new feature requests.

---
Plain, small, dependency‑light. Use what you need, ignore the rest.