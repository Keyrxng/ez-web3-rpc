import { JsonRpcProvider } from '@ethersproject/providers';

export function createProvider(url: string, chainId: number): JsonRpcProvider {
  return new JsonRpcProvider({ url, skipFetchSetup: true }, chainId);
}
