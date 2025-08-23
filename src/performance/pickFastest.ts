import { LatencyMap } from './measure';

export function pickFastest(latencies: LatencyMap): string | null {
  let fastest: string | null = null;
  let best = Number.POSITIVE_INFINITY;
  for (const [url, ms] of Object.entries(latencies)) {
    if (ms < best) { fastest = url; best = ms; }
  }
  return fastest;
}

