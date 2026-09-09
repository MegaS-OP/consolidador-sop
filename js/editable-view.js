/**
 * Vista consolidada editable: renderiza tarjetas de diapositiva y
 * divisorias de sección, y maneja toda la interacción (edición inline,
 * eliminar/duplicar/agregar, drag&drop para reordenar, alternar vista
 * vertical/presentación, navegación en modo presentación).
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

  function buildDividerCardHtml(card) {
    return (
      `<section class="divider-card" data-uid="${card.uid || uid()}" data-type="divider" data-section="${card.sectionId || ''}" style="--section-color:${card.color}">` +
      `<h2 contenteditable="true">${escapeHtml(card.label)}</h2>` +
      `</section>`
    );
  }

  function buildParagraphsHtml(paragraphs) {
    if (!paragraphs || !paragraphs.length) return '';
    const items = paragraphs
      .map((p) => `<li class="lvl-${Math.min(p.level || 0, 2)}" contenteditable="true">${escapeHtml(p.text)}</li>`)
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
        return `<table class="slide-card-table">${rows}</table>`;
      })
      .join('');
  }

  function buildImagesHtml(images) {
    if (!images || !images.length) return '';
    return images.map((src) => `<img src="${src}" alt="" />`).join('');
  }

  function buildSlideCardHtml(card) {
    const hasImages = card.images && card.images.length > 0;
    const body =
      buildParagraphsHtml(card.paragraphs) +
      buildTablesHtml(card.tables) +
      (!card.paragraphs?.length && !card.tables?.length ? '<p class="slide-card-empty-hint">(sin texto)</p>' : '');

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
      `<div class="slide-card-body${hasImages ? '' : ' no-image'}">` +
      `<div class="slide-card-text">` +
      `<h3 class="slide-card-title" contenteditable="true">${escapeHtml(card.title)}</h3>` +
      body +
      `</div>` +
      (hasImages ? `<div class="slide-card-images">${buildImagesHtml(card.images)}</div>` : '') +
      `</div>` +
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

  /** Renderiza el listado completo de tarjetas (dividers + slides) en `container`. */
  function renderConsolidatedView(container, cards) {
    container.innerHTML = cards
      .map((c) => (c.type === 'divider' ? buildDividerCardHtml(c) : buildSlideCardHtml(c)))
      .join('');
  }

  // ---------- Interacción (funciona igual en vivo y en el .html exportado) ----------

  function recomputeSectionsFromDividers(container) {
    let current = null;
    for (const el of container.children) {
      if (el.dataset.type === 'divider') {
        current = {
          id: el.dataset.section,
          label: el.querySelector('h2')?.textContent.trim() || '',
          color: el.style.getPropertyValue('--section-color'),
        };
        continue;
      }
      if (el.dataset.type === 'slide' && current) {
        el.dataset.section = current.id;
        el.style.setProperty('--section-color', current.color);
        const badge = el.querySelector('.slide-card-badge');
        if (badge) badge.textContent = current.label;
      }
    }
  }

  function wireInteractions(container, opts) {
    opts = opts || {};

    // ---- Botones de tarjeta: eliminar / duplicar ----
    container.addEventListener('click', (e) => {
      const btn = e.target.closest('.card-btn[data-action]');
      if (!btn) return;
      const card = btn.closest('.slide-card, .divider-card');
      if (!card) return;
      if (btn.dataset.action === 'delete') {
        card.remove();
        recomputeSectionsFromDividers(container);
      } else if (btn.dataset.action === 'duplicate') {
        const clone = card.cloneNode(true);
        clone.dataset.uid = uid();
        card.after(clone);
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
        recomputeSectionsFromDividers(container);
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }

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
      recomputeSectionsFromDividers(container);
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

  return { renderConsolidatedView, wireInteractions, buildSlideCardHtml, buildDividerCardHtml, escapeHtml };
});
