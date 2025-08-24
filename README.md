# ez-web3-rpc — pragmatic RPC tooling for EVM stacks

[![providers](https://img.shields.io/badge/Providers-4719-blue)](https://www.npmjs.com/package/@keyrxng/ez-web3-rpc) [![chains](https://img.shields.io/badge/Chains-2332-brightgreen)](https://www.npmjs.com/package/@keyrxng/ez-web3-rpc)

🚀 Ready out of the box — 4,719 RPC providers across 2,332 chains

Small, pragmatic helpers to make working with Ethereum (Web3) JSON-RPC providers less tedious.

If your dapp, CI or infra depends on reliable chain reads/writes, this library helps you spend less time chasing flaky RPCs and copy/pasting from chainlist.

Why this exists:
- You shouldn't need to manually curate lists of public RPC URLs or rewrite retry/consensus logic for every project.
- This library keeps those concerns isolated: discover, measure, and wrap providers so your code sees a single stable, latency-ordered provider.

What you'll get:
- Fewer production incidents from transient RPC failures — calls are raced and retried in an orderly way.
- Faster warmup and more consistent latency because the handler prefers endpoints that proved faster for your network.
- Safer reads for critical checks — optional consensus helpers let you compare multiple endpoints before trusting a value.
- Minimal cognitive overhead — sensible defaults so you can get a working provider in seconds and tweak only if needed.

If that sounds useful, the rest is small glue to make it simple to adopt.

Badges
[![npm version](https://img.shields.io/npm/v/@keyrxng/ez-web3-rpc.svg)](https://www.npmjs.com/package/@keyrxng/ez-web3-rpc)
[![npm downloads](https://img.shields.io/npm/dm/@keyrxng/ez-web3-rpc.svg)](https://www.npmjs.com/package/@keyrxng/ez-web3-rpc)
[![license](https://img.shields.io/npm/l/@keyrxng/ez-web3-rpc.svg)](https://www.npmjs.com/package/@keyrxng/ez-web3-rpc)

## Install

Install like any other npm package:

```bash
npm install ez-web3-rpcs
# or
yarn add ez-web3-rpcs
```

Requires Node >= 20.10 (uses global fetch & AbortController).

## Quick start

This shows the minimal path from nothing to an RPC you can call.

```ts
import { RPCHandler } from 'ez-web3-rpcs';

const handler = new RPCHandler({ networkId: '1' });
await handler.init();
const provider = handler.getProvider();
const block = await provider.send('eth_blockNumber', []);
console.log('block', parseInt(block));
```

That's it — you now have a provider that prefers healthy, low-latency endpoints and will retry intelligently on transient failures.

## When to use it

- CI jobs validating blocks or state where a single flaky RPC would cause false negatives.
- Small services that can't afford bespoke provider orchestration but need reliable reads.
- Local tooling and reporters that want consistent latency characteristics without manual tuning.

## Core ideas (short)

- Measure: probe candidates and prefer endpoints that are in-sync and fast.
- Wrap: proxy provider calls so they race a small batch of endpoints and fall back cleanly.
- Consensus (opt-in): compare multiple successful responses for reads you can't blindly trust.

## Configuration highlights

Only `networkId` is required. Defaults are conservative so you get something useful quickly.

- strategy: pick endpoints (default `fastest`) or choose `firstHealthy` for faster initial success.
- settings.tracking: filter endpoints by declared tracking level (`none` / `limited` / `yes`).
- settings.networkRpcs: add custom/private URLs (useful for paid or local nodes).
- proxySettings.rpcCallTimeout / retryCount / retryDelay: tune retry behavior when necessary.

For advanced details, the types and options are small and documented in the source.

## Safety and privacy notes

- The library respects declared tracking metadata on endpoints so you can avoid endpoints that advertise heavy telemetry.
- Consensus helpers are designed for reads; they intentionally won't try to form a quorum from only a single RPC.

## Troubleshooting & errors

Common situations you'll see (and what they mean):
- "Provider not initialized": call `init()` before using the handler.
- "No RPC available": all probes timed out or failed — check your network/override RPCs.
- Retry exhaustion: all batches failed after configured retries.

Logs are deliberately conservative; set `settings.logLevel` to `debug` or `verbose` only while diagnosing.

## Contributing

Patches welcome. If you open a PR, keep the surface area small and tests passing.

Quick dev commands:

```bash
yarn install
yarn test:anvil # required in separate terminal
yarn test
```

## License

MIT