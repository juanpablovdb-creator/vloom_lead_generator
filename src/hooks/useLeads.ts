// =====================================================
// Leadflow Vloom - useLeads Hook
// =====================================================
import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase, getCurrentUser } from '@/lib/supabase';
import type { Lead, LeadFilters, LeadSort, PaginationState, LeadStatus } from '@/types/database';
import { LINKEDIN_POST_FEEDS_CHANNEL } from '@/lib/leadChannels';
import { firstContactFilterGteBound, firstContactFilterLteBound } from '@/lib/dateUtils';

const SUPABASE_NOT_CONFIGURED = 'Configure Supabase: add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env';

/** Minimal input to create a new lead from the CRM (manual entry). */
export interface CreateLeadInput {
  company_name?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_title?: string | null;
  contact_linkedin_url?: string | null;
  contact_phone?: string | null;
  company_url?: string | null;
  company_linkedin_url?: string | null;
  company_size?: string | null;
  company_industry?: string | null;
  company_location?: string | null;
  job_title?: string | null;
  notes?: string | null;
  channel?: string | null;
  status?: LeadStatus;
  first_contacted_at?: string | null;
  assignee?: string | null;
}

interface UseLeadsOptions {
  initialFilters?: LeadFilters;
  initialSort?: LeadSort;
  pageSize?: number;
  /**
   * When true, fetches every row matching current filters in chunks (PostgREST often caps ~1000 rows per response).
   * Use for CRM Kanban so pipeline columns are complete.
   */
  fetchFullFilteredSet?: boolean;
}

const FULL_FETCH_BATCH = 1000;
const FULL_FETCH_CAP = 50_000;

interface UseLeadsReturn {
  // Data
  leads: Lead[];
  totalCount: number;
  isLoading: boolean;
  error: string | null;
  
  // Filters
  filters: LeadFilters;
  setFilters: (filters: LeadFilters) => void;
  updateFilter: <K extends keyof LeadFilters>(key: K, value: LeadFilters[K]) => void;
  clearFilters: () => void;
  
  // Sorting
  sort: LeadSort;
  setSort: (sort: LeadSort) => void;
  
  // Pagination
  pagination: PaginationState;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  
  // Actions
  refreshLeads: () => Promise<void>;
  createLead: (data: CreateLeadInput) => Promise<Lead | null>;
  updateLead: (id: string, updates: Partial<Lead>) => Promise<void>;
  deleteLead: (id: string) => Promise<void>;
  deleteLeads: (ids: string[]) => Promise<void>;
  updateLeadStatus: (id: string, status: LeadStatus) => Promise<void>;
  toggleShare: (id: string) => Promise<void>;
  addTag: (id: string, tag: string) => Promise<void>;
  removeTag: (id: string, tag: string) => Promise<void>;
  
  // Selection
  selectedIds: Set<string>;
  toggleSelection: (id: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  isAllSelected: boolean;
}

const DEFAULT_FILTERS: LeadFilters = {
  show_shared: true,
};

const DEFAULT_SORT: LeadSort = {
  column: 'score',
  direction: 'desc',
};

export function useLeads(options: UseLeadsOptions = {}): UseLeadsReturn {
  const {
    initialFilters = DEFAULT_FILTERS,
    initialSort = DEFAULT_SORT,
    pageSize: initialPageSize = 25,
    fetchFullFilteredSet = false,
  } = options;

  // State
  const [leads, setLeads] = useState<Lead[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<LeadFilters>(initialFilters);
  const [sort, setSort] = useState<LeadSort>(initialSort);
  const [pagination, setPagination] = useState<PaginationState>({
    page: 1,
    pageSize: initialPageSize,
    total: 0,
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Sync filters when parent passes new initialFilters (e.g. new scraping_job_id after a search)
  useEffect(() => {
    const nextJobId = initialFilters?.scraping_job_id;
    const nextSavedId = initialFilters?.saved_search_id;
    setFilters((prev) => {
      if (prev.scraping_job_id === nextJobId && prev.saved_search_id === nextSavedId) return prev;
      return { ...prev, scraping_job_id: nextJobId, saved_search_id: nextSavedId };
    });
  }, [initialFilters?.scraping_job_id, initialFilters?.saved_search_id]);

  // Ordered query without range (saved_search `.in` is applied in fetchLeads).
  const buildLeadsOrderedQuery = useCallback(() => {
    if (!supabase) return null;
    let query = supabase
      .from('leads')
      .select('*', { count: 'exact' });

    // Status filter
    if (filters.status && filters.status.length > 0) {
      query = query.in('status', filters.status);
    }

    // Source filter
    if (filters.source && filters.source.length > 0) {
      query = query.in('job_source', filters.source);
    }

    // Company size filter
    if (filters.company_size && filters.company_size.length > 0) {
      query = query.in('company_size', filters.company_size);
    }

    // Industry filter
    if (filters.industry && filters.industry.length > 0) {
      query = query.in('company_industry', filters.industry);
    }

    // Has email filter
    if (filters.has_email === true) {
      query = query.not('contact_email', 'is', null);
    } else if (filters.has_email === false) {
      query = query.is('contact_email', null);
    }

    // Has LinkedIn filter
    if (filters.has_linkedin === true) {
      query = query.not('contact_linkedin_url', 'is', null);
    } else if (filters.has_linkedin === false) {
      query = query.is('contact_linkedin_url', null);
    }

    // Score range filter
    if (filters.score_min !== undefined) {
      query = query.gte('score', filters.score_min);
    }
    if (filters.score_max !== undefined) {
      query = query.lte('score', filters.score_max);
    }

    // Date range filter
    if (filters.date_from) {
      query = query.gte('created_at', filters.date_from);
    }
    if (filters.date_to) {
      query = query.lte('created_at', filters.date_to);
    }

    // First contact date range (first_contacted_at). Strict: NULL dates are excluded so the Kanban/table
    // only shows leads that actually fall in the selected calendar range.
    if (filters.first_contacted_from) {
      query = query.gte('first_contacted_at', firstContactFilterGteBound(filters.first_contacted_from));
    }
    if (filters.first_contacted_to) {
      query = query.lte('first_contacted_at', firstContactFilterLteBound(filters.first_contacted_to));
    }

    // Search filter (busca en múltiples campos)
    if (filters.search) {
      // Tokenize so punctuation (e.g. "Audacy, Inc.") doesn't prevent matches.
      // Also strip user-entered `%` to avoid confusing wildcards.
      const tokens = String(filters.search)
        .replace(/%/g, ' ')
        .split(/[^a-z0-9]+/i)
        .map((t) => t.trim())
        .filter(Boolean);
      if (tokens.length > 0) {
        const searchTerm = `%${tokens.join('%')}%`;
        query = query.or(
          `job_title.ilike.${searchTerm},company_name.ilike.${searchTerm},contact_name.ilike.${searchTerm},contact_email.ilike.${searchTerm}`
        );
      }
    }

    // Tags filter
    if (filters.tags && filters.tags.length > 0) {
      query = query.contains('tags', filters.tags);
    }

    // Channel filter
    if (filters.channel && filters.channel.length > 0) {
      // Backward compatibility: early UI versions produced "LinkedIn Job Post Feeds".
      // When user selects canonical "LinkedIn Post Feeds", include legacy value too.
      const expanded = new Set(filters.channel);
      if (expanded.has(LINKEDIN_POST_FEEDS_CHANNEL)) expanded.add('LinkedIn Job Post Feeds');
      query = query.in('channel', Array.from(expanded));
    }

    // Assignee filter
    if (filters.assignee && filters.assignee.length > 0) {
      query = query.in('assignee', filters.assignee);
    }

    // Only show rows user marked as lead (for "Leads" / CRM view)
    if (filters.marked_as_lead_only === true) {
      query = query.eq('is_marked_as_lead', true);
    }

    // Single run filter (e.g. results after New Search)
    if (filters.scraping_job_id) {
      query = query.eq('scraping_job_id', filters.scraping_job_id);
    }

    // Sorting
    query = query.order(sort.column, { ascending: sort.direction === 'asc' });

    return query;
  }, [filters, sort]);

  // Fetch leads
  const fetchLeads = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    if (!supabase) {
      setLeads([]);
      setTotalCount(0);
      setPagination(prev => ({ ...prev, total: 0 }));
      setError(SUPABASE_NOT_CONFIGURED);
      setIsLoading(false);
      return;
    }

    try {
      let jobIds: string[] | null = null;
      if (filters.saved_search_id) {
        const { data: jobRows } = await supabase
          .from('scraping_jobs')
          .select('id')
          .eq('saved_search_id', filters.saved_search_id);
        jobIds = ((jobRows ?? []) as { id: string }[]).map((r) => r.id);
        if (jobIds.length === 0) {
          setLeads([]);
          setTotalCount(0);
          setPagination((prev) => ({ ...prev, total: 0 }));
          setIsLoading(false);
          return;
        }
      }

      const attachSavedSearch = (q: Exclude<ReturnType<typeof buildLeadsOrderedQuery>, null>) =>
        jobIds ? q.in('scraping_job_id', jobIds) : q;

      if (fetchFullFilteredSet) {
        const merged: Lead[] = [];
        let offset = 0;
        let total: number | null = null;

        while (offset < FULL_FETCH_CAP) {
          const base = buildLeadsOrderedQuery();
          if (!base) {
            setLeads([]);
            setTotalCount(0);
            setIsLoading(false);
            return;
          }
          const to = Math.min(offset + FULL_FETCH_BATCH - 1, FULL_FETCH_CAP - 1);
          const { data, error: queryError, count } = await attachSavedSearch(base).range(offset, to);

          if (queryError) throw queryError;
          if (total == null && count != null) total = count;

          const chunk = data || [];
          merged.push(...chunk);
          if (chunk.length === 0) break;
          if (chunk.length < FULL_FETCH_BATCH) break;
          if (total != null && merged.length >= total) break;
          offset += chunk.length;
        }

        setLeads(merged);
        setTotalCount(total ?? merged.length);
        setPagination((prev) => ({ ...prev, total: total ?? merged.length }));
      } else {
        const base = buildLeadsOrderedQuery();
        if (!base) {
          setLeads([]);
          setTotalCount(0);
          setIsLoading(false);
          return;
        }
        const from = (pagination.page - 1) * pagination.pageSize;
        const to = from + pagination.pageSize - 1;
        const { data, error: queryError, count } = await attachSavedSearch(base).range(from, to);

        if (queryError) throw queryError;

        setLeads(data || []);
        setTotalCount(count || 0);
        setPagination((prev) => ({ ...prev, total: count || 0 }));
      }
    } catch (err) {
      const rawMessage =
        err instanceof Error
          ? err.message
          : typeof (err as { message?: string })?.message === 'string'
            ? (err as { message: string }).message
            : '';

      // Recoverable: DB schema missing `first_contacted_at` but UI tries to sort by it.
      // Fall back to a safe sort so CRM doesn't hard-fail.
      if (
        sort.column === 'first_contacted_at' &&
        /first_contacted_at/i.test(rawMessage) &&
        /does not exist|unknown column|column/i.test(rawMessage)
      ) {
        console.warn('Missing leads.first_contacted_at; falling back to updated_at sort.', err);
        setSort({ column: 'updated_at', direction: 'desc' });
        return;
      }

      const message =
        err instanceof Error
          ? err.message
          : typeof (err as { message?: string })?.message === 'string'
            ? (err as { message: string }).message
            : 'Failed to fetch leads';
      setError(message);
      console.error('Error fetching leads:', err);
    } finally {
      setIsLoading(false);
    }
  }, [
    buildLeadsOrderedQuery,
    fetchFullFilteredSet,
    filters.saved_search_id,
    pagination.page,
    pagination.pageSize,
    sort.column,
  ]);

  // Initial fetch and refetch on filter/sort/pagination changes
  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  // Realtime subscription (only when Supabase is configured)
  useEffect(() => {
    const db = supabase;
    if (!db) return;
    const channel = db
      .channel('leads-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'leads',
        },
        () => {
          fetchLeads();
        }
      )
      .subscribe();

    return () => {
      db.removeChannel(channel);
    };
  }, [fetchLeads]);

  // Filter helpers
  const updateFilter = useCallback(<K extends keyof LeadFilters>(
    key: K,
    value: LeadFilters[K]
  ) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPagination(prev => ({ ...prev, page: 1 })); // Reset to page 1 on filter change
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setPagination(prev => ({ ...prev, page: 1 }));
  }, []);

  // Pagination helpers
  const setPage = useCallback((page: number) => {
    setPagination(prev => ({ ...prev, page }));
  }, []);

  const setPageSize = useCallback((pageSize: number) => {
    setPagination(prev => ({ ...prev, pageSize, page: 1 }));
  }, []);

  // CRUD operations (no-op when Supabase not configured)
  const createLead = useCallback(async (data: CreateLeadInput): Promise<Lead | null> => {
    if (!supabase) return null;
    const db = supabase;
    const user = await getCurrentUser();
    if (!user) return null;
    const defaultWeights = {
      has_email: 25,
      has_linkedin: 15,
      company_size_match: 20,
      industry_match: 20,
      recent_posting: 20,
    };
    const row = {
      user_id: user.id,
      is_shared: false,
      assignee: data.assignee ?? null,
      job_title: data.job_title ?? null,
      job_description: null,
      job_url: null,
      job_source: null,
      job_location: null,
      job_salary_range: null,
      job_posted_at: null,
      company_name: data.company_name ?? null,
      company_url: data.company_url ?? null,
      company_linkedin_url: data.company_linkedin_url ?? null,
      company_size: data.company_size ?? null,
      company_industry: data.company_industry ?? null,
      company_description: null,
      company_funding: null,
      company_location: data.company_location ?? null,
      contact_name: data.contact_name ?? null,
      contact_title: data.contact_title ?? null,
      contact_email: data.contact_email ?? null,
      contact_linkedin_url: data.contact_linkedin_url ?? null,
      contact_phone: data.contact_phone ?? null,
      status: 'invite_sent' as LeadStatus,
      score: 0,
      score_weights: defaultWeights,
      enrichment_data: {},
      last_enriched_at: null,
      notes: data.notes ?? null,
      tags: [],
      scraping_job_id: null,
      job_external_id: null,
      is_marked_as_lead: true,
      channel: data.channel ?? null,
      first_contacted_at: data.first_contacted_at ?? new Date().toISOString(),
    };

    // If the DB is missing `first_contacted_at` (migration not applied yet), retry without it.
    const insertOnce = async (payload: Record<string, unknown>) =>
      db.from('leads').insert(payload as never).select().single();

    let inserted: unknown;
    let insertError: { message?: string } | null = null;
    {
      const res = await insertOnce(row as unknown as Record<string, unknown>);
      inserted = res.data;
      insertError = (res.error ?? null) as unknown as { message?: string } | null;
    }
    if (insertError) {
      const msg = insertError?.message ?? '';
      const isMissingColumn = /does not exist|unknown column|column/i.test(msg);
      const missingFirstContactedAt = /first_contacted_at/i.test(msg) && isMissingColumn;
      const missingAssignee = /assignee/i.test(msg) && isMissingColumn;

      if (missingFirstContactedAt || missingAssignee) {
        const copy = { ...(row as unknown as Record<string, unknown>) };
        if (missingFirstContactedAt) delete copy.first_contacted_at;
        if (missingAssignee) delete copy.assignee;
        const res2 = await insertOnce(copy);
        if (res2.error) throw res2.error;
        inserted = res2.data;
      } else {
        throw insertError as unknown as Error;
      }
    }

    const lead = inserted as Lead;
    setLeads(prev => [lead, ...prev]);
    setTotalCount(prev => prev + 1);
    // Record invite_sent in history so KPIs count this lead (trigger only fires on UPDATE)
    await db.from('lead_status_history').insert({
      lead_id: lead.id,
      from_status: 'not_contacted',
      to_status: 'invite_sent',
      changed_at: (data.first_contacted_at ?? new Date().toISOString()),
    } as never);
    // Create default "Contact ..." task for new manual lead
    const contactLabel = [lead.company_name, lead.contact_name].filter(Boolean).join(' – ') || 'lead';
    await db.from('tasks').insert({ user_id: user.id, lead_id: lead.id, title: `Contact ${contactLabel}`, status: 'pending' } as never);
    return lead;
  }, []);

  const updateLead = useCallback(async (id: string, updates: Partial<Lead>) => {
    if (!supabase) return;
    const lead = leads.find(l => l.id === id);

    // Supabase client infers never for table update; cast to satisfy typecheck (build)
    const { error: updateError } = await supabase.from('leads').update(updates as never).eq('id', id);

    if (updateError) throw updateError;

    setLeads(prev => prev.map(l => (l.id === id ? { ...l, ...updates } : l)));

    // When user marks a job post as lead, create a task "Contact ..." linked to the lead card
    if (updates.is_marked_as_lead === true && lead) {
      const contactLabel = [lead.company_name, lead.contact_name].filter(Boolean).join(' – ') || 'lead';
      const title = `Contact ${contactLabel}`;
      await supabase.from('tasks').insert({ user_id: lead.user_id, lead_id: lead.id, title, status: 'pending' } as never);
    }
  }, [leads]);

  const deleteLead = useCallback(async (id: string) => {
    if (!supabase) return;
    const { error: deleteError } = await supabase
      .from('leads')
      .delete()
      .eq('id', id);

    if (deleteError) throw deleteError;

    setLeads(prev => prev.filter(lead => lead.id !== id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const deleteLeads = useCallback(async (ids: string[]) => {
    if (!supabase) return;
    const { error: deleteError } = await supabase
      .from('leads')
      .delete()
      .in('id', ids);

    if (deleteError) throw deleteError;

    setLeads(prev => prev.filter(lead => !ids.includes(lead.id)));
    setSelectedIds(new Set());
  }, []);

  const updateLeadStatus = useCallback(async (id: string, status: LeadStatus) => {
    await updateLead(id, { status });
  }, [updateLead]);

  const toggleShare = useCallback(async (id: string) => {
    const lead = leads.find(l => l.id === id);
    if (!lead) return;
    
    await updateLead(id, { is_shared: !lead.is_shared });
  }, [leads, updateLead]);

  const addTag = useCallback(async (id: string, tag: string) => {
    const lead = leads.find(l => l.id === id);
    if (!lead) return;
    
    const newTags = [...new Set([...lead.tags, tag])];
    await updateLead(id, { tags: newTags });
  }, [leads, updateLead]);

  const removeTag = useCallback(async (id: string, tag: string) => {
    const lead = leads.find(l => l.id === id);
    if (!lead) return;
    
    const newTags = lead.tags.filter(t => t !== tag);
    await updateLead(id, { tags: newTags });
  }, [leads, updateLead]);

  // Selection helpers
  const toggleSelection = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(leads.map(l => l.id)));
  }, [leads]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const isAllSelected = useMemo(() => {
    return leads.length > 0 && leads.every(l => selectedIds.has(l.id));
  }, [leads, selectedIds]);

  return {
    // Data
    leads,
    totalCount,
    isLoading,
    error,
    
    // Filters
    filters,
    setFilters,
    updateFilter,
    clearFilters,
    
    // Sorting
    sort,
    setSort,
    
    // Pagination
    pagination,
    setPage,
    setPageSize,
    
    // Actions
    refreshLeads: fetchLeads,
    createLead,
    updateLead,
    deleteLead,
    deleteLeads,
    updateLeadStatus,
    toggleShare,
    addTag,
    removeTag,
    
    // Selection
    selectedIds,
    toggleSelection,
    selectAll,
    clearSelection,
    isAllSelected,
  };
}
