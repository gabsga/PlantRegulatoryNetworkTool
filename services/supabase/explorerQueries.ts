import { fetchSupabaseFilteredRows, fetchSupabasePage } from './client';
import { getSupabaseConfig } from './client';
import { mapIntegratedRows } from './mappers';
import { ExplorePageResult, ExploreQueryParams, SupabaseIntegratedRow, VALID_SOURCES } from './types';

const EXPLORE_SELECT = 'tf,target,tf_id,target_id,sources,evidence_count,direction,details';
const EXPLORE_ORDER = 'tf.asc,target.asc';

const sanitizeFilterValue = (value: string) => value.replace(/[%(),]/g, ' ');

type ExploreSearchMode = 'exact' | 'fuzzy';

const buildExploreQuery = (
  params: ExploreQueryParams,
  searchMode: ExploreSearchMode = 'fuzzy'
): URLSearchParams => {
  const query = new URLSearchParams();
  query.set('select', EXPLORE_SELECT);
  query.set('order', EXPLORE_ORDER);

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

  if ((params.minConfidence || 1) > 1) {
    query.set('evidence_count', `gte.${params.minConfidence}`);
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
    const exactResult = await runQuery('exact');
    if (exactResult.rows.length > 0) {
      return exactResult;
    }
    if (shouldKeepExactOnly(params.searchTerm)) {
      return exactResult;
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
    const exactRows = await runQuery('exact');
    if (exactRows.length > 0) {
      return exactRows;
    }
    if (shouldKeepExactOnly(params.searchTerm)) {
      return exactRows;
    }
  }

  return runQuery('fuzzy');
};
