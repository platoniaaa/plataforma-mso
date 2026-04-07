/**
 * CompetenciasDB.gs — CRUD de Competencias del Programa + Importación desde Excel
 * Plataforma TPT - MSO Chile v2.0
 */

/**
 * Lista competencias de un programa
 */
function listarCompetencias(token, programaId) {
  var sesion = autorizarAccion(token, [ROLES.ADMIN, ROLES.JEFATURA, ROLES.PARTICIPANTE]);

  try {
    var competencias = getSheetData(HOJAS.COMPETENCIAS_PROGRAMA)
      .filter(function(c) { return c.programa_id === programaId && c.activo !== false; });

    competencias.sort(function(a, b) { return (a.orden || 0) - (b.orden || 0); });

    return respuestaOk(competencias);
  } catch (e) {
    console.error('Error en listarCompetencias: ' + e.message);
    return respuestaError(e.message);
  }
}

/**
 * Crea una competencia manualmente
 */
function crearCompetencia(token, datos) {
  var sesion = autorizarAccion(token, [ROLES.ADMIN]);

  try {
    validarRequerido(datos.programa_id, 'Programa');
    validarRequerido(datos.nombre, 'Nombre de competencia');

    var existentes = getSheetData(HOJAS.COMPETENCIAS_PROGRAMA)
      .filter(function(c) { return c.programa_id === datos.programa_id && c.activo !== false; });
    var orden = existentes.length + 1;

    var id = generarId();
    insertRow(HOJAS.COMPETENCIAS_PROGRAMA, {
      id: id,
      programa_id: datos.programa_id,
      nombre: datos.nombre.trim(),
      descripcion: datos.descripcion || '',
      foco_desarrollo: datos.foco_desarrollo || '',
      nivel_1_texto: datos.nivel_1_texto || '',
      nivel_2_texto: datos.nivel_2_texto || '',
      nivel_3_texto: datos.nivel_3_texto || '',
      nivel_4_texto: datos.nivel_4_texto || '',
      interpretacion_nivel_1: datos.interpretacion_nivel_1 || '',
      interpretacion_nivel_2: datos.interpretacion_nivel_2 || '',
      interpretacion_nivel_3: datos.interpretacion_nivel_3 || '',
      interpretacion_nivel_4: datos.interpretacion_nivel_4 || '',
      prioridad: datos.prioridad || 1,
      orden: orden,
      activo: true
    });

    registrarAuditLog(sesion.userId, 'crear', HOJAS.COMPETENCIAS_PROGRAMA, id, 'Competencia creada: ' + datos.nombre);

    return respuestaOk({ id: id, message: 'Competencia creada.' });
  } catch (e) {
    console.error('Error en crearCompetencia: ' + e.message);
    return respuestaError(e.message);
  }
}

/**
 * Actualiza una competencia
 */
function actualizarCompetencia(token, id, datos) {
  var sesion = autorizarAccion(token, [ROLES.ADMIN]);

  try {
    var comp = findById(HOJAS.COMPETENCIAS_PROGRAMA, id);
    if (!comp) return respuestaError('Competencia no encontrada.');

    var cambios = {};
    var campos = ['nombre', 'descripcion', 'foco_desarrollo',
      'nivel_1_texto', 'nivel_2_texto', 'nivel_3_texto', 'nivel_4_texto',
      'interpretacion_nivel_1', 'interpretacion_nivel_2', 'interpretacion_nivel_3', 'interpretacion_nivel_4',
      'prioridad', 'orden'];

    campos.forEach(function(campo) {
      if (datos[campo] !== undefined) cambios[campo] = datos[campo];
    });

    updateById(HOJAS.COMPETENCIAS_PROGRAMA, id, cambios);
    registrarAuditLog(sesion.userId, 'actualizar', HOJAS.COMPETENCIAS_PROGRAMA, id, 'Competencia actualizada');

    return respuestaOk({ message: 'Competencia actualizada.' });
  } catch (e) {
    console.error('Error en actualizarCompetencia: ' + e.message);
    return respuestaError(e.message);
  }
}

/**
 * Desactiva una competencia
 */
function desactivarCompetencia(token, id) {
  var sesion = autorizarAccion(token, [ROLES.ADMIN]);

  try {
    updateById(HOJAS.COMPETENCIAS_PROGRAMA, id, { activo: false });
    registrarAuditLog(sesion.userId, 'desactivar', HOJAS.COMPETENCIAS_PROGRAMA, id, 'Competencia desactivada');
    return respuestaOk({ message: 'Competencia eliminada.' });
  } catch (e) {
    console.error('Error en desactivarCompetencia: ' + e.message);
    return respuestaError(e.message);
  }
}

/**
 * Importa competencias desde datos de Excel (parseado en el frontend con SheetJS)
 * @param {String} token
 * @param {String} programaId
 * @param {Array} competenciasData - Array de objetos con las competencias parseadas del Excel
 * @returns {Object}
 */
function importarCompetenciasExcel(token, programaId, competenciasData) {
  var sesion = autorizarAccion(token, [ROLES.ADMIN]);

  try {
    validarRequerido(programaId, 'Programa');
    if (!competenciasData || competenciasData.length === 0) {
      return respuestaError('No se encontraron competencias en el archivo.');
    }

    var lock = LockService.getScriptLock();
    lock.waitLock(15000);

    try {
      // Desactivar competencias existentes del programa
      var existentes = getSheetData(HOJAS.COMPETENCIAS_PROGRAMA)
        .filter(function(c) { return c.programa_id === programaId && c.activo !== false; });
      existentes.forEach(function(c) {
        updateById(HOJAS.COMPETENCIAS_PROGRAMA, c.id, { activo: false });
      });

      // Insertar nuevas
      var ids = [];
      competenciasData.forEach(function(comp, idx) {
        var id = generarId();
        insertRow(HOJAS.COMPETENCIAS_PROGRAMA, {
          id: id,
          programa_id: programaId,
          nombre: (comp.nombre || comp.competencia || '').trim(),
          descripcion: (comp.descripcion || '').trim(),
          foco_desarrollo: (comp.foco_desarrollo || comp.foco || '').trim(),
          nivel_1_texto: (comp.nivel_1_texto || comp.nivel_1 || comp['Nivel 1'] || '').trim(),
          nivel_2_texto: (comp.nivel_2_texto || comp.nivel_2 || comp['Nivel 2'] || '').trim(),
          nivel_3_texto: (comp.nivel_3_texto || comp.nivel_3 || comp['Nivel 3'] || '').trim(),
          nivel_4_texto: (comp.nivel_4_texto || comp.nivel_4 || comp['Nivel 4'] || '').trim(),
          interpretacion_nivel_1: (comp.interpretacion_nivel_1 || comp.interp_1 || '').trim(),
          interpretacion_nivel_2: (comp.interpretacion_nivel_2 || comp.interp_2 || '').trim(),
          interpretacion_nivel_3: (comp.interpretacion_nivel_3 || comp.interp_3 || '').trim(),
          interpretacion_nivel_4: (comp.interpretacion_nivel_4 || comp.interp_4 || '').trim(),
          prioridad: comp.prioridad || 1,
          orden: idx + 1,
          activo: true
        });
        ids.push(id);
      });

      registrarAuditLog(sesion.userId, 'importar', HOJAS.COMPETENCIAS_PROGRAMA, programaId,
        'Importadas ' + ids.length + ' competencias desde Excel');

    } finally {
      lock.releaseLock();
    }

    return respuestaOk({ total: competenciasData.length, message: competenciasData.length + ' competencias importadas.' });
  } catch (e) {
    console.error('Error en importarCompetenciasExcel: ' + e.message);
    return respuestaError(e.message);
  }
}

/**
 * Reordena competencias
 */
function reordenarCompetencias(token, programaId, ordenIds) {
  var sesion = autorizarAccion(token, [ROLES.ADMIN]);

  try {
    for (var i = 0; i < ordenIds.length; i++) {
      updateById(HOJAS.COMPETENCIAS_PROGRAMA, ordenIds[i], { orden: i + 1 });
    }
    return respuestaOk({ message: 'Orden actualizado.' });
  } catch (e) {
    console.error('Error en reordenarCompetencias: ' + e.message);
    return respuestaError(e.message);
  }
}
