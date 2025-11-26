/**
 * Sleep for a specified duration
 * @param ms Milliseconds to sleep
 */
export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sleep for a random duration between min and max
 * Useful for avoiding detection and rate limiting
 */
export async function sleepRandom(minMs: number, maxMs: number): Promise<void> {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return sleep(ms);
}

/**
 * Sleep with jitter (adds random variation)
 * Useful for distributed systems to avoid thundering herd
 */
export async function sleepWithJitter(ms: number, jitterPercent = 20): Promise<void> {
  const jitter = ms * (jitterPercent / 100);
  const randomMs = ms + Math.random() * jitter * 2 - jitter;
  return sleep(Math.max(0, randomMs));
}
