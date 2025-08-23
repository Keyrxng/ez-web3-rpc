import { Rpc, Tracking } from '../../types/handler';

// Filter RPCs based on tracking preference
export function filterRpcs(rpcs: Rpc[], tracking: Tracking): Rpc[] {
  const predicates: Record<Tracking, (rpc: Rpc) => boolean> = {
    yes: () => true,
    limited: (rpc) => (rpc.tracking === 'limited' || rpc.tracking === 'none'),
    none: (rpc) => rpc.tracking === 'none',
  };
  return rpcs.filter(predicates[tracking]);
}
