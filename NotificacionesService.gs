/**
 * NotificacionesService.gs — Servicio de notificaciones in-app y email
 * Plataforma TPT - MSO Chile
 */

/**
 * Envia una notificacion a un usuario (funcion interna)
 * Inserta en tabla Notificaciones y envia email via MailApp
 * @param {String} userId - ID del usuario destinatario
 * @param {String} tipo - Tipo de notificacion
 * @param {String} titulo - Titulo de la notificacion
 * @param {String} mensaje - Mensaje de la notificacion
 * @returns {String} ID de la notificacion creada
 */
function enviarNotificacion(userId, tipo, titulo, mensaje) {
  try {
    var usuario = findById(HOJAS.USUARIOS, userId);
    if (!usuario || usuario.activo === false) {
      console.error('enviarNotificacion: Usuario no encontrado: ' + userId);
      return null;
    }

    var notifId = generarId();
    var emailEnviado = false;

    insertRow(HOJAS.NOTIFICACIONES, {
      id: notifId,
      usuario_id: userId,
      tipo: tipo,
      titulo: titulo,
      mensaje: mensaje,
      leida: false,
      email_enviado: false,
      fecha: fechaActual()
    });

    // Intentar enviar email
    try {
      MailApp.sendEmail({
        to: usuario.email,
        subject: '[MSO TPT] ' + titulo,
        htmlBody: '<h3>' + titulo + '</h3>' +
          '<p>Hola ' + usuario.nombre_completo + ',</p>' +
          '<p>' + mensaje + '</p>' +
          '<p>Ingresa a la plataforma para mas detalles.</p>'
      });
      emailEnviado = true;
      updateById(HOJAS.NOTIFICACIONES, notifId, { email_enviado: true });
    } catch (emailError) {
      console.error('Error enviando email de notificacion: ' + emailError.message);
    }

    return notifId;
  } catch (e) {
    console.error('Error en enviarNotificacion: ' + e.message);
    return null;
  }
}

/**
 * Obtiene las notificaciones del usuario autenticado
 * @param {String} token - Token de sesion
 * @returns {Object} {success, data}
 */
function obtenerNotificaciones(token) {
  try {
    var sesion = autorizarAccion(token, [ROLES.ADMIN, ROLES.JEFATURA, ROLES.PARTICIPANTE]);

    var notificaciones = findWhere(HOJAS.NOTIFICACIONES, { usuario_id: sesion.userId });

    // Ordenar por fecha mas reciente
    notificaciones.sort(function(a, b) {
      return new Date(b.fecha) - new Date(a.fecha);
    });

    return respuestaOk(notificaciones);
  } catch (e) {
    return respuestaError(e.message);
  }
}

/**
 * Cuenta las notificaciones no leidas del usuario autenticado
 * @param {String} token - Token de sesion
 * @returns {Object} {success, data: {count}}
 */
function contarNotificacionesPendientes(token) {
  try {
    var sesion = autorizarAccion(token, [ROLES.ADMIN, ROLES.JEFATURA, ROLES.PARTICIPANTE]);

    var notificaciones = findWhere(HOJAS.NOTIFICACIONES, { usuario_id: sesion.userId });
    var noLeidas = notificaciones.filter(function(n) {
      return n.leida === false || n.leida === 'false';
    });

    return respuestaOk({ count: noLeidas.length });
  } catch (e) {
    return respuestaError(e.message);
  }
}

/**
 * Marca una notificacion como leida
 * @param {String} token - Token de sesion
 * @param {String} notifId - ID de la notificacion
 * @returns {Object} {success, data}
 */
function marcarComoLeida(token, notifId) {
  try {
    var sesion = autorizarAccion(token, [ROLES.ADMIN, ROLES.JEFATURA, ROLES.PARTICIPANTE]);

    var notificacion = findById(HOJAS.NOTIFICACIONES, notifId);
    if (!notificacion) {
      return respuestaError('Notificacion no encontrada.');
    }

    // Verificar que la notificacion pertenece al usuario
    if (notificacion.usuario_id !== sesion.userId) {
      return respuestaError('No tienes permisos para modificar esta notificacion.');
    }

    updateById(HOJAS.NOTIFICACIONES, notifId, { leida: true });

    return respuestaOk({ message: 'Notificacion marcada como leida.' });
  } catch (e) {
    return respuestaError(e.message);
  }
}

/**
 * Envia recordatorios a participantes con encuestas pendientes
 * Funcion para ejecutar con trigger diario (sin parametros)
 */
function enviarRecordatorios() {
  try {
    // Obtener encuestas activas
    var encuestas = getSheetData(HOJAS.ENCUESTAS)
      .filter(function(e) {
        return e.activo !== false && e.estado === ESTADOS_ENCUESTA.ACTIVA;
      });

    if (encuestas.length === 0) return;

    // Obtener todas las respuestas completadas
    var respuestasCompletadas = getSheetData(HOJAS.ENCUESTA_RESPUESTAS)
      .filter(function(r) { return r.estado === 'completada'; });

    // Mapear encuestas respondidas por usuario: { encuesta_id + '|' + usuario_id: true }
    var respondidaMap = {};
    respuestasCompletadas.forEach(function(r) {
      respondidaMap[r.encuesta_id + '|' + r.usuario_id] = true;
    });

    // Obtener todos los participantes de programas
    var participantes = getSheetData(HOJAS.PROGRAMA_PARTICIPANTES)
      .filter(function(p) { return p.activo !== false && p.rol_programa === 'participante'; });

    // Obtener usuarios activos
    var usuarios = getSheetData(HOJAS.USUARIOS);
    var usuariosMap = {};
    usuarios.forEach(function(u) { usuariosMap[u.id] = u; });

    var programasMap = {};
    var programas = getSheetData(HOJAS.PROGRAMAS);
    programas.forEach(function(p) { programasMap[p.id] = p.nombre; });

    var recordatoriosEnviados = 0;

    encuestas.forEach(function(encuesta) {
      // Obtener participantes del programa de esta encuesta
      var participantesPrograma = participantes.filter(function(p) {
        return p.programa_id === encuesta.programa_id;
      });

      participantesPrograma.forEach(function(pp) {
        var clave = encuesta.id + '|' + pp.usuario_id;

        // Si no ha respondido, enviar recordatorio
        if (!respondidaMap[clave]) {
          var usuario = usuariosMap[pp.usuario_id];
          if (usuario && usuario.estado === ESTADOS_USUARIO.ACTIVO) {
            try {
              // Verificar que no se haya enviado recordatorio hoy
              var hoy = new Date();
              var inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).toISOString();

              var notificacionesHoy = findWhere(HOJAS.NOTIFICACIONES, {
                usuario_id: pp.usuario_id,
                tipo: 'recordatorio_encuesta'
              }).filter(function(n) {
                return n.fecha >= inicioHoy;
              });

              if (notificacionesHoy.length === 0) {
                var programaNombre = programasMap[encuesta.programa_id] || '';
                enviarNotificacion(
                  pp.usuario_id,
                  'recordatorio_encuesta',
                  'Recordatorio: Encuesta pendiente',
                  'Tienes pendiente responder la encuesta "' + encuesta.nombre + '" del programa ' + programaNombre + '. Por favor ingresa a la plataforma para completarla.'
                );
                recordatoriosEnviados++;
              }
            } catch (nErr) {
              console.error('Error enviando recordatorio a ' + usuario.email + ': ' + nErr.message);
            }
          }
        }
      });
    });

    console.log('Recordatorios enviados: ' + recordatoriosEnviados);
  } catch (e) {
    console.error('Error en enviarRecordatorios: ' + e.message);
  }
}
