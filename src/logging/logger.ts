export type LogLevel = 'none' | 'error' | 'info' | 'debug' | 'verbose' | 'ok';

export interface Logger {
  log(level: LogLevel, message: string, meta?: any): void;
}

export class NoopLogger implements Logger {
  log(): void { /* no-op */ }
}

const SYMBOL: Record<Exclude<LogLevel, 'none'>, string> = {
  error: '⚠',
  info: '›',
  debug: '≫',
  verbose: '💬',
  ok: '✓',
};

export class BasicLogger implements Logger {
  constructor(private min: LogLevel = 'info') {}
  private _should(level: LogLevel) {
    if (this.min === 'none') return false;
    if (this.min === 'verbose') return true;
    const order: LogLevel[] = ['error','info','debug','verbose'];
    if (level === 'ok') level = 'info';
    return order.indexOf(level as any) <= order.indexOf(this.min as any);
  }
  log(level: LogLevel, message: string, meta?: any): void {
    if (!this._should(level)) return;
    if (level === 'ok') level = 'info';
    const sym = level !== 'none' ? SYMBOL[level as Exclude<LogLevel,'none'>] || '' : '';
    const base = `${sym} ${message}`.trim();
    if (meta) console.log(base, meta); else console.log(base);
  }
}
