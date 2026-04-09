/** Remember which scraping job last imported leads for a saved search (for "New" badges in results). */
const PREFIX = 'leadflow_ss_latest_job_';

export function getLatestImportScrapingJobId(savedSearchId: string): string | null {
  try {
    return localStorage.getItem(PREFIX + savedSearchId);
  } catch {
    return null;
  }
}

export function setLatestImportScrapingJobId(savedSearchId: string, scrapingJobId: string): void {
  try {
    localStorage.setItem(PREFIX + savedSearchId, scrapingJobId);
  } catch {
    // quota / private mode
  }
}
