/** Retry Apify HTTP calls on transient gateway / rate-limit responses. */

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function isApifyTransientHttpStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

/** True when the error text looks like a temporary Apify/gateway failure. */
export function isApifyTransientErrorMessage(message: string): boolean {
  return /502|503|504|429|bad gateway|gateway time-?out|service unavailable|temporarily unavailable|econnreset|etimedout|fetch failed|networkerror|wall.?clock|cpu time|worker.*limit|timed? ?out waiting/i
    .test(message);
}

export async function fetchApifyResponseWithRetry(
  url: string,
  init: RequestInit,
  options?: { maxAttempts?: number },
): Promise<Response> {
  const maxAttempts = Math.max(1, options?.maxAttempts ?? 5);
  let lastRes: Response | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(url, init);
    lastRes = res;
    if (res.ok || !isApifyTransientHttpStatus(res.status) || attempt === maxAttempts) {
      return res;
    }
    // Consume body so the connection can close before retrying.
    await res.text().catch(() => "");
    const delayMs =
      Math.min(10_000, 400 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 350);
    await sleep(delayMs);
  }

  return lastRes!;
}
