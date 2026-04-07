/**
 * ReportesService.gs — Generacion de informes individuales, consolidados y exportacion de datos
 * Plataforma TPT - MSO Chile v2.0
 *
 * Calcula brechas entre autoevaluacion y coevaluacion por competencia,
 * genera documentos profesionales en Google Docs y los almacena en Drive.
 */

// ============================================
// HELPER: Calcular resultados de un lider
// ============================================

/**
 * Calcula puntajes auto/co PRE/POST por competencia para un lider.
 * @param {String} programaId - ID del programa
 * @param {String} liderUserId - ID del usuario lider
 * @returns {Object} { competencias: [{competenciaId, nombre, autoPre, autoPost, coPre, coPost, brechaPre, brechaPost}], promedios: {autoPre, autoPost, coPre, coPost, brechaPre, brechaPost}, colaboradorId }
 */
function _calcularResultadosLider(programaId, liderUserId) {
  // Obtener competencias del programa
  var competencias = getSheetData(HOJAS.COMPETENCIAS_PROGRAMA)
    .filter(function(c) { return c.programa_id === programaId && c.activo !== false; })
    .sort(function(a, b) { return (a.orden || 0) - (b.orden || 0); });

  // Obtener colaborador asignado a este lider
  var participantes = getSheetData(HOJAS.PROGRAMA_PARTICIPANTES)
    .filter(function(p) { return p.programa_id === programaId && p.activo !== false; });

  var colaboradorId = null;
  for (var i = 0; i < participantes.length; i++) {
    if (participantes[i].lider_id === liderUserId && participantes[i].rol_programa === ROLES_PROGRAMA.COLABORADOR) {
      colaboradorId = participantes[i].usuario_id;
      break;
    }
  }

  // Obtener encuestas del programa
  var encuestas = getSheetData(HOJAS.ENCUESTAS)
    .filter(function(e) { return e.programa_id === programaId && e.activo !== false; });

  var autoPreEncuestaId = null;
  var autoPostEncuestaId = null;
  var coPreEncuestaId = null;
  var coPostEncuestaId = null;

  encuestas.forEach(function(e) {
    if (e.tipo === 'pre' && e.tipo_cuestionario === 'autoevaluacion') autoPreEncuestaId = e.id;
    if (e.tipo === 'post' && e.tipo_cuestionario === 'autoevaluacion') autoPostEncuestaId = e.id;
    if (e.tipo === 'pre' && e.tipo_cuestionario === 'coevaluacion') coPreEncuestaId = e.id;
    if (e.tipo === 'post' && e.tipo_cuestionario === 'coevaluacion') coPostEncuestaId = e.id;
  });

  // Obtener preguntas de las encuestas, mapeadas por id
  var todasPreguntas = getSheetData(HOJAS.ENCUESTA_PREGUNTAS)
    .filter(function(p) { return p.activo !== false; });
  var preguntasMap = {};
  todasPreguntas.forEach(function(p) { preguntasMap[p.id] = p; });

  // Obtener todas las respuestas del programa
  var todasRespuestas = getSheetData(HOJAS.ENCUESTA_RESPUESTAS)
    .filter(function(r) { return r.programa_id === programaId && r.activo !== false && r.estado === 'completada'; });

  // Filtrar respuestas relevantes
  var autoPreResp = todasRespuestas.filter(function(r) { return r.encuesta_id === autoPreEncuestaId && r.usuario_id === liderUserId; });
  var autoPostResp = todasRespuestas.filter(function(r) { return r.encuesta_id === autoPostEncuestaId && r.usuario_id === liderUserId; });
  var coPreResp = colaboradorId ? todasRespuestas.filter(function(r) { return r.encuesta_id === coPreEncuestaId && r.usuario_id === colaboradorId; }) : [];
  var coPostResp = colaboradorId ? todasRespuestas.filter(function(r) { return r.encuesta_id === coPostEncuestaId && r.usuario_id === colaboradorId; }) : [];

  // Helper: calcular promedio por competencia de un conjunto de respuestas
  function _promediosPorCompetencia(respuestas) {
    var sumas = {};
    var conteos = {};
    respuestas.forEach(function(r) {
      var pregunta = preguntasMap[r.pregunta_id];
      if (!pregunta || !pregunta.competencia_id) return;
      var compId = pregunta.competencia_id;
      var valor = typeof r.valor_numerico === 'number' ? r.valor_numerico : parseFloat(r.valor_numerico) || 0;
      if (!sumas[compId]) { sumas[compId] = 0; conteos[compId] = 0; }
      sumas[compId] += valor;
      conteos[compId] += 1;
    });
    var result = {};
    for (var cid in sumas) {
      result[cid] = conteos[cid] > 0 ? Math.round((sumas[cid] / conteos[cid]) * 100) / 100 : 0;
    }
    return result;
  }

  var autoPrePorComp = _promediosPorCompetencia(autoPreResp);
  var autoPostPorComp = _promediosPorCompetencia(autoPostResp);
  var coPrePorComp = _promediosPorCompetencia(coPreResp);
  var coPostPorComp = _promediosPorCompetencia(coPostResp);

  // Construir resultado por competencia
  var resultados = [];
  var sumaAutoPre = 0, sumaAutoPost = 0, sumaCoPre = 0, sumaCoPost = 0;
  var sumaBrechaPre = 0, sumaBrechaPost = 0;
  var count = competencias.length || 1;

  competencias.forEach(function(comp) {
    var ap = autoPrePorComp[comp.id] || 0;
    var apo = autoPostPorComp[comp.id] || 0;
    var cp = coPrePorComp[comp.id] || 0;
    var cpo = coPostPorComp[comp.id] || 0;
    var brechaPre = Math.round((ap - cp) * 100) / 100;
    var brechaPost = Math.round((apo - cpo) * 100) / 100;

    sumaAutoPre += ap;
    sumaAutoPost += apo;
    sumaCoPre += cp;
    sumaCoPost += cpo;
    sumaBrechaPre += brechaPre;
    sumaBrechaPost += brechaPost;

    // Determinar nivel promedio para interpretacion (basado en autoPost o autoPre)
    var nivelRef = apo > 0 ? apo : ap;
    var nivel = 1;
    if (nivelRef >= 3.5) nivel = 4;
    else if (nivelRef >= 2.5) nivel = 3;
    else if (nivelRef >= 1.5) nivel = 2;

    var interpretacion = '';
    if (nivel === 1) interpretacion = comp.interpretacion_nivel_1 || '';
    else if (nivel === 2) interpretacion = comp.interpretacion_nivel_2 || '';
    else if (nivel === 3) interpretacion = comp.interpretacion_nivel_3 || '';
    else if (nivel === 4) interpretacion = comp.interpretacion_nivel_4 || '';

    resultados.push({
      competenciaId: comp.id,
      nombre: comp.nombre,
      descripcion: comp.descripcion || '',
      focusDesarrollo: comp.foco_desarrollo || '',
      autoPre: ap,
      autoPost: apo,
      coPre: cp,
      coPost: cpo,
      brechaPre: brechaPre,
      brechaPost: brechaPost,
      nivel: nivel,
      interpretacion: interpretacion
    });
  });

  var n = competencias.length > 0 ? competencias.length : 1;

  return {
    competencias: resultados,
    promedios: {
      autoPre: Math.round((sumaAutoPre / n) * 100) / 100,
      autoPost: Math.round((sumaAutoPost / n) * 100) / 100,
      coPre: Math.round((sumaCoPre / n) * 100) / 100,
      coPost: Math.round((sumaCoPost / n) * 100) / 100,
      brechaPre: Math.round((sumaBrechaPre / n) * 100) / 100,
      brechaPost: Math.round((sumaBrechaPost / n) * 100) / 100
    },
    colaboradorId: colaboradorId
  };
}

// ============================================
// INFORME INDIVIDUAL
// ============================================

/**
 * Genera un informe individual para un lider del programa.
 * Calcula brechas auto vs co, PRE vs POST por competencia.
 * Crea Google Doc profesional y lo guarda en Drive.
 * @param {String} token - Token de sesion
 * @param {String} programaId - ID del programa
 * @param {String} liderUserId - ID del usuario lider
 * @returns {Object} {success, data: {url, docUrl, informeId}}
 */
function generarInformeIndividual(token, programaId, liderUserId) {
  try {
    var sesion = autorizarAccion(token, [ROLES.ADMIN, ROLES.JEFATURA]);

    var programa = findById(HOJAS.PROGRAMAS, programaId);
    if (!programa || programa.activo === false) {
      return respuestaError('Programa no encontrado.');
    }

    var lider = findById(HOJAS.USUARIOS, liderUserId);
    if (!lider || lider.activo === false) {
      return respuestaError('Lider no encontrado.');
    }

    var cliente = findById(HOJAS.CLIENTES, programa.cliente_id);
    var clienteNombre = cliente ? cliente.nombre : '';

    // Calcular resultados
    var datos = _calcularResultadosLider(programaId, liderUserId);
    var resultados = datos.competencias;
    var promedios = datos.promedios;

    // Obtener nombre del colaborador
    var colaboradorNombre = '';
    if (datos.colaboradorId) {
      var colaborador = findById(HOJAS.USUARIOS, datos.colaboradorId);
      colaboradorNombre = colaborador ? colaborador.nombre_completo : '';
    }

    // ---- Crear Google Doc ----
    var doc = DocumentApp.create('Informe Individual - ' + lider.nombre_completo);
    var body = doc.getBody();

    // Margenes
    body.setMarginTop(40);
    body.setMarginBottom(40);
    body.setMarginLeft(50);
    body.setMarginRight(50);

    // Titulo principal
    var titulo = body.appendParagraph('INFORME INDIVIDUAL');
    titulo.setHeading(DocumentApp.ParagraphHeading.HEADING1);
    titulo.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    titulo.setForegroundColor(COLORES.PRIMARIO);

    var subTitulo = body.appendParagraph(lider.nombre_completo);
    subTitulo.setHeading(DocumentApp.ParagraphHeading.HEADING2);
    subTitulo.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    subTitulo.setForegroundColor(COLORES.SECUNDARIO);

    body.appendParagraph('');

    // ---- Seccion 1: Antecedentes ----
    var secAntecedentes = body.appendParagraph('1. ANTECEDENTES');
    secAntecedentes.setHeading(DocumentApp.ParagraphHeading.HEADING2);
    secAntecedentes.setForegroundColor(COLORES.PRIMARIO);

    var tablaAntec = body.appendTable();
    var filas = [
      ['Programa', programa.nombre],
      ['Cliente', clienteNombre],
      ['Lider evaluado', lider.nombre_completo],
      ['Cargo', lider.cargo || 'N/A'],
      ['Area', lider.area || 'N/A'],
      ['Colaborador evaluador', colaboradorNombre || 'No asignado'],
      ['Periodo', formatearFecha(programa.fecha_inicio) + ' - ' + formatearFecha(programa.fecha_termino)],
      ['Fecha de generacion', formatearFechaHora(fechaActual())]
    ];

    filas.forEach(function(fila) {
      var row = tablaAntec.appendTableRow();
      var cellLabel = row.appendTableCell(fila[0]);
      cellLabel.setBackgroundColor(COLORES.FONDO_ALT);
      cellLabel.getChild(0).asParagraph().editAsText().setBold(true);
      row.appendTableCell(fila[1]);
    });

    body.appendParagraph('');

    // ---- Seccion 2: Resultados por Competencia ----
    var secResultados = body.appendParagraph('2. RESULTADOS POR COMPETENCIA');
    secResultados.setHeading(DocumentApp.ParagraphHeading.HEADING2);
    secResultados.setForegroundColor(COLORES.PRIMARIO);

    body.appendParagraph('La siguiente tabla muestra los puntajes promedio obtenidos en cada competencia, tanto en autoevaluacion como en coevaluacion, para las mediciones PRE y POST.')
      .setForegroundColor(COLORES.TEXTO);

    body.appendParagraph('');

    var tablaRes = body.appendTable();

    // Header
    var headerRow = tablaRes.appendTableRow();
    var headersRes = ['Competencia', 'Auto PRE', 'Auto POST', 'Co PRE', 'Co POST', 'Brecha PRE', 'Brecha POST'];
    headersRes.forEach(function(h) {
      var cell = headerRow.appendTableCell(h);
      cell.setBackgroundColor(COLORES.PRIMARIO);
      cell.getChild(0).asParagraph().editAsText().setForegroundColor('#FFFFFF').setBold(true);
    });

    // Filas de datos
    resultados.forEach(function(r) {
      var row = tablaRes.appendTableRow();
      row.appendTableCell(r.nombre);
      row.appendTableCell(String(r.autoPre));
      row.appendTableCell(String(r.autoPost));
      row.appendTableCell(String(r.coPre));
      row.appendTableCell(String(r.coPost));

      var cellBrechaPre = row.appendTableCell(String(r.brechaPre));
      if (Math.abs(r.brechaPre) > 0.5) {
        cellBrechaPre.getChild(0).asParagraph().editAsText().setForegroundColor(COLORES.ERROR);
      }

      var cellBrechaPost = row.appendTableCell(String(r.brechaPost));
      if (Math.abs(r.brechaPost) > 0.5) {
        cellBrechaPost.getChild(0).asParagraph().editAsText().setForegroundColor(COLORES.ERROR);
      }
    });

    // Fila de promedios
    var rowProm = tablaRes.appendTableRow();
    var cellProm = rowProm.appendTableCell('PROMEDIO GENERAL');
    cellProm.setBackgroundColor(COLORES.FONDO_ALT);
    cellProm.getChild(0).asParagraph().editAsText().setBold(true);
    rowProm.appendTableCell(String(promedios.autoPre)).setBackgroundColor(COLORES.FONDO_ALT);
    rowProm.appendTableCell(String(promedios.autoPost)).setBackgroundColor(COLORES.FONDO_ALT);
    rowProm.appendTableCell(String(promedios.coPre)).setBackgroundColor(COLORES.FONDO_ALT);
    rowProm.appendTableCell(String(promedios.coPost)).setBackgroundColor(COLORES.FONDO_ALT);
    rowProm.appendTableCell(String(promedios.brechaPre)).setBackgroundColor(COLORES.FONDO_ALT);
    rowProm.appendTableCell(String(promedios.brechaPost)).setBackgroundColor(COLORES.FONDO_ALT);

    body.appendParagraph('');

    // ---- Seccion 3: Analisis de Brecha ----
    var secBrecha = body.appendParagraph('3. ANALISIS DE BRECHA');
    secBrecha.setHeading(DocumentApp.ParagraphHeading.HEADING2);
    secBrecha.setForegroundColor(COLORES.PRIMARIO);

    body.appendParagraph('La brecha se calcula como: Autoevaluacion - Coevaluacion. Valores positivos indican sobreestimacion (el lider se evalua mas alto que su colaborador). Valores negativos indican subestimacion.')
      .setForegroundColor(COLORES.TEXTO);

    body.appendParagraph('');

    resultados.forEach(function(r) {
      var parrafoComp = body.appendParagraph(r.nombre);
      parrafoComp.setHeading(DocumentApp.ParagraphHeading.HEADING3);
      parrafoComp.setForegroundColor(COLORES.SECUNDARIO);

      // Clasificacion de brecha PRE
      var clasificacionPre = _clasificarBrecha(r.brechaPre);
      var clasificacionPost = _clasificarBrecha(r.brechaPost);

      body.appendParagraph('Brecha PRE: ' + r.brechaPre + ' (' + clasificacionPre + ')');
      body.appendParagraph('Brecha POST: ' + r.brechaPost + ' (' + clasificacionPost + ')');

      if (r.interpretacion) {
        body.appendParagraph('Interpretacion (Nivel ' + r.nivel + '): ' + r.interpretacion)
          .editAsText().setItalic(true);
      }

      body.appendParagraph('');
    });

    // ---- Seccion 4: Evolucion PRE-POST ----
    var secEvolucion = body.appendParagraph('4. EVOLUCION PRE - POST');
    secEvolucion.setHeading(DocumentApp.ParagraphHeading.HEADING2);
    secEvolucion.setForegroundColor(COLORES.PRIMARIO);

    body.appendParagraph('Comparacion del cambio entre la medicion PRE y POST, tanto en autoevaluacion como en coevaluacion.')
      .setForegroundColor(COLORES.TEXTO);

    body.appendParagraph('');

    var tablaEvol = body.appendTable();
    var headerEvol = tablaEvol.appendTableRow();
    ['Competencia', 'Delta Auto (POST-PRE)', 'Delta Co (POST-PRE)', 'Delta Brecha'].forEach(function(h) {
      var cell = headerEvol.appendTableCell(h);
      cell.setBackgroundColor(COLORES.PRIMARIO);
      cell.getChild(0).asParagraph().editAsText().setForegroundColor('#FFFFFF').setBold(true);
    });

    resultados.forEach(function(r) {
      var deltaAuto = Math.round((r.autoPost - r.autoPre) * 100) / 100;
      var deltaCo = Math.round((r.coPost - r.coPre) * 100) / 100;
      var deltaBrecha = Math.round((r.brechaPost - r.brechaPre) * 100) / 100;

      var row = tablaEvol.appendTableRow();
      row.appendTableCell(r.nombre);

      var cellDA = row.appendTableCell(String(deltaAuto));
      if (deltaAuto > 0) cellDA.getChild(0).asParagraph().editAsText().setForegroundColor(COLORES.EXITO);
      else if (deltaAuto < 0) cellDA.getChild(0).asParagraph().editAsText().setForegroundColor(COLORES.ERROR);

      var cellDC = row.appendTableCell(String(deltaCo));
      if (deltaCo > 0) cellDC.getChild(0).asParagraph().editAsText().setForegroundColor(COLORES.EXITO);
      else if (deltaCo < 0) cellDC.getChild(0).asParagraph().editAsText().setForegroundColor(COLORES.ERROR);

      row.appendTableCell(String(deltaBrecha));
    });

    body.appendParagraph('');

    // Pie
    var pie = body.appendParagraph('Generado por MSO Chile - Plataforma TPT');
    pie.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    pie.setForegroundColor(COLORES.TEXTO_SEC);

    doc.saveAndClose();

    // Mover a carpeta del programa
    var carpeta = _getCarpetaPrograma(programaId);
    var archivo = DriveApp.getFileById(doc.getId());
    carpeta.addFile(archivo);
    DriveApp.getRootFolder().removeFile(archivo);

    // Registrar en InformesGenerados
    var informeId = generarId();
    insertRow(HOJAS.INFORMES_GENERADOS, {
      id: informeId,
      programa_id: programaId,
      usuario_id: liderUserId,
      tipo_informe: 'individual',
      nombre: 'Informe Individual - ' + lider.nombre_completo,
      drive_file_id: doc.getId(),
      drive_url: doc.getUrl(),
      generado_por: sesion.userId,
      fecha_generacion: fechaActual(),
      activo: true
    });

    registrarAuditLog(sesion.userId, 'crear', 'Informe', informeId, 'Informe individual generado para ' + lider.nombre_completo);

    return respuestaOk({
      url: doc.getUrl(),
      docUrl: doc.getUrl(),
      informeId: informeId,
      message: 'Informe individual generado exitosamente.'
    });
  } catch (e) {
    return respuestaError(e.message);
  }
}

// ============================================
// INFORME CONSOLIDADO
// ============================================

/**
 * Genera un informe consolidado grupal del programa.
 * Incluye promedios grupales, brechas por competencia y clasificacion de lideres.
 * @param {String} token - Token de sesion
 * @param {String} programaId - ID del programa
 * @returns {Object} {success, data: {url, docUrl, informeId}}
 */
function generarInformeConsolidado(token, programaId) {
  try {
    var sesion = autorizarAccion(token, [ROLES.ADMIN]);

    var programa = findById(HOJAS.PROGRAMAS, programaId);
    if (!programa || programa.activo === false) {
      return respuestaError('Programa no encontrado.');
    }

    var cliente = findById(HOJAS.CLIENTES, programa.cliente_id);
    var clienteNombre = cliente ? cliente.nombre : '';

    // Obtener todos los lideres del programa
    var participantes = getSheetData(HOJAS.PROGRAMA_PARTICIPANTES)
      .filter(function(p) { return p.programa_id === programaId && p.activo !== false && p.rol_programa === ROLES_PROGRAMA.LIDER; });

    var usuarios = getSheetData(HOJAS.USUARIOS);
    var usuariosMap = {};
    usuarios.forEach(function(u) { usuariosMap[u.id] = u; });

    // Obtener competencias del programa
    var competencias = getSheetData(HOJAS.COMPETENCIAS_PROGRAMA)
      .filter(function(c) { return c.programa_id === programaId && c.activo !== false; })
      .sort(function(a, b) { return (a.orden || 0) - (b.orden || 0); });

    // Calcular resultados por lider
    var resultadosPorLider = [];
    participantes.forEach(function(p) {
      var lider = usuariosMap[p.usuario_id];
      if (!lider || lider.activo === false) return;
      var res = _calcularResultadosLider(programaId, p.usuario_id);
      resultadosPorLider.push({
        liderId: p.usuario_id,
        nombre: lider.nombre_completo,
        cargo: lider.cargo || '',
        area: lider.area || '',
        competencias: res.competencias,
        promedios: res.promedios,
        colaboradorId: res.colaboradorId
      });
    });

    var totalLideres = resultadosPorLider.length;

    // Calcular promedios grupales por competencia
    var grupalPorCompetencia = [];
    competencias.forEach(function(comp) {
      var sumaAutoPre = 0, sumaAutoPost = 0, sumaCoPre = 0, sumaCoPost = 0;
      var n = 0;

      resultadosPorLider.forEach(function(lider) {
        var compData = null;
        for (var i = 0; i < lider.competencias.length; i++) {
          if (lider.competencias[i].competenciaId === comp.id) {
            compData = lider.competencias[i];
            break;
          }
        }
        if (compData) {
          sumaAutoPre += compData.autoPre;
          sumaAutoPost += compData.autoPost;
          sumaCoPre += compData.coPre;
          sumaCoPost += compData.coPost;
          n++;
        }
      });

      var divisor = n > 0 ? n : 1;
      var promAutoPre = Math.round((sumaAutoPre / divisor) * 100) / 100;
      var promAutoPost = Math.round((sumaAutoPost / divisor) * 100) / 100;
      var promCoPre = Math.round((sumaCoPre / divisor) * 100) / 100;
      var promCoPost = Math.round((sumaCoPost / divisor) * 100) / 100;

      grupalPorCompetencia.push({
        competenciaId: comp.id,
        nombre: comp.nombre,
        autoPre: promAutoPre,
        autoPost: promAutoPost,
        coPre: promCoPre,
        coPost: promCoPost,
        brechaPre: Math.round((promAutoPre - promCoPre) * 100) / 100,
        brechaPost: Math.round((promAutoPost - promCoPost) * 100) / 100
      });
    });

    // Clasificar lideres: Consistente, Sobreestimacion, Subestimacion
    var clasificacionLideres = resultadosPorLider.map(function(lider) {
      var brechaPromedio = lider.promedios.brechaPost !== 0 ? lider.promedios.brechaPost : lider.promedios.brechaPre;
      var clasificacion = 'Consistente';
      if (brechaPromedio > 0.5) clasificacion = 'Sobreestimacion';
      else if (brechaPromedio < -0.5) clasificacion = 'Subestimacion';

      return {
        nombre: lider.nombre,
        cargo: lider.cargo,
        area: lider.area,
        brechaPromedio: brechaPromedio,
        clasificacion: clasificacion,
        autoProm: lider.promedios.autoPost > 0 ? lider.promedios.autoPost : lider.promedios.autoPre,
        coProm: lider.promedios.coPost > 0 ? lider.promedios.coPost : lider.promedios.coPre
      };
    });

    // Cobertura
    var totalColaboradores = resultadosPorLider.filter(function(l) { return !!l.colaboradorId; }).length;

    // ---- Crear Google Doc ----
    var doc = DocumentApp.create('Informe Consolidado - ' + programa.nombre);
    var body = doc.getBody();

    body.setMarginTop(40);
    body.setMarginBottom(40);
    body.setMarginLeft(50);
    body.setMarginRight(50);

    // Titulo
    var titulo = body.appendParagraph('INFORME CONSOLIDADO');
    titulo.setHeading(DocumentApp.ParagraphHeading.HEADING1);
    titulo.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    titulo.setForegroundColor(COLORES.PRIMARIO);

    var subTitulo = body.appendParagraph(programa.nombre);
    subTitulo.setHeading(DocumentApp.ParagraphHeading.HEADING2);
    subTitulo.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    subTitulo.setForegroundColor(COLORES.SECUNDARIO);

    body.appendParagraph('Cliente: ' + clienteNombre);
    body.appendParagraph('Fecha: ' + formatearFechaHora(fechaActual()));
    body.appendParagraph('Periodo: ' + formatearFecha(programa.fecha_inicio) + ' - ' + formatearFecha(programa.fecha_termino));
    body.appendParagraph('');

    // ---- Seccion 1: Cobertura ----
    var secCobertura = body.appendParagraph('1. COBERTURA DE EVALUACION');
    secCobertura.setHeading(DocumentApp.ParagraphHeading.HEADING2);
    secCobertura.setForegroundColor(COLORES.PRIMARIO);

    var tablaCobertura = body.appendTable();
    var coberturaData = [
      ['Total lideres en programa', String(totalLideres)],
      ['Lideres con colaborador asignado', String(totalColaboradores)],
      ['Cobertura coevaluacion', totalLideres > 0 ? String(Math.round((totalColaboradores / totalLideres) * 100)) + '%' : '0%']
    ];

    coberturaData.forEach(function(fila) {
      var row = tablaCobertura.appendTableRow();
      var cellLabel = row.appendTableCell(fila[0]);
      cellLabel.setBackgroundColor(COLORES.FONDO_ALT);
      cellLabel.getChild(0).asParagraph().editAsText().setBold(true);
      row.appendTableCell(fila[1]);
    });

    body.appendParagraph('');

    // ---- Seccion 2: Promedios Autoevaluacion ----
    var secAuto = body.appendParagraph('2. PROMEDIOS AUTOEVALUACION POR COMPETENCIA');
    secAuto.setHeading(DocumentApp.ParagraphHeading.HEADING2);
    secAuto.setForegroundColor(COLORES.PRIMARIO);

    var tablaAuto = body.appendTable();
    var headerAuto = tablaAuto.appendTableRow();
    ['Competencia', 'Promedio PRE', 'Promedio POST', 'Delta'].forEach(function(h) {
      var cell = headerAuto.appendTableCell(h);
      cell.setBackgroundColor(COLORES.PRIMARIO);
      cell.getChild(0).asParagraph().editAsText().setForegroundColor('#FFFFFF').setBold(true);
    });

    grupalPorCompetencia.forEach(function(g) {
      var delta = Math.round((g.autoPost - g.autoPre) * 100) / 100;
      var row = tablaAuto.appendTableRow();
      row.appendTableCell(g.nombre);
      row.appendTableCell(String(g.autoPre));
      row.appendTableCell(String(g.autoPost));
      var cellDelta = row.appendTableCell(String(delta));
      if (delta > 0) cellDelta.getChild(0).asParagraph().editAsText().setForegroundColor(COLORES.EXITO);
      else if (delta < 0) cellDelta.getChild(0).asParagraph().editAsText().setForegroundColor(COLORES.ERROR);
    });

    body.appendParagraph('');

    // ---- Seccion 3: Promedios Coevaluacion ----
    var secCo = body.appendParagraph('3. PROMEDIOS COEVALUACION POR COMPETENCIA');
    secCo.setHeading(DocumentApp.ParagraphHeading.HEADING2);
    secCo.setForegroundColor(COLORES.PRIMARIO);

    var tablaCo = body.appendTable();
    var headerCo = tablaCo.appendTableRow();
    ['Competencia', 'Promedio PRE', 'Promedio POST', 'Delta'].forEach(function(h) {
      var cell = headerCo.appendTableCell(h);
      cell.setBackgroundColor(COLORES.PRIMARIO);
      cell.getChild(0).asParagraph().editAsText().setForegroundColor('#FFFFFF').setBold(true);
    });

    grupalPorCompetencia.forEach(function(g) {
      var delta = Math.round((g.coPost - g.coPre) * 100) / 100;
      var row = tablaCo.appendTableRow();
      row.appendTableCell(g.nombre);
      row.appendTableCell(String(g.coPre));
      row.appendTableCell(String(g.coPost));
      var cellDelta = row.appendTableCell(String(delta));
      if (delta > 0) cellDelta.getChild(0).asParagraph().editAsText().setForegroundColor(COLORES.EXITO);
      else if (delta < 0) cellDelta.getChild(0).asParagraph().editAsText().setForegroundColor(COLORES.ERROR);
    });

    body.appendParagraph('');

    // ---- Seccion 4: Tabla de Brechas Grupales ----
    var secBrechas = body.appendParagraph('4. BRECHAS GRUPALES (AUTO - CO)');
    secBrechas.setHeading(DocumentApp.ParagraphHeading.HEADING2);
    secBrechas.setForegroundColor(COLORES.PRIMARIO);

    body.appendParagraph('Brecha = Promedio Autoevaluacion - Promedio Coevaluacion. Valores positivos indican sobreestimacion grupal.')
      .setForegroundColor(COLORES.TEXTO);

    body.appendParagraph('');

    var tablaBrechas = body.appendTable();
    var headerBrechas = tablaBrechas.appendTableRow();
    ['Competencia', 'Brecha PRE', 'Brecha POST', 'Tendencia'].forEach(function(h) {
      var cell = headerBrechas.appendTableCell(h);
      cell.setBackgroundColor(COLORES.PRIMARIO);
      cell.getChild(0).asParagraph().editAsText().setForegroundColor('#FFFFFF').setBold(true);
    });

    grupalPorCompetencia.forEach(function(g) {
      var tendencia = '';
      if (Math.abs(g.brechaPost) < Math.abs(g.brechaPre)) tendencia = 'Mejora';
      else if (Math.abs(g.brechaPost) > Math.abs(g.brechaPre)) tendencia = 'Deterioro';
      else tendencia = 'Estable';

      var row = tablaBrechas.appendTableRow();
      row.appendTableCell(g.nombre);

      var cellBPre = row.appendTableCell(String(g.brechaPre));
      if (Math.abs(g.brechaPre) > 0.5) cellBPre.getChild(0).asParagraph().editAsText().setForegroundColor(COLORES.ERROR);

      var cellBPost = row.appendTableCell(String(g.brechaPost));
      if (Math.abs(g.brechaPost) > 0.5) cellBPost.getChild(0).asParagraph().editAsText().setForegroundColor(COLORES.ERROR);

      var cellTend = row.appendTableCell(tendencia);
      if (tendencia === 'Mejora') cellTend.getChild(0).asParagraph().editAsText().setForegroundColor(COLORES.EXITO);
      else if (tendencia === 'Deterioro') cellTend.getChild(0).asParagraph().editAsText().setForegroundColor(COLORES.ERROR);
    });

    body.appendParagraph('');

    // ---- Seccion 5: Analisis Individual Resumido ----
    var secIndiv = body.appendParagraph('5. ANALISIS INDIVIDUAL RESUMIDO');
    secIndiv.setHeading(DocumentApp.ParagraphHeading.HEADING2);
    secIndiv.setForegroundColor(COLORES.PRIMARIO);

    body.appendParagraph('Clasificacion: Consistente (|brecha| < 0.5), Sobreestimacion (brecha > 0.5), Subestimacion (brecha < -0.5)')
      .setForegroundColor(COLORES.TEXTO);

    body.appendParagraph('');

    var tablaIndiv = body.appendTable();
    var headerIndiv = tablaIndiv.appendTableRow();
    ['Lider', 'Cargo', 'Area', 'Prom. Auto', 'Prom. Co', 'Brecha', 'Clasificacion'].forEach(function(h) {
      var cell = headerIndiv.appendTableCell(h);
      cell.setBackgroundColor(COLORES.PRIMARIO);
      cell.getChild(0).asParagraph().editAsText().setForegroundColor('#FFFFFF').setBold(true);
    });

    clasificacionLideres.forEach(function(cl) {
      var row = tablaIndiv.appendTableRow();
      row.appendTableCell(cl.nombre);
      row.appendTableCell(cl.cargo);
      row.appendTableCell(cl.area);
      row.appendTableCell(String(cl.autoProm));
      row.appendTableCell(String(cl.coProm));
      row.appendTableCell(String(cl.brechaPromedio));

      var cellClasif = row.appendTableCell(cl.clasificacion);
      if (cl.clasificacion === 'Sobreestimacion') {
        cellClasif.getChild(0).asParagraph().editAsText().setForegroundColor(COLORES.ADVERTENCIA);
      } else if (cl.clasificacion === 'Subestimacion') {
        cellClasif.getChild(0).asParagraph().editAsText().setForegroundColor(COLORES.SECUNDARIO);
      } else {
        cellClasif.getChild(0).asParagraph().editAsText().setForegroundColor(COLORES.EXITO);
      }
    });

    body.appendParagraph('');

    // ---- Seccion 6: Hallazgos Principales ----
    var secHallazgos = body.appendParagraph('6. HALLAZGOS PRINCIPALES');
    secHallazgos.setHeading(DocumentApp.ParagraphHeading.HEADING2);
    secHallazgos.setForegroundColor(COLORES.PRIMARIO);

    // Conteos de clasificacion
    var numConsistente = clasificacionLideres.filter(function(c) { return c.clasificacion === 'Consistente'; }).length;
    var numSobreestimacion = clasificacionLideres.filter(function(c) { return c.clasificacion === 'Sobreestimacion'; }).length;
    var numSubestimacion = clasificacionLideres.filter(function(c) { return c.clasificacion === 'Subestimacion'; }).length;

    body.appendListItem(numConsistente + ' de ' + totalLideres + ' lideres presentan consistencia entre auto y coevaluacion.');
    body.appendListItem(numSobreestimacion + ' lideres presentan sobreestimacion (se evaluan por sobre la percepcion de su colaborador).');
    body.appendListItem(numSubestimacion + ' lideres presentan subestimacion (se evaluan por debajo de la percepcion de su colaborador).');

    // Identificar competencia con mayor brecha
    if (grupalPorCompetencia.length > 0) {
      var maxBrecha = grupalPorCompetencia[0];
      grupalPorCompetencia.forEach(function(g) {
        if (Math.abs(g.brechaPost) > Math.abs(maxBrecha.brechaPost)) maxBrecha = g;
      });
      body.appendListItem('Competencia con mayor brecha grupal POST: ' + maxBrecha.nombre + ' (brecha: ' + maxBrecha.brechaPost + ').');

      // Competencia con mayor mejora
      var mejorMejora = grupalPorCompetencia[0];
      grupalPorCompetencia.forEach(function(g) {
        var mejora = Math.abs(g.brechaPre) - Math.abs(g.brechaPost);
        var mejoraMejor = Math.abs(mejorMejora.brechaPre) - Math.abs(mejorMejora.brechaPost);
        if (mejora > mejoraMejor) mejorMejora = g;
      });
      body.appendListItem('Competencia con mayor reduccion de brecha: ' + mejorMejora.nombre + '.');
    }

    body.appendParagraph('');

    // Pie
    var pie = body.appendParagraph('Generado por MSO Chile - Plataforma TPT');
    pie.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    pie.setForegroundColor(COLORES.TEXTO_SEC);

    doc.saveAndClose();

    // Mover a carpeta del programa
    var carpeta = _getCarpetaPrograma(programaId);
    var archivo = DriveApp.getFileById(doc.getId());
    carpeta.addFile(archivo);
    DriveApp.getRootFolder().removeFile(archivo);

    // Registrar en InformesGenerados
    var informeId = generarId();
    insertRow(HOJAS.INFORMES_GENERADOS, {
      id: informeId,
      programa_id: programaId,
      usuario_id: '',
      tipo_informe: 'consolidado',
      nombre: 'Informe Consolidado - ' + programa.nombre,
      drive_file_id: doc.getId(),
      drive_url: doc.getUrl(),
      generado_por: sesion.userId,
      fecha_generacion: fechaActual(),
      activo: true
    });

    registrarAuditLog(sesion.userId, 'crear', 'Informe', informeId, 'Informe consolidado generado para programa ' + programa.nombre);

    return respuestaOk({
      url: doc.getUrl(),
      docUrl: doc.getUrl(),
      informeId: informeId,
      message: 'Informe consolidado generado exitosamente.'
    });
  } catch (e) {
    return respuestaError(e.message);
  }
}

// ============================================
// EXPORTAR DATOS A EXCEL (SPREADSHEET)
// ============================================

/**
 * Exporta datos crudos del programa a un nuevo Spreadsheet.
 * Crea hojas con respuestas de encuestas segmentadas por tipo.
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

    // Mapas auxiliares
    var usuarios = getSheetData(HOJAS.USUARIOS);
    var usuariosMap = {};
    usuarios.forEach(function(u) { usuariosMap[u.id] = u; });

    var competencias = getSheetData(HOJAS.COMPETENCIAS_PROGRAMA)
      .filter(function(c) { return c.programa_id === programaId && c.activo !== false; });
    var competenciasMap = {};
    competencias.forEach(function(c) { competenciasMap[c.id] = c.nombre; });

    var encuestas = getSheetData(HOJAS.ENCUESTAS)
      .filter(function(e) { return e.programa_id === programaId && e.activo !== false; });
    var encuestasMap = {};
    encuestas.forEach(function(e) { encuestasMap[e.id] = e; });

    var preguntas = getSheetData(HOJAS.ENCUESTA_PREGUNTAS)
      .filter(function(p) { return p.activo !== false; });
    var preguntasMap = {};
    preguntas.forEach(function(p) { preguntasMap[p.id] = p; });

    // ---- Hoja 1: Respuestas ----
    var sheetResp = ss.getActiveSheet();
    sheetResp.setName('Respuestas');
    sheetResp.appendRow(['Encuesta', 'Tipo', 'Tipo Cuestionario', 'Participante', 'Pregunta', 'Competencia', 'Valor', 'Valor Numerico', 'Fecha']);

    var respuestas = getSheetData(HOJAS.ENCUESTA_RESPUESTAS)
      .filter(function(r) { return r.programa_id === programaId && r.activo !== false; });

    respuestas.forEach(function(r) {
      var encuesta = encuestasMap[r.encuesta_id] || {};
      var pregunta = preguntasMap[r.pregunta_id] || {};
      var usr = usuariosMap[r.usuario_id];
      sheetResp.appendRow([
        encuesta.nombre || r.encuesta_id,
        encuesta.tipo || '',
        encuesta.tipo_cuestionario || '',
        usr ? usr.nombre_completo : r.usuario_id,
        pregunta.texto_pregunta || r.pregunta_id,
        competenciasMap[pregunta.competencia_id] || '',
        r.valor_respuesta,
        r.valor_numerico,
        r.fecha_respuesta
      ]);
    });

    var headerRange = sheetResp.getRange(1, 1, 1, 9);
    headerRange.setFontWeight('bold');
    headerRange.setBackground(COLORES.PRIMARIO);
    headerRange.setFontColor('#FFFFFF');

    // ---- Hoja 2: Participantes ----
    var sheetPart = ss.insertSheet('Participantes');
    sheetPart.appendRow(['Nombre', 'Email', 'Cargo', 'Area', 'Rol Programa', 'Lider Asignado']);

    var participantes = getSheetData(HOJAS.PROGRAMA_PARTICIPANTES)
      .filter(function(p) { return p.programa_id === programaId && p.activo !== false; });

    participantes.forEach(function(p) {
      var usr = usuariosMap[p.usuario_id];
      var lider = p.lider_id ? usuariosMap[p.lider_id] : null;
      if (usr) {
        sheetPart.appendRow([
          usr.nombre_completo,
          usr.email,
          usr.cargo || '',
          usr.area || '',
          p.rol_programa || '',
          lider ? lider.nombre_completo : ''
        ]);
      }
    });

    var headerPart = sheetPart.getRange(1, 1, 1, 6);
    headerPart.setFontWeight('bold');
    headerPart.setBackground(COLORES.PRIMARIO);
    headerPart.setFontColor('#FFFFFF');

    // ---- Hoja 3: Resumen por Competencia ----
    var sheetComp = ss.insertSheet('Resumen Competencias');
    sheetComp.appendRow(['Competencia', 'Auto PRE', 'Auto POST', 'Co PRE', 'Co POST', 'Brecha PRE', 'Brecha POST']);

    // Calcular promedios grupales
    var lideresParticipantes = participantes.filter(function(p) { return p.rol_programa === ROLES_PROGRAMA.LIDER; });

    competencias.forEach(function(comp) {
      var sumaAP = 0, sumaAPO = 0, sumaCP = 0, sumaCPO = 0, n = 0;
      lideresParticipantes.forEach(function(lp) {
        var res = _calcularResultadosLider(programaId, lp.usuario_id);
        for (var i = 0; i < res.competencias.length; i++) {
          if (res.competencias[i].competenciaId === comp.id) {
            sumaAP += res.competencias[i].autoPre;
            sumaAPO += res.competencias[i].autoPost;
            sumaCP += res.competencias[i].coPre;
            sumaCPO += res.competencias[i].coPost;
            n++;
            break;
          }
        }
      });
      var d = n > 0 ? n : 1;
      var ap = Math.round((sumaAP / d) * 100) / 100;
      var apo = Math.round((sumaAPO / d) * 100) / 100;
      var cp = Math.round((sumaCP / d) * 100) / 100;
      var cpo = Math.round((sumaCPO / d) * 100) / 100;
      sheetComp.appendRow([comp.nombre, ap, apo, cp, cpo, Math.round((ap - cp) * 100) / 100, Math.round((apo - cpo) * 100) / 100]);
    });

    var headerComp = sheetComp.getRange(1, 1, 1, 7);
    headerComp.setFontWeight('bold');
    headerComp.setBackground(COLORES.PRIMARIO);
    headerComp.setFontColor('#FFFFFF');

    // Mover a carpeta del programa
    var carpeta = _getCarpetaPrograma(programaId);
    var archivoSS = DriveApp.getFileById(ss.getId());
    carpeta.addFile(archivoSS);
    DriveApp.getRootFolder().removeFile(archivoSS);

    // Registrar en InformesGenerados
    var informeId = generarId();
    insertRow(HOJAS.INFORMES_GENERADOS, {
      id: informeId,
      programa_id: programaId,
      usuario_id: '',
      tipo_informe: 'datos_brutos',
      nombre: 'Datos Exportados - ' + programa.nombre,
      drive_file_id: ss.getId(),
      drive_url: ss.getUrl(),
      generado_por: sesion.userId,
      fecha_generacion: fechaActual(),
      activo: true
    });

    registrarAuditLog(sesion.userId, 'exportar', 'DatosExcel', programaId, 'Datos crudos exportados');

    return respuestaOk({
      url: ss.getUrl(),
      informeId: informeId,
      message: 'Datos exportados exitosamente.'
    });
  } catch (e) {
    return respuestaError(e.message);
  }
}

// ============================================
// LISTAR PARTICIPANTES (para selector de informe)
// ============================================

/**
 * Lista participantes de un programa para el selector de reporte individual.
 * @param {String} token - Token de sesion
 * @param {String} programaId - ID del programa
 * @returns {Object} {success, data: [{id, nombre, cargo, rol_programa, area}]}
 */
function listarParticipantesPrograma(token, programaId) {
  try {
    autorizarAccion(token, [ROLES.ADMIN, ROLES.JEFATURA]);

    var asignaciones = getSheetData(HOJAS.PROGRAMA_PARTICIPANTES)
      .filter(function(a) { return a.programa_id === programaId && a.activo !== false; });

    var usuarios = getSheetData(HOJAS.USUARIOS);
    var usuariosMap = {};
    usuarios.forEach(function(u) { usuariosMap[u.id] = u; });

    var resultado = asignaciones.map(function(a) {
      var u = usuariosMap[a.usuario_id] || {};
      return {
        id: a.usuario_id,
        nombre: u.nombre_completo || '',
        cargo: u.cargo || '',
        area: u.area || '',
        rol_programa: a.rol_programa || '',
        lider_id: a.lider_id || ''
      };
    }).filter(function(p) { return !!p.nombre; });

    resultado.sort(function(a, b) { return a.nombre.localeCompare(b.nombre); });

    return respuestaOk(resultado);
  } catch (e) {
    return respuestaError(e.message);
  }
}

// ============================================
// LISTAR INFORMES GENERADOS
// ============================================

/**
 * Lista los informes previamente generados para un programa.
 * @param {String} token - Token de sesion
 * @param {String} programaId - ID del programa
 * @returns {Object} {success, data: [{id, tipo_informe, nombre, drive_url, generado_por_nombre, fecha_generacion}]}
 */
function listarInformesGenerados(token, programaId) {
  try {
    autorizarAccion(token, [ROLES.ADMIN, ROLES.JEFATURA]);

    var informes = getSheetData(HOJAS.INFORMES_GENERADOS)
      .filter(function(inf) { return inf.programa_id === programaId && inf.activo !== false; });

    // Obtener nombres de generadores y usuarios
    var usuarios = getSheetData(HOJAS.USUARIOS);
    var usuariosMap = {};
    usuarios.forEach(function(u) { usuariosMap[u.id] = u; });

    var resultado = informes.map(function(inf) {
      var generador = usuariosMap[inf.generado_por];
      var usuario = inf.usuario_id ? usuariosMap[inf.usuario_id] : null;
      return {
        id: inf.id,
        tipo_informe: inf.tipo_informe,
        nombre: inf.nombre,
        drive_url: inf.drive_url,
        drive_file_id: inf.drive_file_id,
        usuario_nombre: usuario ? usuario.nombre_completo : '',
        generado_por_nombre: generador ? generador.nombre_completo : '',
        fecha_generacion: inf.fecha_generacion
      };
    });

    // Ordenar por fecha descendente
    resultado.sort(function(a, b) {
      return new Date(b.fecha_generacion) - new Date(a.fecha_generacion);
    });

    return respuestaOk(resultado);
  } catch (e) {
    return respuestaError(e.message);
  }
}

// ============================================
// HELPER: Clasificar brecha
// ============================================

/**
 * Clasifica una brecha numerica en texto descriptivo.
 * @param {Number} brecha - Valor de brecha (auto - co)
 * @returns {String} Clasificacion textual
 */
function _clasificarBrecha(brecha) {
  if (Math.abs(brecha) <= 0.5) return 'Consistente';
  if (brecha > 0.5) return 'Sobreestimacion';
  return 'Subestimacion';
}
