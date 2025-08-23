import {
  NetworkId,
  NetworkName,
  HandlerConstructorConfig,
  NativeToken,
  NetworkCurrencies,
  NetworkExplorers,
  NetworkRPCs,
} from "./types/handler";

import {
  LOCAL_HOST,
  networkCurrencies,
  networkExplorers,
  networkIds,
  networkNames,
  networkRpcs,
  permit2Address,
  getNetworkId,
  getNetworkFaucets,
  getNetworkExplorer,
  getNetworkName,
  getNetworkRpcs,
  getNetworkCurrency,
  getNetworkData,
} from "./types/constants";

export { LOCAL_HOST, networkCurrencies, networkExplorers, networkIds, networkNames, networkRpcs, permit2Address };
export { getNetworkId, getNetworkFaucets, getNetworkExplorer, getNetworkName, getNetworkRpcs, getNetworkCurrency, getNetworkData };


import { RPCHandler, RpcHandlerOptions } from "./src"


export type {
  NetworkId,
  NetworkName,
  HandlerConstructorConfig,
  NativeToken,
  NetworkCurrencies,
  NetworkExplorers,
  NetworkRPCs,
};

export { RPCHandler, RpcHandlerOptions };
