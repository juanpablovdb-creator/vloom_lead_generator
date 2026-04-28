// =====================================================
// Leadflow Vloom - CRM card (Kanban)
// =====================================================
import type { Lead } from '@/types/database';
import { ExternalLink, MapPin, Briefcase, User, CheckCircle2, Circle, CheckSquare, Square } from 'lucide-react';

interface CRMCardProps {
  lead: Lead;
  onDragStart: (e: React.DragEvent, lead: Lead) => void;
  onUpdateLead?: (id: string, updates: Partial<Lead>) => Promise<void>;
  onOpen?: (lead: Lead) => void;
  isSelected?: boolean;
  onToggleSelected?: () => void;
}

/** When `company_name` is empty, LinkedIn headlines often contain "Role at Company". */
function companyFromHeadline(headline: string | null | undefined): string {
  if (!headline?.trim()) return '';
  const m = headline.trim().match(/\s+at\s+(.+)$/i);
  if (!m?.[1]) return '';
  return (m[1].split('|')[0] ?? m[1]).trim();
}

function safeHostname(urlLike: string | null | undefined): string | null {
  const raw = (urlLike ?? '').trim();
  if (!raw) return null;
  try {
    const u = new URL(raw.includes('://') ? raw : `https://${raw}`);
    const host = u.hostname.replace(/^www\./i, '').trim();
    return host || null;
  } catch {
    return null;
  }
}

function initialsFromName(name: string): string {
  const parts = name
    .split(/\s+/g)
    .map((p) => p.trim())
    .filter(Boolean);
  const a = (parts[0]?.[0] ?? '').toUpperCase();
  const b = (parts[1]?.[0] ?? parts[0]?.[1] ?? '').toUpperCase();
  return `${a}${b}`.trim() || '—';
}

function logoUrlForLead(lead: Lead): string | null {
  const host = safeHostname(lead.company_url) ?? safeHostname(lead.company_linkedin_url);
  if (!host) return null;
  return `https://logo.clearbit.com/${host}`;
}

export function CRMCard({ lead, onDragStart, onUpdateLead, onOpen, isSelected = false, onToggleSelected }: CRMCardProps) {
  const companyStr = lead.company_name?.trim() || '';
  const contactStr = lead.contact_name?.trim() || '';
  const jobStr = lead.job_title?.trim() || '';
  const headlineCompany = !companyStr ? companyFromHeadline(lead.contact_title) : '';
  /** Prefer company; Post Feeds often lack DB company until enrich — use headline "at Company" when present. */
  const primaryTitle =
    companyStr ||
    headlineCompany ||
    contactStr ||
    (jobStr.length > 72 ? `${jobStr.slice(0, 72)}…` : jobStr) ||
    '—';

  const parts: string[] = [];
  if (lead.company_location) parts.push(lead.company_location);
  if (lead.contact_title?.trim()) parts.push(lead.contact_title.trim());
  else if (jobStr && jobStr !== companyStr && jobStr !== contactStr) parts.push(jobStr);
  if (contactStr && contactStr !== companyStr && !parts.some((p) => p.includes(contactStr))) {
    parts.push(contactStr);
  }
  if (lead.company_industry && !parts.includes(lead.company_industry)) parts.push(lead.company_industry);
  const subLine = parts.slice(0, 3).join(' · ') || null;
  const logoUrl = logoUrlForLead(lead);
  const fallbackInitials = initialsFromName(companyStr || headlineCompany || contactStr || jobStr || 'Lead');

  const locationLabel = (lead.company_location || lead.job_location || '').trim() || null;
  const assigneeLabel = (lead.assignee || '').trim() || null;
  const videoSent = lead.tags?.includes('video_sent') ?? false;

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, lead)}
      onClick={() => {
        if (onOpen) onOpen(lead);
      }}
      className={`bg-card border rounded-lg p-4 cursor-pointer transition-colors space-y-2 ${
        isSelected ? 'border-primary/70 ring-1 ring-primary/30' : 'border-border hover:border-primary/40'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0 flex-1">
          {onToggleSelected && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelected();
              }}
              className={`mt-0.5 p-0.5 rounded border ${
                isSelected
                  ? 'border-primary/50 bg-primary/10 text-primary'
                  : 'border-border bg-background/30 text-muted-foreground hover:text-foreground'
              }`}
              title={isSelected ? 'Unselect' : 'Select'}
            >
              {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
            </button>
          )}
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-foreground text-sm truncate">{primaryTitle}</h3>
            {subLine && <p className="text-muted-foreground text-xs truncate">{subLine}</p>}
          </div>
        </div>
        <div className="flex-shrink-0">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt=""
              className="w-8 h-8 rounded object-cover flex-shrink-0"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <div className="w-8 h-8 rounded border border-border bg-background flex items-center justify-center text-[10px] font-semibold text-muted-foreground">
              {fallbackInitials}
            </div>
          )}
        </div>
      </div>
      <div className="space-y-1 text-xs">
        {jobStr && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Briefcase className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{jobStr}</span>
          </div>
        )}
        {locationLabel && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <MapPin className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{locationLabel}</span>
          </div>
        )}
        {assigneeLabel && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <User className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{assigneeLabel}</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pt-1">
        <span className="text-xs font-medium text-muted-foreground">Score: {lead.score}</span>
        {lead.tags && lead.tags.length > 0 && <span className="text-xs text-muted-foreground">{lead.tags.length} tags</span>}
      </div>

      <button
        type="button"
        onClick={async (e) => {
          e.stopPropagation();
          if (!onUpdateLead) return;
          const nextTags = videoSent ? (lead.tags ?? []).filter((t) => t !== 'video_sent') : [...(lead.tags ?? []), 'video_sent'];
          await onUpdateLead(lead.id, { tags: nextTags });
        }}
        className={`flex items-center gap-1.5 text-xs pt-1 transition-colors ${
          videoSent ? 'text-green-500' : 'text-muted-foreground hover:text-foreground'
        } ${!onUpdateLead ? 'opacity-60 pointer-events-none' : ''}`}
      >
        {videoSent ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
        VIDEO SENT
      </button>

      <div className="flex gap-2 pt-1">
        <a
          href={lead.job_url ?? '#'}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className={`flex-1 flex items-center justify-center gap-1 text-xs py-1.5 border border-border rounded-md text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors ${
            lead.job_url ? '' : 'pointer-events-none opacity-60'
          }`}
        >
          Job Post <ExternalLink className="w-3 h-3" />
        </a>
        <a
          href={lead.company_linkedin_url || lead.company_url || '#'}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className={`flex-1 flex items-center justify-center gap-1 text-xs py-1.5 border border-border rounded-md text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors ${
            lead.company_linkedin_url || lead.company_url ? '' : 'pointer-events-none opacity-60'
          }`}
        >
          Company <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
}
