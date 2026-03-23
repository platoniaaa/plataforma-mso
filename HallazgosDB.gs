/**
 * HallazgosDB.gs — CRUD de hallazgos y recomendaciones
 * Plataforma TPT - MSO Chile
 */

/**
 * Crea un nuevo hallazgo
 * @param {String} token - Token de sesion
 * @param {Object} datos - {programa_id, conducta_id, hallazgo, segmento_afectado, criticidad, interpretacion, estado_decision}
 * @returns {Object} {success, data}
 */
function crearHallazgo(token, datos) {
  try {
    var sesion = autorizarAccion(token, [ROLES.ADMIN]);

    validarRequerido(datos.programa_id, 'Programa');
    validarRequerido(datos.hallazgo, 'Hallazgo');
    validarRequerido(datos.segmento_afectado, 'Segmento afectado');
    validarRequerido(datos.criticidad, 'Criticidad');
    validarRequerido(datos.estado_decision, 'Estado de decision');

    // Validar criticidad
    var criticidades = ['baja', 'media', 'alta', 'critica'];
    if (criticidades.indexOf(datos.criticidad) === -1) {
      return respuestaError('Criticidad no valida. Opciones: ' + criticidades.join(', '));
    }

    // Validar estado_decision
    var estadosDecision = ['informar', 'monitorear', 'intervenir', 'escalar', 'cerrar'];
    if (estadosDecision.indexOf(datos.estado_decision) === -1) {
      return respuestaError('Estado de decision no valido. Opciones: ' + estadosDecision.join(', '));
    }

    // Validar programa existe
    var programa = findById(HOJAS.PROGRAMAS, datos.programa_id);
    if (!programa || programa.activo === false) {
      return respuestaError('Programa no encontrado.');
    }

    // Validar conducta si se proporciona
    if (datos.conducta_id) {
      var conducta = findById(HOJAS.CONDUCTAS_CRITICAS, datos.conducta_id);
      if (!conducta || conducta.activo === false) {
        return respuestaError('Conducta no encontrada.');
      }
    }

    var lock = LockService.getScriptLock();
    lock.waitLock(10000);

    try {
      var hallazgoId = generarId();
      insertRow(HOJAS.HALLAZGOS, {
        id: hallazgoId,
        programa_id: datos.programa_id,
        conducta_id: datos.conducta_id || '',
        hallazgo: datos.hallazgo.trim(),
        segmento_afectado: datos.segmento_afectado.trim(),
        criticidad: datos.criticidad,
        interpretacion: (datos.interpretacion || '').trim(),
        estado_decision: datos.estado_decision,
        creado_por: sesion.userId,
        fecha_creacion: fechaActual(),
        activo: true
      });
    } finally {
      lock.releaseLock();
    }

    registrarAuditLog(sesion.userId, 'crear', HOJAS.HALLAZGOS, hallazgoId, 'Hallazgo creado');
    return respuestaOk({ hallazgoId: hallazgoId, message: 'Hallazgo creado exitosamente.' });
  } catch (e) {
    return respuestaError(e.message);
  }
}

/**
 * Crea una recomendacion asociada a un hallazgo
 * @param {String} token - Token de sesion
 * @param {Object} datos - {hallazgo_id, recomendacion, conducta_id, prioridad, responsable_sugerido}
 * @returns {Object} {success, data}
 */
function crearRecomendacion(token, datos) {
  try {
    var sesion = autorizarAccion(token, [ROLES.ADMIN]);

    validarRequerido(datos.hallazgo_id, 'Hallazgo');
    validarRequerido(datos.recomendacion, 'Recomendacion');
    validarRequerido(datos.prioridad, 'Prioridad');

    // Validar prioridad
    var prioridades = ['baja', 'media', 'alta'];
    if (prioridades.indexOf(datos.prioridad) === -1) {
      return respuestaError('Prioridad no valida. Opciones: ' + prioridades.join(', '));
    }

    // Validar hallazgo existe
    var hallazgo = findById(HOJAS.HALLAZGOS, datos.hallazgo_id);
    if (!hallazgo || hallazgo.activo === false) {
      return respuestaError('Hallazgo no encontrado.');
    }

    var lock = LockService.getScriptLock();
    lock.waitLock(10000);

    try {
      var recomendacionId = generarId();
      insertRow(HOJAS.RECOMENDACIONES, {
        id: recomendacionId,
        hallazgo_id: datos.hallazgo_id,
        recomendacion: datos.recomendacion.trim(),
        conducta_id: datos.conducta_id || '',
        prioridad: datos.prioridad,
        responsable_sugerido: (datos.responsable_sugerido || '').trim(),
        fecha_creacion: fechaActual(),
        activo: true
      });
    } finally {
      lock.releaseLock();
    }

    registrarAuditLog(sesion.userId, 'crear', HOJAS.RECOMENDACIONES, recomendacionId, 'Recomendacion creada para hallazgo ' + datos.hallazgo_id);
    return respuestaOk({ recomendacionId: recomendacionId, message: 'Recomendacion creada exitosamente.' });
  } catch (e) {
    return respuestaError(e.message);
  }
}

/**
 * Actualiza el estado de decision de un hallazgo
 * @param {String} token - Token de sesion
 * @param {String} hallazgoId - ID del hallazgo
 * @param {String} estado - Nuevo estado de decision
 * @returns {Object} {success, data}
 */
function actualizarEstadoDecision(token, hallazgoId, estado) {
  try {
    var sesion = autorizarAccion(token, [ROLES.ADMIN]);

    var estadosDecision = ['informar', 'monitorear', 'intervenir', 'escalar', 'cerrar'];
    if (estadosDecision.indexOf(estado) === -1) {
      return respuestaError('Estado de decision no valido. Opciones: ' + estadosDecision.join(', '));
    }

    var hallazgo = findById(HOJAS.HALLAZGOS, hallazgoId);
    if (!hallazgo || hallazgo.activo === false) {
      return respuestaError('Hallazgo no encontrado.');
    }

    updateById(HOJAS.HALLAZGOS, hallazgoId, { estado_decision: estado });

    registrarAuditLog(sesion.userId, 'editar', HOJAS.HALLAZGOS, hallazgoId, 'Estado de decision cambiado a: ' + estado);
    return respuestaOk({ message: 'Estado de decision actualizado.' });
  } catch (e) {
    return respuestaError(e.message);
  }
}

/**
 * Lista hallazgos de un programa con recomendaciones anidadas y conducta_nombre resuelto
 * @param {String} token - Token de sesion
 * @param {String} programaId - ID del programa
 * @returns {Object} {success, data}
 */
function listarHallazgos(token, programaId) {
  try {
    autorizarAccion(token, [ROLES.ADMIN]);

    var hallazgos = findWhere(HOJAS.HALLAZGOS, { programa_id: programaId })
      .filter(function(h) { return h.activo !== false; });

    // Cargar conductas para resolver nombres
    var conductas = getSheetData(HOJAS.CONDUCTAS_CRITICAS);
    var conductasMap = {};
    conductas.forEach(function(c) { conductasMap[c.id] = c.nombre; });

    // Cargar todas las recomendaciones activas
    var todasRecomendaciones = getSheetData(HOJAS.RECOMENDACIONES)
      .filter(function(r) { return r.activo !== false; });

    // Agrupar recomendaciones por hallazgo_id
    var recsMap = {};
    todasRecomendaciones.forEach(function(r) {
      if (!recsMap[r.hallazgo_id]) recsMap[r.hallazgo_id] = [];
      r.conducta_nombre = conductasMap[r.conducta_id] || '';
      recsMap[r.hallazgo_id].push(r);
    });

    // Enriquecer hallazgos
    hallazgos.forEach(function(h) {
      h.conducta_nombre = conductasMap[h.conducta_id] || '';
      h.recomendaciones = recsMap[h.id] || [];
    });

    // Ordenar por fecha mas reciente
    hallazgos.sort(function(a, b) {
      return new Date(b.fecha_creacion) - new Date(a.fecha_creacion);
    });

    return respuestaOk(hallazgos);
  } catch (e) {
    return respuestaError(e.message);
  }
}

/**
 * Actualiza campos de un hallazgo
 * @param {String} token - Token de sesion
 * @param {String} id - ID del hallazgo
 * @param {Object} datos - Campos a actualizar
 * @returns {Object} {success, data}
 */
function actualizarHallazgo(token, id, datos) {
  try {
    var sesion = autorizarAccion(token, [ROLES.ADMIN]);

    var hallazgo = findById(HOJAS.HALLAZGOS, id);
    if (!hallazgo || hallazgo.activo === false) {
      return respuestaError('Hallazgo no encontrado.');
    }

    // Validar criticidad si se proporciona
    if (datos.criticidad) {
      var criticidades = ['baja', 'media', 'alta', 'critica'];
      if (criticidades.indexOf(datos.criticidad) === -1) {
        return respuestaError('Criticidad no valida.');
      }
    }

    // Validar estado_decision si se proporciona
    if (datos.estado_decision) {
      var estadosDecision = ['informar', 'monitorear', 'intervenir', 'escalar', 'cerrar'];
      if (estadosDecision.indexOf(datos.estado_decision) === -1) {
        return respuestaError('Estado de decision no valido.');
      }
    }

    var cambios = {};
    ['hallazgo', 'conducta_id', 'segmento_afectado', 'criticidad', 'interpretacion', 'estado_decision'].forEach(function(campo) {
      if (datos[campo] !== undefined) cambios[campo] = datos[campo];
    });

    updateById(HOJAS.HALLAZGOS, id, cambios);

    registrarAuditLog(sesion.userId, 'editar', HOJAS.HALLAZGOS, id, 'Hallazgo actualizado');
    return respuestaOk({ message: 'Hallazgo actualizado exitosamente.' });
  } catch (e) {
    return respuestaError(e.message);
  }
}

/**
 * Elimina logicamente una recomendacion
 * @param {String} token - Token de sesion
 * @param {String} id - ID de la recomendacion
 * @returns {Object} {success, data}
 */
function eliminarRecomendacion(token, id) {
  try {
    var sesion = autorizarAccion(token, [ROLES.ADMIN]);

    var rec = findById(HOJAS.RECOMENDACIONES, id);
    if (!rec || rec.activo === false) {
      return respuestaError('Recomendacion no encontrada.');
    }

    updateById(HOJAS.RECOMENDACIONES, id, { activo: false });

    registrarAuditLog(sesion.userId, 'eliminar', HOJAS.RECOMENDACIONES, id, 'Recomendacion eliminada');
    return respuestaOk({ message: 'Recomendacion eliminada.' });
  } catch (e) {
    return respuestaError(e.message);
  }
}
