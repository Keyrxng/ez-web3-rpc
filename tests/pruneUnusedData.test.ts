import { NetworkId } from '../types/handler';

describe('pruneDynamicData', () => {
  const TARGET: NetworkId = '1';

  beforeEach(() => {
    // Ensure we load a fresh copy of modules so we start from unmodified dynamic data
    jest.resetModules();
  });

  it('removes all dynamic entries except the provided networkId', () => {
    const constants = require('../types/constants');
    const pruneDynamicData = require('../src/utils').pruneDynamicData;

    // sanity: ensure multiple entries exist before pruning
    const beforeIds = Object.keys(constants.networkIds);
    expect(beforeIds.length).toBeGreaterThan(1);

    pruneDynamicData(TARGET);
    
    const ids = Object.keys(constants.networkIds);
    // networkIds keys are strings of network ids
    expect(ids).toEqual([TARGET]);

    // networkRpcs should only include the target id
    expect(Object.keys(constants.networkRpcs)).toEqual([TARGET]);

    // networkExplorers should only include the target id
    expect(Object.keys(constants.networkExplorers)).toEqual([TARGET]);

    // networkCurrencies should only include the target id
    expect(Object.keys(constants.networkCurrencies)).toEqual([TARGET]);

    // NETWORK_FAUCETS imported from dynamic should also be pruned to the target id
    if (constants.NETWORK_FAUCETS && typeof constants.NETWORK_FAUCETS === 'object') {
      expect(Object.keys(constants.NETWORK_FAUCETS)).toEqual([TARGET]);
    }

    // networkNames should contain only the name that maps to the target id
    const names = Object.keys(constants.networkNames);
    expect(names.length).toBe(1);
    const nameForId = constants.networkIds[TARGET];
    expect(names[0]).toBe(nameForId);
  });
});
