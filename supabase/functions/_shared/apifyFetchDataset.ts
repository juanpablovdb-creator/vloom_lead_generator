/** Apify occasionally returns 429/502/503/504 while a dataset is served or under load. Retry with backoff. */

const DEFAULT_BASE = "https://api.apify.com/v2";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function fetchApifyDatasetItemsWithRetry(
  datasetId: string,
  headers: Record<string, string>,
  options?: { apiBaseUrl?: string; maxAttempts?: number },
): Promise<Record<string, unknown>[]> {
  const base = (options?.apiBaseUrl ?? DEFAULT_BASE).replace(/\/$/, "");
  const url = `${base}/datasets/${datasetId}/items?format=json`;
  const maxAttempts = Math.max(1, options?.maxAttempts ?? 6);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(url, { headers });
    if (res.ok) {
      const raw = await res.json();
      return (Array.isArray(raw) ? raw : raw?.items ?? raw?.results ?? []) as Record<
        string,
        unknown
      >[];
    }

    const status = res.status;
    const retryable = status === 429 || status === 502 || status === 503 || status === 504;
    const bodyText = await res.text().catch(() => "");
    let apifyMsg: string | undefined;
    try {
      const parsed = JSON.parse(bodyText) as { error?: { message?: string } };
      apifyMsg = parsed?.error?.message;
    } catch {
      if (bodyText && bodyText.length > 0 && bodyText.length < 400) {
        apifyMsg = bodyText.trim();
      }
    }

    if (!retryable || attempt === maxAttempts) {
      const baseMsg = apifyMsg ?? `Failed to get dataset items (${status})`;
      const hint =
        retryable && attempt === maxAttempts
          ? " Apify's API was temporarily unavailable; wait a minute and try again."
          : "";
      throw new Error(baseMsg + hint);
    }

    const delayMs =
      Math.min(12_000, 500 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 400);
    await sleep(delayMs);
  }

  throw new Error("Failed to get dataset items");
}
