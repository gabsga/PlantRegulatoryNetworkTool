/**
 * KEGG KGML Parser
 * Converts KEGG KGML files to TSV format compatible with the pathway visualization
 * 
 * Usage: node scripts/parseKeggKGML.js <input.xml> <output_dir> [hormone_filter]
 * Example: node scripts/parseKeggKGML.js ath04075.xml public/data/pathways/aba ABA
 */

const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');

// Hormone-related compound IDs from KEGG
const HORMONE_COMPOUNDS = {
    'ABA': ['C06082'],  // Abscisic acid
    'AUXIN': ['C00954'], // IAA (Indole-3-acetic acid)
    'ETHYLENE': ['C06547'], // Ethylene
    'CYTOKININ': ['C00371', 'C04083', 'C02029'], // Cytokinins
    'GIBBERELLIN': ['C00859', 'C11864'], // Gibberellins
    'BRASSINOSTEROID': ['C08814'], // Brassinolide
    'JASMONIC_ACID': ['C08491'], // Jasmonic acid
    'SALICYLIC_ACID': ['C00805'] // Salicylic acid
};

async function parseKGML(xmlPath, outputDir, hormoneFilter = null) {
    console.log(`Parsing KGML file: ${xmlPath}`);

    // Read and parse XML
    const xmlData = fs.readFileSync(xmlPath, 'utf8');
    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(xmlData);

    const pathway = result.pathway;
    const entries = pathway.entry || [];
    const relations = pathway.relation || [];

    console.log(`Found ${entries.length} entries and ${relations.length} relations`);

    // Filter by hormone if specified
    let relevantCompounds = [];
    if (hormoneFilter) {
        const hormone = hormoneFilter.toUpperCase();
        if (HORMONE_COMPOUNDS[hormone]) {
            relevantCompounds = HORMONE_COMPOUNDS[hormone];
            console.log(`Filtering for ${hormone}: ${relevantCompounds.join(', ')}`);
        } else {
            console.warn(`Unknown hormone: ${hormone}. Available: ${Object.keys(HORMONE_COMPOUNDS).join(', ')}`);
        }
    }

    // Build entry lookup
    const entryMap = {};
    entries.forEach(entry => {
        const id = entry.$.id;
        entryMap[id] = entry;
    });

    // Extract nodes (genes and compounds)
    const nodes = [];
    const nodeContent = [];
    let nodeIdCounter = 1;

    entries.forEach(entry => {
        const attrs = entry.$;
        const graphics = entry.graphics ? entry.graphics[0].$ : null;

        if (!graphics) return;

        const type = attrs.type;
        const id = attrs.id;

        // Skip map entries (pathway links)
        if (type === 'map' || type === 'group') return;

        // For compounds, check if it's a hormone we care about
        if (type === 'compound') {
            const compoundId = attrs.name.replace('cpd:', '');

            // If filtering, skip non-relevant compounds
            if (relevantCompounds.length > 0 && !relevantCompounds.includes(compoundId)) {
                return;
            }

            nodes.push({
                node_id: id,
                display_name: compoundId,
                type: 'compound',
                auxin_role: hormoneFilter ? `${hormoneFilter.toLowerCase()}_core` : 'hormone_core',
                x: graphics.x,
                y: graphics.y,
                width: graphics.width,
                height: graphics.height
            });

            nodeContent.push({
                node_id: id,
                display_name: compoundId,
                type: 'compound',
                gene_or_compound_id: compoundId,
                x: graphics.x,
                y: graphics.y
            });
        }

        // For genes
        if (type === 'gene') {
            const geneNames = attrs.name.split(' ');
            const displayName = graphics.name.replace('...', '');

            nodes.push({
                node_id: id,
                display_name: displayName,
                type: 'gene',
                auxin_role: hormoneFilter ? `${hormoneFilter.toLowerCase()}_core` : 'pathway_gene',
                x: graphics.x,
                y: graphics.y,
                width: graphics.width,
                height: graphics.height
            });

            // Add each gene to node_content
            geneNames.forEach(geneName => {
                const geneId = geneName.replace('ath:', '');
                nodeContent.push({
                    node_id: id,
                    display_name: displayName,
                    type: 'gene',
                    gene_or_compound_id: geneId,
                    x: graphics.x,
                    y: graphics.y
                });
            });
        }
    });

    // Extract edges (relations)
    const edges = [];

    relations.forEach(relation => {
        const attrs = relation.$;
        const from = attrs.entry1;
        const to = attrs.entry2;
        const type = attrs.type;

        // Get subtypes
        const subtypes = relation.subtype || [];
        let regulation = 'unknown';
        let subtypeStr = '';

        subtypes.forEach(st => {
            const name = st.$.name;
            subtypeStr += (subtypeStr ? ',' : '') + name;

            if (name === 'activation' || name === 'expression') {
                regulation = 'activation';
            } else if (name === 'inhibition' || name === 'repression') {
                regulation = 'repression';
            }
        });

        // Only include if both nodes exist in our filtered set
        const fromNode = nodes.find(n => n.node_id === from);
        const toNode = nodes.find(n => n.node_id === to);

        if (fromNode && toNode) {
            edges.push({
                from: from,
                to: to,
                type: type,
                regulation: regulation,
                subtype: subtypeStr
            });
        }
    });

    console.log(`Extracted ${nodes.length} nodes and ${edges.length} edges`);

    // Create output directory
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    // Write TSV files
    writeTSV(path.join(outputDir, 'nodes.tsv'), nodes, ['node_id', 'display_name', 'type', 'auxin_role', 'x', 'y', 'width', 'height']);
    writeTSV(path.join(outputDir, 'edges.tsv'), edges, ['from', 'to', 'type', 'regulation', 'subtype']);
    writeTSV(path.join(outputDir, 'content.tsv'), nodeContent, ['node_id', 'display_name', 'type', 'gene_or_compound_id', 'x', 'y']);

    console.log(`✓ Output written to ${outputDir}`);
}

function writeTSV(filePath, data, columns) {
    const header = columns.join('\t');
    const rows = data.map(row => columns.map(col => row[col] || '').join('\t'));
    const content = [header, ...rows].join('\n');
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`  Written: ${filePath} (${data.length} rows)`);
}

// Main execution
const args = process.argv.slice(2);
if (args.length < 2) {
    console.error('Usage: node parseKeggKGML.js <input.xml> <output_dir> [hormone_filter]');
    console.error('Example: node parseKeggKGML.js ath04075.xml public/data/pathways/aba ABA');
    console.error(`Available hormones: ${Object.keys(HORMONE_COMPOUNDS).join(', ')}`);
    process.exit(1);
}

const [inputFile, outputDir, hormoneFilter] = args;

parseKGML(inputFile, outputDir, hormoneFilter)
    .then(() => console.log('Done!'))
    .catch(err => {
        console.error('Error:', err);
        process.exit(1);
    });
