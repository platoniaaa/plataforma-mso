/**
 * EncuestasDB.gs — CRUD de encuestas y preguntas
 * Plataforma TPT - MSO Chile
 */

function crearEncuesta(token, datos) {
  try {
    var sesion = autorizarAccion(token, [ROLES.ADMIN]);
    validarRequerido(datos.programa_id, 'Programa');
    validarRequerido(datos.nombre, 'Nombre de la encuesta');
    validarRequerido(datos.tipo, 'Tipo (pre/post)');

    var encuestaId = generarId();
    insertRow(HOJAS.ENCUESTAS, {
      id: encuestaId,
      programa_id: datos.programa_id,
      nombre: datos.nombre.trim(),
      tipo: datos.tipo,
      instrucciones: datos.instrucciones || '',
      estado: ESTADOS_ENCUESTA.BORRADOR,
      fecha_activacion: '',
      fecha_cierre: datos.fecha_cierre || '',
      creado_por: sesion.userId,
      fecha_creacion: fechaActual(),
      activo: true
    });

    registrarAuditLog(sesion.userId, 'crear', HOJAS.ENCUESTAS, encuestaId, 'Encuesta creada: ' + datos.nombre);
    return respuestaOk({ encuestaId: encuestaId, message: 'Encuesta creada.' });
  } catch (e) {
    return respuestaError(e.message);
  }
}

function listarEncuestas(token, programaId) {
  try {
    autorizarAccion(token, [ROLES.ADMIN]);
    var encuestas = findWhere(HOJAS.ENCUESTAS, { programa_id: programaId })
      .filter(function(e) { return e.activo !== false; });

    // Contar preguntas por encuesta
    var preguntas = getSheetData(HOJAS.ENCUESTA_PREGUNTAS).filter(function(p) { return p.activo !== false; });
    encuestas.forEach(function(enc) {
      enc.num_preguntas = preguntas.filter(function(p) { return p.encuesta_id === enc.id; }).length;
    });

    return respuestaOk(encuestas);
  } catch (e) {
    return respuestaError(e.message);
  }
}

function obtenerEncuestaCompleta(token, encuestaId) {
  try {
    autorizarAccion(token, [ROLES.ADMIN, ROLES.PARTICIPANTE]);

    var encuesta = findById(HOJAS.ENCUESTAS, encuestaId);
    if (!encuesta || encuesta.activo === false) return respuestaError('Encuesta no encontrada.');

    var preguntas = findWhere(HOJAS.ENCUESTA_PREGUNTAS, { encuesta_id: encuestaId })
      .filter(function(p) { return p.activo !== false; })
      .sort(function(a, b) { return a.orden - b.orden; });

    // Agregar nombre de conducta
    var conductas = getSheetData(HOJAS.CONDUCTAS_CRITICAS);
    var conductasMap = {};
    conductas.forEach(function(c) { conductasMap[c.id] = c.nombre; });

    preguntas.forEach(function(p) {
      p.conducta_nombre = conductasMap[p.conducta_id] || '';
    });

    encuesta.preguntas = preguntas;
    return respuestaOk(encuesta);
  } catch (e) {
    return respuestaError(e.message);
  }
}

function actualizarEncuesta(token, encuestaId, datos) {
  try {
    autorizarAccion(token, [ROLES.ADMIN]);
    var cambios = {};
    ['nombre', 'instrucciones', 'fecha_cierre'].forEach(function(c) {
      if (datos[c] !== undefined) cambios[c] = datos[c];
    });
    updateById(HOJAS.ENCUESTAS, encuestaId, cambios);
    return respuestaOk({ message: 'Encuesta actualizada.' });
  } catch (e) {
    return respuestaError(e.message);
  }
}

function agregarPregunta(token, datos) {
  try {
    autorizarAccion(token, [ROLES.ADMIN]);
    validarRequerido(datos.encuesta_id, 'Encuesta');
    validarRequerido(datos.texto_pregunta, 'Texto de la pregunta');
    validarRequerido(datos.tipo_respuesta, 'Tipo de respuesta');
    validarRequerido(datos.conducta_id, 'Conducta asociada');

    var existentes = findWhere(HOJAS.ENCUESTA_PREGUNTAS, { encuesta_id: datos.encuesta_id })
      .filter(function(p) { return p.activo !== false; });

    var preguntaId = generarId();
    insertRow(HOJAS.ENCUESTA_PREGUNTAS, {
      id: preguntaId,
      encuesta_id: datos.encuesta_id,
      conducta_id: datos.conducta_id,
      texto_pregunta: datos.texto_pregunta.trim(),
      tipo_respuesta: datos.tipo_respuesta,
      obligatoria: datos.obligatoria !== false,
      orden: existentes.length + 1,
      activo: true
    });

    return respuestaOk({ preguntaId: preguntaId, message: 'Pregunta agregada.' });
  } catch (e) {
    return respuestaError(e.message);
  }
}

function actualizarPregunta(token, id, datos) {
  try {
    autorizarAccion(token, [ROLES.ADMIN]);
    var cambios = {};
    ['texto_pregunta', 'tipo_respuesta', 'conducta_id', 'obligatoria', 'orden'].forEach(function(c) {
      if (datos[c] !== undefined) cambios[c] = datos[c];
    });
    updateById(HOJAS.ENCUESTA_PREGUNTAS, id, cambios);
    return respuestaOk({ message: 'Pregunta actualizada.' });
  } catch (e) {
    return respuestaError(e.message);
  }
}

function eliminarPregunta(token, id) {
  try {
    autorizarAccion(token, [ROLES.ADMIN]);
    updateById(HOJAS.ENCUESTA_PREGUNTAS, id, { activo: false });
    return respuestaOk({ message: 'Pregunta eliminada.' });
  } catch (e) {
    return respuestaError(e.message);
  }
}

function activarEncuesta(token, encuestaId) {
  try {
    var sesion = autorizarAccion(token, [ROLES.ADMIN]);

    var encuesta = findById(HOJAS.ENCUESTAS, encuestaId);
    if (!encuesta) return respuestaError('Encuesta no encontrada.');

    var preguntas = findWhere(HOJAS.ENCUESTA_PREGUNTAS, { encuesta_id: encuestaId })
      .filter(function(p) { return p.activo !== false; });

    if (preguntas.length === 0) {
      return respuestaError('La encuesta debe tener al menos una pregunta.');
    }

    updateById(HOJAS.ENCUESTAS, encuestaId, {
      estado: ESTADOS_ENCUESTA.ACTIVA,
      fecha_activacion: fechaActual()
    });

    // Notificar participantes del programa
    var participantes = findWhere(HOJAS.PROGRAMA_PARTICIPANTES, { programa_id: encuesta.programa_id })
      .filter(function(p) { return p.activo !== false && p.rol_programa === 'participante'; });

    var usuarios = getSheetData(HOJAS.USUARIOS);
    var usuariosMap = {};
    usuarios.forEach(function(u) { usuariosMap[u.id] = u; });

    participantes.forEach(function(p) {
      var u = usuariosMap[p.usuario_id];
      if (u && u.estado === ESTADOS_USUARIO.ACTIVO) {
        try {
          insertRow(HOJAS.NOTIFICACIONES, {
            id: generarId(),
            usuario_id: u.id,
            tipo: 'encuesta_pendiente',
            titulo: 'Nueva encuesta disponible',
            mensaje: 'Tienes una encuesta pendiente: ' + encuesta.nombre,
            leida: false,
            email_enviado: false,
            fecha: fechaActual()
          });

          MailApp.sendEmail({
            to: u.email,
            subject: '[MSO TPT] Encuesta pendiente: ' + encuesta.nombre,
            htmlBody: '<h3>Tienes una encuesta pendiente</h3>' +
              '<p>Hola ' + u.nombre_completo + ',</p>' +
              '<p>Se ha habilitado la encuesta <strong>' + encuesta.nombre + '</strong>.</p>' +
              '<p>Ingresa a la plataforma para responderla.</p>' +
              (encuesta.fecha_cierre ? '<p>Fecha límite: ' + encuesta.fecha_cierre + '</p>' : '')
          });
        } catch (nErr) { console.error('Error notificación: ' + nErr.message); }
      }
    });

    registrarAuditLog(sesion.userId, 'editar', HOJAS.ENCUESTAS, encuestaId, 'Encuesta activada');
    return respuestaOk({ message: 'Encuesta activada y notificaciones enviadas.' });
  } catch (e) {
    return respuestaError(e.message);
  }
}

function cerrarEncuesta(token, encuestaId) {
  try {
    var sesion = autorizarAccion(token, [ROLES.ADMIN]);
    updateById(HOJAS.ENCUESTAS, encuestaId, { estado: ESTADOS_ENCUESTA.CERRADA, fecha_cierre: fechaActual() });
    registrarAuditLog(sesion.userId, 'editar', HOJAS.ENCUESTAS, encuestaId, 'Encuesta cerrada');
    return respuestaOk({ message: 'Encuesta cerrada.' });
  } catch (e) {
    return respuestaError(e.message);
  }
}

// --- Respuestas (participante) ---

function obtenerEncuestaPendiente(token) {
  try {
    var sesion = autorizarAccion(token, [ROLES.PARTICIPANTE]);

    // Programas del participante
    var asignaciones = findWhere(HOJAS.PROGRAMA_PARTICIPANTES, { usuario_id: sesion.userId })
      .filter(function(a) { return a.activo !== false && a.rol_programa === 'participante'; });

    var programaIds = asignaciones.map(function(a) { return a.programa_id; });

    // Encuestas activas de esos programas
    var encuestas = getSheetData(HOJAS.ENCUESTAS)
      .filter(function(e) {
        return e.activo !== false &&
               e.estado === ESTADOS_ENCUESTA.ACTIVA &&
               programaIds.indexOf(e.programa_id) !== -1;
      });

    // Respuestas existentes
    var respuestas = getSheetData(HOJAS.ENCUESTA_RESPUESTAS)
      .filter(function(r) { return r.usuario_id === sesion.userId && r.estado === 'completada'; });
    var respondidas = respuestas.map(function(r) { return r.encuesta_id; });

    // Filtrar no respondidas
    var pendientes = encuestas.filter(function(e) {
      return respondidas.indexOf(e.id) === -1;
    });

    if (pendientes.length === 0) return respuestaOk(null);

    // Obtener nombre del programa
    var programas = getSheetData(HOJAS.PROGRAMAS);
    var progMap = {};
    programas.forEach(function(p) { progMap[p.id] = p.nombre; });

    var lista = pendientes.map(function(e) {
      return {
        id: e.id,
        nombre: e.nombre,
        tipo: e.tipo,
        instrucciones: e.instrucciones,
        programa_nombre: progMap[e.programa_id] || '',
        programa_id: e.programa_id,
        fecha_cierre: e.fecha_cierre
      };
    });

    return respuestaOk(lista);
  } catch (e) {
    return respuestaError(e.message);
  }
}

function enviarRespuestas(token, encuestaId, respuestas) {
  try {
    var sesion = autorizarAccion(token, [ROLES.PARTICIPANTE]);

    var encuesta = findById(HOJAS.ENCUESTAS, encuestaId);
    if (!encuesta || encuesta.estado !== ESTADOS_ENCUESTA.ACTIVA) {
      return respuestaError('Esta encuesta no está disponible.');
    }

    // Verificar que no haya respondido ya
    var existentes = findWhere(HOJAS.ENCUESTA_RESPUESTAS, {
      encuesta_id: encuestaId,
      usuario_id: sesion.userId,
      estado: 'completada'
    });
    if (existentes.length > 0) {
      return respuestaError('Ya respondiste esta encuesta.');
    }

    // Validar preguntas obligatorias
    var preguntas = findWhere(HOJAS.ENCUESTA_PREGUNTAS, { encuesta_id: encuestaId })
      .filter(function(p) { return p.activo !== false; });

    var obligatorias = preguntas.filter(function(p) { return p.obligatoria !== false; });
    var respondidas = {};
    respuestas.forEach(function(r) { respondidas[r.preguntaId] = r.valor; });

    for (var i = 0; i < obligatorias.length; i++) {
      if (!respondidas[obligatorias[i].id] && respondidas[obligatorias[i].id] !== 0) {
        return respuestaError('Por favor completa todas las preguntas obligatorias antes de enviar.');
      }
    }

    // Guardar respuestas
    var lock = LockService.getScriptLock();
    lock.waitLock(15000);

    try {
      respuestas.forEach(function(r) {
        var pregunta = preguntas.find(function(p) { return p.id === r.preguntaId; });
        var valorNum = pregunta ? convertirAValorNumerico(r.valor, pregunta.tipo_respuesta) : 0;

        insertRow(HOJAS.ENCUESTA_RESPUESTAS, {
          id: generarId(),
          encuesta_id: encuestaId,
          pregunta_id: r.preguntaId,
          usuario_id: sesion.userId,
          programa_id: encuesta.programa_id,
          valor_respuesta: String(r.valor),
          valor_numerico: valorNum,
          fecha_respuesta: fechaActual(),
          estado: 'completada',
          activo: true
        });
      });
    } finally {
      lock.releaseLock();
    }

    registrarAuditLog(sesion.userId, 'crear', HOJAS.ENCUESTA_RESPUESTAS, encuestaId, 'Encuesta respondida');
    return respuestaOk({ message: 'Respuestas enviadas exitosamente.' });
  } catch (e) {
    return respuestaError(e.message);
  }
}
