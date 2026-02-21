# LeadFlow 🚀

Smart lead prospecting platform for finding, enriching, and contacting potential clients.

## Features

- 🔍 **Job Post Scraping**: Find job posts from LinkedIn, Indeed, and Glassdoor using Apify actors
- 📊 **Lead Enrichment**: Automatically enrich leads with company and contact information
- ⚖️ **Smart Scoring**: Configure custom scoring weights to prioritize the best leads
- 🤖 **AI Email Generation**: Generate personalized outreach emails with Claude AI
- 📧 **Automated Sending**: Send emails directly through SendGrid integration
- 👥 **Team Collaboration**: Share leads and templates with your team

## Tech Stack

- **Frontend**: React + TypeScript + Tailwind CSS
- **Backend/DB**: Supabase (PostgreSQL + Auth + Edge Functions)
- **Scraping**: Apify Actors
- **Email**: SendGrid
- **AI**: Claude API (Anthropic)

## Getting Started

### 1. Set up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to SQL Editor and run the migration:
   ```
   supabase/migrations/001_initial_schema.sql
   ```
3. Copy your project URL and anon key from Settings → API

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your Supabase credentials:
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Run Development Server

```bash
npm run dev
```

### 5. Add API Keys (in app)

Once running, go to Settings and add your API keys:
- **Apify**: Get from [console.apify.com](https://console.apify.com) → Settings → Integrations
- **SendGrid**: Get from [sendgrid.com](https://sendgrid.com) → Settings → API Keys
- **Anthropic**: Get from [console.anthropic.com](https://console.anthropic.com)

## Project Structure

```
leadflow/
├── src/
│   ├── components/       # React components
│   │   ├── LeadsTable.tsx
│   │   ├── FilterBar.tsx
│   │   ├── JobSearch.tsx
│   │   ├── ScoringConfig.tsx
│   │   ├── EmailComposer.tsx
│   │   └── ErrorBoundary.tsx
│   ├── hooks/           # Custom React hooks
│   │   └── useLeads.ts
│   ├── lib/             # API clients
│   │   ├── supabase.ts
│   │   ├── apify.ts
│   │   ├── sendgrid.ts
│   │   └── ai-email.ts
│   ├── pages/           # Page components
│   │   ├── HomePage.tsx
│   │   ├── SearchConfigPage.tsx
│   │   └── Dashboard.tsx
│   ├── types/           # TypeScript types
│   │   └── database.ts
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── docs/                # Process and planning
│   ├── BACKLOG.md       # Sprint + Waves
│   ├── PRE_MORTEMS.md   # Risk documentation
│   ├── HOUSEKEEPING.md  # Done / pending
│   ├── DEBT.md          # Technical debt
│   └── PROCESS.md       # Daily rituals
├── supabase/
│   └── migrations/      # SQL migrations
│       └── 001_initial_schema.sql
└── package.json
```

## Process and Documentation

- **[docs/PASO_A_PASO.md](docs/PASO_A_PASO.md)** — Checklist: qué hacer después de cada sesión
- **[docs/GITHUB_SETUP.md](docs/GITHUB_SETUP.md)** — Conectar a GitHub y sincronizar
- **[docs/PROCESS.md](docs/PROCESS.md)** — Daily rituals (lint, wave planning)
- **[docs/BACKLOG.md](docs/BACKLOG.md)** — Sprint backlog + Waves
- **[docs/PRE_MORTEMS.md](docs/PRE_MORTEMS.md)** — Pre-mortems and risks
- **[docs/HOUSEKEEPING.md](docs/HOUSEKEEPING.md)** — What's done, what's pending
- **[docs/DEBT.md](docs/DEBT.md)** — Technical debt log

### Lint

```bash
npm run lint        # Check
npm run lint:fix     # Auto-fix (run before end of day)
```

## Migrating to Cursor

This project is designed for easy migration from Lovable to Cursor:

1. Export the project from Lovable
2. Open in Cursor
3. Run `npm install`
4. Your Supabase database is already set up - no data migration needed!

## Database Schema

The main tables are:
- `leads` - Prospective clients with job and contact info
- `email_templates` - Reusable email templates
- `emails_sent` - History of sent emails
- `scraping_jobs` - Apify scraping job tracking
- `scoring_presets` - Saved scoring configurations
- `api_keys` - Team API keys (encrypted)

## License

MIT
