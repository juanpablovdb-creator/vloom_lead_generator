// =====================================================
// Leadflow Vloom - useLeads Hook
// =====================================================
import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import type { Lead, LeadFilters, LeadSort, PaginationState, LeadStatus } from '@/types/database';

const SUPABASE_NOT_CONFIGURED = 'Configure Supabase: add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env';

interface UseLeadsOptions {
  initialFilters?: LeadFilters;
  initialSort?: LeadSort;
  pageSize?: number;
}

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

  // Build query based on filters (only when Supabase is configured)
  const buildQuery = useCallback(() => {
    if (!supabase) return null;
    let query = supabase
      .from('leads')
      .select('*', { count: 'exact' });

    // Saved search filter: only leads from runs of this saved search (via scraping_job_id)
    // saved_search_id filter is applied in fetchLeads (via scraping_job ids)

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

    // Search filter (busca en múltiples campos)
    if (filters.search) {
      const searchTerm = `%${filters.search}%`;
      query = query.or(
        `job_title.ilike.${searchTerm},company_name.ilike.${searchTerm},contact_name.ilike.${searchTerm},contact_email.ilike.${searchTerm}`
      );
    }

    // Tags filter
    if (filters.tags && filters.tags.length > 0) {
      query = query.contains('tags', filters.tags);
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

    // Pagination
    const from = (pagination.page - 1) * pagination.pageSize;
    const to = from + pagination.pageSize - 1;
    query = query.range(from, to);

    return query;
  }, [filters, sort, pagination.page, pagination.pageSize]);

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
      let query = buildQuery();
      if (!query) {
        setLeads([]);
        setTotalCount(0);
        setIsLoading(false);
        return;
      }
      // When filtering by saved search: get scraping_job ids for that saved search, then filter leads by them
      if (filters.saved_search_id) {
        const { data: jobRows } = await supabase
          .from('scraping_jobs')
          .select('id')
          .eq('saved_search_id', filters.saved_search_id);
        const jobIds = ((jobRows ?? []) as { id: string }[]).map((r) => r.id);
        if (jobIds.length === 0) {
          setLeads([]);
          setTotalCount(0);
          setPagination((prev) => ({ ...prev, total: 0 }));
          setIsLoading(false);
          return;
        }
        query = query.in('scraping_job_id', jobIds);
      }
      const { data, error: queryError, count } = await query;

      if (queryError) throw queryError;

      setLeads(data || []);
      setTotalCount(count || 0);
      setPagination(prev => ({ ...prev, total: count || 0 }));
    } catch (err) {
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
  }, [buildQuery, filters.saved_search_id]);

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
  const updateLead = useCallback(async (id: string, updates: Partial<Lead>) => {
    if (!supabase) return;
    const lead = leads.find(l => l.id === id);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateError } = await supabase.from('leads').update(updates as any).eq('id', id);

    if (updateError) throw updateError;

    setLeads(prev => prev.map(l => (l.id === id ? { ...l, ...updates } : l)));

    // When user marks a job post as lead, create a task "Contactar a ..." linked to the lead card
    if (updates.is_marked_as_lead === true && lead) {
      const contactLabel = [lead.company_name, lead.contact_name].filter(Boolean).join(' – ') || 'lead';
      const title = `Contactar a ${contactLabel}`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await supabase.from('tasks').insert({ user_id: lead.user_id, lead_id: lead.id, title, status: 'pending' } as any);
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
