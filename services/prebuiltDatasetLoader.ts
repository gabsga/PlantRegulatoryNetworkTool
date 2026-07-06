import { DatasetManifest, GeneMapping, IntegratedDataset, IntegratedInteraction, PathwayMapping, TfTargetSetsByKey, VALID_SOURCES } from '../types';

const PREBUILT_BASE = '/data/prebuilt';
const INTERACTION_CHUNK_DIR = `${PREBUILT_BASE}/interaction_chunks`;

let manifestPromise: Promise<DatasetManifest | null> | null = null;
let interactionsPromise: Promise<IntegratedInteraction[] | null> | null = null;
let geneMappingPromise: Promise<GeneMapping | null> | null = null;
let pathwayMappingPromise: Promise<PathwayMapping | null> | null = null;
let goAnnotationsPromise: Promise<Record<string, string[]> | null> | null = null;
let tfTargetSetsPromise: Promise<TfTargetSetsByKey | null> | null = null;
const interactionChunkPromises = new Map<string, Promise<IntegratedInteraction[] | null>>();
const tfIncomingPromises = new Map<string, Promise<IntegratedInteraction[] | null>>();

const fetchJson = async <T>(url: string): Promise<T | null> => {
  const res = await fetch(url);
  if (!res.ok) return null;
  const text = await res.text();
  const trimmed = text.trimStart();
  const lowered = trimmed.slice(0, 64).toLowerCase();
  if (lowered.startsWith('<!doctype html') || lowered.startsWith('<html')) {
    return null;
  }
  return JSON.parse(text) as T;
};

export const loadPrebuiltManifest = async (): Promise<DatasetManifest | null> => {
  if (!manifestPromise) {
    manifestPromise = fetchJson<DatasetManifest>(`${PREBUILT_BASE}/manifest.json`);
  }
  return manifestPromise;
};

export const loadPrebuiltInteractions = async (): Promise<IntegratedInteraction[] | null> => {
  if (!interactionsPromise) {
    interactionsPromise = (async () => {
      const manifest = await loadPrebuiltManifest();
      const chunkCount = manifest?.interactionChunkCount || 0;
      if (!chunkCount) return null;

      const chunks = await Promise.all(
        Array.from({ length: chunkCount }, (_, index) => {
          const fileName = `${String(index).padStart(2, '0')}.json`;
          return loadPrebuiltInteractionChunk(fileName);
        })
      );

      if (chunks.some((chunk) => chunk === null)) return null;
      return chunks.flatMap((chunk) => chunk || []);
    })();
  }
  return interactionsPromise;
};

export const loadPrebuiltInteractionChunk = async (fileName: string): Promise<IntegratedInteraction[] | null> => {
  if (!interactionChunkPromises.has(fileName)) {
    interactionChunkPromises.set(fileName, fetchJson<IntegratedInteraction[]>(`${INTERACTION_CHUNK_DIR}/${fileName}`));
  }
  return interactionChunkPromises.get(fileName)!;
};

export const loadPrebuiltGeneMapping = async (): Promise<GeneMapping | null> => {
  if (!geneMappingPromise) {
    geneMappingPromise = fetchJson<GeneMapping>(`${PREBUILT_BASE}/gene_mapping.json`);
  }
  return geneMappingPromise;
};

export const loadPrebuiltPathwayMapping = async (): Promise<PathwayMapping | null> => {
  if (!pathwayMappingPromise) {
    pathwayMappingPromise = fetchJson<PathwayMapping>(`${PREBUILT_BASE}/pathway_mapping.json`);
  }
  return pathwayMappingPromise;
};

export const loadPrebuiltGoAnnotations = async (): Promise<Record<string, string[]> | null> => {
  if (!goAnnotationsPromise) {
    goAnnotationsPromise = fetchJson<Record<string, string[]>>(`${PREBUILT_BASE}/go_annotations.json`);
  }
  return goAnnotationsPromise;
};

export const loadPrebuiltTfTargetSets = async (): Promise<TfTargetSetsByKey | null> => {
  if (!tfTargetSetsPromise) {
    tfTargetSetsPromise = fetchJson<TfTargetSetsByKey>(`${PREBUILT_BASE}/tf_target_sets.json`);
  }
  return tfTargetSetsPromise;
};

export const loadPrebuiltDirectForTF = async (tf: string): Promise<IntegratedInteraction[] | null> => {
  const selectedTF = tf.trim();
  if (!selectedTF) return null;

  const manifest = await loadPrebuiltManifest();
  const fileName = manifest?.tfChunkIndex?.[selectedTF];
  if (!fileName) return null;

  const chunk = await loadPrebuiltInteractionChunk(fileName);
  if (!chunk) return null;
  return chunk.filter((interaction) => interaction.tf === selectedTF);
};

export const loadPrebuiltIncomingForTF = async (tf: string): Promise<IntegratedInteraction[] | null> => {
  const selectedTF = tf.trim();
  if (!selectedTF) return null;

  if (!tfIncomingPromises.has(selectedTF)) {
    tfIncomingPromises.set(selectedTF, (async () => {
      const manifest = await loadPrebuiltManifest();
      const fileName = manifest?.tfIncomingIndex?.[selectedTF];
      if (!fileName) return null;
      return fetchJson<IntegratedInteraction[]>(`${PREBUILT_BASE}/tf_incoming/${fileName}`);
    })());
  }

  return tfIncomingPromises.get(selectedTF)!;
};

export const loadIntegratedDataFromPrebuilt = async (): Promise<IntegratedDataset | null> => {
  const [manifest, interactions, geneMapping, pathwayMapping, goAnnotations] = await Promise.all([
    loadPrebuiltManifest(),
    loadPrebuiltInteractions(),
    loadPrebuiltGeneMapping(),
    loadPrebuiltPathwayMapping(),
    loadPrebuiltGoAnnotations()
  ]);

  if (!interactions || !geneMapping || !pathwayMapping || !goAnnotations) {
    return null;
  }

  const fallbackStats = {
    totalInteractions: interactions.length,
    sourceCounts: VALID_SOURCES.map((source) => ({
      name: source,
      count: interactions.filter((item) => item.sources.includes(source)).length
    })),
    highConfidence3: interactions.filter((item) => item.evidenceCount >= 3).length,
    uniqueTFs: new Set(interactions.map((item) => item.tf)).size,
    uniqueTargets: new Set(interactions.map((item) => item.target)).size
  };

  return {
    interactions,
    geneMapping,
    pathwayMapping,
    goAnnotations,
    totalInteractions: manifest?.stats.totalInteractions || interactions.length,
    stats: manifest?.stats || fallbackStats
  };
};
