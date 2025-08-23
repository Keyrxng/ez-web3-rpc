/* Extended benchmark adding:
   - Multiple iterations (default 5) with aggregate stats (mean, median, p95)
   - Consensus call timing (new handler fastest strategy)
   - Error rate (success ratio) for operations
   - Retry / failure counters (cooldowns, 429s, 5xx, consensus failures)
   - Legacy block divergence count (out-of-sync providers removed)
   - Cold vs warm comparison (iteration 0 = cold, excluded from warm aggregates)
   - Optional comparison of new handler strategy 'firstHealthy' (enable with BENCH_INCLUDE_FIRST_HEALTHY=1)
   - Provider churn detection (fastest variant)
   - JSON summary for automation

   Usage:
     yarn bench:compare:ext [networkId] [iterations]
   Env vars:
     NETWORK_ID=100 ITERS=10 DISABLE_WARMUP=1 BENCH_INCLUDE_FIRST_HEALTHY=1 yarn bench:compare:ext
*/

import { RPCHandler as LegacyRPCHandler } from '../types/rpc-handler';
import { RPCHandler as NewRPCHandler } from '../src/rpc-handler';
import fs from 'fs';
import path from 'path';
import type { HandlerConstructorConfig } from '../types/handler';

interface Sample { ms: number; ok: boolean; }

function stats(samples: Sample[]) {
  const ok = samples.filter(s => s.ok).map(s => s.ms);
  const count = samples.length;
  const success = ok.length;
  const failures = count - success;
  if (!ok.length) return { mean: NaN, median: NaN, p95: NaN, count, success, failures, successRatio: 0 };
  const mean = ok.reduce((a,b)=>a+b,0)/ok.length;
  const sorted = [...ok].sort((a,b)=>a-b);
  const median = sorted.length % 2 ? sorted[(sorted.length-1)/2] : (sorted[sorted.length/2 -1] + sorted[sorted.length/2])/2;
  const p95 = sorted[Math.min(sorted.length-1, Math.floor(sorted.length*0.95))];
  return { mean, median, p95, count, success, failures, successRatio: success / count };
}

interface Counters {
  cooldowns: number;
  rateLimits429: number;
  serverErrors5xx: number;
  consensusFailures: number; // failed attempts that weren't 429/5xx
  divergenceLegacy: number;  // out-of-sync provider events (legacy)
}

function newCounters(): Counters { return { cooldowns:0, rateLimits429:0, serverErrors5xx:0, consensusFailures:0, divergenceLegacy:0 }; }

async function time<T>(fn: () => Promise<T>): Promise<{ ms: number; value?: T; ok: boolean; err?: any }>{
  const start = performance.now();
  try { const value = await fn(); return { ms: performance.now()-start, value, ok: true }; }
  catch(err){ return { ms: performance.now()-start, ok:false, err }; }
}

function fmt(n: number){ if(Number.isNaN(n)) return 'NaN'; return n.toFixed(2); }

async function run(){
  const networkId = (process.env.NETWORK_ID || process.argv[2] || '1').trim();
  const iterations = +(process.env.ITERS || process.argv[3] || 5);
  const warm = !process.env.DISABLE_WARMUP;
  const includeFirstHealthy = process.env.BENCH_INCLUDE_FIRST_HEALTHY === '1';
  console.log(`[ext-bench] network=${networkId} iterations=${iterations} warmup=${warm}`);
  if (includeFirstHealthy) console.log('[ext-bench] Including firstHealthy strategy for new handler');

  const baseCfg: HandlerConstructorConfig = {
    networkId: networkId as any,
    proxySettings: { retryCount: 2, retryDelay: 75 },
    settings: { tracking: 'limited', rpcTimeout: 4000, cacheRefreshCycles: 5, browserLocalStorage: false }
  };

  // Warmup to populate caches / latency maps
  if (warm) {
    const wLegacy = new LegacyRPCHandler(baseCfg); await wLegacy.getFastestRpcProvider();
    const wNew = new NewRPCHandler({ ...baseCfg, strategy: 'fastest' }); await wNew.init();
  }

  const legacyInitTimes: Sample[] = [];
  const newFastInitTimes: Sample[] = [];
  const newFirstInitTimes: Sample[] = [];
  const legacyBlockTimes: Sample[] = [];
  const newFastBlockTimes: Sample[] = [];
  const newFirstBlockTimes: Sample[] = [];
  const legacyHeavyTimes: Sample[] = [];
  const newFastHeavyTimes: Sample[] = [];
  const newFirstHeavyTimes: Sample[] = [];
  const legacyGasTimes: Sample[] = [];
  const newFastGasTimes: Sample[] = [];
  const newFirstGasTimes: Sample[] = [];
  const consensusTimes: Sample[] = [];
  let providerUrlChangesFast = 0;
  let providerUrlChangesFirst = 0;

  const fastCounters = newCounters();
  const firstCounters = newCounters();
  const legacyCounters = newCounters();

  for (let i=0;i<iterations;i++) {
    const legacy = new LegacyRPCHandler(baseCfg);
    // monkey patch legacy log for divergence counts
    const origLegacyLog = legacy.log.bind(legacy as any);
    (legacy as any).log = (tier: any, message: string, meta?: any) => {
      if (message.includes('Detected out of sync provider')) legacyCounters.divergenceLegacy++;
      return origLegacyLog(tier, message, meta);
    };

    const newFast = new NewRPCHandler({ ...baseCfg, strategy: 'fastest' });
    const newFirst = includeFirstHealthy ? new NewRPCHandler({ ...baseCfg, strategy: 'firstHealthy' }) : null;

    // Patch logging for counters (fast)
    const patchNew = (handler: any, counters: Counters) => {
      if (!handler) return;
      const orig = handler._logProxy.bind(handler);
      handler._logProxy = (level: string, message: string, meta?: any) => {
        if (message === 'cooling down provider') counters.cooldowns++;
        else if (message === 'consensus rpc request failed') {
          const err: string = meta?.error || '';
            if (/HTTP 429/.test(err)) counters.rateLimits429++;
            else if (/HTTP 5\d\d/.test(err)) counters.serverErrors5xx++;
            else counters.consensusFailures++;
        }
        return orig(level, message, meta);
      };
    };
    patchNew(newFast, fastCounters);
    if (newFirst) patchNew(newFirst, firstCounters);

    const lInit = await time(async ()=>{ await legacy.getFastestRpcProvider(); });
    const fInit = await time(async ()=>{ await newFast.init(); });
    const fhInit = newFirst ? await time(async ()=>{ await newFirst.init(); }) : null;
    legacyInitTimes.push({ ms: lInit.ms, ok: lInit.ok });
    newFastInitTimes.push({ ms: fInit.ms, ok: fInit.ok });
    if (fhInit) newFirstInitTimes.push({ ms: fhInit.ms, ok: fhInit.ok });

    const legacyProvider = legacy.getProvider();
    const fastProvider = newFast.getProvider();
    const firstProvider = newFirst ? newFirst.getProvider() : null;
    const fastStartUrl = fastProvider.connection.url;
    const firstStartUrl = firstProvider?.connection.url;

    const heavyParam = ['latest', true];

    const lBlock = await time(()=>legacyProvider.getBlockNumber());
    const fBlock = await time(()=>fastProvider.getBlockNumber());
    const fhBlock = firstProvider ? await time(()=>firstProvider.getBlockNumber()) : null;
    legacyBlockTimes.push({ ms: lBlock.ms, ok: lBlock.ok });
    newFastBlockTimes.push({ ms: fBlock.ms, ok: fBlock.ok });
    if (fhBlock) newFirstBlockTimes.push({ ms: fhBlock.ms, ok: fhBlock.ok });

    const lHeavy = await time(()=>legacyProvider.send('eth_getBlockByNumber', heavyParam));
    const fHeavy = await time(()=>fastProvider.send('eth_getBlockByNumber', heavyParam));
    const fhHeavy = firstProvider ? await time(()=>firstProvider.send('eth_getBlockByNumber', heavyParam)) : null;
    legacyHeavyTimes.push({ ms: lHeavy.ms, ok: lHeavy.ok });
    newFastHeavyTimes.push({ ms: fHeavy.ms, ok: fHeavy.ok });
    if (fhHeavy) newFirstHeavyTimes.push({ ms: fhHeavy.ms, ok: fhHeavy.ok });

    const lGas = await time(()=>legacyProvider.getGasPrice());
    const fGas = await time(()=>fastProvider.getGasPrice());
    const fhGas = firstProvider ? await time(()=>firstProvider.getGasPrice()) : null;
    legacyGasTimes.push({ ms: lGas.ms, ok: lGas.ok });
    newFastGasTimes.push({ ms: fGas.ms, ok: fGas.ok });
    if (fhGas) newFirstGasTimes.push({ ms: fhGas.ms, ok: fhGas.ok });

    // Consensus only for fastest
    const cons = await time(()=> newFast.calls.consensus({ jsonrpc:'2.0', method:'eth_getBlockByNumber', params:['latest', false], id: 100 + i }, '0.5', { concurrency: 5, timeoutMs: 6000 }) );
    consensusTimes.push({ ms: cons.ms, ok: cons.ok });

    if (fastStartUrl !== fastProvider.connection.url) providerUrlChangesFast++;
    if (firstProvider && firstStartUrl !== firstProvider.connection.url) providerUrlChangesFirst++;
  }

  function line(name:string, legacy: Sample[], fast: Sample[], first?: Sample[]){
    const ls = stats(legacy), fs = stats(fast); const fh = first ? stats(first) : null;
    const base = `${name}\tlegacy_mean=${fmt(ls.mean)}ms median=${fmt(ls.median)} p95=${fmt(ls.p95)} succ=${ls.success}/${ls.count}(${(ls.successRatio*100).toFixed(0)}%)\tfast_mean=${fmt(fs.mean)}ms median=${fmt(fs.median)} p95=${fmt(fs.p95)} succ=${fs.success}/${fs.count}(${(fs.successRatio*100).toFixed(0)}%)`;
    console.log(first ? base + `\tfirstHealthy_mean=${fmt(fh!.mean)}ms median=${fmt(fh!.median)} p95=${fmt(fh!.p95)} succ=${fh!.success}/${fh!.count}(${(fh!.successRatio*100).toFixed(0)}%)` : base);
  }

  // Cold vs warm split (iteration 0 cold; rest warm)
  const sliceWarm = <T>(arr: T[]) => arr.slice(1);
  const cold = {
    init: { legacy: stats(legacyInitTimes.slice(0,1)), fast: stats(newFastInitTimes.slice(0,1)), first: includeFirstHealthy ? stats(newFirstInitTimes.slice(0,1)) : undefined },
  };
  const warmSets = {
    init: { legacy: stats(sliceWarm(legacyInitTimes)), fast: stats(sliceWarm(newFastInitTimes)), first: includeFirstHealthy ? stats(sliceWarm(newFirstInitTimes)) : undefined },
    block: { legacy: stats(sliceWarm(legacyBlockTimes)), fast: stats(sliceWarm(newFastBlockTimes)), first: includeFirstHealthy ? stats(sliceWarm(newFirstBlockTimes)) : undefined },
    heavy: { legacy: stats(sliceWarm(legacyHeavyTimes)), fast: stats(sliceWarm(newFastHeavyTimes)), first: includeFirstHealthy ? stats(sliceWarm(newFirstHeavyTimes)) : undefined },
    gas: { legacy: stats(sliceWarm(legacyGasTimes)), fast: stats(sliceWarm(newFastGasTimes)), first: includeFirstHealthy ? stats(sliceWarm(newFirstGasTimes)) : undefined },
  };

  console.log('\n=== Aggregate Results (All Iterations) ===');
  line('Init', legacyInitTimes, newFastInitTimes, includeFirstHealthy ? newFirstInitTimes : undefined);
  line('BlockNumber', legacyBlockTimes, newFastBlockTimes, includeFirstHealthy ? newFirstBlockTimes : undefined);
  line('HeavyBlock', legacyHeavyTimes, newFastHeavyTimes, includeFirstHealthy ? newFirstHeavyTimes : undefined);
  line('GasPrice', legacyGasTimes, newFastGasTimes, includeFirstHealthy ? newFirstGasTimes : undefined);
  const cons = stats(consensusTimes);
  console.log(`Consensus(fastest only)\tmean=${fmt(cons.mean)}ms median=${fmt(cons.median)} p95=${fmt(cons.p95)} succ=${cons.success}/${cons.count}`);
  console.log(`Provider churn fastest ${providerUrlChangesFast}/${iterations}`);
  if (includeFirstHealthy) console.log(`Provider churn firstHealthy ${providerUrlChangesFirst}/${iterations}`);
  console.log('\n=== Warm Iterations (excluding first) ===');
  console.log(`Init warm: legacy_mean=${fmt(warmSets.init.legacy.mean)} fast_mean=${fmt(warmSets.init.fast.mean)}${includeFirstHealthy?` firstHealthy_mean=${fmt(warmSets.init.first!.mean)}`:''}`);
  console.log(`Block warm: legacy_mean=${fmt(warmSets.block.legacy.mean)} fast_mean=${fmt(warmSets.block.fast.mean)}${includeFirstHealthy?` firstHealthy_mean=${fmt(warmSets.block.first!.mean)}`:''}`);
  console.log(`Heavy warm: legacy_mean=${fmt(warmSets.heavy.legacy.mean)} fast_mean=${fmt(warmSets.heavy.fast.mean)}${includeFirstHealthy?` firstHealthy_mean=${fmt(warmSets.heavy.first!.mean)}`:''}`);
  console.log(`Gas warm: legacy_mean=${fmt(warmSets.gas.legacy.mean)} fast_mean=${fmt(warmSets.gas.fast.mean)}${includeFirstHealthy?` firstHealthy_mean=${fmt(warmSets.gas.first!.mean)}`:''}`);

  console.log('\n=== Counters ===');
  const showCounters = (name: string, c: Counters) => console.log(`${name}: cooldowns=${c.cooldowns} 429=${c.rateLimits429} 5xx=${c.serverErrors5xx} otherConsensusFails=${c.consensusFailures} divergenceLegacy=${c.divergenceLegacy}`);
  showCounters('fastest', fastCounters);
  if (includeFirstHealthy) showCounters('firstHealthy', firstCounters);
  showCounters('legacy', legacyCounters);

  const json = {
    networkId,
    iterations,
    warmup: warm,
    includeFirstHealthy,
    cold,
    warm: warmSets,
    aggregateAll: {
      init: { legacy: stats(legacyInitTimes), fast: stats(newFastInitTimes), first: includeFirstHealthy ? stats(newFirstInitTimes) : undefined },
      blockNumber: { legacy: stats(legacyBlockTimes), fast: stats(newFastBlockTimes), first: includeFirstHealthy ? stats(newFirstBlockTimes) : undefined },
      heavyBlock: { legacy: stats(legacyHeavyTimes), fast: stats(newFastHeavyTimes), first: includeFirstHealthy ? stats(newFirstHeavyTimes) : undefined },
      gasPrice: { legacy: stats(legacyGasTimes), fast: stats(newFastGasTimes), first: includeFirstHealthy ? stats(newFirstGasTimes) : undefined },
      consensus: cons,
      providerChurn: { fastest: providerUrlChangesFast, firstHealthy: includeFirstHealthy ? providerUrlChangesFirst : undefined },
      counters: { fastest: fastCounters, firstHealthy: includeFirstHealthy ? firstCounters : undefined, legacy: legacyCounters }
    }
  };
  console.log('\nJSON_RESULT ' + JSON.stringify(json));

  // Markdown report (auto unless BENCH_NO_MD=1)
  if (process.env.BENCH_NO_MD !== '1') {
    try {
      const resultsDir = path.join(process.cwd(), 'benchmarks', 'results');
      if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g,'-');
      const fname = `bench-${networkId}-${iterations}iter-${ts}.md`;
      const fpath = path.join(resultsDir, fname);
      const md = buildMarkdown(json);
      fs.writeFileSync(fpath, md, 'utf-8');
      console.log(`\nWROTE_MARKDOWN ${path.relative(process.cwd(), fpath)}`);
    } catch (e) {
      console.error('Failed to write markdown report', e);
    }
  }
}

run().catch(e => { console.error('Extended benchmark failed', e); process.exit(1); });

// Build markdown summary
function buildMarkdown(j: any): string {
  const ts = new Date().toISOString();
  const hdr = `# RPC Benchmark Report\n\nGenerated: ${ts}\nNetwork: ${j.networkId}\nIterations: ${j.iterations}\nWarmup enabled: ${j.warmup}\nInclude firstHealthy: ${j.includeFirstHealthy}\n`;
  const sec = (title: string) => `\n## ${title}\n`;
  const statLine = (name: string, o: any) => `| ${name} | ${fmtSafe(o.mean)} | ${fmtSafe(o.median)} | ${fmtSafe(o.p95)} | ${o.success}/${o.count} | ${(o.successRatio*100||0).toFixed(0)}% |`;
  const init = j.aggregateAll.init;
  const block = j.aggregateAll.blockNumber;
  const heavy = j.aggregateAll.heavyBlock;
  const gas = j.aggregateAll.gasPrice;
  const consensus = j.aggregateAll.consensus;
  const counters = j.aggregateAll.counters;
  const churn = j.aggregateAll.providerChurn;
  const tableHeader = `| Metric | Mean (ms) | Median (ms) | p95 (ms) | Success | Success % |\n| ------ | --------- | ----------- | -------- | ------- | --------- |`;
  let table = tableHeader + '\n' + [
    statLine('Init legacy', init.legacy),
    statLine('Init fast', init.fast),
    j.includeFirstHealthy && init.first ? statLine('Init firstHealthy', init.first) : null,
    statLine('Block legacy', block.legacy),
    statLine('Block fast', block.fast),
    j.includeFirstHealthy && block.first ? statLine('Block firstHealthy', block.first) : null,
    statLine('Heavy legacy', heavy.legacy),
    statLine('Heavy fast', heavy.fast),
    j.includeFirstHealthy && heavy.first ? statLine('Heavy firstHealthy', heavy.first) : null,
    statLine('Gas legacy', gas.legacy),
    statLine('Gas fast', gas.fast),
    j.includeFirstHealthy && gas.first ? statLine('Gas firstHealthy', gas.first) : null,
    statLine('Consensus (fast)', consensus)
  ].filter(Boolean).join('\n');
  const coldInit = j.cold.init;
  const warmInit = j.warm.init;
  const warmBlock = j.warm.block;
  const warmHeavy = j.warm.heavy;
  const warmGas = j.warm.gas;
  const coldWarm = `| Phase | Variant | Mean | Median | p95 | Success% |\n| ----- | ------- | ---- | ------ | --- | -------- |\n` + [
    rowCW('Cold Init','legacy', coldInit.legacy),
    rowCW('Cold Init','fast', coldInit.fast),
    j.includeFirstHealthy && coldInit.first ? rowCW('Cold Init','firstHealthy', coldInit.first) : null,
    rowCW('Warm Init','legacy', warmInit.legacy),
    rowCW('Warm Init','fast', warmInit.fast),
    j.includeFirstHealthy && warmInit.first ? rowCW('Warm Init','firstHealthy', warmInit.first) : null,
    rowCW('Warm Block','legacy', warmBlock.legacy),
    rowCW('Warm Block','fast', warmBlock.fast),
    j.includeFirstHealthy && warmBlock.first ? rowCW('Warm Block','firstHealthy', warmBlock.first) : null,
    rowCW('Warm Heavy','legacy', warmHeavy.legacy),
    rowCW('Warm Heavy','fast', warmHeavy.fast),
    j.includeFirstHealthy && warmHeavy.first ? rowCW('Warm Heavy','firstHealthy', warmHeavy.first) : null,
    rowCW('Warm Gas','legacy', warmGas.legacy),
    rowCW('Warm Gas','fast', warmGas.fast),
    j.includeFirstHealthy && warmGas.first ? rowCW('Warm Gas','firstHealthy', warmGas.first) : null,
  ].filter(Boolean).join('\n');
  const ctrs = `| Variant | Cooldowns | 429 | 5xx | OtherConsensus | DivergenceLegacy |\n| ------- | --------- | --- | --- | -------------- | ---------------- |\n` + [
    rowCounters('fastest', counters.fastest),
    j.includeFirstHealthy && counters.firstHealthy ? rowCounters('firstHealthy', counters.firstHealthy) : null,
    rowCounters('legacy', counters.legacy)
  ].filter(Boolean).join('\n');
  const churnSec = `| Strategy | Churn |\n| -------- | ----- |\n` + [
    `| fastest | ${churn.fastest} |`,
    j.includeFirstHealthy && churn.firstHealthy !== undefined ? `| firstHealthy | ${churn.firstHealthy} |` : null
  ].filter(Boolean).join('\n');
  const interpretation = `### Quick Notes\n- Fast init vs legacy delta: ${(init.legacy.mean - init.fast.mean).toFixed(2)} ms improvement.\n- Consensus success ratio: ${(consensus.successRatio*100||0).toFixed(0)}%.\n- Cooldowns (fastest): ${counters.fastest.cooldowns}. Rate limits: ${counters.fastest.rateLimits429}.`;
  return [hdr, sec('Aggregate Metrics'), table, sec('Cold vs Warm Breakdown'), coldWarm, sec('Counters'), ctrs, sec('Provider Churn'), churnSec, sec('Interpretation'), interpretation, '\n'].join('\n\n');
}

function fmtSafe(n: any){
  if(n==null || Number.isNaN(n)) return 'NaN';
  return typeof n==='number'? n.toFixed(2): String(n);
}
function rowCW(phase:string, variant:string, o:any){return `| ${phase} | ${variant} | ${fmtSafe(o.mean)} | ${fmtSafe(o.median)} | ${fmtSafe(o.p95)} | ${(o.successRatio*100||0).toFixed(0)}% |`;}
function rowCounters(name:string, c:any){return `| ${name} | ${c.cooldowns} | ${c.rateLimits429} | ${c.serverErrors5xx} | ${c.consensusFailures} | ${c.divergenceLegacy} |`;}
