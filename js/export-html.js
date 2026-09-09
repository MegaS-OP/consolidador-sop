/**
 * Arma el documento .html autocontenido que se descarga: el CSS y
 * editable-view.js quedan inline, así el archivo abre suelto (doble clic,
 * sin servidor) y sigue siendo editable — mismo motor de interacción que
 * la vista en vivo, auto-inicializado con un bootstrap al cargar.
 *
 * Sólo arma el string del documento; quien lo llama se encarga de
 * conseguir el CSS/JS (fetch) y de disparar la descarga.
 */

(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  if (typeof window !== 'undefined') window.ExportHtml = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  function buildStandaloneHtml({ title, cardsHtml, cssText, editableViewJsText }) {
    return (
      '<!doctype html>\n' +
      '<html lang="es">\n' +
      '<head>\n' +
      '<meta charset="UTF-8" />\n' +
      '<meta name="viewport" content="width=device-width, initial-scale=1.0" />\n' +
      `<title>${title}</title>\n` +
      '<link rel="preconnect" href="https://fonts.googleapis.com" />\n' +
      '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />\n' +
      '<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" />\n' +
      `<style>\n${cssText}\n</style>\n` +
      '</head>\n' +
      '<body>\n' +
      '<header class="topbar no-print">\n' +
      '  <div class="topbar-brand"><span class="brand-mark">S&amp;OP</span><span class="brand-name">Informe consolidado</span></div>\n' +
      '</header>\n' +
      '<main id="app">\n' +
      '  <div class="consolidated-toolbar no-print">\n' +
      '    <div class="view-toggle">\n' +
      '      <button type="button" class="view-toggle-btn active" id="btnVertical">Vertical</button>\n' +
      '      <button type="button" class="view-toggle-btn" id="btnPresent">Presentación</button>\n' +
      '    </div>\n' +
      '    <div class="consolidated-actions">\n' +
      '      <div class="present-nav" id="presentNav">\n' +
      '        <button type="button" class="btn btn-ghost" id="presentPrev">←</button>\n' +
      '        <span class="present-nav-count" id="presentCount">1 / 1</span>\n' +
      '        <button type="button" class="btn btn-ghost" id="presentNext">→</button>\n' +
      '      </div>\n' +
      '      <button type="button" class="btn btn-ghost" id="btnAddBlank">+ Nota</button>\n' +
      '      <button type="button" class="btn btn-primary" id="btnPrint">Exportar a PDF</button>\n' +
      '    </div>\n' +
      '  </div>\n' +
      `  <div class="consolidated-list" id="consolidatedList">${cardsHtml}</div>\n` +
      '</main>\n' +
      `<script>\n${editableViewJsText}\n</script>\n` +
      '<script>\n' +
      "document.addEventListener('DOMContentLoaded', function () {\n" +
      "  var container = document.getElementById('consolidatedList');\n" +
      '  EditableView.wireInteractions(container, {\n' +
      "    addBlankButton: document.getElementById('btnAddBlank'),\n" +
      "    verticalButton: document.getElementById('btnVertical'),\n" +
      "    presentButton: document.getElementById('btnPresent'),\n" +
      "    presentNav: document.getElementById('presentNav'),\n" +
      "    presentPrev: document.getElementById('presentPrev'),\n" +
      "    presentNext: document.getElementById('presentNext'),\n" +
      "    presentCount: document.getElementById('presentCount'),\n" +
      "    printButton: document.getElementById('btnPrint'),\n" +
      '  });\n' +
      '});\n' +
      '</script>\n' +
      '</body>\n' +
      '</html>\n'
    );
  }

  return { buildStandaloneHtml };
});
