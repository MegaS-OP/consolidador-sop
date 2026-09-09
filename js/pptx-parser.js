/**
 * Extracción client-side para la vista previa: para cada diapositiva de un
 * .pptx de planta, obtiene el título, el texto completo (para el
 * clasificador) y un thumbnail (la imagen principal incrustada, si tiene y
 * es un formato que el navegador puede mostrar).
 *
 * No se intenta renderizar la diapositiva completa: no hay motor de
 * PowerPoint en el navegador. El thumbnail es sólo una ayuda visual.
 */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./ooxml-utils'), require('jszip'));
  } else {
    root.PptxParser = factory(root.OoxmlUtils, root.JSZip);
  }
})(typeof self !== 'undefined' ? self : this, function (OoxmlUtils, JSZip) {
  const RENDERABLE_MIME = {
    png: 'image/png',
    jpeg: 'image/jpeg',
    jpg: 'image/jpeg',
    gif: 'image/gif',
    bmp: 'image/bmp',
    svg: 'image/svg+xml',
  };

  class PptxParseError extends Error {
    constructor(message, cause) {
      super(message);
      this.name = 'PptxParseError';
      this.cause = cause;
    }
  }

  /** Orden real de las diapositivas (según ppt/presentation.xml), como rutas ppt/slides/slideN.xml. */
  async function getSlideOrder(zip) {
    const presFile = zip.file('ppt/presentation.xml');
    const relsFile = zip.file('ppt/_rels/presentation.xml.rels');
    if (!presFile || !relsFile) {
      throw new PptxParseError('El archivo no tiene la estructura esperada de un .pptx (falta ppt/presentation.xml o sus relaciones).');
    }
    const presXml = await presFile.async('string');
    const relsXml = await relsFile.async('string');
    const rels = OoxmlUtils.parseRels(relsXml);
    const ridToTarget = new Map(
      rels
        .filter((r) => r.type.endsWith('/slide') && !r.type.endsWith('/slideLayout') && !r.type.endsWith('/slideMaster'))
        .map((r) => [r.id, OoxmlUtils.resolveRelTarget('ppt/presentation.xml', r.target)])
    );
    const order = [];
    const re = /<p:sldId\b[^>]*r:id="(rId\d+)"/g;
    let m;
    while ((m = re.exec(presXml))) {
      const path = ridToTarget.get(m[1]);
      if (path) order.push(path);
    }
    if (!order.length) {
      throw new PptxParseError('No se encontraron diapositivas en el archivo.');
    }
    return order;
  }

  /**
   * Párrafos (<a:p>) de un bloque de shape, con su texto ({level, bullet}) —
   * compartido entre extractTitle/extractTitleBlock/extractParagraphs.
   * Algunas plantillas meten varios párrafos dentro del MISMO placeholder de
   * título (en los hechos, una mini-lista de objetivos) — de ahí que el
   * título sea sólo el primer párrafo no vacío, nunca el bloque entero.
   */
  function shapeParagraphs(blockXml) {
    const paragraphs = [];
    const paraRe = /<a:p>([\s\S]*?)<\/a:p>/g;
    let m;
    while ((m = paraRe.exec(blockXml))) {
      const text = paraText(m[1]).trim();
      if (!text) continue;
      const lvlMatch = m[1].match(/<a:pPr[^>]*\blvl="(\d+)"/);
      const level = lvlMatch ? Number(lvlMatch[1]) : 0;
      const bullet = !/<a:buNone/.test(m[1]);
      paragraphs.push({ text, level, bullet });
    }
    return paragraphs;
  }

  function extractTitle(slideXml) {
    const blocks = OoxmlUtils.splitShapeBlocks(slideXml);
    for (const b of blocks) {
      if (/<p:ph\b[^>]*type="(title|ctrTitle)"/.test(b.text)) {
        const paras = shapeParagraphs(b.text);
        if (paras.length) return paras[0].text;
      }
    }
    for (const b of blocks) {
      const paras = shapeParagraphs(b.text);
      if (paras.length) return paras[0].text;
    }
    return '(sin título)';
  }

  async function extractMainImage(zip, slidePath, slideXml) {
    const relsPath = OoxmlUtils.relsPathFor(slidePath);
    const relsFile = zip.file(relsPath);
    if (!relsFile) return null;
    const rels = OoxmlUtils.parseRels(await relsFile.async('string'));
    const imageRels = new Map(rels.filter((r) => r.type.endsWith('/image')).map((r) => [r.id, r]));
    if (!imageRels.size) return null;

    let best = null;
    const picRe = /<p:pic>[\s\S]*?<\/p:pic>/g;
    let m;
    while ((m = picRe.exec(slideXml))) {
      const block = m[0];
      const embedMatch = block.match(/r:embed="(rId\d+)"/);
      if (!embedMatch) continue;
      const rel = imageRels.get(embedMatch[1]);
      if (!rel) continue;
      const extMatch = block.match(/<a:ext cx="(\d+)" cy="(\d+)"\s*\/>/);
      const area = extMatch ? Number(extMatch[1]) * Number(extMatch[2]) : 1;
      if (!best || area > best.area) best = { rel, area };
    }
    if (!best) return null;

    const imgPath = OoxmlUtils.resolveRelTarget(slidePath, best.rel.target);
    const imgFile = zip.file(imgPath);
    if (!imgFile) return null;
    const ext = OoxmlUtils.extname(imgPath);
    const mime = RENDERABLE_MIME[ext];
    if (!mime) {
      // Formato no renderizable en <img> del navegador (típicamente .emf/.wmf,
      // frecuentes en gráficos pegados desde Excel). Se omite el thumbnail.
      return null;
    }
    const base64 = await imgFile.async('base64');
    return `data:${mime};base64,${base64}`;
  }

  // ---------- Extracción de contenido completo (para la vista consolidada) ----------

  /**
   * @returns {{title: string, titleBlock: object|null, titleExtraParagraphs: Array}}
   * `titleExtraParagraphs` son los párrafos 2°, 3°, etc. del MISMO shape de
   * título, cuando ese shape en los hechos trae más de un párrafo (p.ej. un
   * título que es una mini-lista de objetivos) — se recuperan como párrafos
   * de cuerpo en vez de perderse (ver extractParagraphs).
   */
  function extractTitleBlock(slideXml) {
    const blocks = OoxmlUtils.splitShapeBlocks(slideXml);
    for (const b of blocks) {
      if (/<p:ph\b[^>]*type="(title|ctrTitle)"/.test(b.text)) {
        const paras = shapeParagraphs(b.text);
        if (paras.length) return { title: paras[0].text, titleBlock: b, titleExtraParagraphs: paras.slice(1) };
        return { title: '(sin título)', titleBlock: b, titleExtraParagraphs: [] };
      }
    }
    for (const b of blocks) {
      const paras = shapeParagraphs(b.text);
      if (paras.length) return { title: paras[0].text, titleBlock: b, titleExtraParagraphs: paras.slice(1) };
    }
    return { title: '(sin título)', titleBlock: null, titleExtraParagraphs: [] };
  }

  function paraText(paraXml) {
    const texts = [];
    const re = /<a:t>([^<]*)<\/a:t>/g;
    let m;
    while ((m = re.exec(paraXml))) texts.push(OoxmlUtils.decodeXmlEntities(m[1]));
    return texts.join('');
  }

  /** Párrafos de cuerpo: los del shape de título (salvo el primero, que es
   * el título) más los de todas las demás formas de texto de la diapositiva. */
  function extractParagraphs(slideXml, titleBlock, titleExtraParagraphs) {
    const blocks = OoxmlUtils.splitShapeBlocks(slideXml);
    const paragraphs = [...(titleExtraParagraphs || [])];
    for (const b of blocks) {
      if (titleBlock && b.start === titleBlock.start) continue;
      paragraphs.push(...shapeParagraphs(b.text));
    }
    return paragraphs;
  }

  /** Tablas (<a:tbl>) como matriz de filas/columnas de texto. Simplificación: no resuelve celdas combinadas. */
  function extractTables(slideXml) {
    const tables = [];
    const tblRe = /<a:tbl>[\s\S]*?<\/a:tbl>/g;
    let tblMatch;
    while ((tblMatch = tblRe.exec(slideXml))) {
      const tblXml = tblMatch[0];
      const rows = [];
      const trRe = /<a:tr\b[^>]*>([\s\S]*?)<\/a:tr>/g;
      let tr;
      while ((tr = trRe.exec(tblXml))) {
        const cells = [];
        const tcRe = /<a:tc\b[^>]*>([\s\S]*?)<\/a:tc>/g;
        let tc;
        while ((tc = tcRe.exec(tr[1]))) {
          cells.push(paraText(tc[1]).trim());
        }
        if (cells.length) rows.push(cells);
      }
      if (rows.length) tables.push({ rows });
    }
    return tables;
  }

  /** Todas las imágenes renderizables de la diapositiva (no sólo la principal), en orden de aparición. */
  async function extractAllImages(zip, slidePath, slideXml) {
    const relsPath = OoxmlUtils.relsPathFor(slidePath);
    const relsFile = zip.file(relsPath);
    if (!relsFile) return [];
    const rels = OoxmlUtils.parseRels(await relsFile.async('string'));
    const imageRels = new Map(rels.filter((r) => r.type.endsWith('/image')).map((r) => [r.id, r]));
    if (!imageRels.size) return [];

    const images = [];
    const picRe = /<p:pic>[\s\S]*?<\/p:pic>/g;
    let m;
    while ((m = picRe.exec(slideXml))) {
      const embedMatch = m[0].match(/r:embed="(rId\d+)"/);
      if (!embedMatch) continue;
      const rel = imageRels.get(embedMatch[1]);
      if (!rel) continue;
      const imgPath = OoxmlUtils.resolveRelTarget(slidePath, rel.target);
      const imgFile = zip.file(imgPath);
      if (!imgFile) continue;
      const ext = OoxmlUtils.extname(imgPath);
      const mime = RENDERABLE_MIME[ext];
      if (!mime) continue; // emf/wmf: no renderizable en <img>, se omite
      const base64 = await imgFile.async('base64');
      images.push(`data:${mime};base64,${base64}`);
    }
    return images;
  }

  /**
   * Contenido completo de una diapositiva (título, párrafos de cuerpo,
   * tablas, imágenes) para volcar en la vista consolidada — a diferencia de
   * parsePptxFile, que sólo saca lo necesario para la vista previa del
   * tablero. Se llama sólo para las diapositivas efectivamente incluidas.
   */
  async function extractSlideContent(zip, slidePath) {
    const slideXml = await zip.file(slidePath).async('string');
    const { title, titleBlock, titleExtraParagraphs } = extractTitleBlock(slideXml);
    const paragraphs = extractParagraphs(slideXml, titleBlock, titleExtraParagraphs);
    const tables = extractTables(slideXml);
    const images = await extractAllImages(zip, slidePath, slideXml);
    return { title, paragraphs, tables, images };
  }

  /**
   * Parsea un archivo .pptx completo y devuelve sus diapositivas en orden,
   * con título, texto completo y thumbnail cuando hay imagen disponible.
   *
   * @param {ArrayBuffer|Blob} fileData
   * @param {string} fileName
   */
  async function parsePptxFile(fileData, fileName) {
    let zip;
    try {
      zip = await JSZip.loadAsync(fileData);
    } catch (e) {
      throw new PptxParseError(
        `No se pudo leer "${fileName}": no parece ser un archivo .pptx válido (¿está corrupto o es otro formato?).`,
        e
      );
    }

    let order;
    try {
      order = await getSlideOrder(zip);
    } catch (e) {
      if (e instanceof PptxParseError) throw e;
      throw new PptxParseError(`No se pudo interpretar la estructura de "${fileName}": ${e.message}`, e);
    }

    const slides = [];
    for (let i = 0; i < order.length; i++) {
      const slidePath = order[i];
      try {
        const slideXml = await zip.file(slidePath).async('string');
        const title = extractTitle(slideXml);
        const fullText = OoxmlUtils.allSlideText(slideXml);
        const thumbnail = await extractMainImage(zip, slidePath, slideXml);
        slides.push({
          slidePath,
          orderIndex: i,
          title,
          fullText,
          thumbnail,
        });
      } catch (e) {
        // Una diapositiva puntual rota no debería tirar abajo la lectura de
        // todo el archivo: se agrega igual, marcada, para que la usuaria
        // decida qué hacer (normalmente excluirla).
        slides.push({
          slidePath,
          orderIndex: i,
          title: '(no se pudo leer esta diapositiva)',
          fullText: '',
          thumbnail: null,
          parseError: e.message,
        });
      }
    }

    return { zip, fileName, slides };
  }

  /** Heurística simple para sugerir el nombre de planta a partir del nombre de archivo. */
  function guessPlantNameFromFileName(fileName) {
    let base = fileName.replace(/\.pptx?$/i, '');
    base = base.replace(/[_\-.]+/g, ' ').trim();
    const stopWords = [
      'informe', 'sop', 's&op', 's op', 'suministro', 'reunion', 'reunión',
      'planta', 'mensual', 'final', 'v1', 'v2', 'v3', 'draft', 'borrador',
    ];
    let words = base.split(/\s+/).filter(Boolean);
    words = words.filter((w) => {
      const wl = w.toLowerCase();
      if (/^\d{1,2}$/.test(wl)) return false; // números sueltos (mes/día)
      if (/^(20)?\d{2}$/.test(wl)) return false; // años
      return !stopWords.includes(wl);
    });
    const guess = words.join(' ').trim();
    return guess || base || 'Planta sin nombre';
  }

  return { parsePptxFile, extractSlideContent, guessPlantNameFromFileName, PptxParseError };
});
