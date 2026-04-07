/**
 * CronogramaDB.gs — CRUD de Cronograma/Hitos del Programa + Importación Gantt
 * Plataforma TPT - MSO Chile v2.0
 */

/**
 * Lista hitos del cronograma de un programa
 */
function listarCronograma(token, programaId) {
  var sesion = autorizarAccion(token, [ROLES.ADMIN, ROLES.JEFATURA, ROLES.PARTICIPANTE]);

  try {
    var hitos = getSheetData(HOJAS.CRONOGRAMA_PROGRAMA)
      .filter(function(h) { return h.programa_id === programaId && h.activo !== false; });

    hitos.sort(function(a, b) { return (a.orden || 0) - (b.orden || 0); });

    // Agrupar por fase
    var fases = {};
    hitos.forEach(function(h) {
      var fase = h.fase || 'Sin fase';
      if (!fases[fase]) fases[fase] = [];
      fases[fase].push(h);
    });

    return respuestaOk({ hitos: hitos, fases: fases });
  } catch (e) {
    console.error('Error en listarCronograma: ' + e.message);
    return respuestaError(e.message);
  }
}

/**
 * Crea un hito en el cronograma
 */
function crearHito(token, datos) {
  var sesion = autorizarAccion(token, [ROLES.ADMIN]);

  try {
    validarRequerido(datos.programa_id, 'Programa');
    validarRequerido(datos.nombre_hito, 'Nombre del hito');

    var existentes = getSheetData(HOJAS.CRONOGRAMA_PROGRAMA)
      .filter(function(h) { return h.programa_id === datos.programa_id && h.activo !== false; });

    var id = generarId();
    insertRow(HOJAS.CRONOGRAMA_PROGRAMA, {
      id: id,
      programa_id: datos.programa_id,
      fase: datos.fase || '',
      nombre_hito: datos.nombre_hito.trim(),
      fecha_inicio: datos.fecha_inicio || '',
      fecha_fin: datos.fecha_fin || '',
      responsable: datos.responsable || '',
      estado: datos.estado || ESTADOS_HITO.PENDIENTE,
      orden: existentes.length + 1,
      activo: true
    });

    return respuestaOk({ id: id, message: 'Hito creado.' });
  } catch (e) {
    console.error('Error en crearHito: ' + e.message);
    return respuestaError(e.message);
  }
}

/**
 * Actualiza un hito
 */
function actualizarHito(token, id, datos) {
  var sesion = autorizarAccion(token, [ROLES.ADMIN]);

  try {
    var cambios = {};
    ['fase', 'nombre_hito', 'fecha_inicio', 'fecha_fin', 'responsable', 'estado', 'orden'].forEach(function(c) {
      if (datos[c] !== undefined) cambios[c] = datos[c];
    });
    updateById(HOJAS.CRONOGRAMA_PROGRAMA, id, cambios);
    return respuestaOk({ message: 'Hito actualizado.' });
  } catch (e) {
    console.error('Error en actualizarHito: ' + e.message);
    return respuestaError(e.message);
  }
}

/**
 * Elimina un hito
 */
function eliminarHito(token, id) {
  var sesion = autorizarAccion(token, [ROLES.ADMIN]);

  try {
    updateById(HOJAS.CRONOGRAMA_PROGRAMA, id, { activo: false });
    return respuestaOk({ message: 'Hito eliminado.' });
  } catch (e) {
    console.error('Error en eliminarHito: ' + e.message);
    return respuestaError(e.message);
  }
}

/**
 * Importa cronograma desde datos de Gantt Excel (parseado en frontend con SheetJS)
 */
function importarCronogramaExcel(token, programaId, hitosData) {
  var sesion = autorizarAccion(token, [ROLES.ADMIN]);

  try {
    validarRequerido(programaId, 'Programa');
    if (!hitosData || hitosData.length === 0) {
      return respuestaError('No se encontraron hitos en el archivo.');
    }

    var lock = LockService.getScriptLock();
    lock.waitLock(15000);

    try {
      // Desactivar hitos existentes
      var existentes = getSheetData(HOJAS.CRONOGRAMA_PROGRAMA)
        .filter(function(h) { return h.programa_id === programaId && h.activo !== false; });
      existentes.forEach(function(h) {
        updateById(HOJAS.CRONOGRAMA_PROGRAMA, h.id, { activo: false });
      });

      // Insertar nuevos
      hitosData.forEach(function(hito, idx) {
        insertRow(HOJAS.CRONOGRAMA_PROGRAMA, {
          id: generarId(),
          programa_id: programaId,
          fase: (hito.fase || '').trim(),
          nombre_hito: (hito.nombre_hito || hito.actividad || hito.nombre || '').trim(),
          fecha_inicio: hito.fecha_inicio || hito.fecha || '',
          fecha_fin: hito.fecha_fin || '',
          responsable: hito.responsable || '',
          estado: ESTADOS_HITO.PENDIENTE,
          orden: idx + 1,
          activo: true
        });
      });

      registrarAuditLog(sesion.userId, 'importar', HOJAS.CRONOGRAMA_PROGRAMA, programaId,
        'Importados ' + hitosData.length + ' hitos desde Gantt Excel');

    } finally {
      lock.releaseLock();
    }

    return respuestaOk({ total: hitosData.length, message: hitosData.length + ' hitos importados.' });
  } catch (e) {
    console.error('Error en importarCronogramaExcel: ' + e.message);
    return respuestaError(e.message);
  }
}
