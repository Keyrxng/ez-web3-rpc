import { BlockExplorer, NetworkId, NetworkName, NativeToken, Rpc } from "..";
import { CHAINS_IDS, EXTRA_RPCS, NETWORK_CURRENCIES, NETWORK_EXPLORERS, NETWORK_FAUCETS } from "../dynamic";

export const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
export const LOCAL_HOST = "http://127.0.0.1:8545";
export const LOCAL_HOST_2 = "http://127.0.0.1:8546";

const networkIds: Record<NetworkId, NetworkName> = {
  ...{ ...CHAINS_IDS }, // removing readonly
  31337: "anvil",
  1337: "hardhat",
};

const networkNames = Object.fromEntries(
  Object.entries(networkIds).map(([key, value]) => {
    return [value, key as NetworkId];
  })
);

const networkRpcs = Object.fromEntries(
  Object.entries(networkNames).map(([, value]) => {
    const chainRpcs = EXTRA_RPCS[value as unknown as keyof typeof EXTRA_RPCS];

    const rpcs: Rpc[] = [
      {
        url: LOCAL_HOST,
        tracking: "none",
        isOpenSource: undefined,
        trackingDetails: ""
      },
      {
        url: LOCAL_HOST_2,
        tracking: "none",
        isOpenSource: undefined,
        trackingDetails: ""
      }
    ];

    if (value === "31337" || value === "1337") {
      chainRpcs.push(...rpcs as never[]);
    }

    return [value, { rpcs: chainRpcs }];
  })
) as Record<NetworkId, { rpcs: Rpc[] }>;

const networkExplorers = Object.fromEntries(
  Object.entries(networkNames).map(([, value]) => {
    const chainExplorers: BlockExplorer[] = NETWORK_EXPLORERS[value as unknown as keyof typeof NETWORK_EXPLORERS];
    return [value, chainExplorers];
  })
) as Record<NetworkId, BlockExplorer[]>;

const networkCurrencies: Record<NetworkId, NativeToken> = Object.fromEntries(
  Object.entries(NETWORK_CURRENCIES).map(([chainId, currency]) => {
    return [chainId, currency as NativeToken];
  })
) as Record<NetworkId, NativeToken>;

export { networkIds, networkNames, networkRpcs, networkCurrencies, networkExplorers };