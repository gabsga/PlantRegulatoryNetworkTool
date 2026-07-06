import { useEffect, useMemo, useState } from 'react';
import { IntegratedInteraction } from '../types';
import { loadIntegratedData } from '../services/dataLoader';
import { filterInteractions } from '../services/explorer/filterInteractions';

interface ExplorerFilterState {
  minConfidence: number;
  priorityTfFilter: string | null;
  searchTerm: string;
  selectedSources: string[];
}

const explorerPageSize = 100;

export function useExplorerData({
  enabled,
  filters,
  page
}: {
  enabled: boolean;
  filters: ExplorerFilterState;
  page: number;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localRows, setLocalRows] = useState<IntegratedInteraction[]>([]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    const load = async () => {
      try {
        const dataset = await loadIntegratedData();
        if (cancelled) return;

        const filtered = filterInteractions(dataset.interactions, {
          minConfidence: filters.minConfidence,
          priorityTfFilter: filters.priorityTfFilter,
          searchTerm: filters.searchTerm,
          selectedSources: filters.selectedSources
        });

        setLocalRows(filtered);
      } catch (loadError) {
        console.error(loadError);
        if (!cancelled) {
          setLocalRows([]);
          setError('Error cargando datos del explorer.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [enabled, filters.minConfidence, filters.priorityTfFilter, filters.searchTerm, filters.selectedSources, page]);

  const displayRows = useMemo(
    () => localRows.slice((page - 1) * explorerPageSize, page * explorerPageSize),
    [localRows, page]
  );

  const displayTotal = localRows.length;
  const totalPages = Math.max(1, Math.ceil(displayTotal / explorerPageSize));

  return {
    displayRows,
    displayTotal,
    error,
    loading,
    totalPages
  };
}
