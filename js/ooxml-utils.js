/**
 * Utilidades OOXML de bajo nivel, compartidas entre el extractor (preview) y
 * el fusionador (generación del consolidado final).
 *
 * Se evita a propósito cualquier parser XML "real" (DOMParser/xmldom): los
 * archivos .rels y [Content_Types].xml que produce PowerPoint/Google Slides
 * son siempre listas planas de elementos con atributos, así que un regex
 * dirigido es suficiente, más simple, y corre igual en navegador y en Node
 * (útil para probar el motor de fusión con `node` antes de tocar el DOM).
 */

const CONTENT_TYPES_NS =
  'http://schemas.openxmlformats.org/package/2006/content-types';
const RELS_NS =
  'http://schemas.openxmlformats.org/package/2006/relationships';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

// Tipos de relación que nunca se copian al consolidado: notas del orador.
// Son las únicas que se pueden excluir con seguridad, porque la relación
// que las declara vive solo en el .rels de la parte dueña — nada dentro
// del XML de la diapositiva/layout/master las referencia por r:id.
//
// OJO: "tags" (<p:tags r:id="..."/>, metadata de objeto muy común en
// decks exportados de Google Slides) y los comentarios modernos SÍ pueden
// quedar referenciados por r:id desde adentro del propio contenido (p.ej.
// <p:nvPr><p:custDataLst><p:tags r:id="rId1"/>...). Si se excluye esa
// relación pero no esa referencia inline, el archivo final queda con un
// r:id apuntando a nada — exactamente el tipo de corrupción que PowerPoint
// rechaza al abrir aunque el .zip y el XML sean válidos. Por eso NO se
// excluyen: es más seguro copiar ese archivito de metadata de más que
// dejar una referencia colgando.
const EXCLUDED_REL_TYPE_SUBSTR = ['notesSlide', 'notesMaster'];

function normalizePath(path) {
  const parts = path.split('/');
  const out = [];
  for (const part of parts) {
    if (part === '' || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
}

function dirname(path) {
  const idx = path.lastIndexOf('/');
  return idx === -1 ? '' : path.slice(0, idx);
}

function basename(path) {
  const idx = path.lastIndexOf('/');
  return idx === -1 ? path : path.slice(idx + 1);
}

function extname(path) {
  const b = basename(path);
  const idx = b.lastIndexOf('.');
  return idx === -1 ? '' : b.slice(idx + 1).toLowerCase();
}

/** Resuelve un Target relativo de un .rels contra el directorio de la parte dueña. */
function resolveRelTarget(ownerPartPath, target) {
  if (target.startsWith('/')) return normalizePath(target.slice(1));
  return normalizePath(dirname(ownerPartPath) + '/' + target);
}

function relsPathFor(partPath) {
  return `${dirname(partPath)}/_rels/${basename(partPath)}.rels`;
}

/** Parsea un .rels a [{id, type, target, targetMode}]. */
function parseRels(xmlText) {
  const entries = [];
  const re = /<Relationship\b([^>]*?)\/?>/g;
  let m;
  while ((m = re.exec(xmlText))) {
    const attrs = parseAttrs(m[1]);
    entries.push({
      id: attrs.Id,
      type: attrs.Type,
      target: attrs.Target,
      targetMode: attrs.TargetMode || 'Internal',
    });
  }
  return entries;
}

function parseAttrs(attrText) {
  const attrs = {};
  const re = /([\w:]+)="([^"]*)"/g;
  let m;
  while ((m = re.exec(attrText))) {
    attrs[m[1]] = decodeXmlEntities(m[2]);
  }
  return attrs;
}

function decodeXmlEntities(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function encodeXmlAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function encodeXmlText(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildRelsXml(entries) {
  const rels = entries
    .map((e) => {
      const attrs = [`Id="${encodeXmlAttr(e.id)}"`, `Type="${encodeXmlAttr(e.type)}"`, `Target="${encodeXmlAttr(e.target)}"`];
      if (e.targetMode === 'External') attrs.push('TargetMode="External"');
      return `<Relationship ${attrs.join(' ')}/>`;
    })
    .join('');
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' +
    `<Relationships xmlns="${RELS_NS}">${rels}</Relationships>`
  );
}

/** Parsea [Content_Types].xml a { defaults: Map(ext->ct), overrides: Map(partPath sin "/" inicial ->ct) }. */
function parseContentTypes(xmlText) {
  const defaults = new Map();
  const overrides = new Map();
  const defRe = /<Default\b([^>]*?)\/?>/g;
  let m;
  while ((m = defRe.exec(xmlText))) {
    const a = parseAttrs(m[1]);
    if (a.Extension) defaults.set(a.Extension.toLowerCase(), a.ContentType);
  }
  const ovRe = /<Override\b([^>]*?)\/?>/g;
  while ((m = ovRe.exec(xmlText))) {
    const a = parseAttrs(m[1]);
    if (a.PartName) overrides.set(a.PartName.replace(/^\//, ''), a.ContentType);
  }
  return { defaults, overrides };
}

// Content types para las partes OOXML de PowerPoint más comunes. Se
// resuelven por CARPETA (y a veces por fragmento del nombre), nunca por el
// nombre completo: como cada parte copiada se renombra con un prefijo para
// evitar colisiones entre archivos de distintas plantas, un regex de nombre
// completo tipo /slide\d+\.xml$/ dejaría de matchear apenas se prefija.
const CONTENT_TYPE_BY_DIR = {
  'ppt/slides': 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml',
  'ppt/slideLayouts': 'application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml',
  'ppt/slideMasters': 'application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml',
  'ppt/theme': 'application/vnd.openxmlformats-officedocument.theme+xml',
};

// Partes "singleton" que se identifican por contener este fragmento en su
// nombre original (independientemente del prefijo de unicidad agregado).
const CONTENT_TYPE_BY_BASENAME_CONTAINS = [
  ['tableStyles', 'application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml'],
  ['presProps', 'application/vnd.openxmlformats-officedocument.presentationml.presProps+xml'],
  ['viewProps', 'application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml'],
];

// Extensiones binarias/comunes con Default fijo, por si la fuente no las trae
// declaradas (raro, pero mejor no depender de eso).
const FALLBACK_DEFAULTS = {
  xml: 'application/xml',
  rels: 'application/vnd.openxmlformats-package.relationships+xml',
  png: 'image/png',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  gif: 'image/gif',
  emf: 'image/x-emf',
  wmf: 'image/x-wmf',
  bmp: 'image/bmp',
  tiff: 'image/tiff',
  bin: 'application/vnd.openxmlformats-officedocument.oleObject',
  svg: 'image/svg+xml',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

/** Encuentra todos los bloques <p:sp>...</p:sp> de nivel superior en un XML de diapositiva. */
function splitShapeBlocks(xml) {
  const blocks = [];
  const re = /<p:sp>[\s\S]*?<\/p:sp>/g;
  let m;
  while ((m = re.exec(xml))) {
    blocks.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
  }
  return blocks;
}

/** Concatena el texto (<a:t>) de un bloque de shape, en orden de aparición. */
function blockJoinedText(blockXml) {
  const texts = [];
  const re = /<a:t>([^<]*)<\/a:t>/g;
  let m;
  while ((m = re.exec(blockXml))) texts.push(decodeXmlEntities(m[1]));
  return texts.join('');
}

/** Todo el texto de una diapositiva (todos los <a:t>, en orden). */
function allSlideText(slideXml) {
  return blockJoinedText(slideXml);
}

const OoxmlUtils = {
  normalizePath,
  dirname,
  basename,
  extname,
  resolveRelTarget,
  relsPathFor,
  parseRels,
  parseAttrs,
  decodeXmlEntities,
  encodeXmlAttr,
  encodeXmlText,
  buildRelsXml,
  parseContentTypes,
  CONTENT_TYPE_BY_DIR,
  CONTENT_TYPE_BY_BASENAME_CONTAINS,
  FALLBACK_DEFAULTS,
  EXCLUDED_REL_TYPE_SUBSTR,
  splitShapeBlocks,
  blockJoinedText,
  allSlideText,
  CONTENT_TYPES_NS,
  RELS_NS,
  REL,
};

// UMD mínimo: en Node se exporta vía module.exports; en el navegador (sin
// build step, así que sin bundler que resuelva require/module) se expone
// como global.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = OoxmlUtils;
}
if (typeof window !== 'undefined') {
  window.OoxmlUtils = OoxmlUtils;
}
