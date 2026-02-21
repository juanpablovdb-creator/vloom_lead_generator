// =====================================================
// Vloom Lead Generator - CRM view (Kanban + useLeads)
// =====================================================
import { useLeads } from '@/hooks/useLeads';
import { CRMKanban } from './CRMKanban';

export function CRMView() {
  const { leads, isLoading, error, updateLeadStatus } = useLeads({
    pageSize: 500,
    initialFilters: {},
  });

  if (error) {
    return (
      <div className="p-4 md:p-6">
        <h1 className="text-lg font-semibold text-vloom-text mb-4">CRM</h1>
        <div className="bg-vloom-surface border border-vloom-border rounded-lg p-4 text-vloom-muted text-sm">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6">
      <h1 className="text-lg font-semibold text-vloom-text mb-4">CRM</h1>
      <CRMKanban
        leads={leads}
        isLoading={isLoading}
        onStatusChange={updateLeadStatus}
      />
    </div>
  );
}
