/**
 * Clasificación automática sugerida por keyword matching sobre el título Y
 * el texto interno de cada diapositiva, con un score de confianza.
 */

(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  if (typeof window !== 'undefined') window.Classifier = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  // Orden fijo de la agenda: define el orden de las secciones en la vista
  // consolidada y dónde se inserta cada divisoria.
  const SECTIONS = [
    { id: 'bo', label: 'BO / Críticos', color: '#2E9150', keywords: ['bo', 'crítico', 'critico', 'back order'] },
    { id: 'faltantes', label: 'Informe de Faltantes', color: '#00707A', keywords: ['faltante', 'rechazo', 'liberación', 'liberacion'] },
    { id: 'lanzamientos', label: 'Lanzamientos', color: '#D69A1F', keywords: ['lanzamiento', 'fecha estimada'] },
    { id: 'temas', label: 'Temas pendientes en Log de acciones', color: '#7A5CC7', keywords: ['temas pendientes', 'log de acciones', 'materias primas'] },
    { id: 'kpis', label: 'KPIs / Capacidad', color: '#C0392B', keywords: ['kpi', 'capacidad', 'indicador'] },
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
