import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import { IntegratedInteraction, PathwayMapping } from '../types';

interface HierarchicalViewProps {
    data: IntegratedInteraction[];
    pathwayMapping: PathwayMapping;
    selectedTF: string;
    onTFChange: (tf: string) => void;
}

export default function HierarchicalView({ data, pathwayMapping, selectedTF, onTFChange }: HierarchicalViewProps) {
    const svgRef = useRef<SVGSVGElement>(null);
    const [showDownstreamTargets, setShowDownstreamTargets] = useState(false);
    const [showLabels, setShowLabels] = useState(true);

    // Get unique TFs
    const availableTFs = useMemo(() => {
        const tfSet = new Set(data.map(d => d.tf));
        return Array.from(tfSet).sort();
    }, [data]);

    // Build TF network
    const tfNetwork = useMemo(() => {
        const tfSet = new Set(data.map(d => d.tf));
        const network: Record<string, { upstream: string[], downstream: string[], targets: string[] }> = {};

        data.forEach(({ tf, target }) => {
            if (!network[tf]) network[tf] = { upstream: [], downstream: [], targets: [] };

            if (tfSet.has(target)) {
                // Target is also a TF - but exclude auto-regulation
                if (tf !== target) {
                    if (!network[target]) network[target] = { upstream: [], downstream: [], targets: [] };
                    network[tf].downstream.push(target);
                    network[target].upstream.push(tf);
                }
            } else {
                // Target is a regular gene
                network[tf].targets.push(target);
            }
        });

        return network;
    }, [data]);

    // Get hierarchy for selected TF
    const hierarchy = useMemo(() => {
        if (!selectedTF || !tfNetwork[selectedTF]) return null;

        const upstream = tfNetwork[selectedTF].upstream || [];
        const downstream = tfNetwork[selectedTF].downstream || [];
        const downstreamTargets: Record<string, string[]> = {};

        if (showDownstreamTargets) {
            downstream.forEach(tf => {
                downstreamTargets[tf] = tfNetwork[tf]?.targets || [];
            });
        }

        return { upstream, downstream, downstreamTargets };
    }, [selectedTF, tfNetwork, showDownstreamTargets]);

    // Get biological process color for TF
    const getTFColor = (tf: string): string => {
        const processes = pathwayMapping[tf] || [];

        for (const process of processes) {
            if (process.includes('ABA') || process.includes('abscisic')) return '#3b82f6';
            if (process.includes('WATER') || process.includes('water')) return '#0ea5e9';
            if (process.includes('OSMOTIC') || process.includes('osmotic')) return '#06b6d4';
            if (process.includes('AUXIN') || process.includes('auxin')) return '#10b981';
            if (process.includes('ETHYLENE') || process.includes('ethylene')) return '#f59e0b';
            if (process.includes('JASMONIC') || process.includes('jasmonic')) return '#ef4444';
            if (process.includes('CYTOKININ') || process.includes('cytokinin')) return '#8b5cf6';
            if (process.includes('GIBBERELLIN') || process.includes('gibberellin')) return '#ec4899';
        }

        return '#64748b'; // Default gray
    };

    useEffect(() => {
        if (!svgRef.current || !selectedTF || !hierarchy) return;

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

        // Layout parameters
        const levelSpacing = 200;
        const nodeSpacing = 120;
        const centerX = width / 2;

        // Level -1: Upstream TFs
        const upstreamY = 100;
        const upstreamStartX = centerX - ((hierarchy.upstream.length - 1) * nodeSpacing) / 2;

        hierarchy.upstream.forEach((tf, idx) => {
            const x = upstreamStartX + idx * nodeSpacing;
            const color = getTFColor(tf);

            const node = g.append('g').attr('transform', `translate(${x}, ${upstreamY})`);

            node.append('path')
                .attr('d', d3.symbol().type(d3.symbolTriangle).size(300)())
                .attr('fill', color)
                .attr('stroke', '#1e293b')
                .attr('stroke-width', 2);

            if (showLabels) {
                node.append('text')
                    .text(tf)
                    .attr('y', -20)
                    .attr('text-anchor', 'middle')
                    .attr('fill', color)
                    .attr('font-size', '12px')
                    .attr('font-weight', 'bold');
            }

            // Connection to selected TF
            g.append('line')
                .attr('x1', x)
                .attr('y1', upstreamY + 12)
                .attr('x2', centerX)
                .attr('y2', upstreamY + levelSpacing - 12)
                .attr('stroke', color)
                .attr('stroke-width', 2)
                .attr('opacity', 0.6)
                .attr('marker-end', 'url(#arrow)');

            node.append('title').text(`${tf}\nRegulates: ${selectedTF}`);
        });

        // Level 0: Selected TF
        const selectedY = upstreamY + levelSpacing;
        const selectedColor = getTFColor(selectedTF);

        const selectedNode = g.append('g').attr('transform', `translate(${centerX}, ${selectedY})`);

        selectedNode.append('path')
            .attr('d', d3.symbol().type(d3.symbolTriangle).size(500)())
            .attr('fill', selectedColor)
            .attr('stroke', '#10b981')
            .attr('stroke-width', 3);

        selectedNode.append('text')
            .text(selectedTF)
            .attr('y', -25)
            .attr('text-anchor', 'middle')
            .attr('fill', '#10b981')
            .attr('font-size', '16px')
            .attr('font-weight', 'bold');

        // Level +1: Downstream TFs
        const downstreamY = selectedY + levelSpacing;
        const downstreamStartX = centerX - ((hierarchy.downstream.length - 1) * nodeSpacing) / 2;

        hierarchy.downstream.forEach((tf, idx) => {
            const x = downstreamStartX + idx * nodeSpacing;
            const color = getTFColor(tf);

            const node = g.append('g').attr('transform', `translate(${x}, ${downstreamY})`);

            node.append('path')
                .attr('d', d3.symbol().type(d3.symbolTriangle).size(300)())
                .attr('fill', color)
                .attr('stroke', '#1e293b')
                .attr('stroke-width', 2);

            if (showLabels) {
                node.append('text')
                    .text(tf)
                    .attr('y', -20)
                    .attr('text-anchor', 'middle')
                    .attr('fill', color)
                    .attr('font-size', '12px')
                    .attr('font-weight', 'bold');
            }

            // Connection from selected TF
            g.append('line')
                .attr('x1', centerX)
                .attr('y1', selectedY + 12)
                .attr('x2', x)
                .attr('y2', downstreamY - 12)
                .attr('stroke', color)
                .attr('stroke-width', 2)
                .attr('opacity', 0.6)
                .attr('marker-end', 'url(#arrow)');

            // Downstream targets (if enabled)
            if (showDownstreamTargets && hierarchy.downstreamTargets[tf]) {
                const targets = hierarchy.downstreamTargets[tf].slice(0, 5); // Limit to 5
                const targetsY = downstreamY + 100;

                targets.forEach((target, targetIdx) => {
                    const targetX = x + (targetIdx - 2) * 30;

                    g.append('circle')
                        .attr('cx', targetX)
                        .attr('cy', targetsY)
                        .attr('r', 5)
                        .attr('fill', color)
                        .attr('stroke', '#1e293b')
                        .attr('stroke-width', 1.5);

                    g.append('line')
                        .attr('x1', x)
                        .attr('y1', downstreamY + 12)
                        .attr('x2', targetX)
                        .attr('y2', targetsY - 5)
                        .attr('stroke', color)
                        .attr('stroke-width', 1)
                        .attr('opacity', 0.4);

                    if (showLabels) {
                        g.append('text')
                            .text(target)
                            .attr('x', targetX)
                            .attr('y', targetsY + 20)
                            .attr('text-anchor', 'middle')
                            .attr('fill', '#94a3b8')
                            .attr('font-size', '9px');
                    }
                });

                if (hierarchy.downstreamTargets[tf].length > 5) {
                    g.append('text')
                        .text(`+${hierarchy.downstreamTargets[tf].length - 5} more`)
                        .attr('x', x)
                        .attr('y', targetsY + 40)
                        .attr('text-anchor', 'middle')
                        .attr('fill', '#64748b')
                        .attr('font-size', '10px')
                        .attr('font-style', 'italic');
                }
            }

            node.append('title').text(`${tf}\nRegulated by: ${selectedTF}\nTargets: ${tfNetwork[tf]?.targets.length || 0} genes`);
        });

        // Arrow marker
        const defs = svg.append('defs');
        defs.append('marker')
            .attr('id', 'arrow')
            .attr('viewBox', '0 -5 10 10')
            .attr('refX', 8)
            .attr('refY', 0)
            .attr('markerWidth', 6)
            .attr('markerHeight', 6)
            .attr('orient', 'auto')
            .append('path')
            .attr('d', 'M0,-5L10,0L0,5')
            .attr('fill', '#64748b');

        // Reset zoom on double-click
        svg.on('dblclick.zoom', null);
        svg.on('dblclick', () => {
            svg.transition().duration(750).call(zoom.transform as any, d3.zoomIdentity);
        });

    }, [selectedTF, hierarchy, showDownstreamTargets, showLabels, tfNetwork, pathwayMapping]);

    return (
        <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-3xl shadow-2xl border border-slate-700 flex flex-col overflow-hidden h-[800px] relative">
            {/* Header */}
            <div className="p-6 border-b border-slate-700 bg-slate-900/50 backdrop-blur-sm flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                        <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
                        </svg>
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-white tracking-tight">Hierarchical View</h3>
                        <p className="text-sm text-emerald-400 font-medium">TF Regulatory Cascade</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {/* TF Selector */}
                    <select
                        value={selectedTF}
                        onChange={(e) => onTFChange(e.target.value)}
                        className="px-4 py-2 bg-slate-800/50 border border-slate-700 rounded-xl text-sm font-bold text-emerald-400 outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                        <option value="">Select TF...</option>
                        {availableTFs.map(tf => (
                            <option key={tf} value={tf}>{tf}</option>
                        ))}
                    </select>

                    {/* Show Downstream Targets Toggle */}
                    <button
                        onClick={() => setShowDownstreamTargets(!showDownstreamTargets)}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${showDownstreamTargets
                            ? 'bg-teal-500/20 border-teal-500/30 text-teal-400 border'
                            : 'bg-slate-800 border-slate-700 text-slate-400 border'
                            }`}
                    >
                        {showDownstreamTargets ? 'Hide Targets' : 'Show Targets'}
                    </button>

                    {/* Show Labels Toggle */}
                    <button
                        onClick={() => setShowLabels(!showLabels)}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${showLabels
                            ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400 border'
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
                    <div className="text-xs font-bold text-emerald-400 mb-3">Hierarchy</div>
                    <div className="text-xs text-slate-300 space-y-2">
                        <div className="flex items-center gap-2">
                            <div className="w-4 h-4 bg-slate-600" style={{ clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)' }}></div>
                            <span>Level -1 (Upstream)</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-5 h-5 bg-emerald-500" style={{ clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)' }}></div>
                            <span>Level 0 (Selected)</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-4 h-4 bg-slate-600" style={{ clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)' }}></div>
                            <span>Level +1 (Downstream)</span>
                        </div>
                    </div>
                    <div className="text-xs text-slate-400 mt-3 pt-3 border-t border-slate-700">
                        <div>• Scroll to zoom</div>
                        <div>• Drag to pan</div>
                        <div>• Double-click to reset</div>
                    </div>
                </div>

                {/* Stats */}
                {selectedTF && hierarchy && (
                    <div className="absolute top-6 right-6 p-4 bg-slate-900/80 backdrop-blur-md border border-slate-700 rounded-2xl shadow-2xl">
                        <div className="grid grid-cols-2 gap-4 text-center">
                            <div>
                                <div className="text-2xl font-black text-blue-400">{hierarchy.upstream.length}</div>
                                <div className="text-[10px] font-bold text-slate-400 uppercase">Upstream</div>
                            </div>
                            <div>
                                <div className="text-2xl font-black text-teal-400">{hierarchy.downstream.length}</div>
                                <div className="text-[10px] font-bold text-slate-400 uppercase">Downstream</div>
                            </div>
                        </div>
                    </div>
                )}

                {!selectedTF ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="text-center">
                            <div className="text-6xl mb-4">📊</div>
                            <div className="text-xl font-bold text-slate-400">Select a TF to view cascade</div>
                        </div>
                    </div>
                ) : !hierarchy || (hierarchy.upstream.length === 0 && hierarchy.downstream.length === 0) ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="text-center">
                            <div className="text-6xl mb-4">🔍</div>
                            <div className="text-xl font-bold text-slate-400">No TF cascade found</div>
                            <div className="text-sm text-slate-500 mt-2">This TF has no upstream or downstream TFs</div>
                        </div>
                    </div>
                ) : (
                    <svg ref={svgRef} className="w-full h-full"></svg>
                )}
            </div>
        </div>
    );
}
