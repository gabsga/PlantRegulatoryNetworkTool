import React, { Suspense, lazy, useEffect, useState } from 'react';
import { AppView, HubMapping } from './types';
import Landing from './components/Landing';
import ExplorerView from './components/ExplorerView';
import { exportExplorerAsTsv } from './services/export/explorerExport';
import { PathwayData } from './services/pathwayLoader';
import { useDatasetStats } from './hooks/useDatasetStats';
import { useExplorerData } from './hooks/useExplorerData';

const NetworkVisualization = lazy(() => import('./components/NetworkVisualization'));
const EnrichmentPanel = lazy(() => import('./components/EnrichmentPanel'));

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}

function ViewFallback({ label }: { label: string }) {
  return (
    <div className="print-panel rounded-3xl p-8 text-sm text-[var(--print-fog)]">
      Loading {label}...
    </div>
  );
}

const App: React.FC = () => {
  const [activeView, setActiveView] = useState<AppView>('explorer');
  const [showLanding, setShowLanding] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebouncedValue(searchTerm, 350);
  const [priorityTfFilter, setPriorityTfFilter] = useState<string | null>(null);
  const [exportFormat, setExportFormat] = useState<'symbol' | 'geneId'>('geneId');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showExplorerSummary, setShowExplorerSummary] = useState(true);
  const [hubMapping] = useState<HubMapping>({});
  const [explorerPage, setExplorerPage] = useState(1);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [exportingTSV, setExportingTSV] = useState(false);
  const [exportProgress, setExportProgress] = useState<string | null>(null);
  const [pathwayData, setPathwayData] = useState<PathwayData | null>(null);
  const [selectedSources] = useState<string[]>(['TARGET', 'DAP', 'CHIP']);

  const minConfidence = 1;

  const { stats: datasetStats, error: statsError } = useDatasetStats(!showLanding);
  const explorer = useExplorerData({
    enabled: !showLanding && activeView === 'explorer',
    filters: {
      minConfidence,
      priorityTfFilter,
      searchTerm: debouncedSearchTerm,
      selectedSources
    },
    page: explorerPage
  });

  useEffect(() => {
    setExplorerPage(1);
  }, [debouncedSearchTerm, priorityTfFilter]);

  useEffect(() => {
    if (explorer.error) {
      setErrorMessage(explorer.error);
    } else if (statsError) {
      setErrorMessage(statsError);
    }
  }, [explorer.error, statsError]);

  const handleDownloadTSV = () => {
    const run = async () => {
      setExportingTSV(true);
      setExportProgress('Preparing export...');

      try {
        await exportExplorerAsTsv({
          exportFormat,
          filters: {
            minConfidence,
            priorityTfFilter,
            searchTerm: debouncedSearchTerm,
            selectedSources
          },
          onProgress: setExportProgress
        });
      } catch (downloadError) {
        console.error(downloadError);
        setErrorMessage('Error exporting filtered TSV.');
      } finally {
        setExportingTSV(false);
        setExportProgress(null);
      }
    };

    void run();
  };

  if (showLanding) {
    return (
      <Landing
        onEnter={() => {
          setShowLanding(false);
          setActiveView('explorer');
        }}
      />
    );
  }

  return (
    <div className="print-shell print-grid flex h-screen overflow-hidden">
      <div className={`fixed inset-0 bg-slate-950/70 z-20 transition-opacity md:hidden ${isSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={() => setIsSidebarOpen(false)}></div>
      <aside className={`fixed md:static z-30 w-72 h-full print-panel border-r border-[var(--print-line)] text-slate-300 flex flex-col shrink-0 transition-transform md:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-6 border-b border-[var(--print-line)] flex items-center gap-3 justify-between">
          <div className="flex items-center gap-3">
            <div className="print-logo-frame w-16 h-16 rounded-2xl flex items-center justify-center p-2">
              <img src="/logos/sinfondoprint.png" alt="PRINT logo" className="w-full h-full object-contain" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight leading-tight">PRINT</h1>
              <p className="text-[10px] text-[var(--print-fog)] -mt-0.5">Plant Regulatory Information Network Tool</p>
            </div>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="md:hidden text-slate-400 hover:text-white">✕</button>
        </div>

        <nav className="print-scrollbar flex-1 p-4 space-y-2 overflow-y-auto">
          <div className="mb-6 px-3 py-3 print-panel-soft rounded-xl">
            <div className="text-[10px] font-bold text-[var(--print-mint)] uppercase tracking-widest mb-2">Database</div>
            <div className="text-xs font-medium text-slate-300 flex justify-between">
              <span>Interactions:</span>
              <span className="text-[var(--print-mint)] font-bold">{datasetStats?.totalInteractions ?? '...'}</span>
            </div>
            <div className="text-xs font-medium text-slate-300 flex justify-between mt-1">
              <span>Unique targets:</span>
              <span className="text-[var(--print-mint)] font-bold">{datasetStats?.uniqueTargets ?? '...'}</span>
            </div>
          </div>

          <button onClick={() => setActiveView('explorer')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${activeView === 'explorer' ? 'print-button' : 'hover:bg-white/5 text-slate-400'}`}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Explore Data
          </button>
          <button onClick={() => setActiveView('network')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${activeView === 'network' ? 'print-button' : 'hover:bg-white/5 text-slate-400'}`}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
            Network View
          </button>
          <button onClick={() => setActiveView('enrichment')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${activeView === 'enrichment' ? 'print-button' : 'hover:bg-white/5 text-slate-400'}`}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3v18h18M7 13l3-3 4 4 5-6" />
            </svg>
            Enrichment
          </button>
        </nav>
        <div className="p-4 border-t border-[var(--print-line)]">
          <div className="grid grid-cols-2 gap-3">
            <a
              href="https://pgrlab.cl"
              target="_blank"
              rel="noreferrer"
              className="print-partner-card rounded-2xl px-3 py-2.5 flex items-center justify-center overflow-hidden transition-all hover:border-[var(--print-line-strong)] hover:bg-white/5"
            >
              <div className="h-11 w-28 flex items-center justify-center shrink-0">
                <img
                  src="/logos/Logo Lab (transparent bg).png"
                  alt="Plant Genome Regulation Lab"
                  className="print-partner-logo max-h-full max-w-full object-contain opacity-100"
                />
              </div>
            </a>
            <a
              href="https://phytolearning.cl"
              target="_blank"
              rel="noreferrer"
              className="rounded-2xl px-3 py-2 flex items-center justify-center overflow-hidden transition-all hover:border-[var(--print-line-strong)] hover:bg-white/5 border border-[rgba(119,167,159,0.28)] bg-[linear-gradient(180deg,rgba(78,112,121,0.9),rgba(55,81,89,0.9))]"
            >
              <div className="h-10 w-24 flex items-center justify-center shrink-0">
                <img
                  src="/logos/2025 - Logo PhytoLearning sin fondo (1).png"
                  alt="PhytoLearning"
                  className="max-h-full max-w-full object-contain opacity-95"
                />
              </div>
            </a>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 bg-black/10">
        <header className="h-20 print-panel-soft border-b border-[var(--print-line)] flex items-center justify-between px-4 md:px-8 shrink-0 z-10">
          <div className="flex items-center gap-3">
            <button onClick={() => setIsSidebarOpen(true)} className="md:hidden px-3 py-2 rounded-lg bg-black/10 border border-[var(--print-line)] text-slate-200">☰</button>
            <div className="flex flex-col gap-1 items-start">
              <div className="flex items-center gap-4">
                <h2 className="text-lg font-bold text-[var(--print-mint)]">Regulatory Dashboard</h2>
              </div>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          {activeView === 'explorer' ? (
            <ExplorerView
              data={explorer.displayRows}
              datasetStats={datasetStats}
              errorMessage={errorMessage}
              explorerLoading={explorer.loading}
              exportFormat={exportFormat}
              exportProgress={exportProgress}
              exportingTSV={exportingTSV}
              explorerDisplayRows={explorer.displayRows}
              explorerDisplayTotal={explorer.displayTotal}
              explorerPage={explorerPage}
              explorerTotalPages={explorer.totalPages}
              hubMapping={hubMapping}
              onClearError={() => setErrorMessage(null)}
              onDownloadTSV={handleDownloadTSV}
              onNextPage={() => setExplorerPage((page) => Math.min(explorer.totalPages, page + 1))}
              onPrevPage={() => setExplorerPage((page) => Math.max(1, page - 1))}
              onSearchTermChange={(value) => {
                setSearchTerm(value);
                setPriorityTfFilter(null);
              }}
              onSetExportFormat={setExportFormat}
              onTogglePriorityTf={(gene) => {
                const isActive = priorityTfFilter === gene;
                setPriorityTfFilter(isActive ? null : gene);
                setSearchTerm(isActive ? '' : gene);
              }}
              onToggleSummary={() => setShowExplorerSummary((value) => !value)}
              priorityTfFilter={priorityTfFilter}
              searchTerm={searchTerm}
              showExplorerSummary={showExplorerSummary}
              totalInteractions={datasetStats?.totalInteractions || explorer.displayTotal}
            />
          ) : activeView === 'network' ? (
            <Suspense fallback={<ViewFallback label="network view" />}>
              <NetworkVisualization
                pathwayData={pathwayData}
                onPathwayChange={setPathwayData}
              />
            </Suspense>
          ) : activeView === 'enrichment' ? (
            <Suspense fallback={<ViewFallback label="enrichment view" />}>
              <EnrichmentPanel
                selectedSources={selectedSources}
                minConfidence={minConfidence}
              />
            </Suspense>
          ) : (
            <div className="print-panel rounded-3xl p-8 text-sm text-[var(--print-fog)]">
              Unknown view.
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default App;
