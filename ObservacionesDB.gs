/**
 * ObservacionesDB.gs — CRUD de observaciones de jefatura y detalles
 * Plataforma TPT - MSO Chile
 */

/**
 * Crea una observacion completa (estado=completada)
 * @param {String} token - Token de sesion
 * @param {Object} datos - {programaId, conductaId, participanteId, tipoMedicion, detalles[], comentario}
 * @returns {Object} {success, data}
 */
function crearObservacion(token, datos) {
  try {
    var sesion = autorizarAccion(token, [ROLES.JEFATURA]);

    validarRequerido(datos.programaId, 'Programa');
    validarRequerido(datos.conductaId, 'Conducta');
    validarRequerido(datos.participanteId, 'Participante');
    validarRequerido(datos.tipoMedicion, 'Tipo de medicion');

    // Validar tipo de medicion
    if (TIPOS_MEDICION.indexOf(datos.tipoMedicion) === -1) {
      return respuestaError('Tipo de medicion no valido. Opciones: ' + TIPOS_MEDICION.join(', '));
    }

    // Validar que existan detalles
    if (!datos.detalles || datos.detalles.length === 0) {
      return respuestaError('Debe incluir al menos un criterio de observacion.');
    }

    // Validar que la conducta pertenece al programa
    var conducta = findById(HOJAS.CONDUCTAS_CRITICAS, datos.conductaId);
    if (!conducta || conducta.activo === false) {
      return respuestaError('Conducta no encontrada.');
    }
    if (conducta.programa_id !== datos.programaId) {
      return respuestaError('La conducta seleccionada no pertenece a este programa.');
    }

    // Validar que el participante existe y esta activo
    var participante = findById(HOJAS.USUARIOS, datos.participanteId);
    if (!participante || participante.activo === false) {
      return respuestaError('Participante no encontrado.');
    }

    // Validar que todos los criterios obligatorios tengan respuesta
    var criterios = findWhere(HOJAS.CRITERIOS_OBSERVACION, { conducta_id: datos.conductaId })
      .filter(function(c) { return c.activo !== false; });
    var criteriosObligatorios = criterios.filter(function(c) { return c.obligatorio !== false; });

    var respondidos = {};
    datos.detalles.forEach(function(d) { respondidos[d.criterioId] = d.valorRespuesta; });

    for (var i = 0; i < criteriosObligatorios.length; i++) {
      if (respondidos[criteriosObligatorios[i].id] === undefined || respondidos[criteriosObligatorios[i].id] === '') {
        return respuestaError('Todos los criterios obligatorios deben tener respuesta para completar la observacion.');
      }
    }

    // Buscar checklist activo para esta conducta
    var checklists = findWhere(HOJAS.CHECKLISTS, { programa_id: datos.programaId, conducta_id: datos.conductaId })
      .filter(function(cl) { return cl.activo !== false && cl.estado === ESTADOS_ENCUESTA.ACTIVA; });
    var checklistId = checklists.length > 0 ? checklists[0].id : '';
    var tipoRespuesta = checklists.length > 0 ? checklists[0].tipo_respuesta : 'escala_1_5';

    var lock = LockService.getScriptLock();
    lock.waitLock(15000);

    try {
      var observacionId = generarId();
      insertRow(HOJAS.OBSERVACIONES_JEFATURA, {
        id: observacionId,
        checklist_id: checklistId,
        programa_id: datos.programaId,
        conducta_id: datos.conductaId,
        observador_id: sesion.userId,
        participante_id: datos.participanteId,
        tipo_medicion: datos.tipoMedicion,
        fecha_observacion: fechaActual(),
        comentario: datos.comentario || '',
        estado: ESTADOS_OBSERVACION.COMPLETADA,
        fecha_creacion: fechaActual(),
        activo: true
      });

      // Insertar detalles
      datos.detalles.forEach(function(detalle) {
        var valorNum = convertirAValorNumerico(detalle.valorRespuesta, tipoRespuesta);
        insertRow(HOJAS.OBSERVACION_DETALLES, {
          id: generarId(),
          observacion_id: observacionId,
          criterio_id: detalle.criterioId,
          valor_respuesta: String(detalle.valorRespuesta),
          valor_numerico: valorNum,
          activo: true
        });
      });
    } finally {
      lock.releaseLock();
    }

    registrarAuditLog(sesion.userId, 'crear', HOJAS.OBSERVACIONES_JEFATURA, observacionId, 'Observacion completada');
    return respuestaOk({ observacionId: observacionId, message: 'Observacion registrada exitosamente.' });
  } catch (e) {
    return respuestaError(e.message);
  }
}

/**
 * Guarda un borrador de observacion (detalles pueden ser parciales)
 * @param {String} token - Token de sesion
 * @param {Object} datos - {programaId, conductaId, participanteId, tipoMedicion, detalles[], comentario}
 * @returns {Object} {success, data}
 */
function guardarBorrador(token, datos) {
  try {
    var sesion = autorizarAccion(token, [ROLES.JEFATURA]);

    validarRequerido(datos.programaId, 'Programa');
    validarRequerido(datos.conductaId, 'Conducta');
    validarRequerido(datos.participanteId, 'Participante');
    validarRequerido(datos.tipoMedicion, 'Tipo de medicion');

    if (TIPOS_MEDICION.indexOf(datos.tipoMedicion) === -1) {
      return respuestaError('Tipo de medicion no valido. Opciones: ' + TIPOS_MEDICION.join(', '));
    }

    // Validar conducta pertenece al programa
    var conducta = findById(HOJAS.CONDUCTAS_CRITICAS, datos.conductaId);
    if (!conducta || conducta.activo === false) {
      return respuestaError('Conducta no encontrada.');
    }
    if (conducta.programa_id !== datos.programaId) {
      return respuestaError('La conducta seleccionada no pertenece a este programa.');
    }

    // Validar participante
    var participante = findById(HOJAS.USUARIOS, datos.participanteId);
    if (!participante || participante.activo === false) {
      return respuestaError('Participante no encontrado.');
    }

    // Buscar checklist activo
    var checklists = findWhere(HOJAS.CHECKLISTS, { programa_id: datos.programaId, conducta_id: datos.conductaId })
      .filter(function(cl) { return cl.activo !== false && cl.estado === ESTADOS_ENCUESTA.ACTIVA; });
    var checklistId = checklists.length > 0 ? checklists[0].id : '';
    var tipoRespuesta = checklists.length > 0 ? checklists[0].tipo_respuesta : 'escala_1_5';

    var lock = LockService.getScriptLock();
    lock.waitLock(15000);

    try {
      var observacionId = generarId();
      insertRow(HOJAS.OBSERVACIONES_JEFATURA, {
        id: observacionId,
        checklist_id: checklistId,
        programa_id: datos.programaId,
        conducta_id: datos.conductaId,
        observador_id: sesion.userId,
        participante_id: datos.participanteId,
        tipo_medicion: datos.tipoMedicion,
        fecha_observacion: fechaActual(),
        comentario: datos.comentario || '',
        estado: ESTADOS_OBSERVACION.BORRADOR,
        fecha_creacion: fechaActual(),
        activo: true
      });

      // Insertar detalles parciales (si los hay)
      if (datos.detalles && datos.detalles.length > 0) {
        datos.detalles.forEach(function(detalle) {
          var valorNum = convertirAValorNumerico(detalle.valorRespuesta, tipoRespuesta);
          insertRow(HOJAS.OBSERVACION_DETALLES, {
            id: generarId(),
            observacion_id: observacionId,
            criterio_id: detalle.criterioId,
            valor_respuesta: String(detalle.valorRespuesta),
            valor_numerico: valorNum,
            activo: true
          });
        });
      }
    } finally {
      lock.releaseLock();
    }

    registrarAuditLog(sesion.userId, 'crear', HOJAS.OBSERVACIONES_JEFATURA, observacionId, 'Borrador de observacion guardado');
    return respuestaOk({ observacionId: observacionId, message: 'Borrador guardado exitosamente.' });
  } catch (e) {
    return respuestaError(e.message);
  }
}

/**
 * Completa un borrador de observacion
 * @param {String} token - Token de sesion
 * @param {String} observacionId - ID de la observacion borrador
 * @param {Object} datos - {detalles[], comentario}
 * @returns {Object} {success, data}
 */
function completarObservacion(token, observacionId, datos) {
  try {
    var sesion = autorizarAccion(token, [ROLES.JEFATURA]);

    var observacion = findById(HOJAS.OBSERVACIONES_JEFATURA, observacionId);
    if (!observacion || observacion.activo === false) {
      return respuestaError('Observacion no encontrada.');
    }

    if (observacion.estado !== ESTADOS_OBSERVACION.BORRADOR) {
      return respuestaError('Solo se pueden completar observaciones en estado borrador.');
    }

    if (observacion.observador_id !== sesion.userId) {
      return respuestaError('Solo puedes completar tus propias observaciones.');
    }

    // Buscar checklist para obtener tipo de respuesta
    var checklists = findWhere(HOJAS.CHECKLISTS, { programa_id: observacion.programa_id, conducta_id: observacion.conducta_id })
      .filter(function(cl) { return cl.activo !== false; });
    var tipoRespuesta = checklists.length > 0 ? checklists[0].tipo_respuesta : 'escala_1_5';

    // Obtener criterios obligatorios de la conducta
    var criterios = findWhere(HOJAS.CRITERIOS_OBSERVACION, { conducta_id: observacion.conducta_id })
      .filter(function(c) { return c.activo !== false; });
    var criteriosObligatorios = criterios.filter(function(c) { return c.obligatorio !== false; });

    // Obtener detalles existentes del borrador
    var detallesExistentes = findWhere(HOJAS.OBSERVACION_DETALLES, { observacion_id: observacionId })
      .filter(function(d) { return d.activo !== false; });
    var detallesMap = {};
    detallesExistentes.forEach(function(d) { detallesMap[d.criterio_id] = d; });

    // Agregar/actualizar detalles nuevos
    var lock = LockService.getScriptLock();
    lock.waitLock(15000);

    try {
      if (datos.detalles && datos.detalles.length > 0) {
        datos.detalles.forEach(function(detalle) {
          var valorNum = convertirAValorNumerico(detalle.valorRespuesta, tipoRespuesta);
          if (detallesMap[detalle.criterioId]) {
            // Actualizar detalle existente
            updateById(HOJAS.OBSERVACION_DETALLES, detallesMap[detalle.criterioId].id, {
              valor_respuesta: String(detalle.valorRespuesta),
              valor_numerico: valorNum
            });
            detallesMap[detalle.criterioId].valor_respuesta = detalle.valorRespuesta;
          } else {
            // Insertar nuevo detalle
            insertRow(HOJAS.OBSERVACION_DETALLES, {
              id: generarId(),
              observacion_id: observacionId,
              criterio_id: detalle.criterioId,
              valor_respuesta: String(detalle.valorRespuesta),
              valor_numerico: valorNum,
              activo: true
            });
            detallesMap[detalle.criterioId] = { valor_respuesta: detalle.valorRespuesta };
          }
        });
      }

      // Validar que todos los criterios obligatorios tengan respuesta
      for (var i = 0; i < criteriosObligatorios.length; i++) {
        var det = detallesMap[criteriosObligatorios[i].id];
        if (!det || det.valor_respuesta === undefined || det.valor_respuesta === '') {
          return respuestaError('Todos los criterios obligatorios deben tener respuesta para completar la observacion.');
        }
      }

      // Actualizar estado y comentario
      var cambios = { estado: ESTADOS_OBSERVACION.COMPLETADA };
      if (datos.comentario !== undefined) {
        cambios.comentario = datos.comentario;
      }
      updateById(HOJAS.OBSERVACIONES_JEFATURA, observacionId, cambios);
    } finally {
      lock.releaseLock();
    }

    registrarAuditLog(sesion.userId, 'editar', HOJAS.OBSERVACIONES_JEFATURA, observacionId, 'Observacion completada desde borrador');
    return respuestaOk({ message: 'Observacion completada exitosamente.' });
  } catch (e) {
    return respuestaError(e.message);
  }
}

/**
 * Lista observaciones de un programa
 * Admin ve todas, jefatura solo las propias
 * @param {String} token - Token de sesion
 * @param {String} programaId - ID del programa
 * @returns {Object} {success, data}
 */
function listarObservaciones(token, programaId) {
  try {
    var sesion = autorizarAccion(token, [ROLES.ADMIN, ROLES.JEFATURA]);

    var observaciones = findWhere(HOJAS.OBSERVACIONES_JEFATURA, { programa_id: programaId })
      .filter(function(o) { return o.activo !== false; });

    // Jefatura solo ve las propias
    if (sesion.rol === ROLES.JEFATURA) {
      observaciones = observaciones.filter(function(o) {
        return o.observador_id === sesion.userId;
      });
    }

    // Cargar nombres de participantes y conductas
    var usuarios = getSheetData(HOJAS.USUARIOS);
    var usuariosMap = {};
    usuarios.forEach(function(u) { usuariosMap[u.id] = u.nombre_completo; });

    var conductas = getSheetData(HOJAS.CONDUCTAS_CRITICAS);
    var conductasMap = {};
    conductas.forEach(function(c) { conductasMap[c.id] = c.nombre; });

    observaciones.forEach(function(obs) {
      obs.participante_nombre = usuariosMap[obs.participante_id] || '';
      obs.conducta_nombre = conductasMap[obs.conducta_id] || '';
      obs.observador_nombre = usuariosMap[obs.observador_id] || '';
    });

    return respuestaOk(observaciones);
  } catch (e) {
    return respuestaError(e.message);
  }
}

/**
 * Obtiene una observacion completa con sus detalles
 * @param {String} token - Token de sesion
 * @param {String} id - ID de la observacion
 * @returns {Object} {success, data}
 */
function obtenerObservacion(token, id) {
  try {
    var sesion = autorizarAccion(token, [ROLES.ADMIN, ROLES.JEFATURA]);

    var observacion = findById(HOJAS.OBSERVACIONES_JEFATURA, id);
    if (!observacion || observacion.activo === false) {
      return respuestaError('Observacion no encontrada.');
    }

    // Jefatura solo puede ver sus propias observaciones
    if (sesion.rol === ROLES.JEFATURA && observacion.observador_id !== sesion.userId) {
      return respuestaError('No tienes permisos para ver esta observacion.');
    }

    // Cargar detalles
    var detalles = findWhere(HOJAS.OBSERVACION_DETALLES, { observacion_id: id })
      .filter(function(d) { return d.activo !== false; });

    // Cargar nombres de criterios
    var criterios = getSheetData(HOJAS.CRITERIOS_OBSERVACION);
    var criteriosMap = {};
    criterios.forEach(function(c) { criteriosMap[c.id] = c.descripcion; });

    detalles.forEach(function(d) {
      d.criterio_descripcion = criteriosMap[d.criterio_id] || '';
    });

    // Cargar nombre de participante y conducta
    var participante = findById(HOJAS.USUARIOS, observacion.participante_id);
    observacion.participante_nombre = participante ? participante.nombre_completo : '';

    var conducta = findById(HOJAS.CONDUCTAS_CRITICAS, observacion.conducta_id);
    observacion.conducta_nombre = conducta ? conducta.nombre : '';

    var observador = findById(HOJAS.USUARIOS, observacion.observador_id);
    observacion.observador_nombre = observador ? observador.nombre_completo : '';

    observacion.detalles = detalles;

    return respuestaOk(observacion);
  } catch (e) {
    return respuestaError(e.message);
  }
}
