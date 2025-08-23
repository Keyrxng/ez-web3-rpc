import { networkCurrencies, networkExplorers, networkRpcs } from "./constants";
import { CHAINS_IDS, EXTRA_RPCS } from "../dynamic";
import { LogLevel } from "../src/logging/logger"

export type BlockExplorer = {
  name: string;
  url: string;
  standard?: string;
  icon?: string;
};

export type NativeToken = {
  name: string;
  symbol: string;
  decimals: number;
};

/**
 * Configuration options for the RPC-Handler.
 *
 * - `NetworkId` The ID of the network to connect to.
 *
 * You can configure various settings for the RPC-Handler, including:
 * - `settings.tracking` - How much data you'd like to allow providers to gather.
 * - `settings.networkRpcs` - Custom RPC endpoints to use.
 * - `settings.autoStorage` - Whether to store latency and provider info in LocalStorage or in-memory only.
 *
 */
export type HandlerConstructorConfig = {
  networkId: NetworkId;
  settings?: {
    /**
     * Whether to store latency and provider info in LocalStorage
     * or in-memory only.
     */
    browserLocalStorage?: boolean;
    /**
     * The logging level to use for the RPC-Handler.
     */
    logLevel?: LogLevel;
    /**
     * The data tracking status of the RPC provider, which can be:
     * - `yes` - Allow all providers regards of the data they gather
     * - `limited` - Allow providers that only gather minimal data
     * - `none` - Allow only providers that gather zero data at all
     *
     * Defaults to `none`, meaning less providers will be available,
     * adjust this setting to allow more providers if needed or if tracking
     * is of no consequence.
     *
     * PrivacyStatements can be found at https://github.com/DefiLlama/chainlist/blob/main/constants/extraRpcs.js#L5
     */
    tracking?: Tracking;
    /**
     * The maximum time to allow for a response from the RPC provider.
     */
    rpcTimeout?: number; 
    /**
     * The number of cycles to wait before re-testing all RPCs,
     * including those which are removed mid-cycle if they failed to handle
     * any requests.
     */
    /**
     * You must inject your own custom RPCs here, including but not limited
     * to, any testing or development endpoints such as `http://localhost:8545` etc.
     *
     * This is not a requirement if you intend to use public RPCs.
     *
     * E.G. `http://localhost:8545`
     * E.G. `https://mainnet.infura.io/v3/YOUR_INFURA_PROJECT_ID`
     */
    networkRpcs?: Rpc[];
    /**
     * BROWSER ONLY
     *
     * Whether to store latency and provider info in LocalStorage
     * or in-memory only.
     */
    autoStorage?: boolean;
  };
  /**
   * Settings from proxying Ethereum JSON-RPC calls.
   *
   * - `retryCount` - How many times we'll loop the list of RPCs retrying the request before failing.
   * - `retryDelay` - How long we'll wait before moving to the next RPC.
   * - `rpcCallTimeout` - The maximum time to wait for a response from the RPC provider.
   * 
   * Can be declared globally or overriden at the function level.
   */
  proxySettings?: {
    retryCount: number; 
    retryDelay: number;
    rpcCallTimeout: number;
  };
};

export type NetworkRPCs = typeof networkRpcs;
export type NetworkCurrencies = typeof networkCurrencies;
export type NetworkExplorers = typeof networkExplorers;

type NetworkIds<T extends PropertyKey = keyof typeof EXTRA_RPCS> = {
  [K in T]: K extends string ? K : never;
}[T] | "31337" | "1337";

/**
 * Union of all supported blockchain network IDs.
 *
 * Note: `1337` & `31337` have been injected for convenience.
 */
export type NetworkId = NetworkIds | "31337" | "1337";

/**
 * Unfiltered mapping of all supported blockchain network IDs to their names.
 */
type ChainsUnfiltered = {
  -readonly [K in keyof typeof CHAINS_IDS]: (typeof CHAINS_IDS)[K];
};

// filtered NetworkName union
export type NetworkName = ChainsUnfiltered[NetworkId] | "anvil" | "hardhat";

export type Tracking = "yes" | "limited" | "none";

export type Rpc = {
  url: string;
  tracking?: Tracking;
  trackingDetails?: string;
  isOpenSource?: boolean;
};

