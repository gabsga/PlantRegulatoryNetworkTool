# Migracion de PRINT a Modo Local para Despliegue en ELQUI

## 1. Objetivo

Migrar `PRINT` desde un esquema mixto `Supabase + archivos locales` a un esquema **100% local**, donde:

- la fuente de verdad sean archivos del propio proyecto;
- la aplicacion se compile como sitio estatico;
- el despliegue final quede "colgado" en el servidor `ELQUI`;
- el acceso a la app ocurra desde la red local;
- el desarrollo pueda seguir haciendose desde otro servidor y luego publicarse en `ELQUI`.

La meta es simplificar operacion, eliminar dependencia de servicios externos y dejar un flujo reproducible para actualizaciones de datos y frontend.

## 2. Estado actual

Hoy el repositorio ya tiene una base util para esta migracion:

- existe un loader local en `services/staticDatasetLoader.ts`;
- `public/data/` ya contiene los TSV usados como fallback;
- el build de Vite genera una app estatica en `dist/`;
- la logica actual intenta usar `Supabase` si hay variables `VITE_SUPABASE_*` y, si falla, cae a archivos locales.

Eso significa que no estamos partiendo desde cero: el modo local ya existe, pero no es todavia el camino principal ni el unico soportado.

## 3. Nueva arquitectura objetivo

### 3.1 Principio general

`PRINT` debe funcionar sin `Supabase`, sin RPCs y sin vistas materializadas remotas.

La arquitectura objetivo sera:

1. `public/data/` contiene todos los archivos canonicos requeridos por la app.
2. El frontend carga esos archivos directamente por HTTP desde el mismo host donde se sirve la app.
3. `ELQUI` publica el contenido de `dist/` en la red local.
4. Las actualizaciones se hacen recompilando en el servidor de trabajo y copiando el build final a `ELQUI`, o compilando directamente en `ELQUI`.

### 3.2 Topologia propuesta

- **Servidor de desarrollo/trabajo**:
  - edicion de codigo;
  - pruebas locales;
  - armado/actualizacion de `public/data/`;
  - build de produccion.

- **Servidor ELQUI**:
  - host estatico dentro de la LAN;
  - expone `PRINT` por IP o hostname interno;
  - no procesa ni transforma datos;
  - solo sirve archivos.

## 4. Decision tecnica recomendada

### Recomendacion principal

Usar un despliegue **estatico puro** en `ELQUI`.

Esto implica:

- mantener `PRINT` como app Vite;
- compilar con `npm run build`;
- publicar la carpeta `dist/` en `ELQUI`;
- servirla con un servidor web simple de LAN, por ejemplo `nginx`, `caddy` o incluso `python -m http.server` para pruebas.

### Por que esta opcion es la mejor para ELQUI

- elimina `Supabase` por completo;
- reduce puntos de falla;
- no requiere base de datos ni credenciales;
- encaja con la idea de "colgar archivos" en un servidor;
- simplifica backup y versionado;
- hace mas facil mover o replicar la app a otro host interno.

## 5. Cambios funcionales requeridos en el codigo

## 5.1 Loader de datos

El archivo `services/dataLoader.ts` hoy hace esto:

- intenta cargar desde `Supabase`;
- si falla, usa `loadIntegratedDataFromStaticFiles()`.

La migracion debe cambiar ese contrato a:

- **modo local como comportamiento unico y oficial**;
- `Supabase` deja de ser parte del flujo normal;
- idealmente se elimina la bifurcacion condicional por `getSupabaseConfig()`.

### Cambio esperado

`loadIntegratedData()` debe cargar siempre desde `public/data/`.

Resultado:

- menos complejidad;
- menos ramas de error;
- menos diferencias entre desarrollo y produccion.

## 5.2 Servicios supabase

La carpeta `services/supabase/` hoy agrupa:

- cliente REST;
- queries de explorer;
- queries de red;
- queries de anotaciones;
- tipos y mapeos.

Con la nueva arquitectura hay dos opciones:

### Opcion A. Conservadora

Mantener esos archivos por un tiempo, pero dejarlos fuera del flujo activo.

Ventajas:

- migracion menos riesgosa;
- permite rollback rapido;
- evita tocar demasiado codigo al principio.

### Opcion B. Limpieza completa

Eliminar o archivar toda la capa `Supabase` una vez validado el modo local.

Ventajas:

- repo mas claro;
- menos deuda tecnica;
- menos confusion futura.

### Recomendacion

Hacerlo en dos fases:

1. primero dejar `local-only` funcionando;
2. despues archivar o borrar `services/supabase/`.

## 5.3 Exploracion, filtros y enrichment

Hay partes del frontend que hoy consumen helpers con nombre `fetchSupabase*`.

Aunque internamente se resuelvan con archivos locales, conviene rediseñar la capa de acceso para que los nombres reflejen la realidad.

### Recomendacion de refactor

Crear una capa neutral, por ejemplo:

- `services/local/explorerQueries.ts`
- `services/local/networkQueries.ts`
- `services/local/annotationQueries.ts`

o bien una sola capa:

- `services/localDataset.ts`

La idea es que el dominio hable de:

- interacciones;
- TFs;
- GO;
- pathways;
- enrichment;

y no de `Supabase`.

## 5.4 Variables de entorno

En el nuevo modelo, `PRINT` no deberia depender de:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_SUPABASE_*`

Se recomienda:

- dejar `.env.local` sin claves de `Supabase`;
- documentar que el build local no requiere secretos;
- si hace falta, agregar solo variables de despliegue estatico, por ejemplo base path.

## 6. Datos: fuente de verdad local

## 6.1 Archivos actuales relevantes

Hoy la app ya usa archivos como:

- `public/data/target.tsv`
- `public/data/chip.tsv`
- `public/data/dap.part01.tsv` ... `dap.partNN.tsv`
- `public/data/mapping.tsv`
- `public/data/process.txt`
- `public/data/go_annotations.tsv`

Tambien existen insumos pesados o auxiliares en:

- `docs/raw_data/`
- `upload/supabase_csv/`

## 6.2 Definicion recomendada de canon

La fuente de verdad debe quedar explicitamente definida asi:

- **canon de runtime**: `public/data/`
- **raw historico o insumos originales**: `docs/raw_data/`
- **artefactos temporales de transformacion**: `upload/` o carpeta equivalente gitignored

Esto evita mezclar:

- datos que la app sirve al usuario;
- datos crudos de procesamiento;
- archivos intermedios.

## 6.3 Estrategia de versionado de datos

Como el despliegue sera estatico, los datos deben viajar con el build.

Se recomienda:

1. actualizar `public/data/`;
2. probar localmente;
3. compilar;
4. publicar `dist/` en `ELQUI`.

Opcionalmente, agregar un archivo como:

- `public/data/DATA_VERSION.json`

con campos como:

- fecha de corte;
- origen;
- responsable;
- notas de cambio.

Eso ayuda mucho para soporte interno.

## 7. Estrategia de despliegue en ELQUI

## 7.1 Modelo recomendado

`ELQUI` debe actuar como **servidor estatico de LAN**.

Estructura sugerida en `ELQUI`:

```text
/srv/print/
  current/
  releases/
  shared/
```

Donde:

- `releases/` guarda builds versionados;
- `current/` apunta al build activo;
- `shared/` puede guardar assets persistentes si mas adelante hicieran falta.

### Ejemplo

```text
/srv/print/releases/2026-07-06_1130/
/srv/print/current -> /srv/print/releases/2026-07-06_1130/
```

Esto permite rollback simple cambiando el enlace `current`.

## 7.2 Que se publica realmente

Publicar el contenido generado por:

```bash
npm run build
```

o sea, la carpeta:

```text
dist/
```

No hace falta desplegar:

- `node_modules/`
- `docs/`
- `upload/`
- scripts de preparacion

si `ELQUI` solo va a servir la aplicacion ya compilada.

## 7.3 Servidor web

Opciones viables en `ELQUI`:

- `nginx` si quieres algo estable y convencional;
- `caddy` si quieres configuracion minima;
- `python -m http.server` solo para pruebas internas rapidas.

### Recomendacion

Si `ELQUI` va a quedar como host semipermanente, usar `nginx`.

Config minima esperada:

- document root apuntando a `/srv/print/current`;
- soporte de SPA para que rutas internas resuelvan a `index.html`;
- exposicion por puerto interno, por ejemplo `80` o `8080`.

## 8. Flujo de trabajo: desarrollo en otro servidor y publicacion en ELQUI

## 8.1 Flujo recomendado

1. desarrollar y validar en el servidor de trabajo;
2. actualizar `public/data/` si cambian datasets;
3. ejecutar `npm run build`;
4. copiar `dist/` a `ELQUI`;
5. activar el release en `ELQUI`;
6. probar desde una maquina de la red local.

## 8.2 Mecanismos de traslado

Opciones razonables:

- `rsync` sobre SSH;
- `scp`;
- `git pull` en `ELQUI` + build local en `ELQUI`;
- carpeta compartida de red, si ya existe.

### Recomendacion principal

Usar `rsync` para copiar `dist/` ya compilado desde el servidor de trabajo a `ELQUI`.

Ventajas:

- solo sube diferencias;
- deja el host de despliegue mas simple;
- no obliga a instalar toolchain completo en `ELQUI`.

### Variante alternativa

Si `ELQUI` ya tiene `node` y acceso al repo:

1. hacer `git pull` en `ELQUI`;
2. correr `npm ci`;
3. correr `npm run build`;
4. publicar `dist/`.

Esto simplifica trazabilidad, pero hace a `ELQUI` parte del pipeline de build.

## 8.3 Script de despliegue sugerido

Se recomienda crear despues un script como:

- `scripts/deploy-elqui.sh`

con responsabilidades como:

- validar que `npm run build` paso;
- crear carpeta release;
- copiar `dist/` al destino;
- actualizar `current`;
- dejar log del despliegue.

No es obligatorio para la primera iteracion, pero vale la pena si `PRINT` se actualizara seguido.

## 9. Riesgos y mitigaciones

## 9.1 Tamano de datos

Si `public/data/` crece mucho:

- el tiempo de carga inicial puede subir;
- el navegador puede tardar en parsear TSVs grandes;
- ciertas vistas podrian volverse pesadas.

### Mitigacion

- mantener archivos particionados cuando sea necesario, como ya pasa con `dap.partNN.tsv`;
- considerar preintegrar mas datos en archivos optimizados;
- medir tiempos reales de carga en la LAN.

## 9.2 Logica aun acoplada a Supabase

Puede haber componentes o hooks que todavia dependan de funciones `fetchSupabase*`.

### Mitigacion

- inventariar imports;
- reemplazar primero la capa de acceso;
- luego limpiar nombres e implementaciones.

## 9.3 Despliegue manual propenso a errores

Copiar archivos a mano puede producir:

- builds incompletos;
- confusion de version;
- rollback dificil.

### Mitigacion

- usar estructura `releases/current`;
- automatizar con script;
- mantener convencion de version por fecha.

## 9.4 Diferencias entre entorno de trabajo y ELQUI

Aunque el sitio final sea estatico, pueden aparecer diferencias por:

- rutas base;
- permisos;
- configuracion del servidor web;
- cache del navegador.

### Mitigacion

- probar el build servido por HTTP antes de publicar;
- documentar la URL final de LAN;
- definir una configuracion unica de hosting.

## 10. Plan de implementacion propuesto

## Fase 1. Congelar Supabase como dependencia activa

- cambiar `services/dataLoader.ts` para cargar solo local;
- eliminar necesidad de `VITE_SUPABASE_*` en runtime;
- verificar que la app levanta solo con `public/data/`.

## Fase 2. Desacoplar nombres y servicios

- reemplazar imports `fetchSupabase*` por una capa neutral o local;
- refactorizar hooks y componentes para dejar de hablar de `Supabase`;
- validar explorer, network, enrichment y pathway.

## Fase 3. Ordenar datos canonicos

- confirmar que `public/data/` es la fuente de verdad;
- mover o documentar claramente `docs/raw_data/` como insumo no servido;
- definir proceso oficial de actualizacion de datasets.

## Fase 4. Preparar despliegue ELQUI

- definir ruta final en `ELQUI`;
- configurar servidor estatico;
- probar acceso desde otra maquina de la red;
- definir rollback simple.

## Fase 5. Automatizar

- crear script de despliegue;
- documentar comando unico de publicacion;
- opcionalmente agregar validaciones previas.

## 11. Criterios de exito

La migracion se considera exitosa si:

1. `PRINT` funciona sin variables ni servicios de `Supabase`.
2. Toda la informacion visible proviene de archivos locales del proyecto.
3. El build puede publicarse en `ELQUI` como sitio estatico.
4. Un usuario de la red local puede acceder por IP/hostname interno.
5. El proceso de actualizacion puede repetirse desde otro servidor sin pasos ambiguos.

## 12. Recomendacion final

La decision correcta para este nuevo escenario es convertir `PRINT` en una app **local-first y estaticamente desplegable**.

En la practica eso significa:

- dejar `public/data/` como fuente de verdad;
- retirar `Supabase` del camino critico;
- compilar en el servidor de trabajo;
- publicar `dist/` en `ELQUI`;
- servirlo en la LAN con un host estatico simple.

Es la opcion mas alineada con lo que necesitas ahora: menos infraestructura, menos dependencia externa y una operacion mucho mas controlable dentro del laboratorio.

## 13. Siguientes entregables recomendados

Despues de este documento, los siguientes artefactos utiles serian:

1. un refactor tecnico para dejar `PRINT` en `local-only`;
2. un `DEPLOY_ELQUI.md` con pasos exactos de publicacion;
3. un `scripts/deploy-elqui.sh`;
4. una limpieza final de la capa `Supabase`.
