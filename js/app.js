(function () {
  'use strict';

  const MAX_PLANTS = 8;
  // Etiquetas cortas para los chips de sección de cada tarjeta (las de
  // Classifier.SECTIONS son más largas, pensadas como encabezado).
  const SECTION_CHIP_LABELS = {
    bo: 'BO / Críticos',
    faltantes: 'Faltantes',
    lanzamientos: 'Lanzamientos',
    temas: 'Temas pendientes',
    kpis: 'KPIs',
  };
  const CHIP_OPTIONS = [...Classifier.SECTIONS.map((s) => ({ id: s.id, label: SECTION_CHIP_LABELS[s.id] || s.label })), { id: null, label: 'Sin clasificar' }];

  const state = {
    plants: [], // { id, fileName, label, zip, slides: [...], error }
    plantOrder: [], // ids, orden final en el consolidado
    slides: [], // vista plana: { uid, plantId, slidePath, title, thumbnail, sectionId, confidence, excluded, orderIndex }
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
    $('#topbarActions').hidden = name === 'Upload';
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
          confidence: cls.confidence,
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

      const group = document.createElement('div');
      group.className = 'plant-group';
      group.innerHTML = `<div class="plant-group-header">${escapeHtml(plant.label)}<span class="plant-group-count">${slidesOfPlant.length} diapositivas</span></div>`;

      const list = document.createElement('div');
      list.className = 'slide-list';
      for (const slide of slidesOfPlant) {
        list.appendChild(renderCard(slide));
      }
      group.appendChild(list);
      boardEl.appendChild(group);
    }

    updateGenerateButtonState();
  }

  function renderCard(slide) {
    const card = document.createElement('div');
    card.className = `card${slide.excluded ? ' excluded' : ''}`;
    card.dataset.uid = slide.uid;

    const thumbHtml = slide.thumbnail
      ? `<img src="${slide.thumbnail}" alt="" />`
      : 'sin vista previa';

    const chipsHtml = CHIP_OPTIONS.map(
      (opt) =>
        `<button type="button" class="section-chip${slide.sectionId === opt.id ? ' active' : ''}" data-section="${opt.id === null ? '' : opt.id}">${escapeHtml(opt.label)}</button>`
    ).join('');

    card.innerHTML = `
      <div class="card-thumb">${thumbHtml}</div>
      <div class="card-body">
        <div class="card-title">${escapeHtml(slide.title)}</div>
        <div class="section-chip-row">${chipsHtml}</div>
      </div>
      <button class="card-exclude" title="${slide.excluded ? 'Incluir de nuevo' : 'Excluir del consolidado'}">${slide.excluded ? '↺' : '×'}</button>
    `;

    card.querySelectorAll('.section-chip').forEach((chipEl) => {
      chipEl.addEventListener('click', () => {
        slide.sectionId = chipEl.dataset.section || null;
        renderBoard();
      });
    });
    card.querySelector('.card-exclude').addEventListener('click', () => {
      slide.excluded = !slide.excluded;
      renderBoard();
    });

    return card;
  }

  const mesAnioInput = $('#mesAnioInput');
  const btnGenerar = $('#btnGenerar');
  mesAnioInput.addEventListener('input', updateGenerateButtonState);

  function updateGenerateButtonState() {
    const hasAnySlide = state.slides.some((s) => !s.excluded && s.sectionId !== null);
    btnGenerar.disabled = !hasAnySlide || !mesAnioInput.value.trim();
  }

  // ---------- Generación del consolidado ----------

  btnGenerar.addEventListener('click', generateConsolidated);

  function sanitizeFileNamePart(s) {
    return s.trim().replace(/\s+/g, '_').replace(/[^\w\-]/g, '');
  }

  async function generateConsolidated() {
    const mesAnio = mesAnioInput.value.trim();
    if (!mesAnio) return;

    const unclassifiedCount = state.slides.filter((s) => !s.excluded && s.sectionId === null).length;
    if (unclassifiedCount > 0) {
      const proceed = confirm(
        `Hay ${unclassifiedCount} diapositiva(s) "Sin clasificar" que NO se van a incluir en el consolidado. ¿Continuar de todas formas?`
      );
      if (!proceed) return;
    }

    setScreen('Generating');
    const statusEl = $('#generatingStatus');

    try {
      const { ConsolidatedBuilder } = PptxMerger;
      const builder = new ConsolidatedBuilder();

      statusEl.textContent = 'Cargando plantilla…';
      const tplBuf = await fetch('assets/template.pptx').then((r) => {
        if (!r.ok) throw new Error('No se pudo cargar la plantilla (assets/template.pptx).');
        return r.arrayBuffer();
      });
      const tplZip = await JSZip.loadAsync(tplBuf);
      await builder.loadTemplate(tplZip);

      for (const plant of state.plants) {
        if (plant.status === 'ok') await builder.registerSource(plant.id, plant.zip);
      }

      statusEl.textContent = 'Armando portada…';
      await builder.addPortada(mesAnio);

      const labels = state.plantOrder.map((pid) => plantById(pid).label);
      const sectionOrder = Classifier.SECTIONS.map((s) => s.id);

      for (let i = 0; i < state.plantOrder.length; i++) {
        const pid = state.plantOrder[i];
        const plant = plantById(pid);
        statusEl.textContent = `Agregando ${plant.label}…`;
        await builder.addDivider(labels, i, i);

        const plantSlides = state.slides
          .filter((s) => s.plantId === pid && !s.excluded && s.sectionId !== null)
          .sort((a, b) => {
            const sa = sectionOrder.indexOf(a.sectionId);
            const sb = sectionOrder.indexOf(b.sectionId);
            if (sa !== sb) return sa - sb;
            return a.orderIndex - b.orderIndex;
          });

        for (const slide of plantSlides) {
          await builder.addPlantSlide(pid, slide.slidePath);
        }
      }

      statusEl.textContent = 'Agregando apéndice…';
      await builder.addDivider(labels, state.plantOrder.length, state.plantOrder.length);
      await builder.addAppendix();

      statusEl.textContent = 'Generando archivo final…';
      const blob = await builder.build();

      if (builder.warnings.length) {
        console.warn('Avisos de generación:', builder.warnings);
      }

      const parts = mesAnio.split(/\s+/);
      const mes = sanitizeFileNamePart(parts[0] || mesAnio);
      const anio = sanitizeFileNamePart(parts.slice(1).join(' ') || '');
      const fileName = `Informe_SOP_Consolidado_${mes}${anio ? '_' + anio : ''}.pptx`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);

      setScreen('Board');
      if (builder.warnings.length) {
        showToast(`Listo, con ${builder.warnings.length} aviso(s) — ver consola.`, 6000);
      } else {
        showToast('Consolidado generado y descargado.', 4000);
      }
    } catch (e) {
      console.error(e);
      setScreen('Board');
      showToast('No se pudo generar el consolidado: ' + (e.message || 'error desconocido'), 7000);
    }
  }

  setScreen('Upload');
})();
