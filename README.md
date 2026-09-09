# Consolidador S&OP

Reemplaza el copy-paste manual mensual de las diapositivas de las 8 plantas
productivas en el informe consolidado de S&OP Global, por una revisión y
confirmación rápida en el navegador.

No hay backend ni base de datos: todo corre en el navegador, en memoria, para
la sesión de uso. Nada se sube a ningún servidor.

**El resultado ya no es un `.pptx`: es un documento HTML autocontenido**,
editable, exportable a PDF, y que se puede reabrir y seguir editando (ver
*Por qué HTML y no PPTX* más abajo).

**Identidad visual**: colores, tipografía, logo y portada salen
directamente del archivo base real que usan las 8 plantas para armar su
informe mensual (`2025_Inf_SOP_base_para_todas_las_plantas.pptx`), no son
un diseño inventado — verde `#009045`, teal `#00AC9C`, tipografía Barlow
para títulos (la que usa el archivo base) e IBM Plex Sans para el cuerpo,
el isotipo real de Megalabs en el encabezado, y la portada del consolidado
recrea la portada real (las mismas dos fotos + el isotipo + "S&OP
Ciclo:") con el mes/año que cargues cada vez.

**El agrupamiento es por planta, no por tema**: el consolidado trae una
divisoria grande por cada planta (nunca una carátula por sección/tema como
"Capacidad" o "KPIs"), y cada planta conserva el orden real de sus
diapositivas — sin reordenarlas ni mezclarlas con las de otra planta.
Cada tarjeta sí muestra una etiqueta de sección de referencia (Capacidad,
KPIs, Informe de Faltantes, Lanzamientos, BO / Crítico, Materias Primas e
Insumos — las 6 secciones y su orden salen del mismo archivo base) para
ubicarse rápido, pero es sólo eso, una etiqueta: no agrupa ni reordena.

## Flujo de uso mensual

1. **Abrí la herramienta** (URL de Netlify) y arrastrá hasta 8 archivos
   `.pptx`, uno por planta.
2. La herramienta detecta automáticamente el nombre de cada planta a partir
   del nombre de archivo (editable a mano si hace falta) y lee cada
   diapositiva.
3. Hacé clic en **Continuar a revisión**. Vas a ver un tablero con una
   columna por planta, cada una con sus diapositivas en su orden original.
   Ahí podés:
   - Excluir del consolidado una diapositiva puntual (por ejemplo, la de
     "Agenda/reglas de la reunión" de alguna planta) con el botón ×.
   - Reordenar los chips de "Orden de plantas en el consolidado" para que
     coincidan con el orden en que se van a presentar en la reunión.
4. Completá **Mes / Año** (ej. "Septiembre 2026") y hacé clic en **Generar
   consolidado**. La herramienta extrae el contenido completo de cada
   diapositiva incluida (título, texto con sus niveles de viñeta, tablas,
   imágenes) y arma la **vista consolidada**: primero la portada (con el
   ciclo que acabás de completar), y después, por cada planta en el orden
   elegido, una divisoria grande con el nombre de la planta seguida de
   todas sus diapositivas incluidas, en su orden real — nunca mezcladas
   con las de otra planta.
5. **Editá la vista consolidada** directamente en el navegador:
   - Cualquier texto (títulos, viñetas, celdas de tabla, el nombre de una
     planta, el texto de la portada) es editable haciendo clic sobre él.
   - Cada tarjeta de diapositiva tiene botones para **duplicarla** o
     **eliminarla**.
   - **Arrastrá tarjetas** para reordenarlas — incluso de una planta a
     otra, para corregir a mano una diapositiva mal ubicada (la tarjeta
     adopta el nombre de la planta donde queda).
   - **+ Nota** agrega una tarjeta en blanco para agregar un comentario
     manual que no vino de ninguna planta.
   - Alterná entre vista **Vertical** (todas las tarjetas en una lista, para
     editar cómodo) y **Presentación** (una tarjeta por pantalla, con
     flechas), útil para repasar antes de la reunión.
6. **Exportá el resultado**:
   - **Descargar HTML**: guarda un único archivo
     `Informe_SOP_Consolidado_{Mes}_{Año}.html`, autocontenido (imágenes
     incluidas, sin depender de internet ni de este sitio). Se puede abrir
     con doble clic en cualquier navegador, **y sigue siendo editable** al
     reabrirlo — trae su propio motor de edición adentro.
   - **Exportar a PDF**: abre el diálogo de impresión del navegador con una
     tarjeta por página horizontal, listo para "Guardar como PDF" o
     imprimir.
   - **Volver al tablero** si hace falta corregir la inclusión/exclusión de
     diapositivas de origen (esto descarta las ediciones hechas en la vista
     consolidada, así que conviene usarlo antes de editar a mano, no
     después).

## Por qué HTML y no PPTX

La primera versión de esta herramienta generaba un `.pptx` consolidado
copiando las diapositivas originales, parte por parte, entre los archivos de
cada planta (reconstruyendo a mano las relaciones internas de un paquete
OOXML: `[Content_Types].xml`, los `.rels` de cada parte, la lista de
diapositivas, layouts/masters, etc.). Ese enfoque se descartó porque resultó
demasiado frágil para archivos reales, fuera del control de PowerPoint
mismo. En el camino se encontraron y corrigieron, uno por uno, varios
problemas reales (no hipotéticos — cada uno salió de un archivo que un
usuario subió y no podía abrir):

- Una relación de metadata (`<p:tags>`, muy común en decks exportados desde
  Google Slides) se excluía de la copia, pero seguía siendo referenciada
  desde adentro de las diapositivas — dejaba un `r:id` colgando.
- Colisión de content-type cuando dos plantas distintas usaban la misma
  extensión (típicamente `.bin`) para partes OOXML semánticamente
  distintas.
- Faltaban `docProps/core.xml` / `docProps/app.xml`, que PowerPoint siempre
  incluye y da por sentado que existen.
- Relaciones a imágenes con el archivo binario roto o ausente (común en
  decks exportados desde Google Slides) se descartaban silenciosamente, en
  vez de dejar algo válido en su lugar.
- **Objetos OLE embebidos (gráficos de think-cell)**: el antivirus/filtro de
  adjuntos corporativo (Check Point Harmony Endpoint, "Threat Extraction")
  los eliminaba del archivo *después* de generado y descargado, como medida
  de seguridad — corrompiendo un archivo que hasta ese punto era válido, de
  una forma completamente fuera del control de esta herramienta.
- **IDs de forma duplicados** (`<p:cNvPr id="N">` repetido dentro de una
  misma parte): PowerPoint tolera esto en un archivo que generó él mismo,
  pero lo rechaza en un archivo reconstruido por una herramienta externa —
  y algunos de estos duplicados ya estaban presentes en los archivos
  originales de las plantas, no eran introducidos por el merge.
- El orden en que se escriben las entradas dentro del `.zip` final
  (`[Content_Types].xml` en particular) es distinto entre un `.pptx` real de
  PowerPoint y uno reconstruido por este motor; nunca se confirmó si esto
  era o no la causa final de algún caso, pero es un ejemplo más de cuánto
  hay que replicar exactamente para que PowerPoint acepte un archivo que,
  en teoría (según el estándar OPC), debería ser igual de válido.

Cada uno de estos problemas, individualmente, se pudo diagnosticar y
corregir. Pero la acumulación — y la variabilidad real de los archivos que
llegan de 8 plantas distintas, con distintos orígenes (PowerPoint, Google
Slides), distintos años de antigüedad, y add-ins como think-cell — dejó
claro que reconstruir a mano el paquete OOXML es una estrategia
estructuralmente fragil: cada archivo nuevo puede traer una variante no
vista antes. Por eso se decidió no seguir generando `.pptx`: el consolidado
final es HTML, un formato mucho más tolerante y bajo control total de esta
herramienta (no depende de que otro programa — PowerPoint, un antivirus —
acepte una reconstrucción byte a byte).

**Lo que se reutilizó de la versión anterior**: toda la lógica de
*extracción* (`js/pptx-parser.js`, apoyada en los parsers regex de bajo
nivel de `js/ooxml-utils.js`) seguía funcionando bien — leer un `.pptx`,
encontrar el título, el texto, las tablas, las imágenes de una diapositiva
nunca fue el problema. Se extendió para extraer contenido completo (antes
sólo sacaba título + una imagen de vista previa) en vez de descartarse. Lo
que se descartó por completo fue el motor de *fusión* (`js/pptx-merger.js`,
`js/template.js`, `assets/template.pptx`): la parte que reconstruía el
paquete OOXML de salida.

## Arquitectura

Sitio estático (HTML/CSS/JS, sin build step) para desplegar en Netlify.

- **`js/ooxml-utils.js`**: helpers de bajo nivel basados en expresiones
  regulares (no un parser XML "real") para leer `.rels`,
  `[Content_Types].xml`, y el texto/tablas/imágenes dentro del XML de una
  diapositiva. Corre igual en el navegador y en Node (sin bundler),
  reutilizado tal cual de la versión anterior.
- **`js/pptx-parser.js`**: abre el `.zip` de un `.pptx` con JSZip, resuelve
  el orden real de diapositivas vía `ppt/presentation.xml`, y expone
  `extractSlideContent(zip, slidePath)` que devuelve título, párrafos (con
  nivel de viñeta), tablas (como matriz de celdas) e imágenes (como `data:`
  URLs en base64) de una diapositiva.
- **`js/classifier.js`**: sugiere, para cada diapositiva, una de las 6
  secciones fijas del archivo base (Capacidad, KPIs, Informe de Faltantes,
  Lanzamientos, BO / Crítico, Materias Primas e Insumos) por coincidencia
  de palabras clave en su título/texto, con un nivel de confianza. Es sólo
  una etiqueta de referencia en cada tarjeta — **no agrupa nada**: el
  agrupamiento real de la vista consolidada es por planta.
- **`js/editable-view.js`**: arma el HTML de cada tarjeta (portada /
  divisoria de planta / diapositiva) y maneja toda la interacción —
  edición inline (`contenteditable`), duplicar/eliminar/agregar tarjeta,
  drag & drop para reordenar (recalculando a qué planta pertenece cada
  tarjeta según la divisoria de planta más cercana hacia arriba), y el
  toggle entre vista vertical y modo presentación. Sin dependencias
  externas (ni JSZip ni el resto de la app): el mismo archivo se usa en la
  app en vivo y se embebe, inline, dentro del HTML exportado, para que ese
  archivo suelto siga siendo interactivo sin depender de este sitio.
- **`js/export-html.js`**: arma el string completo del documento HTML
  autocontenido a exportar (CSS y `editable-view.js` inline, el logo y las
  fotos de portada embebidos en base64, más un bootstrap que re-conecta
  los botones al abrir el archivo).
- **`js/app.js`**: conecta todo — pantalla de carga, tablero de revisión,
  generación de la vista consolidada (portada + una divisoria por planta,
  en el orden elegido, seguida de las diapositivas incluidas de esa planta
  en su orden real, llamando a `extractSlideContent` por cada una) y la
  descarga del HTML final.

## Limitaciones conocidas

- **Tablas**: se extraen como matriz de celdas de texto; no se preservan
  celdas combinadas (`gridSpan`/`rowSpan`) ni el formato de color/relleno
  de la tabla original.
- **Imágenes EMF/WMF** (frecuentes en gráficos pegados desde Excel) no se
  pueden mostrar en un navegador y se omiten de la tarjeta — el resto del
  contenido de esa diapositiva (título, texto, tablas) sí se extrae.
- **Gráficos nativos de PowerPoint** (`ppt/charts/...`, no imágenes
  pegadas) y **objetos OLE embebidos** (gráficos de think-cell, hojas de
  cálculo incrustadas) no se renderizan como gráfico — no hay motor de
  PowerPoint en el navegador. Esas diapositivas se extraen igual (título,
  texto, tablas si las tienen), pero conviene revisarlas.
- La vista consolidada no reconstruye el diseño exacto de la diapositiva
  original (posiciones libres, formas superpuestas): usa un layout fijo de
  una o dos columnas (texto / texto + imágenes), consistente entre todas
  las tarjetas.

## Desarrollo

No hay paso de build ni dependencias que instalar para correr la app: es
HTML/CSS/JS estático. Para probarla localmente alcanza con servir la carpeta
con cualquier servidor estático, por ejemplo:

```
npx serve .
```

## Despliegue en Netlify

1. Conectar este repositorio en Netlify.
2. Build command: (ninguno). Publish directory: `.`
3. Deploy.

`netlify.toml` ya deja esto configurado.
