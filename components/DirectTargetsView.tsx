import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { IntegratedInteraction, PathwayMapping } from '../types';

interface DirectTargetsViewProps {
  data: IntegratedInteraction[];
  pathwayMapping: PathwayMapping;
  selectedTF: string;
  onTFChange: (tf: string) => void;
  tfOptions?: string[];
}

type TargetNode = {
  direction: IntegratedInteraction['direction'];
  evidence: number;
  isTF: boolean;
  sources: IntegratedInteraction['sources'];
  target: string;
};

const SOURCE_BADGE_STYLES: Record<'TARGET' | 'DAP' | 'CHIP', string> = {
  TARGET: 'bg-[var(--print-mint)] text-[var(--print-ink)]',
  DAP: 'bg-[#d7aa63] text-[var(--print-ink)]',
  CHIP: 'bg-[#69d7cf] text-[var(--print-ink)]'
};

export default function DirectTargetsView({ data, pathwayMapping: _pathwayMapping, selectedTF, onTFChange, tfOptions }: DirectTargetsViewProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const svgSelectionRef = useRef<d3.Selection<SVGSVGElement, unknown, null, undefined> | null>(null);
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [minEvidence, setMinEvidence] = useState(1);
  const [showLabels, setShowLabels] = useState(true);
  const [selectedSources, setSelectedSources] = useState<string[]>(['TARGET', 'DAP', 'CHIP']);
  const [sourceFilterMode, setSourceFilterMode] = useState<'OR' | 'AND'>('OR');
  const [visibleTfTargets, setVisibleTfTargets] = useState(30);
  const [visibleGeneTargets, setVisibleGeneTargets] = useState(30);

  const availableTFs = useMemo(() => {
    if (tfOptions && tfOptions.length > 0) return tfOptions;
    return Array.from(new Set(data.map((d) => d.tf))).sort();
  }, [data, tfOptions]);

  const tfSet = useMemo(() => (
    new Set((tfOptions && tfOptions.length > 0 ? tfOptions : data.map((d) => d.tf)).map((tf) => tf.trim().toUpperCase()))
  ), [data, tfOptions]);

  const targets = useMemo(() => {
    return data
      .filter((d) => {
        const matchesTF = d.tf === selectedTF;
        const matchesEvidence = d.evidenceCount >= minEvidence;

        let matchesSource = false;
        if (sourceFilterMode === 'OR') {
          matchesSource = d.sources.some((s) => selectedSources.includes(s));
        } else {
          matchesSource = selectedSources.every((s) => d.sources.includes(s));
        }

        return matchesTF && matchesEvidence && matchesSource;
      })
      .map((d) => ({
        target: d.target,
        evidence: d.evidenceCount,
        direction: d.direction,
        sources: d.sources,
        isTF: tfSet.has(d.target.toUpperCase())
      }))
      .sort((a, b) => Number(b.isTF) - Number(a.isTF) || b.evidence - a.evidence || a.target.localeCompare(b.target));
  }, [data, minEvidence, selectedSources, selectedTF, sourceFilterMode, tfSet]);

  const groupedTargets = useMemo(() => ({
    tfs: targets.filter((target) => target.isTF),
    genes: targets.filter((target) => !target.isTF)
  }), [targets]);

  const displayedGroups = useMemo(() => ({
    tfs: groupedTargets.tfs.slice(0, visibleTfTargets),
    genes: groupedTargets.genes.slice(0, visibleGeneTargets)
  }), [groupedTargets, visibleGeneTargets, visibleTfTargets]);

  useEffect(() => {
    setVisibleTfTargets(30);
    setVisibleGeneTargets(30);
  }, [selectedTF, minEvidence, selectedSources, sourceFilterMode]);

  useEffect(() => {
    if (!svgRef.current || !selectedTF || targets.length === 0) return;

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
    svgSelectionRef.current = svg;
    zoomBehaviorRef.current = zoom;

    const centerX = width / 2;
    const tfY = 110;
    const groupsY = 230;
    const nodesStartY = 300;
    const columnGap = Math.max(260, Math.min(420, width * 0.28));
    const leftX = centerX - columnGap / 2;
    const rightX = centerX + columnGap / 2;
    const gridColGap = 72;
    const gridRowGap = 58;
    const gridColumns = Math.max(2, Math.min(4, Math.ceil(Math.sqrt(Math.max(displayedGroups.tfs.length, displayedGroups.genes.length) || 1))));
    const boxWidth = Math.max(220, gridColumns * gridColGap + 80);

    const drawTriangle = (x: number, y: number, fill: string, stroke: string, size: number, label?: string) => {
      const node = g.append('g').attr('transform', `translate(${x}, ${y})`);
      node.append('path')
        .attr('d', d3.symbol().type(d3.symbolTriangle).size(size)())
        .attr('fill', fill)
        .attr('stroke', stroke)
        .attr('stroke-width', 3);

      if (showLabels && label) {
        node.append('text')
          .text(label)
          .attr('y', -24)
          .attr('text-anchor', 'middle')
          .attr('fill', fill)
          .attr('font-size', '14px')
          .attr('font-weight', 'bold');
      }
    };

    const drawCircle = (x: number, y: number, fill: string, stroke: string, radius: number, label?: string) => {
      const node = g.append('g').attr('transform', `translate(${x}, ${y})`);
      node.append('circle')
        .attr('r', radius)
        .attr('fill', fill)
        .attr('stroke', stroke)
        .attr('stroke-width', 2);

      if (showLabels && label) {
        node.append('text')
          .text(label)
          .attr('x', 18)
          .attr('y', 4)
          .attr('fill', '#e2e8f0')
          .attr('font-size', '11px')
          .attr('font-weight', '600');
      }
    };

    const drawEvidenceBadge = (x: number, y: number, evidence: number) => {
      const evidenceColor = evidence === 3 ? '#d7aa63' : evidence === 2 ? '#69d7cf' : '#6c8580';
      g.append('circle')
        .attr('cx', x + 14)
        .attr('cy', y - 12)
        .attr('r', 8)
        .attr('fill', evidenceColor)
        .attr('stroke', '#132026')
        .attr('stroke-width', 1.5);

      g.append('text')
        .text(evidence)
        .attr('x', x + 14)
        .attr('y', y - 9)
        .attr('text-anchor', 'middle')
        .attr('fill', '#ffffff')
        .attr('font-size', '9px')
        .attr('font-weight', 'bold');
    };

    const drawGroupBox = (x: number, title: string, color: string, items: TargetNode[]) => {
      const rowCount = Math.max(1, Math.ceil(items.length / gridColumns));
      const boxHeight = Math.max(140, rowCount * gridRowGap + 70);

      g.append('text')
        .text(title)
        .attr('x', x)
        .attr('y', groupsY)
        .attr('text-anchor', 'middle')
        .attr('fill', color)
        .attr('font-size', '14px')
        .attr('font-weight', 'bold');

      g.append('rect')
        .attr('x', x - boxWidth / 2)
        .attr('y', groupsY + 12)
        .attr('width', boxWidth)
        .attr('height', boxHeight)
        .attr('rx', 16)
        .attr('fill', 'rgba(10,16,20,0.12)')
        .attr('stroke', color)
        .attr('stroke-opacity', 0.5)
        .attr('stroke-dasharray', '5,5');

      g.append('line')
        .attr('x1', centerX)
        .attr('y1', tfY + 18)
        .attr('x2', x)
        .attr('y2', groupsY + 12)
        .attr('stroke', color)
        .attr('stroke-width', 2)
        .attr('opacity', 0.35);

      items.forEach((target, idx) => {
        const col = idx % gridColumns;
        const row = Math.floor(idx / gridColumns);
        const rowWidth = Math.min(gridColumns, items.length - row * gridColumns);
        const rowStartX = x - ((rowWidth - 1) * gridColGap) / 2;
        const nodeX = rowStartX + col * gridColGap;
        const y = nodesStartY + row * gridRowGap;

        g.append('line')
          .attr('x1', centerX)
          .attr('y1', tfY + 18)
          .attr('x2', nodeX)
          .attr('y2', y)
          .attr('stroke', color)
          .attr('stroke-width', 1.4)
          .attr('opacity', 0.24);

        if (target.isTF) {
          drawTriangle(nodeX, y, '#69d7cf', '#d7aa63', 240, showLabels ? target.target : undefined);
        } else {
          drawCircle(nodeX, y, '#8ca7a0', '#1e293b', 9, showLabels ? target.target : undefined);
        }

        drawEvidenceBadge(nodeX, y, target.evidence);

        g.append('title')
          .text(`${target.target}\nEvidence: ${target.evidence} source(s)\nDirection: ${target.direction}\nSources: ${target.sources.join(', ')}`);
      });
    };

    drawTriangle(centerX, tfY, '#4de7bf', '#2f7f76', 420, selectedTF);

    drawGroupBox(leftX, 'TF Targets', '#69d7cf', displayedGroups.tfs);
    drawGroupBox(rightX, 'Non-TF Targets', '#8ca7a0', displayedGroups.genes);

    svg.on('dblclick.zoom', null);
    svg.on('dblclick', () => {
      svg.transition().duration(750).call(zoom.transform as never, d3.zoomIdentity);
    });
  }, [displayedGroups, selectedTF, showLabels, targets]);

  const handleResetView = () => {
    const svg = svgSelectionRef.current;
    const zoom = zoomBehaviorRef.current;
    if (!svg || !zoom) return;
    svg.transition().duration(750).call(zoom.transform as never, d3.zoomIdentity);
  };

  return (
    <div className="print-panel rounded-3xl flex flex-col overflow-hidden h-[800px] relative">
      <div className="p-6 border-b border-[var(--print-line)] bg-black/10 backdrop-blur-sm flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="print-logo-frame w-10 h-10 rounded-xl flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <h3 className="text-xl font-bold text-white tracking-tight">Direct Targets View</h3>
            <p className="text-sm text-[var(--print-mint)] font-medium">TF → Target network grouped only by TFs and non-TFs</p>
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

          <div className="flex items-center gap-2">
            <div className="flex items-center bg-black/10 border border-[var(--print-line)] rounded-xl p-1">
              <button
                onClick={() => setSourceFilterMode('OR')}
                className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-all ${
                  sourceFilterMode === 'OR'
                    ? 'bg-[#69d7cf] text-[var(--print-ink)] shadow-lg'
                    : 'text-slate-400 hover:text-slate-300'
                }`}
                title="Show genes regulated by ANY selected source"
              >
                OR
              </button>
              <button
                onClick={() => setSourceFilterMode('AND')}
                className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-all ${
                  sourceFilterMode === 'AND'
                    ? 'bg-[#d7aa63] text-[var(--print-ink)] shadow-lg'
                    : 'text-slate-400 hover:text-slate-300'
                }`}
                title="Show genes regulated by ALL selected sources"
              >
                AND
              </button>
            </div>

            <div className="flex items-center gap-2 bg-black/10 border border-[var(--print-line)] rounded-xl px-3 py-2">
              {['TARGET', 'DAP', 'CHIP'].map((source) => (
                <button
                  key={source}
                  onClick={() => {
                    if (selectedSources.includes(source)) {
                      setSelectedSources(selectedSources.filter((s) => s !== source));
                    } else {
                      setSelectedSources([...selectedSources, source]);
                    }
                  }}
                  className={`px-2 py-1 rounded text-[10px] font-bold transition-all ${
                    selectedSources.includes(source)
                      ? SOURCE_BADGE_STYLES[source as 'TARGET' | 'DAP' | 'CHIP']
                      : 'bg-white/5 text-slate-400'
                  }`}
                >
                  {source}
                </button>
              ))}
            </div>
          </div>

          <select
            value={minEvidence}
            onChange={(e) => setMinEvidence(+e.target.value)}
            className="px-4 py-2 bg-black/10 border border-[var(--print-line)] rounded-xl text-sm font-bold text-[#69d7cf] outline-none focus:ring-2 focus:ring-[#69d7cf]"
          >
            <option value={1}>≥1 source</option>
            <option value={2}>≥2 sources</option>
            <option value={3}>3 sources</option>
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

          <button
            onClick={handleResetView}
            className="px-4 py-2 rounded-xl text-xs font-bold transition-all bg-black/10 border border-[var(--print-line)] text-slate-200 hover:border-[var(--print-line-strong)]"
          >
            Reset View
          </button>
        </div>
      </div>

      <div className="flex-1 relative bg-black/10 overflow-hidden">
        <div className="absolute top-6 left-6 p-4 bg-[rgba(27,40,46,0.86)] backdrop-blur-md border border-[var(--print-line)] rounded-2xl z-10 shadow-2xl">
          <div className="text-xs font-bold text-[var(--print-mint)] mb-3">Groups</div>
          <div className="text-xs text-slate-300 space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-[#69d7cf]" style={{ clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)' }}></div>
              <span>Targets that are also TFs</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-[#8ca7a0]"></div>
              <span>Targets that are not TFs</span>
            </div>
          </div>
          <div className="text-xs text-slate-400 mt-3 pt-3 border-t border-[var(--print-line)]">
            <div>• Scroll to zoom</div>
            <div>• Drag to pan</div>
            <div>• Double-click to reset</div>
          </div>
        </div>

        {selectedTF && (
          <div className="absolute top-6 right-6 p-4 bg-[rgba(27,40,46,0.86)] backdrop-blur-md border border-[var(--print-line)] rounded-2xl shadow-2xl">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-black text-[var(--print-mint)]">{targets.length}</div>
                <div className="text-[10px] font-bold text-slate-400 uppercase">Targets</div>
              </div>
              <div>
                <div className="text-2xl font-black text-[#69d7cf]">{groupedTargets.tfs.length}</div>
                <div className="text-[10px] font-bold text-slate-400 uppercase">TFs</div>
              </div>
              <div>
                <div className="text-2xl font-black text-[#8ca7a0]">{groupedTargets.genes.length}</div>
                <div className="text-[10px] font-bold text-slate-400 uppercase">Non-TFs</div>
              </div>
            </div>
          </div>
        )}

        {!selectedTF ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-6xl mb-4">🎯</div>
              <div className="text-xl font-bold text-slate-400">Select a TF to view targets</div>
            </div>
          </div>
        ) : targets.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-6xl mb-4">🔍</div>
              <div className="text-xl font-bold text-slate-400">No targets found</div>
              <div className="text-sm text-slate-500 mt-2">Try lowering the evidence filter</div>
            </div>
          </div>
        ) : (
          <>
            <svg ref={svgRef} className="w-full h-full"></svg>
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3">
              {groupedTargets.tfs.length > displayedGroups.tfs.length && (
                <button
                  onClick={() => setVisibleTfTargets((value) => value + 30)}
                  className="rounded-xl border border-[rgba(105,215,207,0.28)] bg-[rgba(27,40,46,0.92)] px-4 py-2 text-xs font-bold text-[#69d7cf]"
                >
                  Load more TFs ({displayedGroups.tfs.length}/{groupedTargets.tfs.length})
                </button>
              )}
              {groupedTargets.genes.length > displayedGroups.genes.length && (
                <button
                  onClick={() => setVisibleGeneTargets((value) => value + 30)}
                  className="rounded-xl border border-[rgba(140,167,160,0.28)] bg-[rgba(27,40,46,0.92)] px-4 py-2 text-xs font-bold text-[#cbd5d1]"
                >
                  Load more non-TFs ({displayedGroups.genes.length}/{groupedTargets.genes.length})
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
