/**
 * FeedbackDB.gs — CRUD de feedback de jefatura a participantes
 * Plataforma TPT - MSO Chile
 */

/**
 * Registra un feedback de jefatura hacia un participante
 * @param {String} token - Token de sesion
 * @param {Object} datos - {programaId, participanteId, observacionId, fortaleza, aspecto_reforzar, recomendacion}
 * @returns {Object} {success, data}
 */
function registrarFeedback(token, datos) {
  try {
    var sesion = autorizarAccion(token, [ROLES.JEFATURA]);

    validarRequerido(datos.programaId, 'Programa');
    validarRequerido(datos.participanteId, 'Participante');
    validarRequerido(datos.fortaleza, 'Fortaleza');
    validarRequerido(datos.aspecto_reforzar, 'Aspecto a reforzar');
    validarRequerido(datos.recomendacion, 'Recomendacion');

    // Validar que el programa existe y esta activo
    var programa = findById(HOJAS.PROGRAMAS, datos.programaId);
    if (!programa || programa.activo === false) {
      return respuestaError('Programa no encontrado.');
    }

    // Validar que el participante existe
    var participante = findById(HOJAS.USUARIOS, datos.participanteId);
    if (!participante || participante.activo === false) {
      return respuestaError('Participante no encontrado.');
    }

    // Validar observacion si se proporciona
    if (datos.observacionId) {
      var observacion = findById(HOJAS.OBSERVACIONES_JEFATURA, datos.observacionId);
      if (!observacion || observacion.activo === false) {
        return respuestaError('Observacion no encontrada.');
      }
      if (observacion.observador_id !== sesion.userId) {
        return respuestaError('Solo puedes asociar feedback a tus propias observaciones.');
      }
    }

    var lock = LockService.getScriptLock();
    lock.waitLock(10000);

    try {
      var feedbackId = generarId();
      insertRow(HOJAS.FEEDBACK, {
        id: feedbackId,
        programa_id: datos.programaId,
        observacion_id: datos.observacionId || '',
        jefatura_id: sesion.userId,
        participante_id: datos.participanteId,
        fortaleza: datos.fortaleza.trim(),
        aspecto_reforzar: datos.aspecto_reforzar.trim(),
        recomendacion: datos.recomendacion.trim(),
        fecha_feedback: fechaActual(),
        activo: true
      });

      // Enviar notificacion al participante
      try {
        var jefatura = findById(HOJAS.USUARIOS, sesion.userId);
        var jefaturaNombre = jefatura ? jefatura.nombre_completo : 'Tu jefatura';

        insertRow(HOJAS.NOTIFICACIONES, {
          id: generarId(),
          usuario_id: datos.participanteId,
          tipo: 'feedback_recibido',
          titulo: 'Nuevo feedback recibido',
          mensaje: jefaturaNombre + ' te ha enviado un feedback sobre el programa ' + programa.nombre + '.',
          leida: false,
          email_enviado: false,
          fecha: fechaActual()
        });

        // Enviar email
        MailApp.sendEmail({
          to: participante.email,
          subject: '[MSO TPT] Nuevo feedback recibido',
          htmlBody: '<h3>Has recibido un nuevo feedback</h3>' +
            '<p>Hola ' + participante.nombre_completo + ',</p>' +
            '<p><strong>' + jefaturaNombre + '</strong> te ha enviado un feedback sobre el programa <strong>' + programa.nombre + '</strong>.</p>' +
            '<p>Ingresa a la plataforma para revisarlo.</p>'
        });

        // Marcar notificacion como enviada por email
        // (ya queda registrada arriba con email_enviado: false, se actualiza aqui)
      } catch (notifError) {
        console.error('Error enviando notificacion de feedback: ' + notifError.message);
      }
    } finally {
      lock.releaseLock();
    }

    registrarAuditLog(sesion.userId, 'crear', HOJAS.FEEDBACK, feedbackId, 'Feedback registrado para participante ' + participante.nombre_completo);
    return respuestaOk({ feedbackId: feedbackId, message: 'Feedback registrado exitosamente.' });
  } catch (e) {
    return respuestaError(e.message);
  }
}

/**
 * Lista feedback recibido por el participante autenticado
 * @param {String} token - Token de sesion
 * @returns {Object} {success, data}
 */
function listarFeedbackRecibido(token) {
  try {
    var sesion = autorizarAccion(token, [ROLES.PARTICIPANTE]);

    var feedbacks = findWhere(HOJAS.FEEDBACK, { participante_id: sesion.userId })
      .filter(function(f) { return f.activo !== false; });

    // Cargar nombres de jefatura y programas
    var usuarios = getSheetData(HOJAS.USUARIOS);
    var usuariosMap = {};
    usuarios.forEach(function(u) { usuariosMap[u.id] = u.nombre_completo; });

    var programas = getSheetData(HOJAS.PROGRAMAS);
    var programasMap = {};
    programas.forEach(function(p) { programasMap[p.id] = p.nombre; });

    feedbacks.forEach(function(f) {
      f.jefatura_nombre = usuariosMap[f.jefatura_id] || '';
      f.programa_nombre = programasMap[f.programa_id] || '';
    });

    // Ordenar por fecha mas reciente
    feedbacks.sort(function(a, b) {
      return new Date(b.fecha_feedback) - new Date(a.fecha_feedback);
    });

    return respuestaOk(feedbacks);
  } catch (e) {
    return respuestaError(e.message);
  }
}

/**
 * Lista feedback dado por la jefatura a su equipo, o todos si es admin
 * @param {String} token - Token de sesion
 * @param {String} programaId - ID del programa
 * @returns {Object} {success, data}
 */
function listarFeedbackEquipo(token, programaId) {
  try {
    var sesion = autorizarAccion(token, [ROLES.ADMIN, ROLES.JEFATURA]);

    var feedbacks = findWhere(HOJAS.FEEDBACK, { programa_id: programaId })
      .filter(function(f) { return f.activo !== false; });

    // Jefatura solo ve los feedback que ha dado
    if (sesion.rol === ROLES.JEFATURA) {
      feedbacks = feedbacks.filter(function(f) {
        return f.jefatura_id === sesion.userId;
      });
    }

    // Cargar nombres
    var usuarios = getSheetData(HOJAS.USUARIOS);
    var usuariosMap = {};
    usuarios.forEach(function(u) { usuariosMap[u.id] = u.nombre_completo; });

    feedbacks.forEach(function(f) {
      f.participante_nombre = usuariosMap[f.participante_id] || '';
      f.jefatura_nombre = usuariosMap[f.jefatura_id] || '';
    });

    // Ordenar por fecha mas reciente
    feedbacks.sort(function(a, b) {
      return new Date(b.fecha_feedback) - new Date(a.fecha_feedback);
    });

    return respuestaOk(feedbacks);
  } catch (e) {
    return respuestaError(e.message);
  }
}
