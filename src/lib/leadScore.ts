// =====================================================
// Leadflow Vloom - Lead Score (Clay-style formula)
// =====================================================
// Maps Clay-style placeholders to our Lead/enrichment_data and computes score.
//
// Clay → Lead mapping:
// - Location (US check): {{Location}}, {{Locality}}, {{Country}}, Enrich Company → company_location, job_location, enrichment_data.country, enrichment_data.locality
// - Employee count / Size: {{Enrich Company}}.employee_count, {{Employee Count}}, {{Size}} → company_size (e.g. "11-50"), enrichment_data.employeeCount
// - Annual revenue: {{Enrich Company}}.annual_revenue, {{Annual Revenue}} → company_funding, enrichment_data.annual_revenue / revenue
// - Remote: {{Location}}, {{Message}}, {{Additional comments}} → job_location, company_location, job_description, notes

/** Input shape: lead fields + optional enrichment_data (Enrich Company). */
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
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  return String(v).trim();
}

/** Location string: Clay uses Location, Locality, Country, Enrich Company country/locality. We map to company_location, job_location, enrichment country/locality. */
function getLocationString(input: LeadScoreInput): string {
  const parts = [
    input.company_location,
    input.job_location,
    input.enrichment_data && (input.enrichment_data.country ?? input.enrichment_data.locality),
  ]
    .filter(Boolean)
    .map((v) => str(v));
  return parts.join(' ').toLowerCase();
}

/** Employee count: Clay uses Enrich Company employee_count, Employee Count, or first number from Size (e.g. "11-50" -> 11). */
function getEmployeeCount(input: LeadScoreInput): number {
  const enrich = input.enrichment_data;
  const fromEnrich = enrich?.employeeCount ?? enrich?.employee_count;
  if (fromEnrich != null) {
    const n = Number(fromEnrich);
    if (!Number.isNaN(n)) return n;
  }
  const size = str(input.company_size);
  if (!size) return 0;
  const firstPart = size.split('-')[0]?.trim();
  if (firstPart) {
    const n = parseInt(firstPart.replace(/\D/g, ''), 10);
    if (!Number.isNaN(n)) return n;
  }
  return 0;
}

/** Annual revenue string: Clay uses Enrich Company annual_revenue or Annual Revenue. We use company_funding or enrichment. */
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

/** Revenue score: +30 for 5M+ or "Xm+", +15 for 1M-5M range or 1M+, else 0. */
function revenueScore(input: LeadScoreInput): number {
  const raw = getRevenueString(input);
  if (!raw) return 0;

  // Contains "+" and e.g. "5 m" or "5m" >= 5
  if (raw.includes('+')) {
    const m = raw.match(/(\d+)\s*m/);
    const num = m ? parseInt(m[1], 10) : 0;
    if (num >= 5) return 30;
  }

  // Range "X - Y" (e.g. "1m - 5m")
  if (raw.includes('-')) {
    if (raw.includes('1m') && raw.includes('5m')) return 15;
    return 0;
  }

  // Single value: parse number, "m" = millions
  const digits = raw.replace(/[^0-9]/g, '');
  const num = parseInt(digits, 10);
  if (Number.isNaN(num)) return 0;
  const value = num * (raw.includes('m') ? 1_000_000 : 1);
  if (value >= 5_000_000) return 30;
  if (value >= 1_000_000) return 15;
  return 0;
}

/** Text used for "remote" check: Clay uses Location, Message, Additional comments. We use job_location, company_location, job_description, notes. */
function getRemoteCheckString(input: LeadScoreInput): string {
  const parts = [
    input.job_location,
    input.company_location,
    input.job_description,
    input.notes,
  ]
    .filter(Boolean)
    .map((v) => str(v));
  return parts.join(' ').toLowerCase();
}

/**
 * Compute lead score from Clay-style formula.
 * Mapping:
 * - Location: company_location, job_location, enrichment_data.country, enrichment_data.locality
 * - Size/Employee count: company_size (e.g. "11-50") or enrichment_data.employeeCount
 * - Annual revenue: company_funding or enrichment_data.annual_revenue / revenue
 * - Remote: job_location, company_location, job_description, notes
 */
export function computeLeadScore(input: LeadScoreInput): number {
  let score = 0;

  // 1) US location: +35 if US, else -35
  const locationStr = getLocationString(input);
  score += US_LOCATION_REGEX.test(locationStr) ? 35 : -35;

  // 2) Company size (employee count): 10-100 => +20, 1-9 => +10, else 0
  const emp = getEmployeeCount(input);
  if (emp >= 10 && emp <= 100) score += 20;
  else if (emp >= 1 && emp <= 9) score += 10;

  // 3) Revenue: up to +30
  score += revenueScore(input);

  // 4) Remote in location/description/notes: +15
  const remoteStr = getRemoteCheckString(input);
  if (remoteStr.includes('remote')) score += 15;

  // Clamp to a sensible range (e.g. 0-100); formula can go negative
  return Math.max(0, Math.min(100, Math.round(score)));
}
