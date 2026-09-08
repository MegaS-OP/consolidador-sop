/**
 * Clasificación automática sugerida por keyword matching sobre el título Y
 * el texto interno de cada diapositiva, con un score de confianza.
 */

(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  if (typeof window !== 'undefined') window.Classifier = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  // Orden fijo de la agenda: define también el orden de columnas del
  // tablero y el orden interno de cada bloque de planta en el consolidado.
  const SECTIONS = [
    { id: 'bo', label: 'BO / Críticos', keywords: ['bo', 'crítico', 'critico', 'back order'] },
    { id: 'faltantes', label: 'Informe de Faltantes', keywords: ['faltante', 'rechazo', 'liberación', 'liberacion'] },
    { id: 'lanzamientos', label: 'Lanzamientos', keywords: ['lanzamiento', 'fecha estimada'] },
    { id: 'temas', label: 'Temas pendientes en Log de acciones', keywords: ['temas pendientes', 'log de acciones', 'materias primas'] },
    { id: 'kpis', label: 'KPIs / Capacidad', keywords: ['kpi', 'capacidad', 'indicador'] },
  ];
  const UNCLASSIFIED = 'sin_clasificar';

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

  return { SECTIONS, UNCLASSIFIED, classifySlide, sectionById };
});
