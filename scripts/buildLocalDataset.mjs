import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import readline from 'readline';

const ROOT = path.resolve(process.cwd());
const DATA_DIR = path.join(ROOT, 'public', 'data');
const OUT_DIR = path.join(DATA_DIR, 'prebuilt');
const INTERACTION_CHUNK_DIR = path.join(OUT_DIR, 'interaction_chunks');
const TF_INCOMING_DIR = path.join(OUT_DIR, 'tf_incoming');
const VALID_SOURCES = ['TARGET', 'DAP', 'CHIP'];
const INTERACTION_CHUNK_COUNT = 32;
const SOURCE_COMBINATIONS = [
  ['TARGET'],
  ['DAP'],
  ['CHIP'],
  ['TARGET', 'DAP'],
  ['TARGET', 'CHIP'],
  ['DAP', 'CHIP'],
  ['TARGET', 'DAP', 'CHIP']
];

function sourceFromFileName(fileName) {
  if (fileName.startsWith('dap')) return 'DAP';
  if (fileName.startsWith('chip')) return 'CHIP';
  return 'TARGET';
}

function datasetFiles(baseName) {
  const single = path.join(DATA_DIR, baseName);
  if (fs.existsSync(single)) return [single];

  const files = [];
  for (let idx = 1; idx <= 99; idx += 1) {
    const suffix = String(idx).padStart(2, '0');
    const candidate = path.join(DATA_DIR, baseName.replace('.tsv', `.part${suffix}.tsv`));
    if (!fs.existsSync(candidate)) break;
    files.push(candidate);
  }
  return files;
}

async function loadGeneMapping() {
  const mapping = {};
  const text = await fsp.readFile(path.join(DATA_DIR, 'mapping.tsv'), 'utf8');
  text.split(/\r?\n/).forEach((line) => {
    const [id, symbol] = line.split('\t').map((value) => (value || '').trim());
    if (id && symbol) mapping[id.toUpperCase()] = symbol;
  });
  return mapping;
}

async function loadPathwayMapping() {
  const mapping = {};
  const text = await fsp.readFile(path.join(DATA_DIR, 'process.txt'), 'utf8');
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
}

async function loadGoAnnotations() {
  const result = {};
  const text = await fsp.readFile(path.join(DATA_DIR, 'go_annotations.tsv'), 'utf8');
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
      if (geneId && term) result[term].push(geneId);
    });
  });
  return result;
}

function computeStats(interactions) {
  return {
    totalInteractions: interactions.length,
    sourceCounts: VALID_SOURCES.map((source) => ({
      name: source,
      count: interactions.filter((item) => item.sources.includes(source)).length
    })),
    highConfidence3: interactions.filter((item) => item.evidenceCount >= 3).length,
    uniqueTFs: new Set(interactions.map((item) => item.tf)).size,
    uniqueTargets: new Set(interactions.map((item) => item.target)).size
  };
}

function buildTfTargetSets(interactions) {
  const result = { '1': {}, '2': {}, '3': {} };

  for (const minEvidence of [1, 2, 3]) {
    for (const selectedSources of SOURCE_COMBINATIONS) {
      const sourceKey = selectedSources.join('|');
      const tfTargets = {};

      interactions.forEach((interaction) => {
        if (interaction.evidenceCount < minEvidence) return;
        if (!interaction.sources.some((source) => selectedSources.includes(source))) return;

        const targetId = (interaction.targetId || interaction.target || '').toUpperCase();
        if (!targetId) return;

        if (!tfTargets[interaction.tf]) tfTargets[interaction.tf] = new Set();
        tfTargets[interaction.tf].add(targetId);
      });

      result[String(minEvidence)][sourceKey] = Object.fromEntries(
        Object.entries(tfTargets).map(([tf, targetIds]) => [tf, Array.from(targetIds).sort()])
      );
    }
  }

  return result;
}

async function integrateInteractions(geneMapping) {
  const resolve = (id) => geneMapping[id.toUpperCase()] || id.toUpperCase();
  const integrated = new Map();

  for (const baseName of ['dap.tsv', 'chip.tsv', 'target.tsv']) {
    const files = datasetFiles(baseName);
    if (!files.length) continue;

    for (const filePath of files) {
      const source = sourceFromFileName(path.basename(filePath));
      const stream = fs.createReadStream(filePath, 'utf8');
      const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

      let headers = null;
      let tfIdx = -1;
      let targetIdx = -1;
      let posIdx = -1;
      let negIdx = -1;
      let isFirst = true;

      for await (const rawLine of rl) {
        const line = rawLine.trimEnd();
        if (!line.trim()) continue;

        if (isFirst) {
          headers = line.split('\t').map((header) => header.trim().toUpperCase());
          tfIdx = headers.indexOf('TF');
          targetIdx = headers.indexOf('TARGET');
          posIdx = headers.indexOf('EXPERIMENTOS_POS');
          negIdx = headers.indexOf('EXPERIMENTOS_NEG');
          isFirst = false;
          continue;
        }

        const parts = line.split('\t');
        const tfId = (parts[tfIdx] || '').trim();
        const targetId = (parts[targetIdx] || '').trim();
        if (!tfId || !targetId) continue;

        const p = parts[posIdx]?.trim();
        const n = parts[negIdx]?.trim();
        let direction = 'unknown';
        if (p && !n) direction = 'activation';
        else if (n && !p) direction = 'repression';
        else if (p && n) direction = 'both';

        const tf = resolve(tfId);
        const target = resolve(targetId);
        const key = `${tf}::${target}`;

        if (!integrated.has(key)) {
          integrated.set(key, {
            tf,
            target,
            tfId,
            targetId,
            sources: [source],
            evidenceCount: 1,
            isHighConfidence: false,
            direction,
            details: {
              [source]: {
                experimentos_pos: p,
                experimentos_neg: n
              }
            }
          });
          continue;
        }

        const entry = integrated.get(key);
        if (!entry.sources.includes(source)) {
          entry.sources.push(source);
          entry.evidenceCount = entry.sources.length;
        }
        if (entry.direction === 'unknown' && direction !== 'unknown') {
          entry.direction = direction;
        }
        if (!entry.details[source]) {
          entry.details[source] = {
            experimentos_pos: p,
            experimentos_neg: n
          };
        }
      }
    }
  }

  return Array.from(integrated.values())
    .map((item) => ({
      ...item,
      isHighConfidence: item.evidenceCount >= 2,
      sources: VALID_SOURCES.filter((source) => item.sources.includes(source))
    }))
    .sort((a, b) => b.evidenceCount - a.evidenceCount || a.tf.localeCompare(b.tf) || a.target.localeCompare(b.target));
}

async function writeJson(fileName, value) {
  await fsp.writeFile(path.join(OUT_DIR, fileName), JSON.stringify(value));
}

async function writeTfShardIndexes(interactions) {
  await fsp.mkdir(INTERACTION_CHUNK_DIR, { recursive: true });
  await fsp.mkdir(TF_INCOMING_DIR, { recursive: true });

  const byTf = new Map();
  const byTarget = new Map();
  interactions.forEach((interaction) => {
    if (!byTf.has(interaction.tf)) byTf.set(interaction.tf, []);
    byTf.get(interaction.tf).push(interaction);
    if (!byTarget.has(interaction.target)) byTarget.set(interaction.target, []);
    byTarget.get(interaction.target).push(interaction);
  });

  const tfChunkIndex = {};
  const incomingIndex = {};
  const tfList = Array.from(byTf.keys()).sort();
  const chunkRows = Array.from({ length: INTERACTION_CHUNK_COUNT }, () => []);

  const chunkIdForTf = (tf) => {
    let hash = 0;
    for (const ch of tf) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    return hash % INTERACTION_CHUNK_COUNT;
  };

  for (const [position, tf] of tfList.entries()) {
    const direct = byTf.get(tf) || [];
    const chunkId = chunkIdForTf(tf);
    const chunkFileName = `${String(chunkId).padStart(2, '0')}.json`;
    tfChunkIndex[tf] = chunkFileName;
    chunkRows[chunkId].push(...direct);

    const incoming = byTarget.get(tf) || [];
    if (incoming.length > 0) {
      const incomingFileName = `${String(position).padStart(4, '0')}.json`;
      incomingIndex[tf] = incomingFileName;
      await fsp.writeFile(path.join(TF_INCOMING_DIR, incomingFileName), JSON.stringify(incoming));
    }
  }

  await Promise.all(
    chunkRows.map((rows, index) => (
      fsp.writeFile(
        path.join(INTERACTION_CHUNK_DIR, `${String(index).padStart(2, '0')}.json`),
        JSON.stringify(rows)
      )
    ))
  );

  return { tfChunkIndex, incomingIndex };
}

async function main() {
  await fsp.mkdir(OUT_DIR, { recursive: true });

  console.log('Loading mappings...');
  const [geneMapping, pathwayMapping, goAnnotations] = await Promise.all([
    loadGeneMapping(),
    loadPathwayMapping(),
    loadGoAnnotations()
  ]);

  console.log('Integrating interactions...');
  const interactions = await integrateInteractions(geneMapping);

  console.log('Computing manifest...');
  const { tfChunkIndex, incomingIndex } = await writeTfShardIndexes(interactions);
  const manifest = {
    generatedAt: new Date().toISOString(),
    stats: computeStats(interactions),
    statsByEvidence: {
      '1': computeStats(interactions),
      '2': computeStats(interactions.filter((item) => item.evidenceCount >= 2)),
      '3': computeStats(interactions.filter((item) => item.evidenceCount >= 3))
    },
    tfOptions: Array.from(new Set(interactions.map((interaction) => interaction.tf))).sort(),
    interactionChunkCount: INTERACTION_CHUNK_COUNT,
    tfChunkIndex,
    tfIncomingIndex: incomingIndex
  };
  const tfTargetSets = buildTfTargetSets(interactions);

  console.log('Writing prebuilt artifacts...');
  await Promise.all([
    writeJson('manifest.json', manifest),
    writeJson('gene_mapping.json', geneMapping),
    writeJson('pathway_mapping.json', pathwayMapping),
    writeJson('go_annotations.json', goAnnotations),
    writeJson('tf_target_sets.json', tfTargetSets)
  ]);

  console.log(`Prebuilt dataset written to ${OUT_DIR}`);
  console.log(`Interactions: ${interactions.length.toLocaleString()}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
