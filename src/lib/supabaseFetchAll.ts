// =====================================================
// Leadflow Vloom - Paginated Supabase reads (PostgREST default limit = 1000)
// =====================================================

const PAGE_SIZE = 1000;

export async function fetchAllPages<T>(
  runQuery: (from: number, to: number) => Promise<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  let hasMore = true;
  while (hasMore) {
    const { data, error } = await runQuery(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = data ?? [];
    all.push(...page);
    hasMore = page.length >= PAGE_SIZE;
    from += PAGE_SIZE;
  }
  return all;
}
