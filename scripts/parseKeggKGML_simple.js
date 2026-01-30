/**
 * Simple KEGG KGML Parser (No external dependencies)
 * Converts KEGG KGML files to TSV format compatible with the pathway visualization
 * 
 * Usage (WSL): node scripts/parseKeggKGML_simple.js ath04075.xml public/data/pathways/aba ABA
 */

const fs = require('fs');
const path = require('path');

// Hormone-related compound IDs from KEGG
const HORMONE_COMPOUNDS = {
    'ABA': ['C06082'],  // Abscisic acid
    'AUXIN': ['C00954'], // IAA (Indole-3-acetic acid)
    'ETHYLENE': ['C06547'], // Ethylene
    'CYTOKININ': ['C00371', 'C04083', 'C02029'], // Cytokinins
    'GIBBERELLIN': ['C00859', 'C11864'], // Gibberellins
    'BRASSINOSTEROID': ['C08814'], // Brassinolide
    'JASMONIC_ACID': ['C08491'], // Jasmonic acid
    'SALICYLIC_ACID': ['C00805'], // Salicylic acid
    'WATER_DEPRIVATION': ['C06082'], // ABA is key for water deprivation
    'OSMOTIC_STRESS': ['C06082'] // ABA is key for osmotic stress
};

function parseKGML(xmlPath, outputDir, hormoneFilter = null) {
    console.log(`Parsing KGML file: ${xmlPath}`);

    // Read XML
    const xmlData = fs.readFileSync(xmlPath, 'utf8');

    // Simple regex-based parsing (works for KGML structure)
    const entryMatches = [...xmlData.matchAll(/<entry id="(\d+)"[^>]*name="([^"]*)"[^>]*type="([^"]*)"[^>]*>/g)];
    const graphicsMatches = [...xmlData.matchAll(/<graphics name="([^"]*)"[^>]*x="([^"]*)"[^>]*y="([^"]*)"[^>]*width="([^"]*)"[^>]*height="([^"]*)"/g)];
    const relationMatches = [...xmlData.matchAll(/<relation entry1="(\d+)" entry2="(\d+)" type="([^"]*)"/g)];
    const subtypeMatches = [...xmlData.matchAll(/<subtype name="([^"]*)"[^>]*>/g)];

    console.log(`Found ${entryMatches.length} entries and ${relationMatches.length} relations`);

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

    // Build entry map
    const entries = [];
    let graphicsIndex = 0;

    entryMatches.forEach(match => {
        const [, id, name, type] = match;
        const graphics = graphicsMatches[graphicsIndex];

        if (graphics) {
            const [, gName, x, y, width, height] = graphics;
            entries.push({
                id,
                name,
                type,
                graphics: { name: gName, x, y, width, height }
            });
            graphicsIndex++;
        }
    });

    // Extract nodes
    const nodes = [];
    const nodeContent = [];

    entries.forEach(entry => {
        const { id, name, type, graphics } = entry;

        if (!graphics) return;
        if (type === 'map' || type === 'group') return;

        // For compounds
        if (type === 'compound') {
            const compoundId = name.replace('cpd:', '').split(' ')[0];

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
            const geneNames = name.split(' ');
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

    // Extract edges
    const edges = [];
    const nodeIds = new Set(nodes.map(n => n.node_id));

    // Parse relations with their subtypes
    let currentRelation = null;
    const lines = xmlData.split('\n');

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // New relation
        const relMatch = line.match(/<relation entry1="(\d+)" entry2="(\d+)" type="([^"]*)"/);
        if (relMatch) {
            if (currentRelation && nodeIds.has(currentRelation.from) && nodeIds.has(currentRelation.to)) {
                edges.push(currentRelation);
            }

            currentRelation = {
                from: relMatch[1],
                to: relMatch[2],
                type: relMatch[3],
                regulation: 'unknown',
                subtype: ''
            };
            continue;
        }

        // Subtype within relation
        const subtypeMatch = line.match(/<subtype name="([^"]*)"[^>]*>/);
        if (subtypeMatch && currentRelation) {
            const name = subtypeMatch[1];
            currentRelation.subtype += (currentRelation.subtype ? ',' : '') + name;

            if (name === 'activation' || name === 'expression') {
                currentRelation.regulation = 'activation';
            } else if (name === 'inhibition' || name === 'repression') {
                currentRelation.regulation = 'repression';
            }
        }

        // End of relation
        if (line.includes('</relation>') && currentRelation) {
            if (nodeIds.has(currentRelation.from) && nodeIds.has(currentRelation.to)) {
                edges.push(currentRelation);
            }
            currentRelation = null;
        }
    }

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
    console.log(`\nNext steps:`);
    console.log(`1. Review the generated TSV files`);
    console.log(`2. Integrate with your visualization tool`);
    console.log(`3. Run for other hormones: ${Object.keys(HORMONE_COMPOUNDS).join(', ')}`);
}

function writeTSV(filePath, data, columns) {
    const header = columns.join('\t');
    const rows = data.map(row => columns.map(col => row[col] || '').join('\t'));
    const content = [header, ...rows].join('\n');
    fs.writeFileSync(filePath, 'utf8');
    console.log(`  Written: ${filePath} (${data.length} rows)`);
}

// Main execution
const args = process.argv.slice(2);
if (args.length < 2) {
    console.error('Usage: node parseKeggKGML_simple.js <input.xml> <output_dir> [hormone_filter]');
    console.error('Example: node parseKeggKGML_simple.js ath04075.xml public/data/pathways/aba ABA');
    console.error(`Available hormones: ${Object.keys(HORMONE_COMPOUNDS).join(', ')}`);
    process.exit(1);
}

const [inputFile, outputDir, hormoneFilter] = args;

parseKGML(inputFile, outputDir, hormoneFilter);
console.log('Done!');
