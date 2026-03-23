/**
 * ReportesService.gs — Generacion de reportes ejecutivos, por participante y exportacion de datos
 * Plataforma TPT - MSO Chile
 */

/**
 * Genera un reporte ejecutivo en Google Doc con resumen del programa
 * Incluye KPIs, comparacion PRE vs POST, hallazgos y recomendaciones
 * @param {String} token - Token de sesion
 * @param {String} programaId - ID del programa
 * @returns {Object} {success, data: {url}}
 */
function generarReporteEjecutivo(token, programaId) {
  try {
    var sesion = autorizarAccion(token, [ROLES.ADMIN]);

    var programa = findById(HOJAS.PROGRAMAS, programaId);
    if (!programa || programa.activo === false) {
      return respuestaError('Programa no encontrado.');
    }

    // Obtener datos del programa
    var kpisResult = obtenerKPIsPrograma(token, programaId);
    var kpis = kpisResult.success ? kpisResult.data : {};

    var comparacionResult = obtenerComparacionPrePost(token, programaId);
    var comparacion = comparacionResult.success ? comparacionResult.data : [];

    var hallazgosResult = listarHallazgos(token, programaId);
    var hallazgos = hallazgosResult.success ? hallazgosResult.data : [];

    // Obtener nombre del cliente
    var cliente = findById(HOJAS.CLIENTES, programa.cliente_id);
    var clienteNombre = cliente ? cliente.nombre : '';

    // Crear documento
    var doc = DocumentApp.create('Reporte Ejecutivo - ' + programa.nombre + ' - ' + formatearFecha(fechaActual()));
    var body = doc.getBody();

    // Estilo del titulo
    var titulo = body.appendParagraph('REPORTE EJECUTIVO');
    titulo.setHeading(DocumentApp.ParagraphHeading.HEADING1);
    titulo.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    titulo.setForegroundColor('#1B4F72');

    var subtitulo = body.appendParagraph(programa.nombre);
    subtitulo.setHeading(DocumentApp.ParagraphHeading.HEADING2);
    subtitulo.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    subtitulo.setForegroundColor('#2E86C1');

    body.appendParagraph('Cliente: ' + clienteNombre);
    body.appendParagraph('Fecha de generacion: ' + formatearFechaHora(fechaActual()));
    body.appendParagraph('Periodo: ' + formatearFecha(programa.fecha_inicio) + ' - ' + formatearFecha(programa.fecha_termino));
    body.appendParagraph('');

    // Seccion KPIs
    var secKpis = body.appendParagraph('1. INDICADORES CLAVE (KPIs)');
    secKpis.setHeading(DocumentApp.ParagraphHeading.HEADING2);
    secKpis.setForegroundColor('#1B4F72');

    var tablaKpis = body.appendTable();
    var headerKpi = tablaKpis.appendTableRow();
    headerKpi.appendTableCell('Indicador').setBackgroundColor('#1B4F72').getChild(0).asParagraph().editAsText().setForegroundColor('#FFFFFF').setBold(true);
    headerKpi.appendTableCell('Valor').setBackgroundColor('#1B4F72').getChild(0).asParagraph().editAsText().setForegroundColor('#FFFFFF').setBold(true);

    var kpiItems = [
      ['Total Participantes', String(kpis.totalParticipantes || 0)],
      ['Observaciones Realizadas', String(kpis.observacionesRealizadas || 0)],
      ['Tasa Respuesta PRE', (kpis.tasaRespuestaPre || 0) + '%'],
      ['Tasa Respuesta POST', (kpis.tasaRespuestaPost || 0) + '%'],
      ['Nivel de Aplicacion', (kpis.nivelAplicacion || 0) + '%']
    ];

    kpiItems.forEach(function(item) {
      var row = tablaKpis.appendTableRow();
      row.appendTableCell(item[0]);
      row.appendTableCell(item[1]);
    });

    body.appendParagraph('');

    // Seccion Comparacion PRE vs POST
    var secComp = body.appendParagraph('2. COMPARACION PRE vs POST');
    secComp.setHeading(DocumentApp.ParagraphHeading.HEADING2);
    secComp.setForegroundColor('#1B4F72');

    if (comparacion.length > 0) {
      var tablaComp = body.appendTable();
      var headerComp = tablaComp.appendTableRow();
      var headers = ['Conducta', 'Promedio PRE', 'Promedio POST', 'Variacion'];
      headers.forEach(function(h) {
        headerComp.appendTableCell(h).setBackgroundColor('#1B4F72').getChild(0).asParagraph().editAsText().setForegroundColor('#FFFFFF').setBold(true);
      });

      comparacion.forEach(function(c) {
        var row = tablaComp.appendTableRow();
        row.appendTableCell(c.conducta_nombre);
        row.appendTableCell(String(c.promedioPre));
        row.appendTableCell(String(c.promedioPost));
        var variacionCell = row.appendTableCell(c.variacion + '%');
        if (c.variacion > 0) {
          variacionCell.getChild(0).asParagraph().editAsText().setForegroundColor('#27AE60');
        } else if (c.variacion < 0) {
          variacionCell.getChild(0).asParagraph().editAsText().setForegroundColor('#E74C3C');
        }
      });
    } else {
      body.appendParagraph('No hay datos de comparacion PRE vs POST disponibles.');
    }

    body.appendParagraph('');

    // Seccion Hallazgos
    var secHallazgos = body.appendParagraph('3. HALLAZGOS');
    secHallazgos.setHeading(DocumentApp.ParagraphHeading.HEADING2);
    secHallazgos.setForegroundColor('#1B4F72');

    if (hallazgos.length > 0) {
      hallazgos.forEach(function(h, idx) {
        var hTitulo = body.appendParagraph('Hallazgo #' + (idx + 1) + ' [' + h.criticidad.toUpperCase() + ']');
        hTitulo.setHeading(DocumentApp.ParagraphHeading.HEADING3);

        body.appendParagraph('Hallazgo: ' + h.hallazgo);
        body.appendParagraph('Segmento afectado: ' + h.segmento_afectado);
        if (h.conducta_nombre) body.appendParagraph('Conducta: ' + h.conducta_nombre);
        body.appendParagraph('Estado de decision: ' + h.estado_decision);
        if (h.interpretacion) body.appendParagraph('Interpretacion: ' + h.interpretacion);

        // Recomendaciones del hallazgo
        if (h.recomendaciones && h.recomendaciones.length > 0) {
          body.appendParagraph('Recomendaciones:').editAsText().setBold(true);
          h.recomendaciones.forEach(function(r) {
            body.appendListItem(r.recomendacion + ' (Prioridad: ' + r.prioridad + ', Responsable: ' + (r.responsable_sugerido || 'N/A') + ')');
          });
        }

        body.appendParagraph('');
      });
    } else {
      body.appendParagraph('No hay hallazgos registrados para este programa.');
    }

    // Pie
    body.appendParagraph('');
    var pie = body.appendParagraph('Generado por MSO Chile - Plataforma TPT');
    pie.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    pie.setForegroundColor('#718096');

    doc.saveAndClose();

    // Exportar como PDF
    var pdfBlob = DriveApp.getFileById(doc.getId()).getAs('application/pdf');
    var pdfFile = DriveApp.createFile(pdfBlob);
    pdfFile.setName('Reporte_Ejecutivo_' + programa.nombre.replace(/\s+/g, '_') + '.pdf');

    registrarAuditLog(sesion.userId, 'exportar', 'Reporte', programaId, 'Reporte ejecutivo generado');

    return respuestaOk({
      docUrl: doc.getUrl(),
      pdfUrl: pdfFile.getUrl(),
      message: 'Reporte generado exitosamente.'
    });
  } catch (e) {
    return respuestaError(e.message);
  }
}

/**
 * Genera un reporte individual por participante
 * @param {String} token - Token de sesion
 * @param {String} programaId - ID del programa
 * @param {String} userId - ID del participante
 * @returns {Object} {success, data: {url}}
 */
function generarReportePorParticipante(token, programaId, userId) {
  try {
    var sesion = autorizarAccion(token, [ROLES.ADMIN]);

    var programa = findById(HOJAS.PROGRAMAS, programaId);
    if (!programa || programa.activo === false) {
      return respuestaError('Programa no encontrado.');
    }

    var usuario = findById(HOJAS.USUARIOS, userId);
    if (!usuario || usuario.activo === false) {
      return respuestaError('Participante no encontrado.');
    }

    // Encuestas PRE y POST del programa
    var encuestas = findWhere(HOJAS.ENCUESTAS, { programa_id: programaId })
      .filter(function(e) { return e.activo !== false; });

    var encuestaPreId = null;
    var encuestaPostId = null;
    encuestas.forEach(function(e) {
      if (e.tipo === 'pre') encuestaPreId = e.id;
      if (e.tipo === 'post') encuestaPostId = e.id;
    });

    // Respuestas del participante
    var respuestas = findWhere(HOJAS.ENCUESTA_RESPUESTAS, { programa_id: programaId, usuario_id: userId })
      .filter(function(r) { return r.activo !== false && r.estado === 'completada'; });

    var preguntasMap = _obtenerPreguntasMap();

    // Conductas del programa
    var conductas = findWhere(HOJAS.CONDUCTAS_CRITICAS, { programa_id: programaId })
      .filter(function(c) { return c.activo !== false; });
    var conductasMap = {};
    conductas.forEach(function(c) { conductasMap[c.id] = c.nombre; });

    // Calcular promedios por conducta
    var dataPre = {};
    var dataPost = {};
    respuestas.forEach(function(r) {
      var pregunta = preguntasMap[r.pregunta_id];
      if (!pregunta || !pregunta.conducta_id) return;
      var conductaId = pregunta.conducta_id;
      var valor = typeof r.valor_numerico === 'number' ? r.valor_numerico : parseFloat(r.valor_numerico) || 0;

      if (r.encuesta_id === encuestaPreId) {
        if (!dataPre[conductaId]) dataPre[conductaId] = [];
        dataPre[conductaId].push(valor);
      } else if (r.encuesta_id === encuestaPostId) {
        if (!dataPost[conductaId]) dataPost[conductaId] = [];
        dataPost[conductaId].push(valor);
      }
    });

    // Feedback recibido
    var feedbacks = findWhere(HOJAS.FEEDBACK, { programa_id: programaId, participante_id: userId })
      .filter(function(f) { return f.activo !== false; });

    // Observaciones del participante
    var observaciones = findWhere(HOJAS.OBSERVACIONES_JEFATURA, { programa_id: programaId, participante_id: userId })
      .filter(function(o) { return o.activo !== false && o.estado === ESTADOS_OBSERVACION.COMPLETADA; });

    // Crear documento
    var doc = DocumentApp.create('Reporte Individual - ' + usuario.nombre_completo + ' - ' + programa.nombre);
    var body = doc.getBody();

    var titulo = body.appendParagraph('REPORTE INDIVIDUAL');
    titulo.setHeading(DocumentApp.ParagraphHeading.HEADING1);
    titulo.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    titulo.setForegroundColor('#1B4F72');

    body.appendParagraph('Participante: ' + usuario.nombre_completo);
    body.appendParagraph('Cargo: ' + (usuario.cargo || 'N/A'));
    body.appendParagraph('Programa: ' + programa.nombre);
    body.appendParagraph('Fecha: ' + formatearFechaHora(fechaActual()));
    body.appendParagraph('');

    // Resultados PRE vs POST
    var secRes = body.appendParagraph('1. RESULTADOS PRE vs POST');
    secRes.setHeading(DocumentApp.ParagraphHeading.HEADING2);
    secRes.setForegroundColor('#1B4F72');

    if (conductas.length > 0) {
      var tablaRes = body.appendTable();
      var headerRes = tablaRes.appendTableRow();
      ['Conducta', 'PRE', 'POST', 'Variacion'].forEach(function(h) {
        headerRes.appendTableCell(h).setBackgroundColor('#1B4F72').getChild(0).asParagraph().editAsText().setForegroundColor('#FFFFFF').setBold(true);
      });

      conductas.forEach(function(c) {
        var valPre = dataPre[c.id] || [];
        var valPost = dataPost[c.id] || [];
        var promPre = valPre.length > 0 ? valPre.reduce(function(a, b) { return a + b; }, 0) / valPre.length : 0;
        var promPost = valPost.length > 0 ? valPost.reduce(function(a, b) { return a + b; }, 0) / valPost.length : 0;
        var variacion = promPre > 0 ? Math.round(((promPost - promPre) / promPre) * 100) : 0;

        var row = tablaRes.appendTableRow();
        row.appendTableCell(c.nombre);
        row.appendTableCell(String(Math.round(promPre * 100) / 100));
        row.appendTableCell(String(Math.round(promPost * 100) / 100));
        row.appendTableCell(variacion + '%');
      });
    } else {
      body.appendParagraph('No hay conductas definidas.');
    }

    body.appendParagraph('');

    // Observaciones
    var secObs = body.appendParagraph('2. OBSERVACIONES (' + observaciones.length + ')');
    secObs.setHeading(DocumentApp.ParagraphHeading.HEADING2);
    secObs.setForegroundColor('#1B4F72');

    body.appendParagraph('Total observaciones completadas: ' + observaciones.length);
    body.appendParagraph('');

    // Feedback
    var secFeed = body.appendParagraph('3. FEEDBACK RECIBIDO (' + feedbacks.length + ')');
    secFeed.setHeading(DocumentApp.ParagraphHeading.HEADING2);
    secFeed.setForegroundColor('#1B4F72');

    if (feedbacks.length > 0) {
      feedbacks.forEach(function(f, idx) {
        body.appendParagraph('Feedback #' + (idx + 1) + ' (' + formatearFecha(f.fecha_feedback) + ')').editAsText().setBold(true);
        body.appendParagraph('Fortaleza: ' + f.fortaleza);
        body.appendParagraph('Aspecto a reforzar: ' + f.aspecto_reforzar);
        body.appendParagraph('Recomendacion: ' + f.recomendacion);
        body.appendParagraph('');
      });
    } else {
      body.appendParagraph('No hay feedback registrado.');
    }

    // Pie
    body.appendParagraph('');
    var pie = body.appendParagraph('Generado por MSO Chile - Plataforma TPT');
    pie.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    pie.setForegroundColor('#718096');

    doc.saveAndClose();

    // Exportar como PDF
    var pdfBlob = DriveApp.getFileById(doc.getId()).getAs('application/pdf');
    var pdfFile = DriveApp.createFile(pdfBlob);
    pdfFile.setName('Reporte_' + usuario.nombre_completo.replace(/\s+/g, '_') + '_' + programa.nombre.replace(/\s+/g, '_') + '.pdf');

    registrarAuditLog(sesion.userId, 'exportar', 'Reporte', programaId, 'Reporte individual generado para ' + usuario.nombre_completo);

    return respuestaOk({
      docUrl: doc.getUrl(),
      pdfUrl: pdfFile.getUrl(),
      message: 'Reporte generado exitosamente.'
    });
  } catch (e) {
    return respuestaError(e.message);
  }
}

/**
 * Exporta datos crudos del programa a un nuevo Spreadsheet
 * Crea hojas con respuestas de encuestas, observaciones y feedback
 * @param {String} token - Token de sesion
 * @param {String} programaId - ID del programa
 * @returns {Object} {success, data: {url}}
 */
function exportarDatosExcel(token, programaId) {
  try {
    var sesion = autorizarAccion(token, [ROLES.ADMIN]);

    var programa = findById(HOJAS.PROGRAMAS, programaId);
    if (!programa || programa.activo === false) {
      return respuestaError('Programa no encontrado.');
    }

    // Crear nuevo Spreadsheet
    var ss = SpreadsheetApp.create('Datos_' + programa.nombre.replace(/\s+/g, '_') + '_' + formatearFecha(fechaActual()).replace(/\//g, '-'));

    // Mapa de usuarios
    var usuarios = getSheetData(HOJAS.USUARIOS);
    var usuariosMap = {};
    usuarios.forEach(function(u) { usuariosMap[u.id] = u.nombre_completo; });

    // Mapa de conductas
    var conductas = getSheetData(HOJAS.CONDUCTAS_CRITICAS);
    var conductasMap = {};
    conductas.forEach(function(c) { conductasMap[c.id] = c.nombre; });

    // Mapa de encuestas
    var encuestas = findWhere(HOJAS.ENCUESTAS, { programa_id: programaId })
      .filter(function(e) { return e.activo !== false; });
    var encuestasMap = {};
    encuestas.forEach(function(e) { encuestasMap[e.id] = e; });

    // Mapa de preguntas
    var preguntas = getSheetData(HOJAS.ENCUESTA_PREGUNTAS)
      .filter(function(p) { return p.activo !== false; });
    var preguntasMap = {};
    preguntas.forEach(function(p) { preguntasMap[p.id] = p; });

    // ---- Hoja 1: Respuestas de Encuestas ----
    var sheetResp = ss.getActiveSheet();
    sheetResp.setName('Respuestas Encuestas');
    sheetResp.appendRow(['Encuesta', 'Tipo', 'Participante', 'Pregunta', 'Conducta', 'Tipo Respuesta', 'Valor', 'Valor Numerico', 'Fecha']);

    var respuestas = findWhere(HOJAS.ENCUESTA_RESPUESTAS, { programa_id: programaId })
      .filter(function(r) { return r.activo !== false; });

    respuestas.forEach(function(r) {
      var encuesta = encuestasMap[r.encuesta_id] || {};
      var pregunta = preguntasMap[r.pregunta_id] || {};
      sheetResp.appendRow([
        encuesta.nombre || r.encuesta_id,
        encuesta.tipo || '',
        usuariosMap[r.usuario_id] || r.usuario_id,
        pregunta.texto_pregunta || r.pregunta_id,
        conductasMap[pregunta.conducta_id] || '',
        pregunta.tipo_respuesta || '',
        r.valor_respuesta,
        r.valor_numerico,
        r.fecha_respuesta
      ]);
    });

    // Formato encabezado
    var headerRangeResp = sheetResp.getRange(1, 1, 1, 9);
    headerRangeResp.setFontWeight('bold');
    headerRangeResp.setBackground('#1B4F72');
    headerRangeResp.setFontColor('#FFFFFF');

    // ---- Hoja 2: Observaciones ----
    var sheetObs = ss.insertSheet('Observaciones');
    sheetObs.appendRow(['Observador', 'Participante', 'Conducta', 'Tipo Medicion', 'Fecha Observacion', 'Comentario', 'Estado']);

    var observaciones = findWhere(HOJAS.OBSERVACIONES_JEFATURA, { programa_id: programaId })
      .filter(function(o) { return o.activo !== false; });

    observaciones.forEach(function(o) {
      sheetObs.appendRow([
        usuariosMap[o.observador_id] || o.observador_id,
        usuariosMap[o.participante_id] || o.participante_id,
        conductasMap[o.conducta_id] || o.conducta_id,
        o.tipo_medicion,
        o.fecha_observacion,
        o.comentario,
        o.estado
      ]);
    });

    var headerRangeObs = sheetObs.getRange(1, 1, 1, 7);
    headerRangeObs.setFontWeight('bold');
    headerRangeObs.setBackground('#1B4F72');
    headerRangeObs.setFontColor('#FFFFFF');

    // ---- Hoja 3: Feedback ----
    var sheetFeed = ss.insertSheet('Feedback');
    sheetFeed.appendRow(['Jefatura', 'Participante', 'Fortaleza', 'Aspecto a Reforzar', 'Recomendacion', 'Fecha']);

    var feedbacks = findWhere(HOJAS.FEEDBACK, { programa_id: programaId })
      .filter(function(f) { return f.activo !== false; });

    feedbacks.forEach(function(f) {
      sheetFeed.appendRow([
        usuariosMap[f.jefatura_id] || f.jefatura_id,
        usuariosMap[f.participante_id] || f.participante_id,
        f.fortaleza,
        f.aspecto_reforzar,
        f.recomendacion,
        f.fecha_feedback
      ]);
    });

    var headerRangeFeed = sheetFeed.getRange(1, 1, 1, 6);
    headerRangeFeed.setFontWeight('bold');
    headerRangeFeed.setBackground('#1B4F72');
    headerRangeFeed.setFontColor('#FFFFFF');

    registrarAuditLog(sesion.userId, 'exportar', 'DatosExcel', programaId, 'Datos crudos exportados');

    return respuestaOk({
      url: ss.getUrl(),
      message: 'Datos exportados exitosamente.'
    });
  } catch (e) {
    return respuestaError(e.message);
  }
}

/**
 * Lista participantes de un programa (para selector de reporte individual)
 * @param {String} token - Token de sesion
 * @param {String} programaId - ID del programa
 * @returns {Object} {success, data}
 */
function listarParticipantesPrograma(token, programaId) {
  try {
    autorizarAccion(token, [ROLES.ADMIN, ROLES.JEFATURA]);

    var asignaciones = findWhere(HOJAS.PROGRAMA_PARTICIPANTES, { programa_id: programaId })
      .filter(function(a) { return a.activo !== false; });

    var usuarios = getSheetData(HOJAS.USUARIOS);
    var usuariosMap = {};
    usuarios.forEach(function(u) { usuariosMap[u.id] = u; });

    var resultado = asignaciones.map(function(a) {
      var u = usuariosMap[a.usuario_id] || {};
      return {
        id: a.usuario_id,
        nombre: u.nombre_completo || '',
        cargo: u.cargo || '',
        rol_programa: a.rol_programa || ''
      };
    }).filter(function(p) { return !!p.nombre; });

    resultado.sort(function(a, b) { return a.nombre.localeCompare(b.nombre); });

    return respuestaOk(resultado);
  } catch (e) {
    return respuestaError(e.message);
  }
}
