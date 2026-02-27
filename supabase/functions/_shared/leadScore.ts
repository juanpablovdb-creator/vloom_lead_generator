// Leadflow Vloom - Lead Score (Clay-style formula) for Edge Functions
// Maps Clay placeholders to our lead/enrichment fields.

export interface LeadScoreInput {
  job_location?: string | null;
  company_location?: string | null;
  company_size?: string | null;
  company_funding?: string | null;
  job_description?: string | null;
  notes?: string | null;
  enrichment_data?: Record<string, unknown> | null;
}

const US_LOCATION_REGEX =
  /united states|usa|u\.s\.a|u\.s\.|^us$|, us\b|alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming|\bny\b|\bca\b|\btx\b|\bfl\b|\bwa\b|\bil\b|\bpa\b|\boh\b|\bmi\b|\bga\b|\bnc\b|\bnj\b|\bva\b|\bma\b|\baz\b|\bin\b|\btn\b|\bmo\b|\bmd\b|\bwi\b|\bco\b|\bmn\b|\bsc\b|\bal\b|\bla\b|\bky\b|\bor\b|\bok\b|\bct\b|\but\b|\bia\b|\bnv\b|\bar\b|\bms\b|\bks\b|\bnm\b|\bne\b|\bwv\b|\bid\b|\bhi\b|\bnh\b|\bme\b|\bri\b|\bmt\b|\bde\b|\bsd\b|\bnd\b|\bak\b|\bwy\b/;

function str(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  return String(v).trim();
}

function getLocationString(input: LeadScoreInput): string {
  const country = input.enrichment_data?.country ?? input.enrichment_data?.locality;
  const parts = [input.company_location, input.job_location, country].filter(Boolean).map((v) => str(v));
  return parts.join(" ").toLowerCase();
}

function getEmployeeCount(input: LeadScoreInput): number {
  const enrich = input.enrichment_data;
  const fromEnrich = enrich?.employeeCount ?? enrich?.employee_count;
  if (fromEnrich != null) {
    const n = Number(fromEnrich);
    if (!Number.isNaN(n)) return n;
  }
  const size = str(input.company_size);
  if (!size) return 0;
  const firstPart = size.split("-")[0]?.trim();
  if (firstPart) {
    const n = parseInt(firstPart.replace(/\D/g, ""), 10);
    if (!Number.isNaN(n)) return n;
  }
  return 0;
}

function getRevenueString(input: LeadScoreInput): string {
  const s =
    str(input.company_funding) ||
    str(
      input.enrichment_data?.annual_revenue ??
        input.enrichment_data?.annualRevenue ??
        input.enrichment_data?.revenue
    );
  return s.toLowerCase();
}

function revenueScore(input: LeadScoreInput): number {
  const raw = getRevenueString(input);
  if (!raw) return 0;
  if (raw.includes("+")) {
    const m = raw.match(/(\d+)\s*m/);
    const num = m ? parseInt(m[1], 10) : 0;
    if (num >= 5) return 30;
  }
  if (raw.includes("-")) {
    if (raw.includes("1m") && raw.includes("5m")) return 15;
    return 0;
  }
  const digits = raw.replace(/[^0-9]/g, "");
  const num = parseInt(digits, 10);
  if (Number.isNaN(num)) return 0;
  const value = num * (raw.includes("m") ? 1_000_000 : 1);
  if (value >= 5_000_000) return 30;
  if (value >= 1_000_000) return 15;
  return 0;
}

function getRemoteCheckString(input: LeadScoreInput): string {
  const parts = [input.job_location, input.company_location, input.job_description, input.notes]
    .filter(Boolean)
    .map((v) => str(v));
  return parts.join(" ").toLowerCase();
}

export function computeLeadScore(input: LeadScoreInput): number {
  let score = 0;
  const locationStr = getLocationString(input);
  score += US_LOCATION_REGEX.test(locationStr) ? 35 : -35;
  const emp = getEmployeeCount(input);
  if (emp >= 10 && emp <= 100) score += 20;
  else if (emp >= 1 && emp <= 9) score += 10;
  score += revenueScore(input);
  const remoteStr = getRemoteCheckString(input);
  if (remoteStr.includes("remote")) score += 15;
  return Math.max(0, Math.min(100, Math.round(score)));
}
