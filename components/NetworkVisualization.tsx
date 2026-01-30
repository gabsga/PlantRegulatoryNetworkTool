import React, { useState } from 'react';
import { IntegratedInteraction, PathwayMapping } from '../types';
import DirectTargetsView from './DirectTargetsView';
import HierarchicalView from './HierarchicalView';
import PathwayVisualization from './PathwayVisualization';
import { PathwayData } from '../services/pathwayLoader';

interface NetworkVisualizationProps {
    data: IntegratedInteraction[];
    pathwayMapping: PathwayMapping;
    pathwayData?: PathwayData | null;
}

type NetworkView = 'direct' | 'hierarchical' | 'pathway';

export default function NetworkVisualization({ data, pathwayMapping, pathwayData }: NetworkVisualizationProps) {
    const [view, setView] = useState<NetworkView>('direct');
    const [selectedTF, setSelectedTF] = useState('');

    return (
        <div className="space-y-6">
            {/* View Selector */}
            <div className="bg-slate-900/50 backdrop-blur-xl rounded-2xl border border-slate-700 p-2 flex items-center gap-2 w-fit shadow-lg">
                <button
                    onClick={() => setView('direct')}
                    className={`px-6 py-3 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${view === 'direct'
                            ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/30'
                            : 'text-slate-400 hover:bg-slate-800'
                        }`}
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Direct Targets
                </button>

                <button
                    onClick={() => setView('hierarchical')}
                    className={`px-6 py-3 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${view === 'hierarchical'
                            ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/30'
                            : 'text-slate-400 hover:bg-slate-800'
                        }`}
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
                    </svg>
                    Hierarchical
                </button>

                <button
                    onClick={() => setView('pathway')}
                    className={`px-6 py-3 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${view === 'pathway'
                            ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/30'
                            : 'text-slate-400 hover:bg-slate-800'
                        }`}
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                    </svg>
                    Pathway
                </button>
            </div>

            {/* View Content */}
            {view === 'direct' && (
                <DirectTargetsView
                    data={data}
                    pathwayMapping={pathwayMapping}
                    selectedTF={selectedTF}
                    onTFChange={setSelectedTF}
                />
            )}

            {view === 'hierarchical' && (
                <HierarchicalView
                    data={data}
                    pathwayMapping={pathwayMapping}
                    selectedTF={selectedTF}
                    onTFChange={setSelectedTF}
                />
            )}

            {view === 'pathway' && (
                pathwayData ? (
                    <PathwayVisualization
                        pathwayData={pathwayData}
                        regulatoryData={data}
                    />
                ) : (
                    <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-3xl shadow-2xl border border-slate-700 flex items-center justify-center h-[800px]">
                        <div className="text-center">
                            <div className="text-6xl mb-4">🧬</div>
                            <div className="text-xl font-bold text-slate-400">No pathway selected</div>
                            <div className="text-sm text-slate-500 mt-2">Select a pathway from the sidebar to view</div>
                        </div>
                    </div>
                )
            )}
        </div>
    );
}
