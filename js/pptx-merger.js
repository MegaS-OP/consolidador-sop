/**
 * Motor de fusión OOXML: arma el .pptx consolidado final copiando
 * diapositivas ORIGINALES completas (con su formato, tablas, imágenes y
 * layout) desde los archivos fuente de cada planta, 100% en el navegador
 * con JSZip.
 *
 * Por qué no pptx-automizer (u otra librería de fusión de OOXML): esas
 * librerías están pensadas para Node (usan `fs` para leer/escribir
 * archivos en disco) y no corren en el navegador sin adaptarlas a fondo.
 * Subir los 8 PPTX de planta a una función serverless para fusionarlos
 * ahí tampoco es robusto: son archivos con imágenes que fácilmente superan
 * el límite de payload de Netlify Functions (6 MB). Por eso todo el motor
 * -extracción Y fusión- corre en el navegador, igual que ya se necesitaba
 * para la vista previa.
 *
 * Estrategia general (ver README para el detalle):
 *  - Cada diapositiva a copiar arrastra sus dependencias (layout, master,
 *    tema, imágenes, gráficos embebidos...) siguiendo genéricamente sus
 *    archivos .rels, sin asumir de antemano qué tipos de parte puede haber.
 *  - Cada parte se copia UNA sola vez por archivo de origen (se cachea),
 *    y se renombra con un prefijo único por origen para que no choquen
 *    nombres entre las distintas plantas (todas pueden traer "image1.png").
 *  - Sólo se excluyen las notas del orador: son las únicas relaciones que
 *    viven exclusivamente en el .rels de su parte dueña, sin ninguna
 *    referencia inline en el contenido que pueda quedar colgando.
 */

/* eslint-disable no-undef */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./ooxml-utils'), require('./template'), require('jszip'));
  } else {
    root.PptxMerger = factory(root.OoxmlUtils, root.SopTemplate, root.JSZip);
  }
})(typeof self !== 'undefined' ? self : this, function (OoxmlUtils, SopTemplate, JSZip) {
  // PNG transparente de 1x1, usado como placeholder cuando una imagen
  // referenciada por una diapositiva no se encuentra en el archivo de
  // origen (vínculo roto en el .pptx original). Evita que el consolidado
  // final quede con una referencia sin destino.
  const PLACEHOLDER_PNG_BASE64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

  function base64ToBytes(b64) {
    if (typeof atob === 'function') {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return bytes;
    }
    // Node (tests): no hay atob global.
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }

  const PLACEHOLDER_PNG_BYTES = base64ToBytes(PLACEHOLDER_PNG_BASE64);

  const OLE_GRAPHIC_URI = 'http://schemas.openxmlformats.org/presentationml/2006/ole';

  /**
   * Reemplaza cada gráfico embebido (objeto OLE — típicamente think-cell,
   * también gráficos de Excel/Word embebidos) por su imagen de respaldo
   * estática ("fallback"), que el propio archivo ya trae para cuando
   * PowerPoint no puede activar el objeto.
   *
   * Por qué: los objetos OLE son el motivo más común de que un antivirus o
   * filtro de adjuntos corporativo (Check Point Harmony Endpoint entre
   * otros) "limpie"/reconstruya el .pptx al descargarlo, dejando
   * referencias rotas en el proceso — el archivo final queda invalidado
   * por algo completamente fuera de este código. Nadie necesita editar
   * esos gráficos desde un consolidado de sólo lectura, así que
   * convertirlos a imagen fija de entrada evita el problema de raíz.
   *
   * Sólo se transforma el patrón conocido y verificado (<p:graphicFrame>
   * con <a:graphicData uri=".../ole"> y una <p:pic> de respaldo dentro de
   * <mc:Fallback>). Si la estructura no coincide exactamente, se deja tal
   * cual — es preferible conservar el objeto OLE (funciona, aunque un
   * antivirus corporativo pueda tocarlo) a arriesgarse a dejar XML inválido.
   *
   * @returns {{ text: string, removedRIds: Set<string> }} removedRIds son
   *   los r:id de relaciones de tipo oleObject que quedaron sin ninguna
   *   referencia en el XML resultante — copyPart las puede omitir sin
   *   dejar nada colgando.
   */
  function flattenOleObjects(xmlText) {
    const removedRIds = new Set();
    if (!xmlText.includes(OLE_GRAPHIC_URI)) return { text: xmlText, removedRIds };

    const frameRe = /<p:graphicFrame>[\s\S]*?<\/p:graphicFrame>/g;
    const newText = xmlText.replace(frameRe, (frameBlock) => {
      if (!frameBlock.includes(OLE_GRAPHIC_URI)) return frameBlock;

      const fbMatch = frameBlock.match(/<mc:Fallback>([\s\S]*?)<\/mc:Fallback>/);
      if (!fbMatch) return frameBlock;
      const picMatch = fbMatch[1].match(/<p:pic>[\s\S]*?<\/p:pic>/);
      if (!picMatch) return frameBlock;

      const idRe = /<p:oleObj\b[^>]*\br:id="(rId\d+)"/g;
      let m;
      while ((m = idRe.exec(frameBlock))) removedRIds.add(m[1]);

      return picMatch[0];
    });

    return { text: newText, removedRIds };
  }

  class ConsolidatedBuilder {
    constructor() {
      this.outZip = new JSZip();
      this.sourceMeta = new Map(); // sourceKey -> { zip, contentTypes }
      this.partCache = new Map(); // `${sourceKey}::${virtualPath}` -> newPath
      this.basenameCounters = new Map(); // `${sourceKey}::${base}` no hace falta, el prefijo ya lo hace único

      this.contentTypeOverrides = new Map(); // newPath (sin "/" inicial) -> contentType
      this.contentTypeDefaultExts = new Map([
        ['rels', OoxmlUtils.FALLBACK_DEFAULTS.rels],
        ['xml', OoxmlUtils.FALLBACK_DEFAULTS.xml],
      ]);

      this.presRelEntries = [];
      this.nextPresRelId = 1;

      this.sldIdEntries = [];
      this.nextSldIdNum = 256;

      this.sldMasterIdEntries = [];
      this.nextSldMasterIdNum = 2147483648;
      this.registeredMasters = new Set();

      this.warnings = []; // cosas para que la usuaria revise (imagen faltante, parte no encontrada)
      this.notes = []; // informativo, no necesita revisión (p.ej. gráficos aplanados a imagen)
      this.slideSize = { cx: 12192000, cy: 6858000 };

      this._portadaBaseXml = null;
      this._dividerBaseXml = null;
    }

    /** Registra un origen (archivo .pptx de una planta, o la plantilla fija). Idempotente. */
    async registerSource(sourceKey, zip) {
      if (this.sourceMeta.has(sourceKey)) return;
      let contentTypes = { defaults: new Map(), overrides: new Map() };
      const ctFile = zip.file('[Content_Types].xml');
      if (ctFile) {
        contentTypes = OoxmlUtils.parseContentTypes(await ctFile.async('string'));
      }
      this.sourceMeta.set(sourceKey, { zip, contentTypes });
    }

    /** Carga la plantilla fija (portada + divider + apéndice) y cachea lo necesario. */
    async loadTemplate(templateZip) {
      await this.registerSource('template', templateZip);
      const presFile = templateZip.file('ppt/presentation.xml');
      if (presFile) {
        const presXml = await presFile.async('string');
        const m = presXml.match(/<p:sldSz cx="(\d+)" cy="(\d+)"/);
        if (m) this.slideSize = { cx: Number(m[1]), cy: Number(m[2]) };
      }
      this._portadaBaseXml = await this._readSourceText('template', SopTemplate.TEMPLATE_PORTADA_PATH);
      this._dividerBaseXml = await this._readSourceText('template', SopTemplate.TEMPLATE_DIVIDER_PATH);
    }

    async _readSourceText(sourceKey, path) {
      const meta = this.sourceMeta.get(sourceKey);
      const file = meta.zip.file(path);
      if (!file) throw new Error(`No se encontró "${path}" en la plantilla embebida.`);
      return file.async('string');
    }

    // ---- Copia genérica de partes OOXML, siguiendo .rels recursivamente ----

    /**
     * Copia una parte (y transitivamente sus dependencias) del origen al
     * paquete de salida. Devuelve la ruta nueva, o null si la parte no
     * existía (se agrega un warning en ese caso).
     */
    async copyPart(sourceKey, origPath, opts) {
      opts = opts || {};
      const virtualPath = opts.virtualPath || origPath;
      const cacheKey = sourceKey + '::' + virtualPath;
      if (this.partCache.has(cacheKey)) return this.partCache.get(cacheKey);

      const meta = this.sourceMeta.get(sourceKey);
      if (!meta) throw new Error(`Origen "${sourceKey}" no registrado.`);

      const dir = OoxmlUtils.dirname(virtualPath);
      const base = OoxmlUtils.basename(virtualPath);
      const newBase = this._uniqueBasename(sourceKey, base);
      const newPath = dir ? `${dir}/${newBase}` : newBase;
      this.partCache.set(cacheKey, newPath);

      const ext = OoxmlUtils.extname(virtualPath);
      const isXmlPart = ext === 'xml';

      let text = opts.overrideText;
      let binData = null;

      if (text === undefined) {
        const file = meta.zip.file(origPath);
        if (!file) {
          if (isXmlPart) {
            // Falta una parte XML (p.ej. un layout referenciado que no está
            // en el .zip): no hay una manera segura de sustituirla, así que
            // se propaga como antes (se corta esta rama de la copia).
            this.warnings.push(`No se encontró la parte "${origPath}" (origen: ${sourceKey}). Se omite.`);
            this.partCache.delete(cacheKey);
            return null;
          }
          // Falta un archivo binario (típicamente una imagen con el vínculo
          // roto en el .pptx original, algo frecuente en decks exportados
          // de Google Slides). Antes se borraba la relación entera, lo que
          // dejaba el r:id que la usa apuntando a la nada -> el archivo
          // final quedaba corrupto. Ahora se sustituye por un placeholder
          // en blanco: el archivo final sigue siendo válido, esa imagen
          // puntual se ve vacía, y queda avisado para revisar esa diapositiva.
          this.warnings.push(
            `No se encontró "${origPath}" (origen: ${sourceKey}); esa imagen quedó en blanco en el consolidado — conviene revisar esa diapositiva.`
          );
          binData = PLACEHOLDER_PNG_BYTES;
        } else if (isXmlPart) {
          text = await file.async('string');
        } else {
          binData = await file.async('uint8array');
        }
      }

      if (isXmlPart) {
        const flattened = flattenOleObjects(text);
        text = flattened.text;
        if (flattened.removedRIds.size) {
          this.notes.push(
            `Se convirtió ${flattened.removedRIds.size} gráfico(s) embebido(s) (think-cell u similar) a imagen fija en "${origPath}", para evitar que un antivirus corporativo corrompa el archivo al descargarlo.`
          );
        }

        const relsPath = OoxmlUtils.relsPathFor(origPath);
        const relsFile = meta.zip.file(relsPath);
        if (relsFile) {
          const relsText = await relsFile.async('string');
          const entries = OoxmlUtils.parseRels(relsText);
          const keptEntries = [];
          for (const rel of entries) {
            if (OoxmlUtils.EXCLUDED_REL_TYPE_SUBSTR.some((s) => rel.type.includes(s))) continue;
            if (rel.type.endsWith('/oleObject') && flattened.removedRIds.has(rel.id)) {
              // Se aplanó a imagen fija más arriba: el XML ya no referencia
              // este r:id, así que la relación (y el objeto OLE binario que
              // apuntaba) se puede omitir sin dejar nada colgando.
              continue;
            }
            if (rel.targetMode === 'External') {
              keptEntries.push(rel);
              continue;
            }
            if (rel.type.includes('/hyperlink')) {
              // Hipervínculo interno a otra diapositiva: no hay garantía de
              // que el destino también se incluya en el consolidado, así
              // que se omite en vez de dejar una referencia rota.
              continue;
            }
            const resolved = OoxmlUtils.resolveRelTarget(origPath, rel.target);
            const newTargetPath = await this.copyPart(sourceKey, resolved);
            if (!newTargetPath) continue;
            keptEntries.push({
              ...rel,
              target: this._replaceBasenameInRelTarget(rel.target, OoxmlUtils.basename(newTargetPath)),
            });
            if (rel.type.endsWith('/slideMaster')) {
              this._registerMasterIfNew(newTargetPath);
            }
          }
          if (keptEntries.length) {
            this.outZip.file(OoxmlUtils.relsPathFor(newPath), OoxmlUtils.buildRelsXml(keptEntries));
          }
        }
        this.outZip.file(newPath, text);
      } else {
        this.outZip.file(newPath, binData);
      }

      this._registerContentType(sourceKey, origPath, newPath, ext);
      return newPath;
    }

    _uniqueBasename(sourceKey, origBase) {
      const dot = origBase.lastIndexOf('.');
      const stem = dot === -1 ? origBase : origBase.slice(0, dot);
      const ext = dot === -1 ? '' : origBase.slice(dot);
      const safeKey = String(sourceKey).replace(/[^a-zA-Z0-9]/g, '');
      return `p${safeKey}_${stem}${ext}`;
    }

    _replaceBasenameInRelTarget(originalTarget, newBasename) {
      const idx = originalTarget.lastIndexOf('/');
      return idx === -1 ? newBasename : originalTarget.slice(0, idx + 1) + newBasename;
    }

    _registerMasterIfNew(newMasterPath) {
      if (this.registeredMasters.has(newMasterPath)) return;
      this.registeredMasters.add(newMasterPath);
      const relId = this._addPresRel('slideMaster', newMasterPath);
      this.sldMasterIdEntries.push({ id: this.nextSldMasterIdNum++, relId });
    }

    _registerContentType(sourceKey, origPath, newPath, ext) {
      const dir = OoxmlUtils.dirname(newPath);
      const byDir = OoxmlUtils.CONTENT_TYPE_BY_DIR[dir];
      if (byDir) {
        this.contentTypeOverrides.set(newPath, byDir);
        return;
      }
      const baseLower = OoxmlUtils.basename(newPath).toLowerCase();
      const byBasename = OoxmlUtils.CONTENT_TYPE_BY_BASENAME_CONTAINS.find(([frag]) =>
        baseLower.includes(frag.toLowerCase())
      );
      if (byBasename) {
        this.contentTypeOverrides.set(newPath, byBasename[1]);
        return;
      }
      const meta = this.sourceMeta.get(sourceKey);
      const origOverride = meta.contentTypes.overrides.get(origPath);
      if (origOverride) {
        this.contentTypeOverrides.set(newPath, origOverride);
        return;
      }

      // Extensiones genuinamente inequívocas (una imagen .png siempre es
      // image/png en cualquier paquete OOXML): se pueden declarar como
      // Default global sin riesgo.
      const universalCt = OoxmlUtils.FALLBACK_DEFAULTS[ext];
      if (universalCt && ext !== 'bin') {
        this.contentTypeDefaultExts.set(ext, universalCt);
        return;
      }

      // Todo lo demás (".bin" en particular: puede ser un objeto OLE en
      // una planta y otra cosa distinta en otra) se resuelve con el
      // [Content_Types].xml de ESA fuente puntual, pero se declara como
      // Override específico de esta parte — nunca como Default global —
      // para no pisar el tipo correcto de un archivo con la misma
      // extensión que venga de otra planta.
      const fromSource = meta.contentTypes.defaults.get(ext) || meta.contentTypes.overrides.get(ext);
      const ct = fromSource || universalCt || 'application/octet-stream';
      this.contentTypeOverrides.set(newPath, ct);
      if (!fromSource && !universalCt) {
        this.warnings.push(
          `Tipo de contenido desconocido para ".${ext}" (${origPath}); se usó un tipo genérico, revisar esa diapositiva en el resultado final.`
        );
      }
    }

    _addPresRel(typeSuffix, targetPathAbs) {
      const id = 'rId' + this.nextPresRelId++;
      const target = targetPathAbs.startsWith('ppt/') ? targetPathAbs.slice(4) : targetPathAbs;
      this.presRelEntries.push({ id, type: `${OoxmlUtils.REL}/${typeSuffix}`, target });
      return id;
    }

    async _addTopSlide(sourceKey, origPath, opts) {
      const newPath = await this.copyPart(sourceKey, origPath, opts);
      if (!newPath) return null;
      const relId = this._addPresRel('slide', newPath);
      this.sldIdEntries.push({ id: this.nextSldIdNum++, relId });
      return newPath;
    }

    // ---- Operaciones de alto nivel usadas por app.js ----

    /** Copia la portada, con el mes/año sustituido en el título. */
    async addPortada(mesAnioLabel) {
      const overrideText = this._portadaBaseXml.replace(
        /S&amp;OP Ciclo: [^<]*/,
        `S&amp;OP Ciclo: ${OoxmlUtils.encodeXmlText(mesAnioLabel)}`
      );
      return this._addTopSlide('template', SopTemplate.TEMPLATE_PORTADA_PATH, { overrideText });
    }

    /**
     * Inserta una diapositiva "Contenido de la sesión" con el resaltado de
     * progreso correspondiente. Llamar una vez antes de cada planta
     * (currentIndex = índice de esa planta) y una vez más antes del
     * apéndice fijo (currentIndex = plantLabels.length).
     */
    async addDivider(plantLabels, currentIndex, dividerSeq) {
      const { xml, ok } = SopTemplate.buildDividerXml(this._dividerBaseXml, plantLabels, currentIndex, OoxmlUtils);
      if (!ok) {
        this.warnings.push(
          'No se pudo generar el resaltado de progreso de "Contenido de la sesión" (la plantilla cambió de formato); se insertó la diapositiva base sin editar.'
        );
      }
      const virtualPath = `ppt/slides/__divider_${dividerSeq}.xml`;
      return this._addTopSlide('template', SopTemplate.TEMPLATE_DIVIDER_PATH, {
        virtualPath,
        overrideText: xml,
      });
    }

    /** Copia una diapositiva real de una planta (ya registrada con registerSource). */
    async addPlantSlide(plantKey, slidePath) {
      return this._addTopSlide(plantKey, slidePath);
    }

    /** Copia el apéndice fijo (glosario de KPIs + cierre), una sola vez. */
    async addAppendix() {
      for (const path of SopTemplate.TEMPLATE_APPENDIX_PATHS) {
        await this._addTopSlide('template', path);
      }
    }

    /** Ensambla [Content_Types].xml, presentation.xml y sus .rels, y genera el .pptx final. */
    async build() {
      const ctParts = [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n',
        `<Types xmlns="${OoxmlUtils.CONTENT_TYPES_NS}">`,
      ];
      for (const [ext, ct] of this.contentTypeDefaultExts) {
        ctParts.push(`<Default Extension="${ext}" ContentType="${OoxmlUtils.encodeXmlAttr(ct)}"/>`);
      }
      ctParts.push(
        '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>',
        '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>',
        '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>'
      );
      for (const [path, ct] of this.contentTypeOverrides) {
        ctParts.push(`<Override PartName="/${path}" ContentType="${OoxmlUtils.encodeXmlAttr(ct)}"/>`);
      }
      ctParts.push('</Types>');
      this.outZip.file('[Content_Types].xml', ctParts.join(''));

      // docProps/core.xml y app.xml: metadata estándar que todo .pptx
      // generado por PowerPoint incluye. Sin esto, algunos filtros de
      // seguridad de correo/descarga (los que renombran el archivo a
      // "*.cleaned.pptx" al "limpiarlo") pueden no reconocer el paquete
      // como un Office válido y corromperlo al reescribirlo.
      const nowIso = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
      this.outZip.file(
        'docProps/core.xml',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' +
          '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
          'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ' +
          'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
          '<dc:title>Informe S&amp;OP Consolidado</dc:title>' +
          '<dc:creator>Consolidador S&amp;OP</dc:creator>' +
          '<cp:lastModifiedBy>Consolidador S&amp;OP</cp:lastModifiedBy>' +
          `<dcterms:created xsi:type="dcterms:W3CDTF">${nowIso}</dcterms:created>` +
          `<dcterms:modified xsi:type="dcterms:W3CDTF">${nowIso}</dcterms:modified>` +
          '</cp:coreProperties>'
      );
      this.outZip.file(
        'docProps/app.xml',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' +
          '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" ' +
          'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
          '<Application>Consolidador S&amp;OP</Application>' +
          '<PresentationFormat>Widescreen</PresentationFormat>' +
          `<Slides>${this.sldIdEntries.length}</Slides>` +
          '<Company>Megalabs</Company>' +
          '</Properties>'
      );

      this.outZip.file(
        '_rels/.rels',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' +
          `<Relationships xmlns="${OoxmlUtils.RELS_NS}">` +
          `<Relationship Id="rId1" Type="${OoxmlUtils.REL}/officeDocument" Target="ppt/presentation.xml"/>` +
          `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` +
          `<Relationship Id="rId3" Type="${OoxmlUtils.REL}/extended-properties" Target="docProps/app.xml"/>` +
          '</Relationships>'
      );

      const sldMasterIdLst =
        '<p:sldMasterIdLst>' +
        this.sldMasterIdEntries.map((e) => `<p:sldMasterId id="${e.id}" r:id="${e.relId}"/>`).join('') +
        '</p:sldMasterIdLst>';
      const sldIdLst =
        '<p:sldIdLst>' +
        this.sldIdEntries.map((e) => `<p:sldId id="${e.id}" r:id="${e.relId}"/>`).join('') +
        '</p:sldIdLst>';

      const presentationXml =
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' +
        '<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
        `xmlns:r="${OoxmlUtils.REL}" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">` +
        sldMasterIdLst +
        sldIdLst +
        `<p:sldSz cx="${this.slideSize.cx}" cy="${this.slideSize.cy}"/>` +
        '<p:notesSz cx="6858000" cy="9144000"/>' +
        '</p:presentation>';
      this.outZip.file('ppt/presentation.xml', presentationXml);
      this.outZip.file('ppt/_rels/presentation.xml.rels', OoxmlUtils.buildRelsXml(this.presRelEntries));

      return this.outZip.generateAsync({
        type: 'blob',
        mimeType:
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        compression: 'DEFLATE',
      });
    }
  }

  return { ConsolidatedBuilder };
});
