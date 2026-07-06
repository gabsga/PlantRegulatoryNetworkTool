import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { IntegratedInteraction, PathwayMapping } from '../types';

interface HierarchicalViewProps {
  data: IntegratedInteraction[];
  pathwayMapping: PathwayMapping;
  selectedTF: string;
  onTFChange: (tf: string) => void;
  tfOptions?: string[];
}

type TfNode = {
  target: string;
};

export default function HierarchicalView({ data, pathwayMapping, selectedTF, onTFChange, tfOptions }: HierarchicalViewProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [showLabels, setShowLabels] = useState(true);

  const availableTFs = useMemo(() => {
    if (tfOptions && tfOptions.length > 0) return tfOptions;
    const tfSet = new Set(data.map((d) => d.tf));
    return Array.from(tfSet).sort();
  }, [data, tfOptions]);

  const tfSet = useMemo(() => (
    new Set((tfOptions && tfOptions.length > 0 ? tfOptions : data.map((d) => d.tf)).map((tf) => tf.trim().toUpperCase()))
  ), [data, tfOptions]);

  const hierarchy = useMemo(() => {
    if (!selectedTF) return null;

    const center = selectedTF.trim().toUpperCase();
    const upstream = Array.from(new Set(
      data
        .filter((row) => (
          row.target.toUpperCase() === center &&
          row.tf.toUpperCase() !== center &&
          tfSet.has(row.tf.toUpperCase())
        ))
        .map((row) => row.tf)
    )).sort();

    const downstream = Array.from(new Map(
      data
        .filter((row) => (
          row.tf.toUpperCase() === center &&
          row.target.toUpperCase() !== center &&
          tfSet.has(row.target.toUpperCase())
        ))
        .map((row) => [
          row.target.toUpperCase(),
          {
            target: row.target
          } satisfies TfNode
        ])
    ).values()).sort((a, b) => a.target.localeCompare(b.target));

    return {
      downstream,
      upstream
    };
  }, [data, selectedTF, tfSet]);

  const getProcessColor = (gene: string): string => {
    const processes = pathwayMapping[gene.toUpperCase()] || [];

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

    return '#6c8580';
  };

  useEffect(() => {
    if (!svgRef.current || !selectedTF || !hierarchy) return;

    const width = svgRef.current.clientWidth;
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const g = svg.append('g');
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform.toString());
      });

    svg.call(zoom);

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

    const centerX = width / 2;
    const upstreamY = 120;
    const selectedY = 300;
    const downstreamY = 520;
    const upstreamSpacing = Math.max(80, Math.min(130, width / Math.max(2, hierarchy.upstream.length + 1)));
    const downstreamSpacing = Math.max(80, Math.min(130, width / Math.max(2, hierarchy.downstream.length + 1)));

    const drawTriangle = (x: number, y: number, color: string, size: number, label?: string) => {
      const node = g.append('g').attr('transform', `translate(${x}, ${y})`);
      node.append('path')
        .attr('d', d3.symbol().type(d3.symbolTriangle).size(size)())
        .attr('fill', color)
        .attr('stroke', '#1e293b')
        .attr('stroke-width', 2);

      if (showLabels && label) {
        node.append('text')
          .text(label)
          .attr('y', size >= 500 ? -28 : 24)
          .attr('text-anchor', 'middle')
          .attr('fill', size >= 500 ? color : '#efc98e')
          .attr('font-size', size >= 500 ? '12px' : '10px')
          .attr('font-weight', 'bold');
      }

      return node;
    };

    const upstreamStartX = centerX - ((hierarchy.upstream.length - 1) * upstreamSpacing) / 2;
    hierarchy.upstream.forEach((tf, idx) => {
      const x = upstreamStartX + idx * upstreamSpacing;
      const color = getProcessColor(tf);
      drawTriangle(x, upstreamY, color, 260, tf)
        .append('title')
        .text(`${tf}\nUpstream TF of ${selectedTF}`);

      g.append('line')
        .attr('x1', x)
        .attr('y1', upstreamY + 12)
        .attr('x2', centerX)
        .attr('y2', selectedY - 16)
        .attr('stroke', color)
        .attr('stroke-width', 2)
        .attr('opacity', 0.5)
        .attr('marker-end', 'url(#arrow)');
    });

    const selectedColor = getProcessColor(selectedTF);
    drawTriangle(centerX, selectedY, selectedColor, 520, selectedTF)
      .select('path')
      .attr('stroke', '#10b981')
      .attr('stroke-width', 3);

    const downstreamStartX = centerX - ((hierarchy.downstream.length - 1) * downstreamSpacing) / 2;
    hierarchy.downstream.forEach((node, idx) => {
      const x = downstreamStartX + idx * downstreamSpacing;
      const color = '#69d7cf';
      drawTriangle(x, downstreamY, color, 280, node.target)
        .append('title')
        .text(`${node.target}\nDownstream TF of ${selectedTF}`);

      g.append('line')
        .attr('x1', centerX)
        .attr('y1', selectedY + 14)
        .attr('x2', x)
        .attr('y2', downstreamY - 12)
        .attr('stroke', color)
        .attr('stroke-width', 1.8)
        .attr('opacity', 0.45)
        .attr('marker-end', 'url(#arrow)');
    });

    svg.on('dblclick.zoom', null);
    svg.on('dblclick', () => {
      svg.transition().duration(750).call(zoom.transform as never, d3.zoomIdentity);
    });
  }, [hierarchy, pathwayMapping, selectedTF, showLabels]);

  return (
    <div className="print-panel rounded-3xl flex flex-col overflow-hidden h-[800px] relative">
      <div className="p-6 border-b border-[var(--print-line)] bg-black/10 backdrop-blur-sm flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="print-logo-frame w-10 h-10 rounded-xl flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
            </svg>
          </div>
          <div>
            <h3 className="text-xl font-bold text-white tracking-tight">Hierarchical View</h3>
            <p className="text-sm text-[var(--print-mint)] font-medium">TF-only hierarchy: upstream TFs, selected TF, and downstream TFs</p>
            <p className="text-[11px] text-slate-400 mt-1">Restricted to TFs only: Level -1 upstream TFs, Level 0 selected TF, Level +1 downstream TFs.</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={selectedTF}
            onChange={(e) => onTFChange(e.target.value)}
            className="px-4 py-2 bg-black/10 border border-[var(--print-line)] rounded-xl text-sm font-bold text-[var(--print-mint)] outline-none focus:ring-2 focus:ring-[var(--print-mint)]"
          >
            <option value="">Select TF...</option>
            {availableTFs.map((tf) => (
              <option key={tf} value={tf}>{tf}</option>
            ))}
          </select>

          <button
            onClick={() => setShowLabels(!showLabels)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${showLabels
              ? 'bg-[rgba(77,231,191,0.12)] border-[rgba(77,231,191,0.28)] text-[var(--print-mint)] border'
              : 'bg-black/10 border-[var(--print-line)] text-slate-400 border'
            }`}
          >
            {showLabels ? 'Hide Labels' : 'Show Labels'}
          </button>
        </div>
      </div>

      <div className="flex-1 relative bg-black/10 overflow-hidden">
        <div className="absolute top-6 left-6 p-4 bg-[rgba(27,40,46,0.86)] backdrop-blur-md border border-[var(--print-line)] rounded-2xl z-10 shadow-2xl">
          <div className="text-xs font-bold text-[var(--print-mint)] mb-3">Hierarchy</div>
          <div className="text-xs text-slate-300 space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-[#6c8580]" style={{ clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)' }}></div>
              <span>Level -1 Upstream TFs</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 bg-[var(--print-mint)]" style={{ clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)' }}></div>
              <span>Level 0 Selected TF</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-[#69d7cf]" style={{ clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)' }}></div>
              <span>Level +1 Downstream TFs</span>
            </div>
          </div>
          <div className="text-xs text-slate-400 mt-3 pt-3 border-t border-[var(--print-line)]">
            <div>• Scroll to zoom</div>
            <div>• Drag to pan</div>
            <div>• Double-click to reset</div>
          </div>
        </div>

        {selectedTF && hierarchy && (
          <div className="absolute top-6 right-6 p-4 bg-[rgba(27,40,46,0.86)] backdrop-blur-md border border-[var(--print-line)] rounded-2xl shadow-2xl">
            <div className="grid grid-cols-2 gap-4 text-center">
              <div>
                <div className="text-2xl font-black text-[#d7aa63]">{hierarchy.upstream.length}</div>
                <div className="text-[10px] font-bold text-slate-400 uppercase">Upstream TFs</div>
              </div>
              <div>
                <div className="text-2xl font-black text-[#69d7cf]">{hierarchy.downstream.length}</div>
                <div className="text-[10px] font-bold text-slate-400 uppercase">Downstream TFs</div>
              </div>
            </div>
          </div>
        )}

        {!selectedTF ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-6xl mb-4">📊</div>
              <div className="text-xl font-bold text-slate-400">Select a TF to view hierarchy</div>
            </div>
          </div>
        ) : !hierarchy || (hierarchy.upstream.length === 0 && hierarchy.downstream.length === 0) ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-6xl mb-4">🔍</div>
              <div className="text-xl font-bold text-slate-400">No hierarchy found</div>
              <div className="text-sm text-slate-500 mt-2">This TF has no upstream or downstream TF relationships in the current dataset.</div>
            </div>
          </div>
        ) : (
          <svg ref={svgRef} className="w-full h-full"></svg>
        )}
      </div>
    </div>
  );
}
