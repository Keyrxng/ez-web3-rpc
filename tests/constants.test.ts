import { NetworkId, NetworkName, NativeToken } from '../types/handler';
import { getNetworkId, getNetworkName, networkCurrencies, networkExplorers, networkIds, networkNames, getNetworkCurrency, getNetworkData, getNetworkExplorer } from '../types/constants';

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
});
