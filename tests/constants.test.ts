import { NetworkId, NetworkName, NativeToken } from '../';
import { NETWORK_FAUCETS } from '../dynamic';
import { networkCurrencies, networkExplorers, networkIds, networkNames, networkRpcs } from '../src/constants';
import { getNetworkCurrency, getNetworkData, getNetworkExplorer, getNetworkFaucets, getNetworkId, getNetworkName, getNetworkRpcs, pruneDynamicData} from "../src/utils"

describe('Constants (src)', () => {
  const netIds = ['1','100','56','80002','137','25'] as NetworkId[];
  const expectedName: Partial<Record<NetworkId,string>> = {
    '1':'ethereum-mainnet', '100':'gnosis', '56':'bnb-smart-chain-mainnet', '80002':'amoy', '137':'polygon-mainnet', '25':'cronos-mainnet'
  };
  const expectedExplorer: Partial<Record<NetworkId,string>> = {
    '1':'https://etherscan.io','100':'https://gnosisscan.io','56':'https://bscscan.com','80002':'https://www.oklink.com/amoy','137':'https://polygonscan.com','25':'https://explorer.cronos.org'
  };
  const expectedNative: Partial<Record<NetworkId,NativeToken>> = {
    '1': { symbol:'ETH', decimals:18, name:'Ether' },
    '100': { symbol:'XDAI', decimals:18, name:'xDAI' },
    '56': { symbol:'BNB', decimals:18, name:'BNB Chain Native Token' },
    '80002': { symbol:'POL', decimals:18, name:'POL' },
    '137': { symbol:'POL', decimals:18, name:'POL' },
    '25': { symbol:'CRO', decimals:18, name:'Cronos' },
  };

  it('getNetworkName valid + invalid', () => {
    expect(getNetworkName('80002')).toBe('amoy');
    expect(getNetworkName(Number.MAX_SAFE_INTEGER as any)).toBe('Unknown Network');
  });
  it('getNetworkId valid + invalid + getNetworkData synergy', () => {
    expect(getNetworkId('amoy' as NetworkName)).toBe('80002');
    expect(getNetworkId('unknown' as any)).toBe(-1);
    expect(getNetworkData('80002' as NetworkId).name).toBe('amoy');
  });
  it('networkNames mapping integrity (ignoring duplicate injected names)', () => {
    const idValuesUnique = [...new Set(Object.values(networkIds))].sort();
    const nameKeys = Object.keys(networkNames).sort();
    expect(idValuesUnique).toEqual(nameKeys);
    netIds.forEach(id => expect(networkIds[id]).toBe(expectedName[id]));
  });
  it('networkCurrencies + getNetworkCurrency', () => {
    netIds.forEach(id => {
      expect(networkCurrencies[id]).toEqual(expectedNative[id]);
      expect(getNetworkCurrency(id)).toEqual(expectedNative[id]);
    });
  });
  it('networkExplorers + getNetworkExplorer', () => {
    netIds.forEach(id => {
      const urls = networkExplorers[id].map(e => e.url);
      expect(urls).toContain(expectedExplorer[id]);
      const urls2 = getNetworkExplorer(id).map(e => e.url);
      expect(urls2).toContain(expectedExplorer[id]);
    });
  });

  it('getNetworkFaucets + NETWORK_FAUCETS', () => {
    // known net with faucets (ropsten = 3)
    const ropsten = '3' as NetworkId;
    expect(NETWORK_FAUCETS[ropsten]).toEqual(getNetworkFaucets(ropsten));

    // known net with no faucets (mainnet = 1)
    const mainnet = '1' as NetworkId;
    expect(NETWORK_FAUCETS[mainnet]).toEqual([]);
    expect(getNetworkFaucets(mainnet)).toEqual([]);

    // invalid id returns empty array
    // (function returns [] when no entry exists)
    // cast to any to simulate unknown numeric id
    expect(getNetworkFaucets(Number.MAX_SAFE_INTEGER as any)).toEqual([]);
  });

  it('getNetworkRpcs valid + invalid', () => {
    const target = '80002' as NetworkId; // amoy
    // networkRpcs stores { rpcs: Rpc[] }
    expect(networkRpcs[target].rpcs).toEqual(getNetworkRpcs(target).rpcs);

    // unknown id returns []
    expect(getNetworkRpcs(Number.MAX_SAFE_INTEGER as any)).toEqual([]);
  });

  it('pruneDynamicData keeps only the target id in dynamic maps', () => {
    const TARGET = '80002' as NetworkId;

    // load fresh modules to avoid using already-imported references
    jest.resetModules();
    // require ensures we get the current module objects to mutate
    const utils = require('../src/utils');
    const constants = require('../src/constants');

    // Sanity: constants should contain many entries before pruning
    expect(Object.keys(constants.networkIds).length).toBeGreaterThan(1);

    utils.pruneDynamicData(TARGET);

    // After pruning, only the target key should remain in these maps
    expect(Object.keys(constants.networkIds)).toEqual([TARGET]);
    // networkNames maps name->id: all remaining values should equal TARGET
    expect(Object.values(constants.networkNames)).toEqual([TARGET]);
    expect(Object.keys(constants.networkRpcs)).toEqual([TARGET]);
    expect(Object.keys(constants.networkExplorers)).toEqual([TARGET]);
    expect(Object.keys(constants.networkCurrencies)).toEqual([TARGET]);

    // NETWORK_FAUCETS is imported from dynamic and should be pruned as well
    if (constants.NETWORK_FAUCETS && typeof constants.NETWORK_FAUCETS === 'object') {
      expect(Object.keys(constants.NETWORK_FAUCETS)).toEqual([TARGET]);
    }
  });
});
