/**
 * harvestapi/linkedin-job-search expects workplaceType values: remote | hybrid | office (lowercase).
 * UI / saved_searches may store Remote, Hybrid, On-site.
 * @see https://apify.com/harvestapi/linkedin-job-search/input-schema
 */
export function mapWorkplaceTypesToHarvestApi(types: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of types) {
    const n = raw.trim().toLowerCase().replace(/\s+/g, " ");
    let v: string | null = null;
    if (n === "remote") v = "remote";
    else if (n === "hybrid") v = "hybrid";
    else if (n === "on-site" || n === "on site" || n === "onsite" || n === "office") v = "office";
    if (v && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}
