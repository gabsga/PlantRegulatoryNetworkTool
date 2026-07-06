import { GeneMapping, IntegratedDataset, IntegratedInteraction, PathwayMapping, RegulationDirection, ValidSource } from '../types';

interface RawInteraction {
  tf: string;
  target: string;
  source: ValidSource;
  direction?: RegulationDirection;
  metadata?: {
    experimentos_pos?: string;
    experimentos_neg?: string;
  };
}

const fetchText = async (url: string): Promise<string> => {
  const res = await fetch(url);
  if (!res.ok) return '';
  const text = await res.text();
  const trimmed = text.trimStart();
  const lowered = trimmed.slice(0, 64).toLowerCase();

  // In dev, missing static files can resolve to index.html with a 200 response.
  // Treat obvious HTML fallbacks as "missing" so split TSV discovery can continue.
  if (lowered.startsWith('<!doctype html') || lowered.startsWith('<html')) {
    return '';
  }

  return text;
};

const loadDataText = async (baseName: string): Promise<string> => {
  const single = await fetchText(`/data/${baseName}`);
  if (single) return single;

  const partTexts: string[] = [];
  for (let idx = 1; idx <= 99; idx += 1) {
    const suffix = String(idx).padStart(2, '0');
    const part = await fetchText(`/data/${baseName.replace('.tsv', `.part${suffix}.tsv`)}`);
    if (!part) break;
    partTexts.push(part);
  }

  if (partTexts.length === 0) return '';

  return partTexts
    .map((text, idx) => {
      if (idx === 0) return text;
      const lines = text.split(/\r?\n/);
      return lines.slice(1).join('\n');
    })
    .join('\n');
};

const parseTSV = (text: string, source: ValidSource): RawInteraction[] => {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length < 2) return [];

  const headers = lines[0].split('\t').map((header) => header.trim().toUpperCase());
  const tfIdx = headers.indexOf('TF');
  const targetIdx = headers.indexOf('TARGET');
  const posIdx = headers.indexOf('EXPERIMENTOS_POS');
  const negIdx = headers.indexOf('EXPERIMENTOS_NEG');

  if (tfIdx === -1 || targetIdx === -1) return [];

  return lines.slice(1).map((line) => {
    const parts = line.split('\t');
    const p = parts[posIdx]?.trim();
    const n = parts[negIdx]?.trim();
    let direction: RegulationDirection = 'unknown';

    if (p && !n) direction = 'activation';
    else if (n && !p) direction = 'repression';
    else if (p && n) direction = 'both';

    return {
      tf: (parts[tfIdx] || '').trim(),
      target: (parts[targetIdx] || '').trim(),
      source,
      direction,
      metadata: { experimentos_pos: p, experimentos_neg: n }
    };
  }).filter((row) => row.tf && row.target);
};

const parseMapping = (text: string): GeneMapping => {
  const mapping: GeneMapping = {};
  text.split(/\r?\n/).forEach((line) => {
    const [id, symbol] = line.split('\t').map((value) => value.trim());
    if (id && symbol) mapping[id.toUpperCase()] = symbol;
  });
  return mapping;
};

const parsePathways = (text: string): PathwayMapping => {
  const mapping: PathwayMapping = {};
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length < 2) return mapping;

  const headers = lines[0].split('\t').map((header) => header.trim());
  lines.slice(1).forEach((line) => {
    const parts = line.split('\t');
    parts.forEach((gene, index) => {
      const geneId = gene.trim().toUpperCase();
      const processName = headers[index];
      if (!geneId || !processName) return;
      if (!mapping[geneId]) mapping[geneId] = [];
      if (!mapping[geneId].includes(processName)) mapping[geneId].push(processName);
    });
  });

  return mapping;
};

const parseGOAnnotations = (text: string): Record<string, string[]> => {
  const result: Record<string, string[]> = {};
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length < 2) return result;

  const headers = lines[0].split('\t').map((header) => header.trim());
  headers.forEach((header) => {
    if (header) result[header] = [];
  });

  lines.slice(1).forEach((line) => {
    const parts = line.split('\t');
    parts.forEach((gene, index) => {
      const geneId = gene.trim().toUpperCase();
      const term = headers[index];
      if (geneId && term) {
        result[term].push(geneId);
      }
    });
  });

  return result;
};

const integrateLocalRows = (rows: RawInteraction[], geneMapping: GeneMapping): IntegratedInteraction[] => {
  const map = new Map<string, IntegratedInteraction>();
  const resolve = (id: string) => geneMapping[id.toUpperCase()] || id.toUpperCase();

  rows.forEach((item) => {
    const tfLabel = resolve(item.tf);
    const targetLabel = resolve(item.target);
    const key = `${tfLabel}::${targetLabel}`;

    if (!map.has(key)) {
      map.set(key, {
        tf: tfLabel,
        target: targetLabel,
        tfId: item.tf,
        targetId: item.target,
        sources: [item.source],
        evidenceCount: 1,
        isHighConfidence: false,
        direction: item.direction || 'unknown',
        details: { [item.source]: item.metadata }
      });
      return;
    }

    const entry = map.get(key)!;
    if (!entry.sources.includes(item.source)) {
      entry.sources.push(item.source);
      entry.evidenceCount = entry.sources.length;
    }
    if (entry.direction === 'unknown' && item.direction && item.direction !== 'unknown') {
      entry.direction = item.direction;
    }
    if (!entry.details[item.source]) {
      entry.details[item.source] = item.metadata;
    }
  });

  return Array.from(map.values())
    .map((value) => ({
      ...value,
      isHighConfidence: value.evidenceCount >= 2
    }))
    .sort((a, b) => b.evidenceCount - a.evidenceCount);
};

export const loadIntegratedDataFromStaticFiles = async (
  onProgress?: (msg: string) => void
): Promise<IntegratedDataset> => {
  onProgress?.('Loading regulatory datasets...');

  const [dapText, chipText, targetText, mapText, procText, goText] = await Promise.all([
    loadDataText('dap.tsv'),
    loadDataText('chip.tsv'),
    loadDataText('target.tsv'),
    loadDataText('mapping.tsv'),
    loadDataText('process.txt'),
    loadDataText('go_annotations.tsv')
  ]);

  onProgress?.('Parsing datasets...');
  const dapData = parseTSV(dapText, 'DAP');
  const chipData = parseTSV(chipText, 'CHIP');
  const targetData = parseTSV(targetText, 'TARGET');

  onProgress?.('Processing annotations...');
  const geneMapping = parseMapping(mapText);
  const pathwayMapping = parsePathways(procText);
  const goAnnotations = parseGOAnnotations(goText);

  onProgress?.('Integrating network model...');
  const interactions = integrateLocalRows([...dapData, ...chipData, ...targetData], geneMapping);

  return {
    interactions,
    geneMapping,
    pathwayMapping,
    goAnnotations,
    totalInteractions: interactions.length
  };
};
