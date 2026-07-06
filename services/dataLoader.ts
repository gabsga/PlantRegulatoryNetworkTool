import {
  DatasetManifest,
  DatasetStats,
  GeneMapping,
  IntegratedDataset,
  IntegratedInteraction,
  PathwayMapping,
  VALID_SOURCES,
  ValidSource
} from '../types';
import {
  loadIntegratedDataFromPrebuilt,
  loadPrebuiltDirectForTF,
  loadPrebuiltGeneMapping,
  loadPrebuiltGoAnnotations,
  loadPrebuiltIncomingForTF,
  loadPrebuiltInteractions,
  loadPrebuiltManifest,
  loadPrebuiltPathwayMapping,
  loadPrebuiltTfTargetSets
} from './prebuiltDatasetLoader';
import { loadIntegratedDataFromStaticFiles } from './staticDatasetLoader';
import { filterInteractions } from './explorer/filterInteractions';

let datasetPromise: Promise<IntegratedDataset> | null = null;

const normalizeSelectedSources = (sources?: string[]): ValidSource[] => {
  const normalized = (sources?.length ? sources : [...VALID_SOURCES])
    .map((source) => String(source || '').trim().toUpperCase())
    .filter((source): source is ValidSource => VALID_SOURCES.includes(source as ValidSource));

  return Array.from(new Set(normalized));
};

const getSourceKey = (sources?: string[]): string => {
  const normalized = normalizeSelectedSources(sources);
  return VALID_SOURCES.filter((source) => normalized.includes(source)).join('|');
};

export const buildDatasetStats = (interactions: IntegratedInteraction[]): DatasetStats => ({
  totalInteractions: interactions.length,
  sourceCounts: VALID_SOURCES.map((source) => ({
    name: source,
    count: interactions.filter((item) => item.sources.includes(source)).length
  })),
  highConfidence3: interactions.filter((item) => item.evidenceCount >= 3).length,
  uniqueTFs: new Set(interactions.map((item) => item.tf)).size,
  uniqueTargets: new Set(interactions.map((item) => item.target)).size
});

const withDatasetStats = (dataset: IntegratedDataset): IntegratedDataset => (
  dataset.stats
    ? dataset
    : { ...dataset, stats: buildDatasetStats(dataset.interactions) }
);

export const loadDatasetManifest = async (): Promise<DatasetManifest> => {
  const prebuilt = await loadPrebuiltManifest();
  if (prebuilt) return prebuilt;

  const dataset = await loadIntegratedData();
  return {
    generatedAt: new Date().toISOString(),
    stats: dataset.stats || buildDatasetStats(dataset.interactions),
    statsByEvidence: {
      '1': buildDatasetStats(dataset.interactions),
      '2': buildDatasetStats(dataset.interactions.filter((item) => item.evidenceCount >= 2)),
      '3': buildDatasetStats(dataset.interactions.filter((item) => item.evidenceCount >= 3))
    },
    tfOptions: Array.from(new Set(dataset.interactions.map((interaction) => interaction.tf))).sort()
  };
};

export const loadIntegratedData = async (onProgress?: (msg: string) => void): Promise<IntegratedDataset> => {
  if (!datasetPromise) {
    datasetPromise = (async () => {
      const prebuilt = await loadIntegratedDataFromPrebuilt();
      if (prebuilt) return withDatasetStats(prebuilt);
      onProgress?.('Loading bundled local datasets...');
      return withDatasetStats(await loadIntegratedDataFromStaticFiles(onProgress));
    })();
  }

  return datasetPromise;
};

export const loadInteractions = async (): Promise<IntegratedInteraction[]> => {
  const prebuilt = await loadPrebuiltInteractions();
  if (prebuilt) return prebuilt;
  const dataset = await loadIntegratedData();
  return dataset.interactions;
};

export const loadGeneMapping = async (): Promise<GeneMapping> => {
  const prebuilt = await loadPrebuiltGeneMapping();
  if (prebuilt) return prebuilt;
  const dataset = await loadIntegratedData();
  return dataset.geneMapping;
};

export const loadPathwayMapping = async (): Promise<PathwayMapping> => {
  const prebuilt = await loadPrebuiltPathwayMapping();
  if (prebuilt) return prebuilt;
  const dataset = await loadIntegratedData();
  return dataset.pathwayMapping;
};

export const loadGoAnnotations = async (): Promise<Record<string, string[]>> => {
  const prebuilt = await loadPrebuiltGoAnnotations();
  if (prebuilt) return prebuilt;
  const dataset = await loadIntegratedData();
  return dataset.goAnnotations;
};

export const getLocalTFOptions = async (): Promise<string[]> => {
  const manifest = await loadDatasetManifest();
  return manifest.tfOptions;
};

export const getLocalInteractionsForTF = async (tf: string): Promise<IntegratedInteraction[]> => {
  const selectedTF = tf.trim();
  if (!selectedTF) return [];

  const prebuilt = await loadPrebuiltDirectForTF(selectedTF);
  if (prebuilt) return prebuilt;

  const interactions = await loadInteractions();
  return interactions.filter((interaction) => interaction.tf === selectedTF);
};

export const getLocalHierarchyForTF = async (
  tf: string,
  selectedSources: string[] = [...VALID_SOURCES]
): Promise<IntegratedInteraction[]> => {
  const selectedTF = tf.trim();
  if (!selectedTF) return [];

  const [prebuiltDirect, prebuiltIncoming] = await Promise.all([
    loadPrebuiltDirectForTF(selectedTF),
    loadPrebuiltIncomingForTF(selectedTF)
  ]);
  if (prebuiltDirect || prebuiltIncoming) {
    const direct = (prebuiltDirect || []).filter((interaction) => (
      interaction.sources.some((source) => selectedSources.includes(source))
    ));
    const downstreamTFs = Array.from(new Set(
      direct.map((interaction) => interaction.target).filter(Boolean)
    ));
    const downstreamDirect = await Promise.all(
      downstreamTFs.map((tfName) => loadPrebuiltDirectForTF(tfName))
    );
    const hierarchyMap = new Map<string, IntegratedInteraction>();
    const addRows = (rows: IntegratedInteraction[]) => {
      rows.forEach((interaction) => {
        if (!interaction.sources.some((source) => selectedSources.includes(source))) return;
        const key = [
          interaction.tf,
          interaction.target,
          interaction.evidenceCount,
          interaction.direction,
          interaction.sources.join('|')
        ].join('::');
        if (!hierarchyMap.has(key)) hierarchyMap.set(key, interaction);
      });
    };

    addRows(direct);
    addRows(prebuiltIncoming || []);
    downstreamDirect.forEach((rows) => addRows(rows || []));
    return Array.from(hierarchyMap.values());
  }

  const interactions = await loadInteractions();
  const direct = interactions.filter((interaction) => (
    interaction.tf === selectedTF &&
    interaction.sources.some((source) => selectedSources.includes(source))
  ));
  const directTargets = new Set(direct.map((interaction) => interaction.target));

  return interactions.filter((interaction) => {
    const matchesSource = interaction.sources.some((source) => selectedSources.includes(source));
    if (!matchesSource) return false;

    return (
      interaction.tf === selectedTF ||
      interaction.target === selectedTF ||
      directTargets.has(interaction.tf)
    );
  });
};

export const getLocalPathwayMappingForGenes = async (genes: string[]): Promise<PathwayMapping> => {
  const pathwayMapping = await loadPathwayMapping();
  const normalizedGenes = Array.from(new Set(
    genes
      .map((gene) => String(gene || '').trim().toUpperCase())
      .filter(Boolean)
  ));

  return Object.fromEntries(
    normalizedGenes.map((gene) => [gene, pathwayMapping[gene] || []])
  );
};

export const getLocalGeneMappingForGenes = async (genes: string[]): Promise<Record<string, string>> => {
  const geneMapping = await loadGeneMapping();
  const normalizedGenes = Array.from(new Set(
    genes
      .map((gene) => String(gene || '').trim().toUpperCase())
      .filter(Boolean)
  ));

  return Object.fromEntries(
    normalizedGenes
      .map((gene) => [gene, geneMapping[gene]])
      .filter(([, symbol]) => Boolean(symbol))
  );
};

export const getLocalGoAnnotationsByTerms = async (terms: string[]): Promise<Record<string, string[]>> => {
  const goAnnotations = await loadGoAnnotations();
  const normalizedTerms = Array.from(new Set(
    terms
      .map((term) => String(term || '').trim())
      .filter(Boolean)
  ));

  return Object.fromEntries(
    normalizedTerms.map((term) => [term, goAnnotations[term] || []])
  );
};

export const getLocalTfTargetSets = async (params: {
  minConfidence?: number;
  selectedSources?: string[];
}): Promise<Map<string, Set<string>>> => {
  const minEvidence = Math.max(1, Math.min(3, params.minConfidence || 1));
  const selectedSources = normalizeSelectedSources(params.selectedSources);
  const sourceKey = getSourceKey(selectedSources);

  const prebuiltTfTargetSets = await loadPrebuiltTfTargetSets();
  const prebuiltEntry = prebuiltTfTargetSets?.[String(minEvidence)]?.[sourceKey];
  if (prebuiltEntry) {
    return new Map(
      Object.entries(prebuiltEntry).map(([tf, targets]) => [tf, new Set(targets)])
    );
  }

  const interactions = await loadInteractions();
  const tfTargets = new Map<string, Set<string>>();
  interactions.forEach((interaction) => {
    if (interaction.evidenceCount < minEvidence) return;
    if (!interaction.sources.some((source) => selectedSources.includes(source))) return;

    const targetId = (interaction.targetId || interaction.target || '').toUpperCase();
    if (!targetId) return;

    const entry = tfTargets.get(interaction.tf) || new Set<string>();
    entry.add(targetId);
    tfTargets.set(interaction.tf, entry);
  });

  return tfTargets;
};

export const getLocalExploreAll = async (
  filters: Parameters<typeof filterInteractions>[1],
  onProgress?: (loaded: number, total: number) => void
): Promise<IntegratedInteraction[]> => {
  const interactions = await loadInteractions();
  const filtered = filterInteractions(interactions, filters);
  onProgress?.(filtered.length, filtered.length);
  return filtered;
};
