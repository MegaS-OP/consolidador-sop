# Consolidador S&OP

Reemplaza el copy-paste manual mensual de las diapositivas de las 8 plantas
productivas en el PPTX consolidado de S&OP Global, por una revisión y
confirmación rápida en el navegador.

No hay backend ni base de datos: todo corre en el navegador, en memoria, para
la sesión de uso. Nada se sube a ningún servidor.

## Flujo de uso mensual

1. **Abrí la herramienta** (URL de Netlify) y arrastrá hasta 8 archivos
   `.pptx`, uno por planta.
2. La herramienta detecta automáticamente el nombre de cada planta a partir
   del nombre de archivo (editable a mano si hace falta) y lee cada
   diapositiva: título, texto y una imagen principal como vista previa.
3. Hacé clic en **Continuar a revisión**. Vas a ver un tablero con columnas
   fijas: *BO/Críticos*, *Informe de Faltantes*, *Lanzamientos*, *Temas
   pendientes*, *KPIs/Capacidad* y *Sin clasificar*. Cada diapositiva ya
   viene ubicada en la columna que la herramienta sugiere, con un color de
   borde que indica qué tan segura está esa sugerencia:
   - **Verde** = confianza alta, probablemente no hace falta tocarla.
   - **Amarillo** = dudosa, conviene mirarla.
   - **Gris** = sin clasificar, hay que ubicarla a mano.
4. **Corregí lo que haga falta**: arrastrá una tarjeta a otra columna para
   reclasificarla, o hacé clic en la × para excluirla del consolidado (por
   ejemplo, la diapositiva de "Agenda/reglas de la reunión" de alguna
   planta).
5. **Ordená las plantas**: arrastrá los chips de "Orden de plantas en el
   consolidado" en la parte superior para que coincidan con el orden en que
   se van a presentar en la reunión. El consolidado final agrupa las
   diapositivas **por planta** (no por sección), en ese orden, con cada
   bloque de planta ordenado internamente BO → Faltantes → Lanzamientos →
   Temas pendientes → KPIs.
6. Completá **Mes / Año** (ej. "Septiembre 2026") y hacé clic en **Generar
   consolidado**. Se descarga
   `Informe_SOP_Consolidado_{Mes}_{Año}.pptx`, listo para la reunión.

La portada y el bloque final fijo (glosario de KPIs + cierre) se agregan
automáticamente a partir de la plantilla embebida — no hace falta pegarlos a
mano. Antes de cada planta (y una vez más antes del bloque final) se inserta
una diapositiva "Contenido de la sesión" con el mismo resaltado de progreso
que el consolidado histórico (plantas ya presentadas en teal, la actual sin
color, las pendientes en verde).

## Arquitectura

Sitio estático (HTML/CSS/JS, sin build step) para desplegar en Netlify.

- **Extracción y clasificación** (`js/pptx-parser.js`, `js/classifier.js`):
  un `.pptx` es un ZIP. Se lee `ppt/presentation.xml` para el orden real de
  diapositivas, y cada `ppt/slides/slideN.xml` para el título (primer
  placeholder de tipo título, si no el primer texto no vacío), el texto
  completo (para el keyword matching) y, vía `slideN.xml.rels`, la imagen
  principal incrustada como thumbnail (si el formato es renderizable en un
  `<img>` — ver *Limitaciones*).
- **Fusión OOXML** (`js/pptx-merger.js`, `js/ooxml-utils.js`,
  `js/template.js`): arma el `.pptx` final copiando cada diapositiva
  ORIGINAL completa (formato, tablas, imágenes, layout) desde el archivo
  fuente, siguiendo genéricamente sus relaciones (`.rels`): diapositiva →
  layout → master → tema → imágenes/gráficos embebidos. Cada parte se
  copia una sola vez por archivo de origen (se cachea) y se renombra con un
  prefijo único para que no choquen nombres entre plantas distintas (todas
  pueden traer `image1.png`). Notas del orador, comentarios y metadata de
  colaboración de Office no se copian.

  **¿Por qué no `pptx-automizer`** (u otra librería de fusión de OOXML)?
  Estas librerías están pensadas para Node: usan `fs` para leer/escribir en
  disco y no corren en el navegador sin adaptarlas a fondo. La alternativa
  — subir los `.pptx` de las 8 plantas a una función serverless para
  fusionarlos ahí — tampoco es robusta: son archivos con imágenes que
  fácilmente superan el límite de payload de Netlify Functions (6 MB). Por
  eso todo el motor corre en el navegador con JSZip, igual que la
  extracción.

- **Plantilla embebida** (`assets/template.pptx`): contiene únicamente la
  portada, la diapositiva "Contenido de la sesión" (usada como base para
  generar dinámicamente el resaltado de progreso) y el bloque final fijo,
  extraídos del consolidado histórico de referencia. Si en algún momento
  cambia el diseño de la portada, del divisor o del glosario final, hay que
  regenerar este archivo (ver `assets/README.md` si se agrega, o repetir el
  proceso de extracción con el nuevo consolidado de referencia).

## Limitaciones conocidas

- **Vista previa, no renderizado real**: no hay motor de PowerPoint en el
  navegador. El thumbnail es la imagen principal de la diapositiva (si
  tiene una y está en un formato que el navegador puede mostrar) + el
  título — suficiente para reconocer de qué se trata, no una miniatura
  exacta de la diapositiva.
- **Imágenes EMF/WMF** (frecuentes en gráficos pegados desde Excel) no se
  pueden mostrar como thumbnail en el navegador; esas diapositivas se ven
  sin vista previa, pero se copian igual, completas, al consolidado final.
- **Hipervínculos internos** ("ir a la diapositiva X" dentro del mismo
  archivo de planta) no se preservan en el consolidado, para evitar dejar
  referencias rotas si esa diapositiva de destino no termina incluida. Los
  hipervínculos externos (URLs) sí se preservan.
- **Gráficos embebidos de Excel** (`ppt/charts/...` con su libro de datos)
  se copian genéricamente junto con la diapositiva; no se probó
  extensivamente con ese tipo de contenido, así que conviene revisar el
  resultado si alguna planta usa gráficos nativos de PowerPoint (no
  imágenes pegadas).
- **Objetos OLE embebidos** (gráficos de think-cell, hojas de Excel
  incrustadas, etc.) se convierten a imagen fija en vez de copiarse como
  objeto embebido — a propósito: son el motivo más común de que un
  antivirus/filtro de adjuntos corporativo (visto en producción: Check
  Point Harmony Endpoint) reconstruya el `.pptx` al descargarlo, dejando el
  archivo corrupto. El resultado se ve igual, pero deja de ser editable
  como objeto (nadie necesita editar esos gráficos desde un consolidado de
  sólo lectura). Si el patrón interno del objeto no es el esperado, se dejan
  sin tocar en vez de arriesgar un archivo inválido.
- Al generar, la herramienta avisa (con un mensaje) si encontró algo que no
  pudo copiar del todo — revisar la consola del navegador para el detalle.

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
