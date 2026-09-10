/**
 * Vista consolidada editable: renderiza la portada, las divisorias de
 * planta y las tarjetas de diapositiva, y maneja toda la interacción
 * (edición inline, eliminar/duplicar/agregar, drag&drop para reordenar,
 * alternar vista vertical/presentación, navegación en modo presentación).
 *
 * El agrupamiento es SIEMPRE por planta (una divisoria grande por planta,
 * nunca por tema/sección) — cada diapositiva conserva el orden real que
 * tenía en el .pptx de su planta. La sección sugerida por el clasificador
 * se muestra sólo como una etiqueta de referencia en cada tarjeta, no
 * determina el agrupamiento.
 *
 * Deliberadamente sin dependencias de JSZip/OoxmlUtils/Classifier ni de
 * ningún estado externo: todo lo que necesita para funcionar vive en el
 * propio DOM (atributos data-*, texto ya editado). Así, el mismo archivo
 * sirve tanto para la app en vivo como para el .html exportado — ese
 * archivo se abre suelto (sin servidor) y se auto-inicializa leyendo las
 * tarjetas que ya están en su propio HTML.
 */

(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  if (typeof window !== 'undefined') window.EditableView = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function uid() {
    return 'c' + Math.random().toString(36).slice(2, 10);
  }

  // ---------- Construcción de tarjetas ----------

  /** Divisoria grande de PLANTA (no de sección/tema). */
  function buildDividerCardHtml(card) {
    return (
      `<section class="divider-card" data-uid="${card.uid || uid()}" data-type="divider">` +
      `<h2 contenteditable="true">${escapeHtml(card.label)}</h2>` +
      `</section>`
    );
  }

  /** Portada fija del informe (una sola vez, al principio): fotos + logo +
   * ciclo, igual a la portada real del archivo base de todas las plantas. */
  function buildCoverCardHtml(card) {
    return (
      `<section class="cover-card" data-uid="${card.uid || uid()}" data-type="cover">` +
      `<div class="cover-photos">` +
      `<div class="cover-photo cover-photo-left" style="background-image:url('assets/cover-building.jpg')"></div>` +
      `<div class="cover-photo cover-photo-right" style="background-image:url('assets/cover-sign.jpg')"></div>` +
      `</div>` +
      `<div class="cover-bottom">` +
      `<div class="cover-logo-wrap"><img class="cover-logo" src="assets/megalabs-logo-full.png" alt="Megalabs" /></div>` +
      `<div class="cover-panel">` +
      `<p class="cover-ciclo" contenteditable="true">${escapeHtml(card.cicloLabel || 'S&OP Ciclo:')}</p>` +
      `<p class="cover-sub" contenteditable="true">Informe de plantas productivas</p>` +
      `<p class="cover-sub" contenteditable="true">Reunión de suministro</p>` +
      `</div>` +
      `</div>` +
      `</section>`
    );
  }

  function buildParagraphsHtml(paragraphs) {
    if (!paragraphs || !paragraphs.length) return '';
    const items = paragraphs
      .map((p) => {
        // Un párrafo que en el original vivía en un shape con fondo de
        // color (una etiqueta, un cartel de anotación) se muestra como un
        // recuadro destacado con ese mismo color, en vez de un bullet más
        // — así no se pierde la jerarquía visual que tenía en la diapositiva.
        const cls = p.fillColor ? ' callout' : '';
        const style = p.fillColor ? ` style="--callout-color:${escapeHtml(p.fillColor)}"` : '';
        return `<li class="lvl-${Math.min(p.level || 0, 2)}${cls}"${style} contenteditable="true">${escapeHtml(p.text)}</li>`;
      })
      .join('');
    return `<ul class="slide-card-list">${items}</ul>`;
  }

  function buildTablesHtml(tables) {
    if (!tables || !tables.length) return '';
    return tables
      .map((t) => {
        const rows = t.rows
          .map((row) => `<tr>${row.map((cell) => `<td contenteditable="true">${escapeHtml(cell)}</td>`).join('')}</tr>`)
          .join('');
        // El wrap es lo que participa del layout (flex/overflow); la
        // tabla en sí es lo que se escala para entrar — ver fitWideTables.
        return `<div class="slide-card-table-wrap"><table class="slide-card-table">${rows}</table></div>`;
      })
      .join('');
  }

  function buildImagesHtml(images) {
    if (!images || !images.length) return '';
    return images
      .map((src) => `<img src="${src}" alt="" class="zoomable-image" title="Clic para ampliar" />`)
      .join('');
  }

  /** Aviso cuando la diapositiva tenía una imagen real (no un logo) en un
   * formato que el navegador no puede mostrar — típicamente .emf/.wmf,
   * frecuente cuando una tabla o gráfico se pega como "Imagen" en vez de
   * mantenerse como tabla. Sin este aviso la tarjeta queda vacía sin
   * ninguna pista de qué faltó ni por qué. */
  function buildUnsupportedImagePlaceholder(count) {
    if (!count) return '';
    const label = count === 1 ? 'No se pudo mostrar una imagen' : `No se pudieron mostrar ${count} imágenes`;
    return (
      `<div class="slide-card-image-unsupported">` +
      `<span class="slide-card-image-unsupported-icon" aria-hidden="true">⚠</span>` +
      `<p>${escapeHtml(label)} de esta diapositiva: está en un formato que el navegador no puede mostrar ` +
      `(.emf/.wmf — común cuando una tabla o gráfico se pega como "Imagen" desde Excel). ` +
      `Revisá el archivo original, o volvé a pegarla como PNG/JPG para que se vea acá.</p>` +
      `</div>`
    );
  }

  function paragraphsCharCount(paragraphs) {
    return (paragraphs || []).reduce((n, p) => n + (p.text ? p.text.length : 0), 0);
  }

  function buildSlideCardHtml(card) {
    const hasImages = card.images && card.images.length > 0;
    const hasTables = card.tables && card.tables.length > 0;
    const hasText = Boolean(card.paragraphs?.length);
    const unsupportedCount = card.unsupportedImageCount || 0;
    const hasUnsupported = unsupportedCount > 0;
    const hasVisualContent = hasImages || hasUnsupported;
    const hasAnyBody = hasText || hasTables || hasVisualContent;

    // "Ancha": cuando el texto de cuerpo es poco o nulo (un rótulo corto
    // tipo "Detalle de los PT faltante:") y hay una imagen y/o tabla real,
    // esa imagen/tabla ES en los hechos el contenido de la diapositiva —
    // usa todo el ancho de la tarjeta (y toda la tabla se escala para
    // entrar completa, sin scroll) en vez de aplastarse en una columna al
    // costado de un texto que casi no existe. Con texto de verdad, se
    // mantiene el layout de dos columnas de siempre.
    const substantialText = paragraphsCharCount(card.paragraphs) > 220;
    const wide = !substantialText && (hasVisualContent || hasTables);

    let bodyClass;
    let bodyHtml;

    if (wide) {
      bodyClass = ' wide-content';
      bodyHtml =
        `<div class="slide-card-text">` +
        `<h3 class="slide-card-title" contenteditable="true">${escapeHtml(card.title)}</h3>` +
        buildParagraphsHtml(card.paragraphs) +
        `</div>` +
        `<div class="slide-card-wide">${buildTablesHtml(card.tables)}${buildImagesHtml(card.images)}${buildUnsupportedImagePlaceholder(unsupportedCount)}</div>`;
    } else {
      bodyClass = hasAnyBody ? '' : ' no-image';
      const textBody =
        buildParagraphsHtml(card.paragraphs) +
        buildTablesHtml(card.tables) +
        (!hasText && !hasTables ? '<p class="slide-card-empty-hint">(sin texto)</p>' : '');
      bodyHtml =
        `<div class="slide-card-text">` +
        `<h3 class="slide-card-title" contenteditable="true">${escapeHtml(card.title)}</h3>` +
        textBody +
        `</div>` +
        (hasVisualContent ? `<div class="slide-card-images">${buildImagesHtml(card.images)}${buildUnsupportedImagePlaceholder(unsupportedCount)}</div>` : '');
    }

    return (
      `<section class="slide-card" data-uid="${card.uid || uid()}" data-type="slide" data-section="${card.sectionId || ''}" style="--section-color:${card.sectionColor}">` +
      `<header class="slide-card-header">` +
      `<span class="slide-card-plant">${escapeHtml(card.plantLabel || '')}</span>` +
      `<span class="slide-card-badge">${escapeHtml(card.sectionLabel || '')}</span>` +
      `<div class="slide-card-actions no-print">` +
      `<button type="button" class="card-btn drag-handle" draggable="true" title="Arrastrar para reordenar">⠿</button>` +
      `<button type="button" class="card-btn" data-action="duplicate" title="Duplicar">⎘</button>` +
      `<button type="button" class="card-btn" data-action="delete" title="Eliminar">×</button>` +
      `</div>` +
      `</header>` +
      `<div class="slide-card-body${bodyClass}">${bodyHtml}</div>` +
      `</section>`
    );
  }

  function buildBlankSlideCardHtml() {
    return buildSlideCardHtml({
      uid: uid(),
      plantLabel: 'Manual',
      sectionId: '',
      sectionLabel: 'Sin clasificar',
      sectionColor: '#9AA39C',
      title: 'Nueva nota',
      paragraphs: [{ text: 'Escribí acá…', level: 0, bullet: true }],
      tables: [],
      images: [],
    });
  }

  /** Renderiza el listado completo de tarjetas (portada + divisorias de planta + slides) en `container`. */
  function renderConsolidatedView(container, cards) {
    container.innerHTML = cards
      .map((c) => {
        if (c.type === 'cover') return buildCoverCardHtml(c);
        if (c.type === 'divider') return buildDividerCardHtml(c);
        return buildSlideCardHtml(c);
      })
      .join('');
    refitWideTablesSoon(container);
  }

  /**
   * fitWideTables ya fuerza layout síncrono (getBoundingClientRect), pero
   * en una tanda grande recién insertada (decenas de tarjetas) el primer
   * pase puede tomar una medida que todavía no asentó del todo — y si
   * después terminan de cargar las tipografías web, el ancho del texto
   * puede correrse. Por eso se repite el ajuste un par de veces más (un
   * frame después, y cuando las fuentes terminan de cargar) en vez de
   * confiar en un único pase síncrono.
   */
  function refitWideTablesSoon(container) {
    fitWideTables(container);
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => requestAnimationFrame(() => fitWideTables(container)));
    }
    if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => fitWideTables(container));
    }
  }

  /**
   * Las tablas en layout "ancho" (.slide-card-wide) se dejan medir a su
   * tamaño natural sin achicarse (ver CSS: width:max-content, sin wrap) y
   * acá se escalan como una unidad (transform: scale, sin recortar texto
   * ni reflowear celdas) para entrar completas en el espacio disponible
   * de la tarjeta — el mismo efecto que "ajustar a la hoja" al imprimir
   * una planilla. Se vuelve a llamar cada vez que el layout puede haber
   * cambiado: al renderizar, al agregar/duplicar una tarjeta, al editar
   * una celda, al cambiar el tamaño de ventana, y justo antes de imprimir.
   */
  function fitWideTables(container) {
    const wraps = container.querySelectorAll('.slide-card-wide .slide-card-table-wrap');
    wraps.forEach((wrap) => {
      const table = wrap.querySelector('.slide-card-table');
      if (!table) return;
      table.style.transform = 'none';
      const wrapRect = wrap.getBoundingClientRect();
      const tableRect = table.getBoundingClientRect();
      if (!wrapRect.width || !wrapRect.height || !tableRect.width || !tableRect.height) return;
      const scale = Math.min(1, wrapRect.width / tableRect.width, wrapRect.height / tableRect.height);
      table.style.transform = scale < 1 ? `scale(${scale})` : 'none';
    });
  }

  // ---------- Interacción (funciona igual en vivo y en el .html exportado) ----------

  /** Al reordenar con drag&drop, una tarjeta arrastrada debajo de otra
   * divisoria de planta pasa a mostrar esa planta en su etiqueta — así se
   * puede corregir a mano una diapositiva mal ubicada. La sección sugerida
   * de cada tarjeta NO se toca acá: es una propiedad del contenido, no de
   * su posición. */
  function recomputePlantsFromDividers(container) {
    let current = null;
    for (const el of container.children) {
      if (el.dataset.type === 'cover') {
        current = null;
        continue;
      }
      if (el.dataset.type === 'divider') {
        current = el.querySelector('h2')?.textContent.trim() || '';
        continue;
      }
      if (el.dataset.type === 'slide' && current !== null) {
        el.dataset.plant = current;
        const badge = el.querySelector('.slide-card-plant');
        if (badge) badge.textContent = current;
      }
    }
  }

  // ---------- Zoom de imágenes (clic para ampliar a tamaño real) ----------

  let lightboxEl = null;

  function ensureLightbox() {
    if (lightboxEl) return lightboxEl;
    lightboxEl = document.createElement('div');
    lightboxEl.className = 'image-lightbox no-print';
    lightboxEl.innerHTML = '<img alt="" />';
    lightboxEl.hidden = true;
    lightboxEl.addEventListener('click', () => closeLightbox());
    document.body.appendChild(lightboxEl);
    return lightboxEl;
  }

  function openLightbox(src) {
    const el = ensureLightbox();
    el.querySelector('img').src = src;
    el.hidden = false;
  }

  function closeLightbox() {
    if (lightboxEl) lightboxEl.hidden = true;
  }

  function wireInteractions(container, opts) {
    opts = opts || {};

    // ---- Ampliar imagen al hacer clic ----
    container.addEventListener('click', (e) => {
      const img = e.target.closest('.zoomable-image');
      if (img) openLightbox(img.src);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeLightbox();
    });

    // ---- Botones de tarjeta: eliminar / duplicar ----
    container.addEventListener('click', (e) => {
      const btn = e.target.closest('.card-btn[data-action]');
      if (!btn) return;
      const card = btn.closest('.slide-card, .divider-card');
      if (!card) return;
      if (btn.dataset.action === 'delete') {
        card.remove();
        recomputePlantsFromDividers(container);
      } else if (btn.dataset.action === 'duplicate') {
        const clone = card.cloneNode(true);
        clone.dataset.uid = uid();
        card.after(clone);
        refitWideTablesSoon(container);
      }
    });

    // ---- Agregar tarjeta en blanco ----
    const addBtn = opts.addBlankButton;
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        const wrap = document.createElement('div');
        wrap.innerHTML = buildBlankSlideCardHtml();
        const el = wrap.firstElementChild;
        container.appendChild(el);
        recomputePlantsFromDividers(container);
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }

    // ---- Reajustar tablas anchas al editar una celda, cambiar el tamaño
    // de la ventana, o justo antes de imprimir/exportar a PDF ----
    let fitTablesTimer = null;
    function scheduleFitWideTables() {
      clearTimeout(fitTablesTimer);
      fitTablesTimer = setTimeout(() => fitWideTables(container), 200);
    }
    container.addEventListener('input', (e) => {
      if (e.target.closest('.slide-card-wide .slide-card-table')) scheduleFitWideTables();
    });
    window.addEventListener('resize', scheduleFitWideTables);
    window.addEventListener('beforeprint', () => fitWideTables(container));

    // ---- Drag & drop para reordenar (incluso entre secciones) ----
    let dragEl = null;
    container.addEventListener('dragstart', (e) => {
      const handle = e.target.closest('.drag-handle');
      const card = e.target.closest('.slide-card, .divider-card');
      if (!card) return;
      if (handle) {
        dragEl = card;
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', card.dataset.uid || '');
      } else {
        e.preventDefault();
      }
    });
    container.addEventListener('dragend', () => {
      if (dragEl) dragEl.classList.remove('dragging');
      dragEl = null;
      recomputePlantsFromDividers(container);
    });
    container.addEventListener('dragover', (e) => {
      if (!dragEl) return;
      e.preventDefault();
      const after = [...container.children]
        .filter((el) => el !== dragEl)
        .find((el) => {
          const rect = el.getBoundingClientRect();
          return e.clientY < rect.top + rect.height / 2;
        });
      if (after) container.insertBefore(dragEl, after);
      else container.appendChild(dragEl);
    });

    // ---- Toggle vertical / presentación ----
    const btnVertical = opts.verticalButton;
    const btnPresent = opts.presentButton;
    const presentNav = opts.presentNav;
    const presentPrev = opts.presentPrev;
    const presentNext = opts.presentNext;
    const presentCount = opts.presentCount;
    let presentIndex = 0;

    function cardsList() {
      return [...container.children];
    }

    function updatePresentActive() {
      const list = cardsList();
      list.forEach((el, i) => el.classList.toggle('present-active', i === presentIndex));
      if (presentCount) presentCount.textContent = `${presentIndex + 1} / ${list.length}`;
    }

    function setMode(mode) {
      container.classList.toggle('mode-present', mode === 'present');
      if (btnVertical) btnVertical.classList.toggle('active', mode === 'vertical');
      if (btnPresent) btnPresent.classList.toggle('active', mode === 'present');
      if (presentNav) presentNav.classList.toggle('visible', mode === 'present');
      if (mode === 'present') {
        presentIndex = Math.min(presentIndex, cardsList().length - 1);
        updatePresentActive();
      }
    }

    if (btnVertical) btnVertical.addEventListener('click', () => setMode('vertical'));
    if (btnPresent) btnPresent.addEventListener('click', () => setMode('present'));
    if (presentPrev)
      presentPrev.addEventListener('click', () => {
        presentIndex = Math.max(0, presentIndex - 1);
        updatePresentActive();
      });
    if (presentNext)
      presentNext.addEventListener('click', () => {
        presentIndex = Math.min(cardsList().length - 1, presentIndex + 1);
        updatePresentActive();
      });

    // ---- Exportar a PDF (imprimir) ----
    if (opts.printButton) {
      opts.printButton.addEventListener('click', () => window.print());
    }

    return { setMode };
  }

  return { renderConsolidatedView, wireInteractions, buildSlideCardHtml, buildDividerCardHtml, buildCoverCardHtml, escapeHtml };
});
