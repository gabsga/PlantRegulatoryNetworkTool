import { fetchSupabaseFilteredRows, fetchSupabaseTable, fetchSupabaseTablePage, postSupabaseRpc } from './client';
import { getSupabaseConfig } from './client';
import { getSourceFilterKey, normalizeSourceList, parseGORows, parsePathwayRows, parseSupabaseStatsRow } from './mappers';
import { DatasetStats } from '../../types';
import {
  SupabaseEnrichmentTargetRow,
  SupabaseGoRow,
  SupabaseMappingRow,
  SupabaseProcessRow,
  SupabaseStatsRow,
  SupabaseTfTargetSetRow
} from './types';

export const fetchSupabaseTfTargetSets = async (params: {
  minConfidence?: number;
  selectedSources?: string[];
}): Promise<Map<string, Set<string>> | null> => {
  const config = getSupabaseConfig();
  if (!config) return null;

  const minEvidence = Math.max(1, Math.min(3, params.minConfidence || 1));
  const sourceKey = getSourceFilterKey(params.selectedSources);

  if (config.tables.enrichmentTargets) {
    const rows = await fetchSupabaseFilteredRows<SupabaseEnrichmentTargetRow>(
      config,
      config.tables.enrichmentTargets,
      new URLSearchParams({
        select: 'tf,target_ids,min_evidence,source_key',
        order: 'tf.asc',
        min_evidence: `eq.${minEvidence}`,
        source_key: `eq.${sourceKey}`
      }).toString()
    );

    const map = new Map<string, Set<string>>();
    rows.forEach((row) => {
      const tf = (row.tf || '').trim();
      if (!tf) return;
      map.set(tf, new Set((row.target_ids || []).map((id) => String(id || '').trim().toUpperCase()).filter(Boolean)));
    });

    return map;
  }

  const rows = await postSupabaseRpc<SupabaseTfTargetSetRow[]>(
    config,
    'print_tf_target_sets',
    {
      min_evidence: minEvidence,
      selected_sources: normalizeSourceList(params.selectedSources)
    }
  );

  const map = new Map<string, Set<string>>();
  rows.forEach((row) => {
    const tf = (row.tf || '').trim();
    if (!tf) return;
    map.set(tf, new Set((row.target_ids || []).map((id) => String(id || '').trim().toUpperCase()).filter(Boolean)));
  });
  return map;
};

export const fetchSupabaseStatsSummary = async (): Promise<DatasetStats | undefined> => {
  const config = getSupabaseConfig();
  if (!config?.tables.stats) return undefined;

  const { rows } = await fetchSupabaseTablePage<SupabaseStatsRow>(
    config,
    config.tables.stats,
    'total_interactions,target_count,dap_count,chip_count,high_confidence_3,unique_tfs,unique_targets',
    'total_interactions.desc',
    0,
    1
  );

  return parseSupabaseStatsRow(rows[0]);
};

export const fetchSupabaseAnnotationBundle = async () => {
  const config = getSupabaseConfig();
  if (!config) return null;

  const [mappingRows, processRows, goRows, stats] = await Promise.all([
    fetchSupabaseTable<SupabaseMappingRow>(
      config,
      config.tables.mapping,
      'gene_id,symbol',
      'gene_id.asc'
    ),
    fetchSupabaseTable<SupabaseProcessRow>(
      config,
      config.tables.process,
      'gene_id,process',
      'gene_id.asc,process.asc'
    ),
    fetchSupabaseTable<SupabaseGoRow>(
      config,
      config.tables.go,
      'go_term,gene_id',
      'go_term.asc,gene_id.asc'
    ),
    fetchSupabaseStatsSummary()
  ]);

  return {
    geneMapping: Object.fromEntries(
      mappingRows
        .map((row) => [String(row.gene_id || '').trim().toUpperCase(), String(row.symbol || '').trim()] as const)
        .filter(([id, symbol]) => id && symbol)
    ),
    pathwayMapping: parsePathwayRows(processRows),
    goAnnotations: parseGORows(goRows),
    stats
  };
};

export const fetchSupabasePathwayMappingForGenes = async (genes: string[]) => {
  const config = getSupabaseConfig();
  const normalizedGenes = Array.from(new Set(
    genes
      .map((gene) => String(gene || '').trim().toUpperCase())
      .filter(Boolean)
  ));
  if (!config || normalizedGenes.length === 0) return null;

  const chunkSize = 200;
  const allRows: SupabaseProcessRow[] = [];

  for (let i = 0; i < normalizedGenes.length; i += chunkSize) {
    const chunk = normalizedGenes.slice(i, i + chunkSize);
    const query = new URLSearchParams({
      select: 'gene_id,process',
      order: 'gene_id.asc,process.asc'
    });
    query.set('gene_id', `in.(${chunk.map((gene) => `"${gene}"`).join(',')})`);

    const chunkRows = await fetchSupabaseFilteredRows<SupabaseProcessRow>(
      config,
      config.tables.process,
      query.toString()
    );
    allRows.push(...chunkRows);
  }

  return parsePathwayRows(allRows);
};

export const fetchSupabaseGeneMappingForGenes = async (genes: string[]) => {
  const config = getSupabaseConfig();
  const normalizedGenes = Array.from(new Set(
    genes
      .map((gene) => String(gene || '').trim().toUpperCase())
      .filter(Boolean)
  ));
  if (!config || normalizedGenes.length === 0) return null;

  const chunkSize = 200;
  const allRows: SupabaseMappingRow[] = [];

  for (let i = 0; i < normalizedGenes.length; i += chunkSize) {
    const chunk = normalizedGenes.slice(i, i + chunkSize);
    const query = new URLSearchParams({
      select: 'gene_id,symbol',
      order: 'gene_id.asc'
    });
    query.set('gene_id', `in.(${chunk.map((gene) => `"${gene}"`).join(',')})`);

    const chunkRows = await fetchSupabaseFilteredRows<SupabaseMappingRow>(
      config,
      config.tables.mapping,
      query.toString()
    );
    allRows.push(...chunkRows);
  }

  return Object.fromEntries(
    allRows
      .map((row) => [String(row.gene_id || '').trim().toUpperCase(), String(row.symbol || '').trim()] as const)
      .filter(([id, symbol]) => id && symbol)
  );
};

export const fetchSupabaseGoAnnotationsByTerms = async (terms: string[]) => {
  const config = getSupabaseConfig();
  const normalizedTerms = Array.from(new Set(
    terms
      .map((term) => String(term || '').trim())
      .filter(Boolean)
  ));
  if (!config || normalizedTerms.length === 0) return null;

  const chunkSize = 200;
  const allRows: SupabaseGoRow[] = [];

  for (let i = 0; i < normalizedTerms.length; i += chunkSize) {
    const chunk = normalizedTerms.slice(i, i + chunkSize);
    const query = new URLSearchParams({
      select: 'go_term,gene_id',
      order: 'go_term.asc,gene_id.asc'
    });
    query.set('go_term', `in.(${chunk.map((term) => `"${term}"`).join(',')})`);

    const chunkRows = await fetchSupabaseFilteredRows<SupabaseGoRow>(
      config,
      config.tables.go,
      query.toString()
    );
    allRows.push(...chunkRows);
  }

  return parseGORows(allRows);
};
