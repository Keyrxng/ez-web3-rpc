import { BasicLogger } from '../src/logging/logger';

describe('BasicLogger', () => {
  const levels = ['error','info','debug','verbose','ok'] as const;
  function capture(fn: () => void) { const logs: string[] = []; const orig = console.log; (console as any).log = (...a:any[])=>{logs.push(a.join(' '));}; try { fn(); } finally { console.log = orig; } return logs; }

  it('respects min level hierarchy', () => {
    const logger = new BasicLogger('debug');
    const logs = capture(() => { levels.forEach(l => logger.log(l as any, `m-${l}`)); });
    expect(logs.some(l=>l.includes('m-error'))).toBe(true);
    expect(logs.some(l=>l.includes('m-info'))).toBe(true);
    expect(logs.some(l=>l.includes('m-debug'))).toBe(true);
    expect(logs.some(l=>l.includes('m-ok'))).toBe(true);
    expect(logs.some(l=>l.includes('m-verbose'))).toBe(false);
  });

  it('verbose includes all', () => {
    const logger = new BasicLogger('verbose');
    const logs = capture(() => { levels.forEach(l => logger.log(l as any, `v-${l}`)); });
    expect(logs.filter(l=>/v-/.test(l)).length).toBe(5);
  });

  it('none suppresses all', () => {
    const logger = new BasicLogger('none' as any);
    const logs = capture(() => { levels.forEach(l => logger.log(l as any, `n-${l}`)); });
    expect(logs.length).toBe(0);
  });
});
