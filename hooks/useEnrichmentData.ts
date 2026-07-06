import { useEffect, useMemo, useState } from 'react';
import { getLocalGoAnnotationsByTerms, getLocalTfTargetSets } from '../services/dataLoader';

const GO_TERMS = [
  'Water deprivation',
  'Response to ABA',
  'Salt stress',
  'Osmotic stress',
  'Response to auxin',
  'Response to nitrate'
];

export function useEnrichmentData(selectedSources: string[], minConfidence: number) {
  const [goAnnotations, setGoAnnotations] = useState<Record<string, string[]>>({});
  const [tfTargets, setTfTargets] = useState<Map<string, Set<string>> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const load = async () => {
      try {
        const [localGoAnnotations, localTfTargets] = await Promise.all([
          getLocalGoAnnotationsByTerms(GO_TERMS),
          getLocalTfTargetSets({
            minConfidence,
            selectedSources
          })
        ]);

        if (cancelled) return;

        setGoAnnotations(localGoAnnotations);
        setTfTargets(localTfTargets);
      } catch (loadError) {
        console.error(loadError);
        if (!cancelled) {
          setError('Error cargando datos de enrichment.');
          setGoAnnotations({});
          setTfTargets(null);
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
  }, [minConfidence, selectedSources]);

  return useMemo(() => ({
    error,
    goAnnotations,
    loading,
    tfTargets
  }), [error, goAnnotations, loading, tfTargets]);
}
