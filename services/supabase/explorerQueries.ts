import { fetchSupabaseFilteredRows, fetchSupabasePage } from './client';
import { getSupabaseConfig } from './client';
import { fetchSupabaseGeneMappingForGenes } from './annotationQueries';
import { dedupeIntegratedInteractions, mapIntegratedRows, normalizeSourceList } from './mappers';
import { ExplorePageResult, ExploreQueryParams, SupabaseIntegratedRow, VALID_SOURCES } from './types';

const EXPLORE_SELECT = 'tf,target,tf_id,target_id,sources,evidence_count,direction,details';
const EXPLORE_ORDER = 'tf.asc,target.asc';
const LIKELY_GENE_ID_RE = /^AT[1-5CM]G\d{5}$/i;

const sanitizeFilterValue = (value: string) => value.replace(/[%(),]/g, ' ');
const sortExploreRows = <T extends { tf: string; target: string }>(rows: T[]) => (
  [...rows].sort((a, b) => a.tf.localeCompare(b.tf) || a.target.localeCompare(b.target))
);

type ExploreSearchMode = 'exact' | 'fuzzy';

const buildBaseExploreQuery = (params: ExploreQueryParams) => {
  const query = new URLSearchParams();
  query.set('select', EXPLORE_SELECT);
  query.set('order', EXPLORE_ORDER);

  if ((params.minConfidence || 1) > 1) {
    query.set('evidence_count', `gte.${params.minConfidence}`);
  }

  return query;
};

const buildExploreQuery = (
  params: ExploreQueryParams,
  searchMode: ExploreSearchMode = 'fuzzy'
): URLSearchParams => {
  const query = buildBaseExploreQuery(params);

  const search = (params.searchTerm || '').trim();
  const selectedSources = (params.selectedSources || []).filter(Boolean);
  const exactTF = (params.exactTF || '').trim();
  const orClauses: string[] = [];

  if (exactTF) {
    query.set('tf', `eq.${sanitizeFilterValue(exactTF)}`);
  }

  if (search && !exactTF) {
    const escaped = sanitizeFilterValue(search);
    const escapedUpper = escaped.toUpperCase();

    if (searchMode === 'exact') {
      orClauses.push(`tf.eq.${escaped}`);
      orClauses.push(`target.eq.${escaped}`);
      orClauses.push(`tf_id.eq.${escapedUpper}`);
      orClauses.push(`target_id.eq.${escapedUpper}`);
    } else {
      orClauses.push(`tf.ilike.*${escaped}*`);
      orClauses.push(`target.ilike.*${escaped}*`);
      orClauses.push(`tf_id.ilike.*${escapedUpper}*`);
      orClauses.push(`target_id.ilike.*${escapedUpper}*`);
    }
  }

  if (selectedSources.length > 0 && selectedSources.length < VALID_SOURCES.length) {
    selectedSources.forEach((source) => {
      orClauses.push(`sources.cs.{${source.toUpperCase()}}`);
    });
  }

  if (orClauses.length > 0) {
    query.set('or', `(${orClauses.join(',')})`);
  }

  return query;
};

const shouldTryExactSearch = (params: ExploreQueryParams) => {
  const search = (params.searchTerm || '').trim();
  const exactTF = (params.exactTF || '').trim();
  return Boolean(search) && !exactTF;
};

const shouldKeepExactOnly = (searchTerm?: string) => {
  const search = (searchTerm || '').trim();
  return search.length >= 4 && /^[A-Za-z0-9./_-]+$/.test(search);
};

const resolveExactSearchTerms = async (searchTerm?: string) => {
  const trimmed = (searchTerm || '').trim();
  if (!trimmed) return [];

  const candidates = new Set<string>();
  const addCandidate = (value: string) => {
    const normalized = value.trim();
    if (!normalized) return;
    candidates.add(normalized);

    const upper = normalized.toUpperCase();
    if (upper !== normalized) {
      candidates.add(upper);
    }
  };

  addCandidate(trimmed);

  const normalizedGeneId = trimmed.toUpperCase();
  if (LIKELY_GENE_ID_RE.test(normalizedGeneId)) {
    try {
      const mapping = await fetchSupabaseGeneMappingForGenes([normalizedGeneId]);
      const symbol = mapping?.[normalizedGeneId];
      if (symbol) {
        addCandidate(symbol);
      }
    } catch (error) {
      console.warn(`Failed to resolve display alias for gene ID ${normalizedGeneId}.`, error);
    }
  }

  return Array.from(candidates);
};

const fetchSupabaseExactMatches = async (
  params: ExploreQueryParams,
  table: string
) => {
  const config = getSupabaseConfig();
  if (!config) return [] as ReturnType<typeof mapIntegratedRows>;

  const exactTerms = await resolveExactSearchTerms(params.searchTerm);
  if (exactTerms.length === 0) return [];

  const baseQuery = buildBaseExploreQuery(params);
  const selectedSources = new Set(normalizeSourceList(params.selectedSources));
  const queryKeys = new Set<string>();
  const queryRequests: Array<Promise<SupabaseIntegratedRow[]>> = [];

  exactTerms.forEach((value) => {
    (['tf', 'target'] as const).forEach((column) => {
      const key = `${column}::${value}`;
      if (queryKeys.has(key)) return;
      queryKeys.add(key);

      const query = new URLSearchParams(baseQuery);
      query.set(column, `eq.${sanitizeFilterValue(value)}`);
      queryRequests.push(fetchSupabaseFilteredRows<SupabaseIntegratedRow>(config, table, query.toString()));
    });
  });

  const settled = await Promise.allSettled(queryRequests);
  const fulfilled = settled.filter((result): result is PromiseFulfilledResult<SupabaseIntegratedRow[]> => (
    result.status === 'fulfilled'
  ));

  if (fulfilled.length === 0) {
    const rejected = settled.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    throw rejected?.reason ?? new Error('Exact search failed.');
  }

  return sortExploreRows(
    dedupeIntegratedInteractions(mapIntegratedRows(fulfilled.flatMap((result) => result.value)))
      .filter((row) => row.sources.some((source) => selectedSources.has(source)))
  );
};

export const fetchSupabaseExplorePage = async (params: ExploreQueryParams & {
  page?: number;
  pageSize?: number;
}): Promise<ExplorePageResult | null> => {
  const config = getSupabaseConfig();
  if (!config?.tables.integrated) return null;

  const page = Math.max(1, params.page || 1);
  const pageSize = Math.max(1, Math.min(500, params.pageSize || 100));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const runQuery = async (searchMode: ExploreSearchMode) => {
    const query = buildExploreQuery(params, searchMode).toString();
    const { rows, total } = await fetchSupabasePage<SupabaseIntegratedRow>(
      config,
      config.tables.integrated,
      query,
      { from, to, preferCount: 'planned' }
    );

    const mappedRows = mapIntegratedRows(rows);
    return {
      rows: mappedRows,
      total: total ?? (from + mappedRows.length + (mappedRows.length === pageSize ? 1 : 0))
    };
  };

  if (shouldTryExactSearch(params)) {
    const exactRows = await fetchSupabaseExactMatches(params, config.tables.integrated);
    if (exactRows.length > 0) {
      return {
        rows: exactRows.slice(from, to + 1),
        total: exactRows.length
      };
    }
    if (shouldKeepExactOnly(params.searchTerm)) {
      return {
        rows: [],
        total: 0
      };
    }
  }

  return runQuery('fuzzy');
};

export const fetchSupabaseExploreAll = async (
  params: ExploreQueryParams,
  onProgress?: (loaded: number, total: number) => void
) => {
  const config = getSupabaseConfig();
  if (!config?.tables.integrated) return null;

  const pageSize = 1000;

  const runQuery = async (searchMode: ExploreSearchMode) => {
    const rows = await fetchSupabaseFilteredRows<SupabaseIntegratedRow>(
      config,
      config.tables.integrated,
      buildExploreQuery(params, searchMode).toString(),
      pageSize
    );

    const mappedRows = mapIntegratedRows(rows);
    onProgress?.(mappedRows.length, mappedRows.length);
    return mappedRows;
  };

  if (shouldTryExactSearch(params)) {
    const exactRows = await fetchSupabaseExactMatches(params, config.tables.integrated);
    if (exactRows.length > 0) {
      return exactRows;
    }
    if (shouldKeepExactOnly(params.searchTerm)) {
      return exactRows;
    }
  }

  return runQuery('fuzzy');
};
