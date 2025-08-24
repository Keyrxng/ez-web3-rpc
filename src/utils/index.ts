import { NETWORK_FAUCETS } from "../../dynamic";
import { networkIds, networkNames, networkExplorers, networkRpcs, networkCurrencies } from "../../types/constants";
import { NetworkId, NetworkName } from "../../types/handler";

function getNetworkName(networkId: NetworkId) {
  const networkName = networkIds[networkId];
  if (!networkName) {
    console.error(`Unknown network ID: ${networkId}`);
  }
  return networkName ?? "Unknown Network";
}

function getNetworkId(networkName: NetworkName) {
  const networkId = networkNames[networkName];
  if (!networkId) {
    console.error(`Unknown network name: ${networkName}`);
  }
  return networkId ?? -1;
}

function getNetworkFaucets(networkId: NetworkId) {
  const faucets = NETWORK_FAUCETS[networkId];
  if (!faucets) {
    console.error(`There may not be any faucets for network ID: ${networkId}`);
  }
  return faucets ?? [];
}

function getNetworkExplorer(networkId: NetworkId) {
  const explorers = networkExplorers[networkId];
  if (!explorers) {
    console.error(`There may not be any explorers for network ID: ${networkId}`);
  }
  return explorers ?? [];
}

function getNetworkRpcs(networkId: NetworkId) {
  const rpcs = networkRpcs[networkId];
  if (!rpcs) {
    console.error(`There may not be any RPCs for network ID: ${networkId}`);
  }
  return rpcs ?? [];
}

function getNetworkCurrency(networkId: NetworkId) {
  const currency = networkCurrencies[networkId];
  if (!currency) {
    console.error(`There may not be a currency for network ID: ${networkId}`);
  }
  return currency ?? { name: "Unknown Token", symbol: "UNK", decimals: 18 };
}

function getNetworkData(networkId: NetworkId) {
  return {
    name: getNetworkName(networkId),
    id: networkId,
    rpcs: getNetworkRpcs(networkId),
    currency: getNetworkCurrency(networkId),
    explorers: getNetworkExplorer(networkId),
    faucets: getNetworkFaucets(networkId),
  };
}

/**
 * Prune runtime dynamic objects to only include the provided networkId.
 * This mutates the exported objects so consumers of this package will only
 * see data for the selected network.
 */
function pruneDynamicData(networkId: NetworkId) {
  // keep only the desired id in these maps
  for (const k of Object.keys(networkIds)) {
    if (k !== networkId) delete (networkIds as any)[k];
  }
  for (const k of Object.keys(networkNames)) {
    const v = (networkNames as any)[k];
    if (v !== networkId) delete (networkNames as any)[k];
  }
  for (const k of Object.keys(networkRpcs)) {
    if (k !== networkId) delete (networkRpcs as any)[k];
  }
  for (const k of Object.keys(networkExplorers)) {
    if (k !== networkId) delete (networkExplorers as any)[k];
  }
  for (const k of Object.keys(networkCurrencies)) {
    if (k !== networkId) delete (networkCurrencies as any)[k];
  }
  if (typeof NETWORK_FAUCETS === 'object' && NETWORK_FAUCETS) {
    for (const k of Object.keys(NETWORK_FAUCETS)) {
      if (k !== networkId) delete (NETWORK_FAUCETS as any)[k];
    }
  }
}


export {
  pruneDynamicData,
  getNetworkFaucets,
  getNetworkExplorer,
  getNetworkName,
  getNetworkId,
  getNetworkRpcs,
  getNetworkCurrency,
  getNetworkData
}