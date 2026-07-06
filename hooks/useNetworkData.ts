import { useEffect, useMemo, useState } from 'react';
import { IntegratedInteraction, PathwayMapping } from '../types';
import {
  getLocalGeneMappingForGenes,
  getLocalHierarchyForTF,
  getLocalInteractionsForTF,
  getLocalPathwayMappingForGenes,
  getLocalTFOptions
} from '../services/dataLoader';
import { PathwayData } from '../services/pathwayLoader';

export function useNetworkData(selectedTF: string, pathwayData?: PathwayData | null) {
  const [tfOptions, setTfOptions] = useState<string[]>([]);
  const [directData, setDirectData] = useState<IntegratedInteraction[]>([]);
  const [hierarchyData, setHierarchyData] = useState<IntegratedInteraction[]>([]);
  const [pathwayMapping, setPathwayMapping] = useState<PathwayMapping>({});
  const [geneMapping, setGeneMapping] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    getLocalTFOptions()
      .then((rows) => {
        if (!cancelled) {
          setTfOptions(rows);
        }
      })
      .catch((loadError) => {
        console.error(loadError);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!selectedTF) {
      setDirectData([]);
      setHierarchyData([]);
      setPathwayMapping({});
      setError(null);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    setError(null);

    const load = async () => {
      try {
        const [localDirect, localHierarchy] = await Promise.all([
          getLocalInteractionsForTF(selectedTF),
          getLocalHierarchyForTF(selectedTF)
        ]);
        if (cancelled) return;

        const genes = Array.from(new Set(
          [...localDirect, ...localHierarchy].flatMap((row) => [
            row.tf,
            row.target,
            row.tfId || '',
            row.targetId || ''
          ]).filter(Boolean)
        ));
        const localPathwayMapping = await getLocalPathwayMappingForGenes(genes);

        setDirectData(localDirect);
        setHierarchyData(localHierarchy);
        setPathwayMapping(localPathwayMapping);
      } catch (loadError) {
        console.error(loadError);
        if (!cancelled) {
          setError('Error cargando datos de network.');
          setDirectData([]);
          setHierarchyData([]);
          setPathwayMapping({});
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
  }, [selectedTF]);

  useEffect(() => {
    let cancelled = false;

    if (!pathwayData) {
      setGeneMapping({});
      return () => {
        cancelled = true;
      };
    }

    const geneIds = Array.from(new Set(
      pathwayData.nodeContent
        .map((node) => node.gene_or_compound_id)
        .filter((gene) => gene && /^AT/i.test(gene))
    ));

    if (geneIds.length === 0) {
      setGeneMapping({});
      return () => {
        cancelled = true;
      };
    }

    getLocalGeneMappingForGenes(geneIds)
      .then((mapping) => {
        if (!cancelled) {
          setGeneMapping(mapping);
        }
      })
      .catch((loadError) => {
        console.error(loadError);
      });

    return () => {
      cancelled = true;
    };
  }, [pathwayData]);

  return useMemo(() => ({
    directData,
    error,
    geneMapping,
    hierarchyData,
    loading,
    pathwayMapping,
    tfOptions
  }), [directData, error, geneMapping, hierarchyData, loading, pathwayMapping, tfOptions]);
}
