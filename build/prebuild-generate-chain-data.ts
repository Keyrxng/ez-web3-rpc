import fs, { writeFile } from "fs/promises";
import path from "path";
import { pathToFileURL } from "url";

/**
 * Small prebuild script to generate an aggregated chain list 
 * as chainlist' is not frictionless.
 * 
 * Effectively does the same as chainlist's `generateChainData()` method
 * but is decoupled from changes in their logic but uses the same data
 * source and structure.
 *
 * - reads additionalChainRegistry/*.js (their `export const data = {}`)
 * - reads extraRpcs.js and llamaNodesRpcs.js
 * - fetches upstream chain list and DefiLlama TVLs
 * - merges, dedupes, populates tvl and chainSlug
 * - writes build/generated-chains.json
 */

const ROOT = process.cwd();
const CONSTANTS_DIR = path.join(ROOT, "lib", "chainlist", "constants");
const REGISTRY_DIR = path.join(CONSTANTS_DIR, "additionalChainRegistry");
const OUT_FILE = path.join(ROOT, "build", "generated-chains.json");

async function dynamicImport(filepath: string) {
  const url = pathToFileURL(filepath).href;
  const mod = await import(url);
  return mod;
}

function removeEndingSlash(url: string) {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function normalizeRpcEntry(rpc: any) {
  if (typeof rpc === "string") {
    const s = rpc.trim();
    if (isCommentedString(s)) return null;
    if (containsApiKey(s)) return null;
    return { url: removeEndingSlash(s) };
  }
  const url = rpc?.url;
  if (!url || containsApiKey(String(url))) return null;
  return { ...rpc, url: removeEndingSlash(String(rpc.url)) };
}

function isCommentedString(value: string) {
  if (typeof value !== "string") return false;
  const t = value.trim();
  return t.startsWith("//") || t.startsWith("/*") || t.startsWith("#");
}

function containsApiKey(url: string) {
  if (typeof url !== "string") return false;
  // common patterns: ${INFURA_API_KEY}, ${SOMETHING_API_KEY}, query params like ?api_key= or &key=
  return /\$\{[A-Z0-9_]+_?API_KEY\}|\bapi[_-]?key\b|\bapiKey\b|[?&](api_key|apiKey|key|auth)=/i.test(url);
}


/**
 * The problem is that chainlist relies on build artifacts to run their
 * overrides process during `generateChainData()`. We side step their
 * build system by directly reading the source files and extracting the
 * relevant data ourselves.
 */
async function loadOverrides() {
  const files = await fs.readdir(REGISTRY_DIR);
  const chainFiles = files.filter((f) => f.startsWith("chainid-") && f.endsWith(".js"));
  const overrides: any[] = [];
  for (const file of chainFiles) {
    const full = path.join(REGISTRY_DIR, file);
    try {
      const mod = await dynamicImport(full);
      const data = mod?.data ?? mod?.default;
      if (data) overrides.push(data);
    } catch (err) {
      console.warn(`warning: failed to import override ${file}: ${err}`);
    }
  }
  return overrides;
}

/**
 * Imports fail due to ESM/CJS incompatibility so we
 * extract the hardcoded data to avoid the merging and dynamic imports.
 */
async function getExtraRpcs() {
  let extraRpcs: Record<number, {rpcs: []}> = {};
  const text = await fs.readFile(path.join(CONSTANTS_DIR, "extraRpcs.js"), "utf8");
  // remove the first and last 4 lines (imports, exports)
  const lines = text.split("\n");
  const cleaned = lines.slice(4, -4).join("\n").replace("export ", "");
  /**
   * It currently looks like:
   * 
   * const privacyStatements = {...}
   *
   * const extraRpcs = {
   *  1: {
   *    url: "https://rpc.1.com",
   *    description: "RPC for chain 1",
   *    privacyStatement: privacyStatements.example,
   *  },
   * };
   */

  const newMethodReturningExtraRpcsObj = 
    `function getExtraRpcs(){
      ${cleaned}
      return extraRpcs;
    }`;

  try {
    extraRpcs = eval(newMethodReturningExtraRpcsObj + "\n getExtraRpcs();");
  } catch (err) {
    console.warn(`warning: failed to evaluate extraRpcs: ${err}`);
  }

  return extraRpcs;
}

export async function generateChainData() {
  console.log("prebuild: generating chain list...");

  const extraRpcs = await getExtraRpcs();
  const llamaMod = await dynamicImport(path.join(CONSTANTS_DIR, "llamaNodesRpcs.js"));
  const chainIdsMod = await dynamicImport(path.join(CONSTANTS_DIR, "chainIds.js"));

  const llamaNodes = llamaMod?.llamaNodesRpcs ?? llamaMod?.default ?? llamaMod;
  const chainIds = chainIdsMod?.default ?? chainIdsMod;

  const overrides = await loadOverrides();

  // fetch upstream same sources chainlist uses
  const fetchImpl = globalThis.fetch ?? (await import("node-fetch")).default;
  const [chainsRes, llamaRes] = await Promise.all([
    fetchImpl("https://chainid.network/chains.json").then((r: any) => r.json()),
    fetchImpl("https://api.llama.fi/chains").then((r: any) => r.json()),
  ]);

  const chainTvls = Array.isArray(llamaRes) ? llamaRes : [];

  const overwrittenIds = overrides.reduce((acc: Record<number, boolean>, c: any) => {
    acc[c.chainId] = true;
    return acc;
  }, {});

  // Build merged list (drop deprecated and overwritten upstream entries)
  const filtered = (Array.isArray(chainsRes) ? chainsRes : [])
    .filter((c: any) => c.status !== "deprecated" && !overwrittenIds[c.chainId]);

  const merged = filtered.concat(overrides);

  // populate RPCs, tvl, chainSlug, etc.
  const populated = merged.map((chain: any) => {
    const rpcsFromExtra = (extraRpcs?.[chain.chainId]?.rpcs ?? []).map(normalizeRpcEntry).filter(Boolean);

    let rpcs = [...rpcsFromExtra];

    for (const rpcUrl of chain.rpc ?? []) {
      const rpc = normalizeRpcEntry(rpcUrl);
      if (!rpc || (rpc && !("url" in rpc))) continue;
      if (rpc.url.includes("${INFURA_API_KEY}")) continue;
      if (!rpcs.find((r) => r.url === rpc.url)) rpcs.push(rpc);
    }

    // also prefer llamaNodes RPCs if present (merge at front)
    if (llamaNodes?.[chain.chainId]?.rpcs) {
      const l = llamaNodes[chain.chainId].rpcs.map(normalizeRpcEntry).filter(Boolean);
      // put them first, but dedupe
      for (const entry of l) {
        if (!rpcs.find((r) => r.url === entry.url)) rpcs.unshift(entry);
      }
    }

    chain.rpc = rpcs;

    const chainSlug = chainIds?.[chain.chainId];
    if (chainSlug !== undefined) {
      const defiChain = chainTvls.find((c: any) => c.name.toLowerCase() === chainSlug);
      if (defiChain) {
        chain.tvl = defiChain.tvl;
        chain.chainSlug = chainSlug;
      }
    }

    return chain;
  });

  // sort by tvl desc (missing tvl -> 0)
  populated.sort((a: any, b: any) => (b.tvl ?? 0) - (a.tvl ?? 0));

  // write out
  await fs.writeFile(OUT_FILE, JSON.stringify(populated, null, 2), "utf8");
  console.log(`prebuild: wrote ${OUT_FILE}`);
  const providerCount = populated.flatMap((c) => c.rpc ?? []).length;
  console.log(`prebuild: found ${providerCount} RPC providers across ${populated.length} chains`);
}