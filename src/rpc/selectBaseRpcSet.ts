import { networkRpcs } from '../constants';
import { Rpc, Tracking } from '../..';
import { filterRpcs } from './filterRpcs';

export function selectBaseRpcSet(networkId: string, tracking: Tracking, injected: Rpc[]): Rpc[] {
  const base = networkRpcs[networkId as keyof typeof networkRpcs]?.rpcs || [];
  const merged = [...base, ...injected];
  return filterRpcs(merged, tracking);
}
