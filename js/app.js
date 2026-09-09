(function () {
  'use strict';

  const MAX_PLANTS = 8;

  const state = {
    plants: [], // { id, fileName, label, zip, slides: [...], error }
    plantOrder: [], // ids, orden final en el consolidado
    slides: [], // vista plana: { uid, plantId, slidePath, title, thumbnail, excluded, orderIndex }
  };

  let nextUid = 1;

  // ---------- Utilidades de UI ----------

  const $ = (sel) => document.querySelector(sel);

  function showToast(msg, ms) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { t.hidden = true; }, ms || 4000);
  }

  function setScreen(name) {
    for (const el of document.querySelectorAll('.screen')) el.hidden = true;
    $(`#screen${name}`).hidden = false;
    $('#topbarActions').hidden = name === 'Upload' || name === 'Consolidated';
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---------- Pantalla 1: carga ----------

  const dropzone = $('#dropzone');
  const fileInput = $('#fileInput');
  const fileListEl = $('#fileList');
  const uploadErrorsEl = $('#uploadErrors');
  const btnContinuar = $('#btnContinuar');

  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    handleFiles(e.dataTransfer.files);
  });
  fileInput.addEventListener('change', () => {
    handleFiles(fileInput.files);
    fileInput.value = '';
  });

  function handleFiles(fileListRaw) {
    const files = Array.from(fileListRaw).filter((f) => /\.pptx$/i.test(f.name));
    const rejected = fileListRaw.length - files.length;
    uploadErrorsEl.hidden = true;

    if (state.plants.length + files.length > MAX_PLANTS) {
      uploadErrorsEl.hidden = false;
      uploadErrorsEl.textContent = `Máximo ${MAX_PLANTS} archivos. Ya hay ${state.plants.length} cargados.`;
      return;
    }
    if (rejected > 0) {
      uploadErrorsEl.hidden = false;
      uploadErrorsEl.textContent = `Se ignoraron ${rejected} archivo(s) que no son .pptx.`;
    }
    for (const file of files) addPlantFile(file);
  }

  async function addPlantFile(file) {
    const id = 'plant' + nextUid++;
    const plant = {
      id,
      fileName: file.name,
      label: PptxParser.guessPlantNameFromFileName(file.name),
      zip: null,
      slides: [],
      status: 'parsing',
      error: null,
    };
    state.plants.push(plant);
    renderFileList();

    try {
      const buf = await file.arrayBuffer();
      const { zip, slides } = await PptxParser.parsePptxFile(buf, file.name);
      plant.zip = zip;
      plant.slides = slides;
      plant.status = 'ok';
    } catch (e) {
      plant.status = 'error';
      plant.error = e instanceof PptxParser.PptxParseError ? e.message : `Error inesperado leyendo "${file.name}".`;
      console.error(e);
    }
    renderFileList();
  }

  function removePlant(id) {
    state.plants = state.plants.filter((p) => p.id !== id);
    renderFileList();
  }

  function renderFileList() {
    fileListEl.innerHTML = '';
    for (const plant of state.plants) {
      const row = document.createElement('div');
      row.className = 'file-row';

      const okCount = plant.status === 'ok' ? plant.slides.length : null;
      let statusHtml;
      if (plant.status === 'parsing') statusHtml = `<span class="file-row-status">leyendo…</span>`;
      else if (plant.status === 'ok') statusHtml = `<span class="file-row-status ok">${okCount} diapositivas</span>`;
      else statusHtml = `<span class="file-row-status error">error</span>`;

      row.innerHTML = `
        <div class="file-row-icon">PPTX</div>
        <div class="file-row-body">
          <div class="file-row-name">${escapeHtml(plant.fileName)}</div>
          <div class="file-row-label">
            <input type="text" value="${escapeHtml(plant.label)}" data-plant-id="${plant.id}" aria-label="Nombre de planta" />
          </div>
        </div>
        ${statusHtml}
        <button class="file-row-remove" data-remove-id="${plant.id}" title="Quitar" aria-label="Quitar">×</button>
      `;
      fileListEl.appendChild(row);

      if (plant.status === 'error') {
        const err = document.createElement('div');
        err.className = 'alert alert-error';
        err.style.marginTop = '-4px';
        err.textContent = plant.error;
        fileListEl.appendChild(err);
      }
    }

    fileListEl.querySelectorAll('input[data-plant-id]').forEach((input) => {
      input.addEventListener('input', () => {
        const plant = state.plants.find((p) => p.id === input.dataset.plantId);
        if (plant) plant.label = input.value;
      });
    });
    fileListEl.querySelectorAll('button[data-remove-id]').forEach((btn) => {
      btn.addEventListener('click', () => removePlant(btn.dataset.removeId));
    });

    const okPlants = state.plants.filter((p) => p.status === 'ok');
    btnContinuar.disabled = okPlants.length === 0 || state.plants.some((p) => p.status === 'parsing');
  }

  btnContinuar.addEventListener('click', () => {
    const okPlants = state.plants.filter((p) => p.status === 'ok');
    if (!okPlants.length) return;
    buildInitialBoardState(okPlants);
    setScreen('Board');
    renderPlantChips();
    renderBoard();
  });

  // ---------- Pantalla 2: tablero ----------

  function buildInitialBoardState(okPlants) {
    state.plantOrder = okPlants.map((p) => p.id);
    state.slides = [];
    for (const plant of okPlants) {
      plant.slides.forEach((s, i) => {
        const cls = Classifier.classifySlide(s.title, s.fullText);
        state.slides.push({
          uid: 'slide' + nextUid++,
          plantId: plant.id,
          slidePath: s.slidePath,
          title: s.title,
          thumbnail: s.thumbnail,
          sectionId: cls.sectionId,
          excluded: false,
          orderIndex: i,
        });
      });
    }
  }

  function plantById(id) {
    return state.plants.find((p) => p.id === id);
  }

  function renderPlantChips() {
    const wrap = $('#plantChips');
    wrap.innerHTML = '';
    state.plantOrder.forEach((pid, idx) => {
      const plant = plantById(pid);
      const chip = document.createElement('div');
      chip.className = 'chip';
      chip.draggable = true;
      chip.dataset.plantId = pid;
      chip.innerHTML = `<span class="chip-index">${idx + 1}</span>${escapeHtml(plant.label)}`;
      chip.addEventListener('dragstart', (e) => {
        chip.classList.add('dragging');
        e.dataTransfer.setData('text/plant-id', pid);
      });
      chip.addEventListener('dragend', () => chip.classList.remove('dragging'));
      wrap.appendChild(chip);
    });

    wrap.addEventListener('dragover', (e) => {
      e.preventDefault();
      const dragging = wrap.querySelector('.chip.dragging');
      if (!dragging) return;
      const after = [...wrap.querySelectorAll('.chip:not(.dragging)')].find((el) => {
        const rect = el.getBoundingClientRect();
        return e.clientX < rect.left + rect.width / 2;
      });
      if (after) wrap.insertBefore(dragging, after);
      else wrap.appendChild(dragging);
    });
    wrap.addEventListener('drop', (e) => {
      e.preventDefault();
      state.plantOrder = [...wrap.querySelectorAll('.chip')].map((c) => c.dataset.plantId);
      renderPlantChips();
      renderBoard(); // los dividers dependen del orden de plantas
    });
  }

  function renderBoard() {
    const boardEl = $('#board');
    boardEl.innerHTML = '';

    for (const pid of state.plantOrder) {
      const plant = plantById(pid);
      const slidesOfPlant = state.slides
        .filter((s) => s.plantId === pid)
        .sort((a, b) => a.orderIndex - b.orderIndex);

      const col = document.createElement('div');
      col.className = 'plant-column';
      col.innerHTML = `<div class="plant-column-header">${escapeHtml(plant.label)}<span class="plant-column-count">${slidesOfPlant.length}</span></div>`;

      const list = document.createElement('div');
      list.className = 'plant-column-list';
      for (const slide of slidesOfPlant) {
        list.appendChild(renderCard(slide));
      }
      col.appendChild(list);
      boardEl.appendChild(col);
    }

    updateGenerateButtonState();
  }

  function renderCard(slide) {
    const card = document.createElement('div');
    card.className = `mini-card${slide.excluded ? ' excluded' : ''}`;
    card.dataset.uid = slide.uid;

    const thumbHtml = slide.thumbnail
      ? `<img src="${slide.thumbnail}" alt="" />`
      : 'sin vista previa';

    card.innerHTML = `
      <button class="mini-card-exclude" title="${slide.excluded ? 'Incluir de nuevo' : 'Excluir del consolidado'}">${slide.excluded ? '↺' : '×'}</button>
      <div class="mini-card-thumb">${thumbHtml}</div>
      <div class="mini-card-title">${escapeHtml(slide.title)}</div>
    `;

    card.querySelector('.mini-card-exclude').addEventListener('click', () => {
      slide.excluded = !slide.excluded;
      renderBoard();
    });

    return card;
  }

  const mesAnioInput = $('#mesAnioInput');
  const btnGenerar = $('#btnGenerar');
  mesAnioInput.addEventListener('input', updateGenerateButtonState);

  function updateGenerateButtonState() {
    const hasAnySlide = state.slides.some((s) => !s.excluded);
    btnGenerar.disabled = !hasAnySlide || !mesAnioInput.value.trim();
  }

  // ---------- Generación de la vista consolidada ----------

  btnGenerar.addEventListener('click', generateConsolidated);

  function sanitizeFileNamePart(s) {
    return s.trim().replace(/\s+/g, '_').replace(/[^\w\-]/g, '');
  }

  /**
   * Agrupa SIEMPRE por planta (una divisoria grande por planta, en el
   * orden elegido en "Orden de plantas"), nunca por sección/tema — cada
   * diapositiva conserva el orden real que tenía en el .pptx de su
   * planta. La sección sugerida por el clasificador viaja igual en cada
   * tarjeta, pero sólo como etiqueta de referencia (no reagrupa nada).
   */
  async function generateConsolidated() {
    const mesAnio = mesAnioInput.value.trim();
    if (!mesAnio) return;

    setScreen('Generating');
    const statusEl = $('#generatingStatus');

    try {
      const cards = [{ type: 'cover', cicloLabel: `S&OP Ciclo: ${mesAnio}` }];

      for (const pid of state.plantOrder) {
        const plant = plantById(pid);
        const slidesOfPlant = state.slides
          .filter((s) => !s.excluded && s.plantId === pid)
          .sort((a, b) => a.orderIndex - b.orderIndex);
        if (!slidesOfPlant.length) continue;

        cards.push({ type: 'divider', label: plant.label });

        for (const slide of slidesOfPlant) {
          statusEl.textContent = `Extrayendo "${slide.title}" (${plant.label})…`;
          const content = await PptxParser.extractSlideContent(plant.zip, slide.slidePath);
          const secMeta = Classifier.sectionMeta(slide.sectionId);
          cards.push({
            type: 'slide',
            uid: slide.uid,
            plantLabel: plant.label,
            sectionId: slide.sectionId || '',
            sectionLabel: secMeta.label,
            sectionColor: secMeta.color,
            title: content.title,
            paragraphs: content.paragraphs,
            tables: content.tables,
            images: content.images,
          });
        }
      }

      const container = $('#consolidatedList');
      EditableView.renderConsolidatedView(container, cards);
      updatePresentCount();

      setScreen('Consolidated');
    } catch (e) {
      console.error(e);
      setScreen('Board');
      showToast('No se pudo generar la vista consolidada: ' + (e.message || 'error desconocido'), 7000);
    }
  }

  // ---------- Pantalla 3: vista consolidada ----------

  const consolidatedList = $('#consolidatedList');
  const presentCountEl = $('#presentCount');

  function updatePresentCount() {
    const n = consolidatedList.children.length;
    if (presentCountEl) presentCountEl.textContent = `1 / ${n}`;
  }

  EditableView.wireInteractions(consolidatedList, {
    addBlankButton: $('#btnAddBlank'),
    verticalButton: $('#btnVertical'),
    presentButton: $('#btnPresent'),
    presentNav: $('#presentNav'),
    presentPrev: $('#presentPrev'),
    presentNext: $('#presentNext'),
    presentCount: presentCountEl,
    printButton: $('#btnPrint'),
  });

  $('#btnBackToBoard').addEventListener('click', () => {
    if (!confirm('Volver al tablero descarta cualquier edición hecha en la vista consolidada. ¿Continuar?')) return;
    setScreen('Board');
  });

  $('#btnDownloadHtml').addEventListener('click', downloadStandaloneHtml);

  async function downloadStandaloneHtml() {
    const btn = $('#btnDownloadHtml');
    const originalLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Preparando…';
    try {
      const [cssText, jsText] = await Promise.all([
        fetch(`css/styles.css?v=${Date.now()}`, { cache: 'no-store' }).then((r) => r.text()),
        fetch(`js/editable-view.js?v=${Date.now()}`, { cache: 'no-store' }).then((r) => r.text()),
      ]);

      const mesAnio = mesAnioInput.value.trim() || 'Consolidado';
      const html = ExportHtml.buildStandaloneHtml({
        title: `Informe S&OP Consolidado ${mesAnio}`,
        cardsHtml: consolidatedList.innerHTML,
        cssText,
        editableViewJsText: jsText,
      });

      const parts = mesAnio.split(/\s+/);
      const mes = sanitizeFileNamePart(parts[0] || mesAnio);
      const anio = sanitizeFileNamePart(parts.slice(1).join(' ') || '');
      const fileName = `Informe_SOP_Consolidado_${mes}${anio ? '_' + anio : ''}.html`;

      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);

      showToast('HTML descargado.', 4000);
    } catch (e) {
      console.error(e);
      showToast('No se pudo descargar el HTML: ' + (e.message || 'error desconocido'), 7000);
    } finally {
      btn.disabled = false;
      btn.textContent = originalLabel;
    }
  }

  setScreen('Upload');
})();
