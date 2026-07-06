
export interface InteractionMetadata {
  experimentos?: string;
  experimentos_pos?: string;
  experimentos_neg?: string;
}

export const VALID_SOURCES = ['TARGET', 'DAP', 'CHIP'] as const;
export type ValidSource = typeof VALID_SOURCES[number];

export type RegulationDirection = 'activation' | 'repression' | 'both' | 'unknown';

export interface Interaction {
  tf: string;
  target: string;
  source: 'TARGET' | 'DAP' | 'CHIP';
  metadata?: InteractionMetadata;
  direction?: RegulationDirection;
}

export interface IntegratedInteraction {
  tf: string;
  target: string;
  tfId?: string; // Original Gene ID
  targetId?: string; // Original Gene ID
  sources: ('TARGET' | 'DAP' | 'CHIP')[];
  evidenceCount: number;
  isHighConfidence: boolean;
  direction: RegulationDirection;
  details: {
    [key in 'TARGET' | 'DAP' | 'CHIP']?: InteractionMetadata;
  };
}

export interface IntegratedDataset {
  interactions: IntegratedInteraction[];
  geneMapping: GeneMapping;
  pathwayMapping: PathwayMapping;
  goAnnotations: Record<string, string[]>;
  totalInteractions: number;
  stats?: DatasetStats;
}

export interface DatasetStats {
  totalInteractions?: number;
  sourceCounts: {
    name: 'TARGET' | 'DAP' | 'CHIP';
    count: number;
  }[];
  highConfidence3: number;
  uniqueTFs: number;
  uniqueTargets: number;
}

export interface DatasetManifest {
  generatedAt: string;
  stats: DatasetStats;
  statsByEvidence: Record<string, DatasetStats>;
  tfOptions: string[];
  interactionChunkCount?: number;
  tfChunkIndex?: Record<string, string>;
  tfIncomingIndex?: Record<string, string>;
}

export type TfTargetSetsByKey = Record<string, Record<string, string[]>>;

export interface TfNetworkBundle {
  direct: IntegratedInteraction[];
  hierarchy: IntegratedInteraction[];
}

export interface DataSource {
  id: 'TARGET' | 'DAP' | 'CHIP';
  name: string;
  data: Interaction[];
}

export interface GeneMapping {
  [id: string]: string;
}

export interface PathwayMapping {
  [id: string]: string[]; // Gene -> list of biological processes
}

export interface HubData {
  displayName: string;
  type: string;
  nGenes: number;
  genesList: string[];
}

export interface HubMapping {
  [geneId: string]: HubData;
}

export type AppView = 'landing' | 'explorer' | 'network' | 'enrichment';

export type NetworkColorMode = 'source' | 'regulation' | 'pathway';
export type NetworkLayoutMode = 'force' | 'hierarchical';
