/**
 * Todo lo relacionado con assets/template.pptx: qué diapositiva de ese
 * archivo cumple qué rol fijo, y cómo se genera la diapositiva divisoria
 * "Contenido de la sesión" (con el resaltado de progreso por planta) a
 * partir de esa misma plantilla.
 *
 * assets/template.pptx se armó una sola vez a partir del consolidado
 * histórico de referencia (ver README) y contiene, con sus rutas
 * ORIGINALES intactas:
 *   - ppt/slides/slide1.xml   -> portada ("S&OP Ciclo: {Mes} {Año}")
 *   - ppt/slides/slide2.xml   -> plantilla de la diapositiva divisoria
 *   - ppt/slides/slide86.xml..slide93.xml -> apéndice fijo (glosario de
 *     KPIs + cierre), se copian tal cual, una sola vez, al final.
 */

const TEMPLATE_PORTADA_PATH = 'ppt/slides/slide1.xml';
const TEMPLATE_DIVIDER_PATH = 'ppt/slides/slide2.xml';
const TEMPLATE_APPENDIX_PATHS = [86, 87, 88, 89, 90, 91, 92, 93].map(
  (n) => `ppt/slides/slide${n}.xml`
);

// Colores de progreso de la diapositiva "Contenido de la sesión", tal como
// aparecen en el consolidado histórico de referencia.
const DIVIDER_COLOR_DONE = '009999'; // planta ya presentada
const DIVIDER_COLOR_PENDING = '00A88E'; // planta todavía no presentada
// La planta actual no lleva color propio: mantiene el <a:schemeClr val="bg1"/>
// (blanco) original de la plantilla, que es lo que la resalta frente a las
// demás filas coloreadas.

// Posiciones (EMU) de los 9 renglones de la lista, tomadas directamente del
// consolidado histórico (mismo X, Y en escalón constante). El template sólo
// trae hasta 9 renglones porque nunca hay más de 8 plantas + "Back Up".
const DIVIDER_ITEM_X = 5424847;
const DIVIDER_ITEM_CX = 6782881;
const DIVIDER_ITEM_CY = 244362;
const DIVIDER_ITEM_Y0 = 1128658;
const DIVIDER_ITEM_Y_STEP = 541046;
const DIVIDER_MAX_ITEMS = 9;

const DIVIDER_ITEM_TEMPLATE =
  '<p:sp><p:nvSpPr><p:cNvPr id="{{ID}}" name="item {{ID}}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>' +
  '<p:spPr><a:xfrm><a:off x="{{X}}" y="{{Y}}"/><a:ext cx="{{CX}}" cy="{{CY}}"/></a:xfrm>' +
  '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>' +
  '<p:txBody><a:bodyPr vert="horz" wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" rtlCol="0" anchor="t"><a:spAutoFit/></a:bodyPr>' +
  '<a:lstStyle/>' +
  '<a:p><a:pPr marL="11430" marR="731520" lvl="0" indent="0" algn="l" defTabSz="828172" rtl="0" eaLnBrk="1" fontAlgn="auto" latinLnBrk="0" hangingPunct="1">' +
  '<a:lnSpc><a:spcPct val="78100"/></a:lnSpc><a:spcBef><a:spcPts val="0"/></a:spcBef><a:spcAft><a:spcPts val="0"/></a:spcAft>' +
  '<a:buClrTx/><a:buSzTx/><a:buFontTx/><a:buNone/><a:tabLst/><a:defRPr/></a:pPr>' +
  '<a:r><a:rPr lang="es-ES" sz="2000" b="1"><a:solidFill>{{FILL}}</a:solidFill><a:latin typeface="Barlow"/><a:cs typeface="Barlow"/></a:rPr><a:t>{{DIGIT}}</a:t></a:r>' +
  '<a:r><a:rPr lang="es-ES" sz="2000" b="1"><a:solidFill>{{FILL}}</a:solidFill><a:latin typeface="Barlow"/><a:cs typeface="Barlow"/></a:rPr><a:t>{{LABEL}}</a:t></a:r>' +
  '<a:endParaRPr lang="es-UY" sz="2000" b="1"><a:solidFill>{{FILL}}</a:solidFill><a:latin typeface="Barlow"/><a:cs typeface="Barlow"/></a:endParaRPr>' +
  '</a:p></p:txBody></p:sp>';

/**
 * Genera el XML de una diapositiva divisoria "Contenido de la sesión" con
 * el resaltado de progreso correspondiente.
 *
 * @param {string} baseXml - texto de ppt/slides/slide2.xml de la plantilla.
 * @param {string[]} plantLabels - nombres de planta en el orden final del tablero.
 * @param {number} currentIndex - índice (0-based) de la planta que se está por
 *   presentar en esta inserción; usar plantLabels.length para la última
 *   inserción (antes del apéndice "Back Up").
 * @param {{encodeXmlText: Function}} xmlUtils
 * @returns {{xml: string, ok: boolean}} ok=false si la plantilla no tiene la
 *   estructura esperada (se devuelve baseXml sin modificar, para no romper
 *   la generación por un cambio de formato en el archivo de referencia).
 */
function buildDividerXml(baseXml, plantLabels, currentIndex, xmlUtils) {
  const blocks = xmlUtils.splitShapeBlocks(baseXml);
  const itemBlocks = blocks.filter((b) => /^\s*\d+\s*\.\s*/.test(xmlUtils.blockJoinedText(b.text)));
  if (itemBlocks.length < 2) {
    return { xml: baseXml, ok: false };
  }
  const first = itemBlocks[0];
  const last = itemBlocks[itemBlocks.length - 1];

  const items = [...plantLabels, 'Back Up'];
  const capped = items.slice(0, DIVIDER_MAX_ITEMS);

  let generated = '';
  capped.forEach((label, i) => {
    const isBackup = i === capped.length - 1 && label === 'Back Up';
    const y = DIVIDER_ITEM_Y0 + DIVIDER_ITEM_Y_STEP * i;
    let fill;
    if (i < currentIndex) fill = `<a:srgbClr val="${DIVIDER_COLOR_DONE}"/>`;
    else if (i === currentIndex) fill = '<a:schemeClr val="bg1"/>';
    else fill = `<a:srgbClr val="${DIVIDER_COLOR_PENDING}"/>`;

    const labelText = isBackup
      ? '. Back Up'
      : `. Informe S&OP Planta ${label}`;

    generated += DIVIDER_ITEM_TEMPLATE.replace(/{{ID}}/g, String(900 + i))
      .replace('{{X}}', String(DIVIDER_ITEM_X))
      .replace('{{Y}}', String(y))
      .replace('{{CX}}', String(DIVIDER_ITEM_CX))
      .replace('{{CY}}', String(DIVIDER_ITEM_CY))
      .replace(/{{FILL}}/g, fill)
      .replace('{{DIGIT}}', String(i + 1))
      .replace('{{LABEL}}', xmlUtils.encodeXmlText(labelText));
  });

  const xml = baseXml.slice(0, first.start) + generated + baseXml.slice(last.end);
  return { xml, ok: true };
}

const TemplateModule = {
  TEMPLATE_PORTADA_PATH,
  TEMPLATE_DIVIDER_PATH,
  TEMPLATE_APPENDIX_PATHS,
  buildDividerXml,
};

if (typeof module !== 'undefined') module.exports = TemplateModule;
if (typeof window !== 'undefined') window.SopTemplate = TemplateModule;
