describe('RPCHandler pruning integration', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('calls pruneDynamicData during init when configured', async () => {
    // Mock strategies and provider helpers to avoid network calls
    jest.doMock('../src/strategy/getFastest', () => ({
      getFastest: async (_rpcs: any, _opts: any) => ({ fastest: 'http://localhost:8545', latencies: { 'http://localhost:8545': 1 } }),
    }));
    jest.doMock('../src/strategy/getFirstHealthy', () => ({
      getFirstHealthy: async () => 'http://localhost:8545',
    }));
    jest.doMock('../src/provider/createProvider', () => ({ createProvider: () => ({}) }));
    jest.doMock('../src/provider/retryProxy', () => ({ wrapWithRetry: (base: any) => base }));

    const constants = require('../src/constants');
    // ensure multiple entries pre-prune
    expect(Object.keys(constants.networkIds).length).toBeGreaterThan(1);

    const { RPCHandler } = require('../src/rpc-handler');

    const handler = new RPCHandler({ networkId: '1', settings: { pruneUnusedData: true, browserLocalStorage: false, logLevel: 'none' } });

    await handler.init();

    // After init, the exported dynamic objects should only contain the target id
    expect(Object.keys(constants.networkIds)).toEqual(['1']);
    expect(Object.keys(constants.networkRpcs)).toEqual(['1']);
    expect(Object.keys(constants.networkExplorers)).toEqual(['1']);
    expect(Object.keys(constants.networkCurrencies)).toEqual(['1']);
    if (constants.NETWORK_FAUCETS && typeof constants.NETWORK_FAUCETS === 'object') {
      expect(Object.keys(constants.NETWORK_FAUCETS)).toEqual(['1']);
    }
  });
});
