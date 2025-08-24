export * from "./types/handler";

import {
  networkCurrencies,
  networkExplorers,
  networkIds,
  networkNames,
  networkRpcs,
  LOCAL_HOST,
  LOCAL_HOST_2,
  NETWORK_FAUCETS,
  PERMIT2_ADDRESS
} from "./types/constants";

import {
  getNetworkId,
  getNetworkFaucets,
  getNetworkExplorer,
  getNetworkName,
  getNetworkRpcs,
  getNetworkCurrency,
  getNetworkData,
} from "./src/utils"

export { networkCurrencies, networkExplorers, networkIds, networkNames, networkRpcs,  LOCAL_HOST,
  LOCAL_HOST_2,
  NETWORK_FAUCETS,
  PERMIT2_ADDRESS };
export { getNetworkId, getNetworkFaucets, getNetworkExplorer, getNetworkName, getNetworkRpcs, getNetworkCurrency, getNetworkData };
export * from "./src"
