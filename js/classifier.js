/**
 * Clasificación automática sugerida por keyword matching sobre el título Y
 * el texto interno de cada diapositiva, con un score de confianza.
 *
 * Las 6 secciones y su orden salen del archivo base real que usan las 8
 * plantas para armar su informe mensual
 * (2025_Inf_SOP_base_para_todas_las_plantas.pptx): ese archivo trae, en
 * este orden exacto, un ejemplo de cada tipo de diapositiva que una planta
 * completa — Capacidad, KPIs, Informe de Faltantes, Lanzamientos, BO /
 * Crítico, Materias Primas e Insumos. No son categorías inventadas.
 */

(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  if (typeof window !== 'undefined') window.Classifier = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  // Orden fijo de la agenda (igual al del archivo base): define el orden
  // de las secciones en la vista consolidada y dónde se inserta cada
  // divisoria. Los colores se mantienen dentro de la familia corporativa
  // (verdes/teales reales) salvo BO / Crítico, que usa rojo como color
  // semántico de alerta — no de marca — para que lo crítico salte a la
  // vista.
  const SECTIONS = [
    { id: 'capacidad', label: 'Capacidad', color: '#00A650', keywords: ['capacidad', 'desvío', 'desvios', 'desvíos', 'ocupación', 'ocupacion'] },
    { id: 'kpis', label: 'KPIs', color: '#009045', keywords: ['kpi', 'kpis', 'indicador', 'otif', 'ppa', 'pca', 'aca'] },
    { id: 'faltantes', label: 'Informe de Faltantes', color: '#00AC9C', keywords: ['faltante', 'rechazo', 'liberación', 'liberacion'] },
    { id: 'lanzamientos', label: 'Lanzamientos', color: '#007C6B', keywords: ['lanzamiento', 'acondicionado', 'cuarentena', 'cambio de fórmula', 'cambio de formula'] },
    { id: 'bo', label: 'BO / Crítico', color: '#C0392B', keywords: ['bo', 'crítico', 'critico', 'back order'] },
    { id: 'materias_primas', label: 'Materias Primas e Insumos', color: '#5C7D67', keywords: ['materias primas', 'materia prima', 'insumos', 'abastecimiento', 'embarque'] },
  ];
  const UNCLASSIFIED = 'sin_clasificar';
  const UNCLASSIFIED_LABEL = 'Sin clasificar';
  const UNCLASSIFIED_COLOR = '#9AA39C';

  function stripAccents(s) {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  function normalize(s) {
    return stripAccents(String(s || '').toLowerCase());
  }

  function countOccurrences(haystack, needle) {
    if (!needle) return 0;
    let count = 0;
    let idx = 0;
    while ((idx = haystack.indexOf(needle, idx)) !== -1) {
      count++;
      idx += needle.length;
    }
    return count;
  }

  /**
   * @returns {{ sectionId: string|null, confidence: 'alta'|'dudosa'|'sin_clasificar', scores: Array }}
   */
  function classifySlide(title, bodyText) {
    const titleN = normalize(title);
    const bodyN = normalize(bodyText);

    const scores = SECTIONS.map((sec) => {
      let score = 0;
      for (const kw of sec.keywords) {
        const kwN = normalize(kw);
        if (titleN.includes(kwN)) score += 3;
        score += Math.min(countOccurrences(bodyN, kwN), 3);
      }
      return { sectionId: sec.id, score };
    }).sort((a, b) => b.score - a.score);

    const top = scores[0];
    const second = scores[1];

    if (!top || top.score === 0) {
      return { sectionId: null, confidence: UNCLASSIFIED, scores };
    }
    const tie = second && top.score - second.score <= 1;
    const confidence = top.score >= 3 && !tie ? 'alta' : 'dudosa';
    return { sectionId: top.sectionId, confidence, scores };
  }

  function sectionById(id) {
    return SECTIONS.find((s) => s.id === id) || null;
  }

  /** Label + color para mostrar, funciona también para id null (sin clasificar). */
  function sectionMeta(id) {
    if (id === null || id === undefined) {
      return { id: null, label: UNCLASSIFIED_LABEL, color: UNCLASSIFIED_COLOR };
    }
    return sectionById(id) || { id, label: id, color: UNCLASSIFIED_COLOR };
  }

  return { SECTIONS, UNCLASSIFIED, UNCLASSIFIED_LABEL, UNCLASSIFIED_COLOR, classifySlide, sectionById, sectionMeta };
});
