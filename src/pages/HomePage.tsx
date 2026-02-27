// =====================================================
// Leadflow Vloom - Home Page (Source Selection)
// Layout and brand: wearevloom.com — clean, professional.
// =====================================================
import React from 'react';
import {
  Linkedin,
  Briefcase,
  Building2,
  Users,
  ArrowRight,
  Globe,
} from 'lucide-react';

interface LeadSource {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  borderColor: string;
  apifyActorId: string;
  comingSoon?: boolean;
}

const LEAD_SOURCES: LeadSource[] = [
  {
    id: 'linkedin-jobs',
    name: 'LinkedIn Jobs',
    description: 'Find companies hiring for specific roles on LinkedIn',
    icon: <Linkedin className="w-8 h-8" />,
    color: 'text-[#0A66C2]',
    bgColor: 'bg-[#0A66C2]/10',
    borderColor: 'border-vloom-border hover:border-vloom-accent/50',
    apifyActorId: 'harvestapi/linkedin-job-search',
  },
  {
    id: 'indeed-jobs',
    name: 'Indeed Jobs',
    description: 'Search job postings across Indeed worldwide',
    icon: <Briefcase className="w-8 h-8" />,
    color: 'text-[#2164f3]',
    bgColor: 'bg-[#2164f3]/10',
    borderColor: 'border-vloom-border hover:border-vloom-accent/50',
    apifyActorId: 'misceres/indeed-scraper',
  },
  {
    id: 'glassdoor-jobs',
    name: 'Glassdoor Jobs',
    description: 'Extract job listings with company reviews and salaries',
    icon: <Building2 className="w-8 h-8" />,
    color: 'text-[#0caa41]',
    bgColor: 'bg-[#0caa41]/10',
    borderColor: 'border-vloom-border hover:border-vloom-accent/50',
    apifyActorId: 'epctex/glassdoor-jobs-scraper',
  },
  {
    id: 'google-maps',
    name: 'Google Maps',
    description: 'Find local businesses and extract contact info',
    icon: <Globe className="w-8 h-8" />,
    color: 'text-[#EA4335]',
    bgColor: 'bg-[#EA4335]/10',
    borderColor: 'border-vloom-border hover:border-vloom-accent/50',
    apifyActorId: 'compass/crawler-google-places',
    comingSoon: true,
  },
  {
    id: 'linkedin-people',
    name: 'LinkedIn People',
    description: 'Search for decision makers and contacts directly',
    icon: <Users className="w-8 h-8" />,
    color: 'text-[#0A66C2]',
    bgColor: 'bg-[#0A66C2]/10',
    borderColor: 'border-vloom-border hover:border-vloom-accent/50',
    apifyActorId: 'bebity/linkedin-people-scraper',
    comingSoon: true,
  },
];

interface HomePageProps {
  onSelectSource: (source: LeadSource) => void;
  /** When true, hide the top header (e.g. when embedded in AppLayout). */
  embedded?: boolean;
}

function SourceCard({ source, onSelect }: { source: LeadSource; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      disabled={source.comingSoon}
      className={`
        relative group text-left p-6 rounded-xl border transition-all duration-200 bg-vloom-surface
        ${source.borderColor}
        ${source.comingSoon
          ? 'opacity-60 cursor-not-allowed'
          : 'cursor-pointer hover:shadow-md'
        }
      `}
    >
      {source.comingSoon && (
        <span className="absolute top-4 right-4 px-2 py-1 bg-vloom-border text-vloom-muted text-xs font-medium rounded">
          Coming soon
        </span>
      )}

      <div className={`w-12 h-12 rounded-lg ${source.bgColor} ${source.color} flex items-center justify-center mb-4`}>
        {source.icon}
      </div>

      <h3 className="text-base font-semibold text-vloom-text mb-1 flex items-center gap-2">
        {source.name}
        {!source.comingSoon && (
          <ArrowRight className="w-4 h-4 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-vloom-muted" />
        )}
      </h3>
      <p className="text-sm text-vloom-muted">
        {source.description}
      </p>
    </button>
  );
}

export function HomePage({ onSelectSource, embedded }: HomePageProps) {
  return (
    <div className={embedded ? '' : 'min-h-screen bg-vloom-bg'}>
      {!embedded && (
        <header className="border-b border-vloom-border bg-vloom-surface sticky top-0 z-10">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-14">
              <span className="text-lg font-semibold text-vloom-text">Leadflow Vloom</span>
              <div className="flex items-center gap-4">
                <button className="text-sm text-vloom-muted hover:text-vloom-text">
                  My Leads
                </button>
                <button className="text-sm text-vloom-muted hover:text-vloom-text">
                  Settings
                </button>
              </div>
            </div>
          </div>
        </header>
      )}

      <main className={`max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 ${embedded ? 'py-6' : 'py-12'}`}>
        <div className={embedded ? 'mb-6' : 'mb-10'}>
          <h1 className={`font-semibold text-vloom-text ${embedded ? 'text-lg mb-0' : 'text-3xl font-bold mb-2'}`}>
            Where do you want to search for leads?
          </h1>
          {!embedded && (
            <p className="text-vloom-muted">
              Choose a source to get started. We extract the data, enrich contacts and help you reach out with AI.
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {LEAD_SOURCES.map((source) => (
            <SourceCard
              key={source.id}
              source={source}
              onSelect={() => onSelectSource(source)}
            />
          ))}
        </div>
      </main>
    </div>
  );
}

export type { LeadSource };
