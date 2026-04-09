/**
 * Apify actor-run status strings are usually uppercase; normalize for safe comparisons.
 * @see https://docs.apify.com/api/v2#/reference/actor-runs/run-object
 */
export function normalizeApifyRunStatus(status: unknown): string {
  if (typeof status !== "string") return "";
  return status.trim().toUpperCase();
}

export function isApifyRunActive(status: unknown): boolean {
  const s = normalizeApifyRunStatus(status);
  return s === "RUNNING" || s === "READY";
}

export function isApifyRunTerminalFailure(status: unknown): boolean {
  const s = normalizeApifyRunStatus(status);
  return s === "FAILED" || s === "ABORTED" || s === "TIMED-OUT";
}
