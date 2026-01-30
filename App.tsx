
import React, { useState, useMemo, useEffect } from 'react';
import { IntegratedInteraction, AnalysisResult, AppView, PathwayMapping, HubMapping } from './types';
import StatsPanel from './components/StatsPanel';
import NetworkVisualization from './components/NetworkVisualization';
import PathwaySelector from './components/PathwaySelector';
import { analyzeNetwork } from './services/geminiService';
import { loadIntegratedData } from './services/dataLoader';
import { PathwayData } from './services/pathwayLoader';

const App: React.FC = () => {
  const [data, setData] = useState<IntegratedInteraction[]>([]);
  const [pathwayMapping, setPathwayMapping] = useState<PathwayMapping>({});
  const [goAnnotations, setGoAnnotations] = useState<Record<string, string[]>>({});
  const [hubMapping, setHubMapping] = useState<HubMapping>({});

  const [loading, setLoading] = useState(true);
  const [loadingMsg, setLoadingMsg] = useState("Initializing GeneReg Integrator...");

  const [activeView, setActiveView] = useState<AppView>('explorer');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<AnalysisResult | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [minConfidence, setMinConfidence] = useState(1);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedPathway, setSelectedPathway] = useState<string>('all');
  const [selectedGoTerm, setSelectedGoTerm] = useState<string>('all');
  const [priorityTfFilter, setPriorityTfFilter] = useState<string | null>(null);
  const [exportFormat, setExportFormat] = useState<'symbol' | 'id'>('geneId'); // Default to GeneID as requested

  const [selectedSources, setSelectedSources] = useState<string[]>(['TARGET', 'DAP', 'CHIP']);
  const [graphScope, setGraphScope] = useState<'global' | 'direct' | 'cascade'>('global');
  const [pathwayData, setPathwayData] = useState<PathwayData | null>(null);

  const PRIORITY_GO_TERMS = [
    { id: 'all', label: 'Todos los Procesos' },
    { id: 'Water deprivation', label: 'Water Deprivation (GO:0009414)' },
    { id: 'Response to ABA', label: 'Response to ABA (GO:0009737)' },
    { id: 'ABA-activated signaling pathway', label: 'ABA Signaling (GO:0009738)' },
    { id: 'Response to osmotic stress', label: 'Osmotic Stress (GO:0006970)' },
    { id: 'Response to auxin', label: 'Auxin Response (GO:0009733)' }
  ];

  const PRIORITY_TFS = ['NLP7', 'TGA1', 'HB7', 'ABF2', 'GBF3', 'MYBR1']; // MYBR1 is MYB44

  // Initialization: Load pre-integrated data
  useEffect(() => {
    const init = async () => {
      try {
        const result = await loadIntegratedData((msg) => setLoadingMsg(msg));
        setData(result.interactions);
        setPathwayMapping(result.pathwayMapping);
        setGoAnnotations(result.goAnnotations || {});
        // If hub mapping was loaded, we would set it here. For now empty.
        setHubMapping({});
      } catch (e) {
        console.error(e);
        setErrorMessage("Error crítico: No se pudieron cargar los datos regulatorios locales.");
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const allPathways = useMemo(() => {
    const pSet = new Set<string>();
    (Object.values(pathwayMapping) as string[][]).forEach(p => p.forEach(v => pSet.add(v)));
    return Array.from(pSet).sort();
  }, [pathwayMapping]);

  const filteredData = useMemo(() => {
    let output = data.filter(i => {
      const matchesSearch = i.tf.toUpperCase().includes(searchTerm.toUpperCase()) || i.target.toUpperCase().includes(searchTerm.toUpperCase());
      const matchesConfidence = i.evidenceCount >= minConfidence;

      let matchesPathway = true;
      if (selectedPathway !== 'all') {
        const p1 = pathwayMapping[i.tf.toUpperCase()] || [];
        const p2 = pathwayMapping[i.target.toUpperCase()] || [];
        matchesPathway = p1.includes(selectedPathway) || p2.includes(selectedPathway);
      }

      let matchesGo = true;
      if (selectedGoTerm !== 'all') {
        const genesInGo = goAnnotations[selectedGoTerm] || [];
        matchesGo = genesInGo.includes(i.tf.toUpperCase()) || genesInGo.includes(i.target.toUpperCase());
      }

      let matchesTf = true;
      if (priorityTfFilter) {
        matchesTf = i.tf.toUpperCase() === priorityTfFilter;
      }

      const matchesSource = i.sources.some(s => selectedSources.includes(s));

      return matchesSearch && matchesConfidence && matchesPathway && matchesGo && matchesTf && matchesSource;
    });

    // Stage 2: Scope Logic (Global vs Direct vs Cascade)
    if (graphScope === 'global') {
      if (priorityTfFilter) {
        output = output.filter(i => i.tf.toUpperCase() === priorityTfFilter);
      }
    } else {
      // Direct or Cascade requires a "Center"
      const center = priorityTfFilter || (output.some(i => i.tf.toUpperCase() === searchTerm.toUpperCase()) ? searchTerm.toUpperCase() : null);

      if (center) {
        if (graphScope === 'direct') {
          output = output.filter(i => i.tf.toUpperCase() === center);
        } else if (graphScope === 'cascade') {
          const level1 = output.filter(i => i.tf.toUpperCase() === center);
          const level1Targets = new Set(level1.map(i => i.target.toUpperCase()));
          const level2 = output.filter(i => level1Targets.has(i.tf.toUpperCase()));
          output = [...level1, ...level2];
          // Deduplicate
          output = Array.from(new Set(output));
        }
      }
    }

    return output;
  }, [data, searchTerm, minConfidence, selectedPathway, pathwayMapping, selectedGoTerm, goAnnotations, priorityTfFilter, selectedSources, graphScope]);

  const handleDownloadTSV = () => {
    const headers = ['TF', 'Target', 'Evidence_Sources', 'Direction', 'Evidence_Count', 'Processes'];
    const rows = filteredData.map(row => {
      const tfVal = exportFormat === 'symbol' ? row.tf : (row.tfId || row.tf);
      const targetVal = exportFormat === 'symbol' ? row.target : (row.targetId || row.target);

      return [
        tfVal,
        targetVal,
        row.sources.join('|'),
        row.direction,
        row.evidenceCount,
        (pathwayMapping[row.target] || []).join('|')
      ].join('\t');
    });

    const blob = new Blob([headers.join('\t') + '\n' + rows.join('\n')], { type: 'text/tab-separated-values' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `genereg_export_${exportFormat}_${new Date().toISOString().split('T')[0]}.tsv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleAiAnalysis = async () => {
    if (filteredData.length === 0) return;
    setIsAnalyzing(true);
    setActiveView('ai');
    try {
      const result = await analyzeNetwork(filteredData.slice(0, 50)); // Limit analysis to top 50 filtered
      setAiAnalysis(result);
    } catch (e) { setErrorMessage("Error en análisis AI"); }
    finally { setIsAnalyzing(false); }
  };

  if (loading) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
        <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-6"></div>
        <h2 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">Plant Regulatory Network Tool</h2>
        <p className="text-slate-400 mt-2 animate-pulse">{loadingMsg}</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 overflow-hidden">
      <aside className="w-72 bg-slate-900/50 backdrop-blur-xl border-r border-slate-800 text-slate-300 flex flex-col shrink-0 shadow-2xl">
        <div className="p-6 border-b border-slate-800 flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center text-white font-black text-xl shadow-lg shadow-emerald-500/30">
            🌱
          </div>
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight leading-tight">Plant Regulatory<br />Network Tool</h1>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto custom-scrollbar">
          <div className="mb-6 px-3 py-3 bg-slate-800/50 rounded-xl border border-slate-700">
            <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-2">Database</div>
            <div className="text-xs font-medium text-slate-300 flex justify-between">
              <span>Interactions:</span>
              <span className="text-emerald-400 font-bold">{data.length}</span>
            </div>
            <div className="text-xs font-medium text-slate-300 flex justify-between mt-1">
              <span>Genes/Processes:</span>
              <span className="text-emerald-400 font-bold">{Object.keys(pathwayMapping).length}</span>
            </div>
          </div>

          <button onClick={() => setActiveView('explorer')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${activeView === 'explorer' ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/30' : 'hover:bg-slate-800 text-slate-400'}`}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Explore Data
          </button>
          <button onClick={() => setActiveView('network')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${activeView === 'network' ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/30' : 'hover:bg-slate-800 text-slate-400'}`}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
            Network View
          </button>

          <div className="pt-6 border-t border-slate-800 mt-4">
            <PathwaySelector onPathwayChange={setPathwayData} />
          </div>
        </nav>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 bg-slate-950/30">
        <header className="h-20 bg-slate-900/50 backdrop-blur-xl border-b border-slate-800 flex items-center justify-between px-8 shrink-0 z-10 shadow-lg">
          <div className="flex flex-col gap-1 items-start">
            <div className="flex items-center gap-4">
              <h2 className="text-lg font-bold bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">Regulatory Dashboard</h2>
              <div className="flex items-center gap-2 bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-1.5 shadow-sm backdrop-blur-sm">
                <span className="text-[10px] font-black text-emerald-400 uppercase">GO Context:</span>
                <select value={selectedGoTerm} onChange={(e) => setSelectedGoTerm(e.target.value)} className="bg-transparent text-xs font-bold text-teal-400 outline-none cursor-pointer max-w-[250px]">
                  {PRIORITY_GO_TERMS.map(p => <option key={p.id} value={p.id} className="bg-slate-800">{p.label}</option>)}
                </select>
              </div>
            </div>

            <div className="flex gap-2">
              {PRIORITY_TFS.map(tf => (
                <button
                  key={tf}
                  onClick={() => {
                    const newVal = priorityTfFilter === tf ? null : tf;
                    setPriorityTfFilter(newVal);
                    if (newVal) setGraphScope('direct');
                  }}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-all ${priorityTfFilter === tf ? 'bg-emerald-500 text-white border-emerald-500 shadow-lg shadow-emerald-500/30' : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-emerald-500/50'}`}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex items-center bg-slate-800/50 rounded-lg p-1 border border-slate-700">
              <button onClick={() => setExportFormat('geneId')} className={`px-2 py-1 text-[10px] font-bold rounded ${exportFormat === 'geneId' ? 'bg-emerald-500 text-white shadow' : 'text-slate-400 hover:text-slate-300'}`}>ID</button>
              <button onClick={() => setExportFormat('symbol')} className={`px-2 py-1 text-[10px] font-bold rounded ${exportFormat === 'symbol' ? 'bg-emerald-500 text-white shadow' : 'text-slate-400 hover:text-slate-300'}`}>Symbol</button>
            </div>
            <button onClick={handleDownloadTSV} className="px-4 py-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-black hover:bg-emerald-500/20 transition-all uppercase tracking-widest flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></svg>
              TSV
            </button>
            <button onClick={handleAiAnalysis} disabled={filteredData.length === 0 || isAnalyzing} className="px-6 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl text-xs font-black hover:shadow-lg hover:shadow-emerald-500/30 disabled:opacity-50 transition-all uppercase tracking-widest">
              {isAnalyzing ? 'Analyzing...' : 'Gemini AI'}
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8">
          {errorMessage && <div className="mb-6 p-4 bg-red-900/20 text-red-400 text-sm font-bold rounded-2xl border border-red-800 flex justify-between items-center backdrop-blur-sm"><span>{errorMessage}</span><button onClick={() => setErrorMessage(null)} className="text-red-400 hover:text-red-300">✕</button></div>}

          {activeView === 'explorer' ? (
            <div className="space-y-6 animate-in fade-in duration-500">
              <StatsPanel data={filteredData} />
              <div className="bg-slate-900/50 backdrop-blur-xl rounded-3xl shadow-2xl border border-slate-800 overflow-hidden">
                <div className="p-6 border-b border-slate-800 bg-slate-900/30 flex items-center justify-between">
                  <input type="text" placeholder="Search gene, TF or keyword..." className="max-w-xs w-full pl-4 pr-4 py-2.5 bg-slate-800/50 border border-slate-700 rounded-2xl text-sm outline-none shadow-sm focus:ring-2 focus:ring-emerald-500 text-slate-200 placeholder-slate-500" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                  <span className="text-xs font-bold text-emerald-400">{filteredData.length} interactions visible</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-slate-900/50 text-[10px] text-emerald-400 font-bold uppercase tracking-widest border-b border-slate-800">
                      <tr>
                        <th className="px-6 py-4">Regulator (TF)</th>
                        <th className="px-6 py-4">Target Gene</th>
                        <th className="px-6 py-4">Evidence</th>
                        <th className="px-6 py-4">Direction</th>
                        <th className="px-6 py-4">Biological Context</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {filteredData.slice(0, 100).map((row, idx) => {
                        const isHub = !!hubMapping[row.target];
                        const hub = hubMapping[row.target];

                        return (
                          <tr key={idx} className="hover:bg-emerald-500/5 transition-colors group">
                            <td className="px-6 py-4 text-xs font-black text-emerald-300">{row.tf}</td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <span className={`text-xs font-bold ${isHub ? 'text-teal-400' : 'text-slate-300'}`}>{row.target}</span>
                                {isHub && <span className="text-[8px] bg-teal-500/20 text-teal-400 px-1.5 py-0.5 rounded-full font-black border border-teal-500/30">HUB</span>}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex gap-1">
                                {row.sources.map(s => (
                                  <span key={s} className={`text-[9px] px-1.5 py-0.5 rounded-full font-black text-white ${s === 'TARGET' ? 'bg-emerald-500' : s === 'DAP' ? 'bg-blue-500' : 'bg-violet-500'}`}>{s}</span>
                                ))}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className={`text-[10px] font-black px-2 py-1 rounded-lg uppercase tracking-tight ${row.direction === 'activation' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : row.direction === 'repression' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-slate-700 text-slate-400'}`}>{row.direction}</span>
                            </td>
                            <td className="px-6 py-4">
                              {isHub ? (
                                <div className="text-[10px] font-medium text-teal-400 italic max-w-xs truncate" title={hub?.genesList.join(', ')}>
                                  Hub Reg (GeneReg)
                                </div>
                              ) : (
                                <div className="flex flex-wrap gap-1">
                                  {(pathwayMapping[row.target] || []).slice(0, 3).map(p => <span key={p} className="text-[8px] font-bold bg-slate-800 px-1.5 py-0.5 rounded text-slate-400 border border-slate-700">{p}</span>)}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {filteredData.length > 100 && <div className="p-4 text-center text-xs text-slate-500 font-medium border-t border-slate-800">Showing first 100 results of {filteredData.length}</div>}
                </div>
              </div>
            </div>
          ) : activeView === 'network' ? (
            <NetworkVisualization
              data={filteredData}
              pathwayMapping={pathwayMapping}
              pathwayData={pathwayData}
            />
          ) : (
            <div className="bg-white p-12 rounded-[48px] border border-slate-100 shadow-2xl max-w-4xl mx-auto mt-10 animate-in zoom-in-95 duration-500">
              <h3 className="text-3xl font-black mb-8 text-slate-900 tracking-tight">Interpretación Funcional (AI)</h3>
              {aiAnalysis ? (
                <div className="space-y-10">
                  <p className="text-xl text-slate-600 italic border-l-8 border-indigo-500 pl-8 font-medium leading-relaxed">{aiAnalysis.summary}</p>
                  <div className="grid md:grid-cols-2 gap-8">
                    {aiAnalysis.insights.map((ins, i) => (
                      <div key={i} className="p-8 bg-slate-50 rounded-3xl border border-slate-100 hover:border-indigo-200 hover:bg-white transition-all hover:shadow-xl">
                        <div className="w-8 h-8 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-xs font-black mb-4">0{i + 1}</div>
                        <p className="text-base font-bold text-slate-800 leading-relaxed">{ins}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-20 text-slate-400 font-bold text-lg">
                  <div className="animate-pulse mb-4">🤖</div>
                  Generando insights biológicos sobre la red filtrada...
                </div>
              )}
            </div>
          )
          }
        </div>
      </main>
    </div>
  );
};

export default App;
