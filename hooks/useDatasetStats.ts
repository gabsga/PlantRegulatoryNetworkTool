import { useEffect, useState } from 'react';
import { DatasetStats } from '../types';
import { loadDatasetManifest } from '../services/dataLoader';

export function useDatasetStats(enabled: boolean) {
  const [stats, setStats] = useState<DatasetStats | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    setError(null);

    loadDatasetManifest()
      .then((manifest) => {
        if (!cancelled) {
          setStats(manifest.stats);
        }
      })
      .catch((loadError) => {
        console.warn('Dataset stats unavailable during initial bootstrap.', loadError);
        if (!cancelled) {
          setError('No se pudieron cargar las estadisticas del dataset.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return {
    error,
    stats
  };
}
