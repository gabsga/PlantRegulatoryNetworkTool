# KEGG Pathway Parser

Este script convierte archivos KGML de KEGG a formato TSV compatible con la visualización de redes.

## Uso

### Desde WSL (Recomendado)

```bash
# Navegar al proyecto
cd /mnt/c/Users/Usuario/Downloads/the-final-genereg-integrator

# Ejecutar para ABA
node scripts/parseKeggKGML_simple.js ath04075.xml public/data/pathways/aba ABA

# Ejecutar para Auxinas
node scripts/parseKeggKGML_simple.js ath04075.xml public/data/pathways/auxin AUXIN

# Ejecutar para Water Deprivation (usa ABA)
node scripts/parseKeggKGML_simple.js ath04075.xml public/data/pathways/water_deprivation WATER_DEPRIVATION

# Ejecutar para Osmotic Stress (usa ABA)
node scripts/parseKeggKGML_simple.js ath04075.xml public/data/pathways/osmotic_stress OSMOTIC_STRESS
```

## Hormonas disponibles

- `ABA` - Ácido abscísico
- `AUXIN` - Auxinas (IAA)
- `ETHYLENE` - Etileno
- `CYTOKININ` - Citoquininas
- `GIBBERELLIN` - Giberelinas
- `BRASSINOSTEROID` - Brasinoesteroides
- `JASMONIC_ACID` - Ácido jasmónico
- `SALICYLIC_ACID` - Ácido salicílico
- `WATER_DEPRIVATION` - Privación de agua (usa ABA)
- `OSMOTIC_STRESS` - Estrés osmótico (usa ABA)

## Archivos de salida

El script genera 3 archivos TSV en el directorio de salida:

1. **nodes.tsv** - Nodos de la red (genes y compuestos)
2. **edges.tsv** - Relaciones entre nodos (activación/represión)
3. **content.tsv** - Mapeo de nodos a IDs de genes

## Ejemplo completo

```bash
# 1. Generar datos para ABA
node scripts/parseKeggKGML_simple.js ath04075.xml public/data/pathways/aba ABA

# 2. Verificar archivos generados
ls public/data/pathways/aba/
# Deberías ver: nodes.tsv, edges.tsv, content.tsv

# 3. Integrar con la visualización (próximo paso)
```

## Próximos pasos

1. ✅ Parser creado
2. ⏳ Ejecutar parser para generar TSVs
3. ⏳ Crear componente de visualización de pathways
4. ⏳ Integrar con datos regulatorios existentes (DAP-seq, ChIP-seq, TARGET)
