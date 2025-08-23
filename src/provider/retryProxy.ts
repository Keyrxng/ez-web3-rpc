import { JsonRpcProvider } from '@ethersproject/providers';

export interface RetryOptions {
  retryCount: number;          // how many full cycles through the ordered RPC list
  retryDelay: number;          // delay between individual retry attempts (ms)
  getOrderedUrls: () => string[]; // fastest -> slowest (plain URLs)
  onLog?: (level: string, msg: string, meta?: any) => void;
  chainId: number;
  rpcCallTimeout: number;      // hard timeout for individual RPC call attempts
}

// Wraps user RPC calls in a timeout to handle edgecases post latency testing
function withTimeout<T>(p: Promise<T>, timeout: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`${label} timeout after ${timeout}ms`)), timeout))
  ]) as Promise<T>;
}

// Attempts an RPC call to a specific URL
async function attemptRpc(
  url: string,
  currentUrl: string,
  baseProvider: JsonRpcProvider,
  prop: keyof JsonRpcProvider,
  args: any[],
  chainId: number,
  callTimeout: number,
  onLog?: RetryOptions['onLog']
) {
  const isCurrent = url === currentUrl;
  const provider = isCurrent ? baseProvider : new JsonRpcProvider({ url, skipFetchSetup: true }, chainId);
  onLog?.('debug', 'Attempting RPC call', { method: String(prop), url });
  return withTimeout((provider[prop] as any)(...args), callTimeout, String(prop));
}

/**
 * Races multiple RPC calls and returns the result of the first successful one.
 * 
 * Handles the edgecase where the provider may have rate limited us 
 * after latency testing as one example.
 */
function raceBatch(
  batch: string[],
  attempt: (url: string) => Promise<any>,
  method: string,
  onLog?: RetryOptions['onLog']
): Promise<any> {
  return new Promise((resolve, reject) => {
    let pending = batch.length;
    let lastErr: any;
    let settled = false;
    for (const url of batch) {
      attempt(url).then(res => {
        if (settled) return;
        settled = true;
        onLog?.('verbose', 'Successfully called provider method (race)', { method, rpc: url });
        resolve(res);
      }).catch(err => {
        lastErr = err;
        pending--;
        onLog?.('debug', 'Provider attempt failed', { method, url, error: String(err) });
        if (pending === 0 && !settled) {
          reject(lastErr || new Error('All providers in batch failed'));
        }
      });
    }
  });
}


/**
 * Wraps the provider object in a Proxy which allows for us to handle
 * failures more gracefully by retrying requests.
 * 
 * Requests are batched against the three lowest latency providers, this
 * helps to mitigate the impact of any individual provider's latency post-testing.
 * 
 * Note: Should be safe with write method calls as the nonce would prevent multiple 
 * successful calls if one was to be accepted.
 */
export function wrapWithRetry(initialProvider: JsonRpcProvider, opts: RetryOptions): JsonRpcProvider {
  return new Proxy(initialProvider, {
    get(target: JsonRpcProvider, prop: keyof JsonRpcProvider, receiver) {
      const orig = (target as any)[prop];
      if (typeof orig !== 'function') {
        return Reflect.get(target, prop, receiver);
      }

      return async (...args: any[]) => {
        const ordered = opts.getOrderedUrls();
        if (!ordered.includes(target.connection.url)) ordered.unshift(target.connection.url);
        if (!ordered.length) {
          opts.onLog?.('fatal', 'No RPCs available', { method: String(prop) });
          throw new Error('No RPCs available');
        }

        const attempt = (url: string) => attemptRpc(
          url,
          target.connection.url,
          target,
          prop,
          args,
          opts.chainId,
          opts.rpcCallTimeout,
          opts.onLog
        );

        let loops = opts.retryCount;
        while (loops > 0) {
          for (let i = 0; i < ordered.length; i += 3) {
            const batch = ordered.slice(i, i + 3);
            opts.onLog?.('debug', 'Racing batch', { method: String(prop), batch });
            try {
              return await raceBatch(batch, attempt, String(prop), opts.onLog);
            } catch (batchErr) {
              const isLastBatch = i + 3 >= ordered.length;
              if (loops === 1 && isLastBatch) {
                opts.onLog?.('fatal', 'Failed after all retries (all batches)', { method: String(prop), error: String(batchErr) });
                throw batchErr;
              }
              opts.onLog?.('debug', 'Batch failed, backing off', { delay: opts.retryDelay });
              await new Promise(r => setTimeout(r, opts.retryDelay));
            }
          }
          loops--;
        }
        throw new Error('All retries exhausted (no batch succeeded)');
      };
    }
  });
}

