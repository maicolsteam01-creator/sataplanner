# SataPlanner

Planificador de blueprints para Satisfactory, gratuito y local-first.
Interfaz de plano técnico: arrastrás estructuras, las centrás contra el marco
del blueprint y ves producción, energía y cuellos de botella en vivo.

> Herramienta de fans. No afiliada a Coffee Stain Studios.

## Estado actual

Primera rebanada vertical funcionando (S0 + parte de S1/S2):

- Monorepo npm workspaces con `apps/web` y paquetes `game-data` / `engine`.
- Tema visual "blueprint técnico" (paleta, tipografía, grilla, marco 4×4 / 6×6).
- Lienzo propio con dos vistas: **planta** e **isométrica**.
- Catálogo derecho con búsqueda, categorías, arrastrar y soltar.
- Panel izquierdo de precisión: rejilla, snap, marco, centrar, pisos.
- Inspector: receta, cantidad de máquinas, clock, somersloops, conexiones.
- Motor de producción en vivo: tasas, energía, BOM y alertas.
- Undo/redo, persistencia en `localStorage`, export PNG y JSON.
- UI en **ES / EN / JA**.
- Export **SVG técnico** con cajetín, listado de máquinas, BOM y alertas;
  PNG 2× rasterizado desde el mismo SVG, **PDF** vía impresión A3 horizontal
  y **link comprimido** en `#p=` (sin backend).
- Panel izquierdo con nombre del plano, posición X/Y del nodo cuadrado y
  "centrar nodo en el marco".
- Importador tolerante a `docs.json` plano y al formato `NativeClass`/`Classes`.
- **Solver inverso** (`P` → *Herramientas*): de un ítem objetivo y una tasa a la
  cadena completa de producción, con máquinas, clock, energía, materias primas,
  links con transporte elegido y comparativa de recetas alternativas.
- **Plan por fases**: agrupa la cadena en etapas de construcción con checklist
  y exportación a Markdown.
- **Design Check**: detecta superposiciones, salida del marco, entradas sin
  conectar, sobrecarga de cintas, déficit energético, clock/sloops inválidos y
  ciclos; cada aviso salta al nodo y puede resaltarse en el lienzo.
- **Biblioteca local** (IndexedDB con respaldo en `localStorage`): guardar,
  abrir y borrar planos, importar JSON y plantillas de arranque.
- **Arte procedural propio** por edificio, en UI, canvas y SVG; se puede apagar.
- **Logos de los Mineros Mk.1 y Mk.2**: las imágenes `Miner_Mk.1.webp` y
  `Miner_Mk2.jpg` se usan como icono de cada edificio en catálogo/inspector, se
  dibujan dentro del nodo en el lienzo y viajan incrustadas en el SVG/PNG/PDF
  exportado (sin archivos externos).
- **PWA instalable** con caché offline y **tarjeta PNG con QR** del link `#p=`.
- **Perfiles locales** (`local-default` + espacios adicionales) con los planos
  etiquetados por perfil; los planos anteriores se migran automáticamente.
- Botón **Publicar**: guarda el plano en el perfil activo, lo marca como
  publicado y abre la tarjeta con el link `#p=` y su QR. Sigue sin haber backend.

## Comandos

```bash
npm install
npm run dev        # http://localhost:5173 (también imprime la URL de red local)
npm run test       # tests del motor (Vitest)
npm run typecheck
npm run build      # genera apps/web/dist
npm run preview    # sirve el build en http://localhost:4173
```

## Estructura

```
apps/web                 React + Vite + lienzo Canvas 2D
apps/web/src/lib/        draw, export, library, docIO, planAdapter, shareCard, templates, minerLogo
apps/web/src/components/ PlannerDialog, ShareCardDialog, BuildingArt, Glyph...
apps/web/public/         sw.js, manifest, _headers, íconos, og.png, miner-mk1.webp, miner-mk2.jpg
packages/game-data       contrato de tipos + dataset semilla
packages/engine          cálculo puro (sin UI), testeado con Vitest
packages/engine/src/plan.ts        solver inverso, fases y Design Check
packages/engine/src/plan.test.ts
scripts/import-docs.mjs  pipeline docs.json -> JSON normalizado
```

## Herramientas avanzadas

Atajo `P` o botón **Herramientas** en la barra superior. Cuatro pestañas:

| Pestaña | Qué hace |
|---|---|
| **Generar** | Elige ítem, tasa, estrategia (fijar clock o fijar 1 máquina), clock y si prefiere recetas alternativas. Muestra el resultado y permite *reemplazar* el plano actual o *agregarlo*. |
| **Fases** | Checklist de construcción por fase con acumulado de máquinas y energía; exporta `sataplanner-fases.md`. |
| **Verificar** | Lista de problemas con severidad; clic para centrar el nodo y opción de resaltarlos en el lienzo. |
| **Planos** | Guardar/abrir/borrar en la biblioteca local, importar JSON (texto o archivo) y crear planos desde plantillas. |

El menú **Exportar → Tarjeta con QR** genera una imagen 1200×630 con el QR
del link comprimido: se puede descargar para pasar el plano a otro dispositivo
sin servidor. Ninguna de estas funciones sube datos: todo se calcula en el
dispositivo con el mismo `game-data` que el resto de la app.

## Datos del juego

El dataset de `packages/game-data/src/data.ts` es **semilla de desarrollo**:
los valores marcados `verified: false` son aproximados. Para datos reales:

```bash
# 1. copiar el docs.json de la comunidad (SML) en data/raw/docs.json
# 2. generar el dataset normalizado
npm run data:import
# 3. resultado en data/normalized/game-data.json
```

Los `footprints` (tamaño en foundations) no vienen en `docs.json`: se curan a
mano en `data/curated/footprints.json` y se marcan como verificados.

## Decisiones de arquitectura

- **Renderer:** Canvas 2D aislado detrás de `lib/draw.ts`. PixiJS entra en S2
  con benchmark de 5.000 nodos; la interfaz de dibujo ya está separada para
  que el cambio no toque la UI ni el motor.
- **Motor puro:** `packages/engine` no importa React ni DOM. Se puede testear
  y reutilizar en una CLI o en el futuro exportador de planos.
- **Local-first:** sin cuentas, sin backend, sin analytics. El plano activo
  vive en `localStorage`, la biblioteca de planos en IndexedDB (con respaldo en
  `localStorage`) y el link compartible viaja comprimido en el `#fragment`, que
  nunca llega al servidor.
- **Motor de planificación:** `planProduction`, `phasePlan` y `validateDesign`
  viven en `packages/engine/src/plan.ts`, sin React ni DOM. La UI convierte el
  resultado en un `Doc` editable con `planAdapter.ts`.
- **Export sin dependencias:** un solo generador de SVG (`lib/svg.ts`) alimenta
  las cuatro salidas. PNG se rasteriza a 2× desde ese SVG y PDF se obtiene con
  el diálogo de impresión del navegador en A3 horizontal.
- **Datos versionados:** todo número sale de `game-data`; la UI no hardcodea
  velocidades de cinta, potencias ni recetas.

## Export

| Formato | Cómo | Resultado |
|---|---|---|
| PNG | menú **Exportar** | hoja 3360×2360 px (2×) |
| SVG | menú **Exportar** | vectorial, editable en Figma/Illustrator |
| PDF | menú **Exportar** | A3 horizontal; elegí «Guardar como PDF» |
| JSON | menú **Exportar** | plano completo para reimportar |
| Link | menú **Exportar** | URL con el plano comprimido, sin servidor |
| Tarjeta QR | menú **Exportar → Tarjeta con QR** | PNG 1200×630 con el link compartible |

El SVG incluye grilla recortada al marco, ejes y cruz de centrado, cotas,
escala (1 foundation = 8 m), referencias `B1..Bn`, leyenda de estados,
listado de máquinas, insumos externos y cajetín.

## Publicar (abrir desde otros PC y celulares)

La app es **100 % estática**: no hay backend, ni cuentas, ni secretos. Publicar
es subir `apps/web/dist` a cualquier hosting de archivos.

### 1. Probar en la red local

```bash
npm run build
npm run preview
```

Vite imprime dos URLs; la de **Network** (`http://192.168.x.x:4173`) es la que
abre el celular en la misma WiFi. Si no carga:

- Permitir Node.js en el Firewall de Windows para redes **privadas**.
- Desactivar el "aislamiento de clientes" del router y no usar la red de invitados.
- Usar la IP, no `localhost`: en Windows `localhost` resuelve a IPv6 y el
  servidor queda escuchando en otra interfaz.

### 2. Publicar en internet (gratis, HTTPS automático)

**GitHub Pages (destino actual)** — URL:
<https://maicolsteam01-creator.github.io/sataplanner/>

El repo `maicolsteam01-creator/sataplanner` es público (requisito de Pages en
plan Free). `.github/workflows/deploy.yml` corre en cada push a `main`:
`npm ci` → `typecheck` → `test` → `build` → `upload-pages-artifact` →
`deploy-pages`. Para actualizar la app alcanza con hacer push; GitHub publica
solo si pasan los chequeos. El build usa `base: './'`, así que funciona en el
subdirectorio `/sataplanner/` sin cambiar rutas.

**Cloudflare Pages — Direct Upload** (alternativa, no hace falta git):

1. `npm run build`
2. Cloudflare Dashboard → *Workers & Pages* → *Create* → *Pages* → *Upload assets*.
3. Arrastrar la carpeta **`apps/web/dist`** (no la raíz del repo).
4. Queda en `https://<proyecto>.pages.dev`.

**Netlify Drop** (aún más rápido): arrastrar `apps/web/dist` en
<https://app.netlify.com/drop>.

El repositorio ya trae lo que estos hostings esperan en `apps/web/public/`,
copiado al `dist` en cada build:

| Archivo | Para qué |
|---|---|
| `_headers` | cache largo para `assets/*`, `no-cache` para `index.html`, `nosniff`, `no-referrer` |
| `_redirects` | fallback SPA (`/* /index.html 200`) para rutas futuras |
| `manifest.webmanifest` | instalable en Android/iOS con nombre, colores e íconos |
| `sw.js` | caché del build para abrir la app offline |
| `og.png` | tarjeta 1200×630 al compartir el link en Discord/WhatsApp/X |
| `robots.txt` | indexación básica |

`vite.config.ts` usa `base: './'`, así que el mismo build funciona en la raíz
del dominio o en un subdirectorio (GitHub Pages, `usuario.github.io/sataplanner`).

### 3. Compartir sin publicar (túnel temporal)

```bash
npx cloudflared tunnel --url http://localhost:4173
```

Da una URL `https://algo.trycloudflare.com` con HTTPS, sin cuenta. Se apaga al
cerrar la terminal.

### 4. Actualizaciones automáticas

En GitHub Pages ya está configurado el workflow anterior. En Cloudflare Pages /
Netlify se conecta el repo por Git:

- Build command: `npm run build`
- Output directory: `apps/web/dist`
- Node: `>= 20` (ya declarado en `package.json`)

Cada `push` publica y cada PR genera una URL de preview. Conviene sumar CI con
`npm run typecheck && npm run test && npm run build` antes de publicar.

### Antes de publicar: rescatar los planos locales

`localStorage` está atado al **origen**. Un plano guardado en
`http://localhost:5173` **no aparece** en `https://tu-dominio.pages.dev`.
Exportalo como **JSON** o **link** y reimportalo en el dominio nuevo.

### Detalles a tener en cuenta

- El link compartible (`#p=...`) viaja en el fragmento: nunca llega al servidor.
- `og:image` sale como `./og.png`. Algunos scrapers (X/Twitter) prefieren URL
  absoluta: al tener dominio fijo, cambiar a `https://dominio/og.png`.
- HTTPS es obligatorio para el portapapeles y para que el service worker se
  registre: en `http://localhost` funciona; en LAN HTTP no se activa el offline.
- El service worker se registra solo en producción (`import.meta.env.PROD`) y
  usa caché con fallback a `index.html`. Si cambiás el build, limpiá caché del
  sitio una vez o incrementá `CACHE` en `apps/web/public/sw.js`.
- Un plano guardado en un origen no aparece en otro: usá la biblioteca local
  con import/export, el link `#p=` o la tarjeta QR para migrarlo.

## Roadmap

| Fase | Estado |
|---|---|
| S0 Fundación | ✅ |
| S1 Motor + datos | 🟡 motor listo, falta dataset real |
| S2 Lienzo | ✅ base funcionando + IndexedDB para la biblioteca (PixiJS queda opcional) |
| S3 Cálculo + iso | ✅ cálculo en vivo, iso, solver inverso, fases y Design Check |
| S4 Export | ✅ SVG, PNG 2×, PDF, JSON, link comprimido y tarjeta QR |
| S5 Arte + i18n | ✅ arte procedural propio + ES/EN/JA |
| S6 Móvil + PWA | ✅ responsive + service worker offline |
| S7 QA + release | 🟡 deploy 24/7 en GitHub Pages; dominio propio pendiente |
| S8 Perfil + publicación | ✅ perfil local, planos por perfil, botón Publicar con link/QR |

## Perfil local y publicación

La barra superior muestra el espacio activo (`Mi espacio local` por defecto).
Desde ahí se pueden crear espacios, renombrarlos y cambiar entre ellos. Cada
plano guardado queda asociado al espacio activo y la pestaña **Planos** muestra
si está publicado o en borrador. Los planos creados antes de esta función se
migran al espacio `local-default` al abrir la biblioteca.

**Publicar** guarda el plano actual, lo marca como publicado y abre la tarjeta
con el link `#p=` y su QR. El link sigue viajando comprimido en el fragmento:
no hay servidor, no se sube el plano y no hace falta cuenta. Una fase futura
podrá sumar cuentas opcionales mediante un adapter de nube; hoy no existe.

## Próximos pasos inmediatos

1. Reemplazar el dataset semilla por el importado y curar footprints (hoy todo
   `verified: false`; es el cuello de botella para precisión real).
2. Decidir si se quiere dominio propio apuntando a GitHub Pages.
3. Fase 2 de perfiles: cuenta opcional y backend a elegir (sin afectar el modo local).
4. Benchmark de render con planos grandes y prueba en móvil real.
5. Verificar el service worker tras cada deploy (caché / versión).
