import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { IntegratedInteraction } from '../types';
import { loadPathwayData, PathwayData } from '../services/pathwayLoader';

interface PathwayViewProps {
    data: IntegratedInteraction[];
}

type Hormone = 'aba' | 'auxin' | 'water_deprivation' | 'osmotic_stress';

const HORMONE_OPTIONS: { value: Hormone; label: string; color: string }[] = [
    { value: 'aba', label: 'ABA Response', color: '#3b82f6' },
    { value: 'auxin', label: 'Auxin Signaling', color: '#10b981' },
    { value: 'water_deprivation', label: 'Water Deprivation', color: '#0ea5e9' },
    { value: 'osmotic_stress', label: 'Osmotic Stress', color: '#06b6d4' },
];

export default function PathwayView({ data }: PathwayViewProps) {
    const svgRef = useRef<SVGSVGElement>(null);
    const [selectedHormone, setSelectedHormone] = useState<Hormone>('aba');
    const [pathwayData, setPathwayData] = useState<PathwayData | null>(null);
    const [loading, setLoading] = useState(false);
    const [showLabels, setShowLabels] = useState(true);
    const [highlightRegulated, setHighlightRegulated] = useState(true);

    // Load pathway data when hormone changes
    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            try {
                const data = await loadPathwayData(selectedHormone);
                setPathwayData(data);
            } catch (error) {
                console.error('Failed to load pathway:', error);
                setPathwayData(null);
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [selectedHormone]);

    // Build TF → gene mapping from regulatory data
    const tfGeneMap = React.useMemo(() => {
        const map: Record<string, string[]> = {};
        data.forEach(({ tf, target }) => {
            if (!map[tf]) map[tf] = [];
            map[tf].push(target);
        });
        return map;
    }, [data]);

    // Render pathway visualization
    useEffect(() => {
        if (!svgRef.current || !pathwayData) return;

        const width = svgRef.current.clientWidth;
        const height = 800;

        const svg = d3.select(svgRef.current);
        svg.selectAll('*').remove();

        const g = svg.append('g');

        // Setup zoom
        const zoom = d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.1, 4])
            .on('zoom', (event) => {
                g.attr('transform', event.transform.toString());
            });

        svg.call(zoom);

        // Get regulated genes
        const regulatedGenes = new Set(data.map(d => d.target));

        // Find which TFs regulate pathway genes
        const activeTFs = new Set<string>();
        pathwayData.nodeContent.forEach(({ geneId }) => {
            data.forEach(({ tf, target }) => {
                if (geneId.includes(target) || target.includes(geneId)) {
                    activeTFs.add(tf);
                }
            });
        });

        // Draw edges first (so they appear behind nodes)
        pathwayData.edges.forEach(edge => {
            const source = pathwayData.nodes.find(n => n.nodeId === edge.source);
            const target = pathwayData.nodes.find(n => n.nodeId === edge.target);

            if (source && target) {
                const color = edge.type === 'activation' ? '#10b981' : edge.type === 'repression' ? '#ef4444' : '#64748b';

                g.append('line')
                    .attr('x1', source.x + source.width / 2)
                    .attr('y1', source.y + source.height / 2)
                    .attr('x2', target.x + target.width / 2)
                    .attr('y2', target.y + target.height / 2)
                    .attr('stroke', color)
                    .attr('stroke-width', 2)
                    .attr('opacity', 0.6);
            }
        });

        // Draw nodes
        pathwayData.nodes.forEach(node => {
            const nodeGroup = g.append('g').attr('transform', `translate(${node.x}, ${node.y})`);

            // Check if this node has regulated genes
            const nodeGenes = pathwayData.nodeContent
                .filter(nc => nc.nodeId === node.nodeId)
                .map(nc => nc.geneId);

            const hasRegulatedGenes = highlightRegulated && nodeGenes.some(geneId =>
                Array.from(regulatedGenes).some(rg => geneId.includes(rg) || rg.includes(geneId))
            );

            if (node.type === 'gene') {
                // Gene group (rectangle)
                nodeGroup.append('rect')
                    .attr('width', node.width)
                    .attr('height', node.height)
                    .attr('fill', hasRegulatedGenes ? '#10b981' : '#334155')
                    .attr('stroke', hasRegulatedGenes ? '#059669' : '#475569')
                    .attr('stroke-width', hasRegulatedGenes ? 3 : 2)
                    .attr('rx', 4);

                // Glow effect for regulated genes
                if (hasRegulatedGenes) {
                    nodeGroup.insert('rect', ':first-child')
                        .attr('width', node.width + 8)
                        .attr('height', node.height + 8)
                        .attr('x', -4)
                        .attr('y', -4)
                        .attr('fill', 'none')
                        .attr('stroke', '#10b981')
                        .attr('stroke-width', 2)
                        .attr('opacity', 0.3)
                        .attr('rx', 6);
                }

                if (showLabels) {
                    nodeGroup.append('text')
                        .text(node.displayName)
                        .attr('x', node.width / 2)
                        .attr('y', node.height / 2 + 4)
                        .attr('text-anchor', 'middle')
                        .attr('fill', hasRegulatedGenes ? 'white' : '#94a3b8')
                        .attr('font-size', '10px')
                        .attr('font-weight', hasRegulatedGenes ? 'bold' : 'normal');
                }

            } else if (node.type === 'compound') {
                // Compound (circle)
                const radius = Math.min(node.width, node.height) / 2;

                nodeGroup.append('circle')
                    .attr('cx', node.width / 2)
                    .attr('cy', node.height / 2)
                    .attr('r', radius)
                    .attr('fill', HORMONE_OPTIONS.find(h => h.value === selectedHormone)?.color || '#64748b')
                    .attr('stroke', '#1e293b')
                    .attr('stroke-width', 2);

                if (showLabels) {
                    nodeGroup.append('text')
                        .text(node.displayName)
                        .attr('x', node.width / 2)
                        .attr('y', node.height / 2 + radius + 15)
                        .attr('text-anchor', 'middle')
                        .attr('fill', '#e2e8f0')
                        .attr('font-size', '10px')
                        .attr('font-weight', 'bold');
                }
            }

            // Tooltip
            nodeGroup.append('title')
                .text(`${node.displayName}\nType: ${node.type}\nGenes: ${nodeGenes.length}\nRegulated: ${hasRegulatedGenes ? 'Yes' : 'No'}`);
        });

        // Add TF badges for genes regulated by TFs
        if (highlightRegulated) {
            const tfBadgeY = 20;
            let tfBadgeX = 20;

            Array.from(activeTFs).slice(0, 10).forEach((tf, idx) => {
                const badge = g.append('g').attr('transform', `translate(${tfBadgeX}, ${tfBadgeY})`);

                badge.append('rect')
                    .attr('width', 60)
                    .attr('height', 24)
                    .attr('fill', '#10b981')
                    .attr('stroke', '#059669')
                    .attr('stroke-width', 2)
                    .attr('rx', 12);

                badge.append('text')
                    .text(tf)
                    .attr('x', 30)
                    .attr('y', 16)
                    .attr('text-anchor', 'middle')
                    .attr('fill', 'white')
                    .attr('font-size', '10px')
                    .attr('font-weight', 'bold');

                badge.append('title').text(`TF: ${tf}\nRegulates ${tfGeneMap[tf]?.length || 0} genes in this pathway`);

                tfBadgeX += 70;
            });

            if (activeTFs.size > 10) {
                g.append('text')
                    .text(`+${activeTFs.size - 10} more TFs`)
                    .attr('x', tfBadgeX)
                    .attr('y', tfBadgeY + 16)
                    .attr('fill', '#64748b')
                    .attr('font-size', '10px')
                    .attr('font-style', 'italic');
            }
        }

        // Reset zoom on double-click
        svg.on('dblclick.zoom', null);
        svg.on('dblclick', () => {
            svg.transition().duration(750).call(zoom.transform as any, d3.zoomIdentity);
        });

    }, [pathwayData, data, showLabels, highlightRegulated, selectedHormone, tfGeneMap]);

    return (
        <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-3xl shadow-2xl border border-slate-700 flex flex-col overflow-hidden h-[800px] relative">
            {/* Header */}
            <div className="p-6 border-b border-slate-700 bg-slate-900/50 backdrop-blur-sm flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                        <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                        </svg>
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-white tracking-tight">Pathway View</h3>
                        <p className="text-sm text-emerald-400 font-medium">KEGG Pathway with TF Regulation</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {/* Hormone Selector */}
                    <select
                        value={selectedHormone}
                        onChange={(e) => setSelectedHormone(e.target.value as Hormone)}
                        className="px-4 py-2 bg-slate-800/50 border border-slate-700 rounded-xl text-sm font-bold text-emerald-400 outline-none focus:ring-2 focus:ring-emerald-500"
                        disabled={loading}
                    >
                        {HORMONE_OPTIONS.map(option => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>

                    {/* Highlight Regulated Toggle */}
                    <button
                        onClick={() => setHighlightRegulated(!highlightRegulated)}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${highlightRegulated
                                ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400 border'
                                : 'bg-slate-800 border-slate-700 text-slate-400 border'
                            }`}
                    >
                        {highlightRegulated ? '✓ Highlight Regulated' : 'Highlight Regulated'}
                    </button>

                    {/* Show Labels Toggle */}
                    <button
                        onClick={() => setShowLabels(!showLabels)}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${showLabels
                                ? 'bg-teal-500/20 border-teal-500/30 text-teal-400 border'
                                : 'bg-slate-800 border-slate-700 text-slate-400 border'
                            }`}
                    >
                        {showLabels ? 'Hide Labels' : 'Show Labels'}
                    </button>
                </div>
            </div>

            {/* Visualization */}
            <div className="flex-1 relative bg-slate-950/50 overflow-hidden">
                {/* Legend */}
                <div className="absolute top-6 left-6 p-4 bg-slate-900/80 backdrop-blur-md border border-slate-700 rounded-2xl z-10 shadow-2xl">
                    <div className="text-xs font-bold text-emerald-400 mb-3">Legend</div>
                    <div className="text-xs text-slate-300 space-y-2">
                        <div className="flex items-center gap-2">
                            <div className="w-6 h-4 bg-slate-700 rounded"></div>
                            <span>Gene Group</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-4 h-4 rounded-full" style={{ backgroundColor: HORMONE_OPTIONS.find(h => h.value === selectedHormone)?.color }}></div>
                            <span>Compound</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-6 h-4 bg-emerald-500 rounded"></div>
                            <span>Regulated</span>
                        </div>
                    </div>
                    <div className="text-xs text-slate-400 mt-3 pt-3 border-t border-slate-700">
                        <div>• Scroll to zoom</div>
                        <div>• Drag to pan</div>
                        <div>• Double-click to reset</div>
                    </div>
                </div>

                {/* Stats */}
                {pathwayData && (
                    <div className="absolute top-6 right-6 p-4 bg-slate-900/80 backdrop-blur-md border border-slate-700 rounded-2xl shadow-2xl">
                        <div className="grid grid-cols-3 gap-4 text-center">
                            <div>
                                <div className="text-2xl font-black text-emerald-400">{pathwayData.nodes.length}</div>
                                <div className="text-[10px] font-bold text-slate-400 uppercase">Nodes</div>
                            </div>
                            <div>
                                <div className="text-2xl font-black text-teal-400">{pathwayData.edges.length}</div>
                                <div className="text-[10px] font-bold text-slate-400 uppercase">Edges</div>
                            </div>
                            <div>
                                <div className="text-2xl font-black text-cyan-400">{pathwayData.nodeContent.length}</div>
                                <div className="text-[10px] font-bold text-slate-400 uppercase">Genes</div>
                            </div>
                        </div>
                    </div>
                )}

                {loading ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="text-center">
                            <div className="text-6xl mb-4 animate-pulse">🧬</div>
                            <div className="text-xl font-bold text-slate-400">Loading pathway...</div>
                        </div>
                    </div>
                ) : !pathwayData ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="text-center">
                            <div className="text-6xl mb-4">⚠️</div>
                            <div className="text-xl font-bold text-slate-400">Failed to load pathway</div>
                            <div className="text-sm text-slate-500 mt-2">Try selecting a different hormone</div>
                        </div>
                    </div>
                ) : (
                    <svg ref={svgRef} className="w-full h-full"></svg>
                )}
            </div>
        </div>
    );
}
