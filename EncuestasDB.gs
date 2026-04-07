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
      tipo_cuestionario: datos.tipo_cuestionario || '',
      instrucciones: datos.instrucciones || '',
      estado: ESTADOS_ENCUESTA.BORRADOR,
      fecha_activacion: '',
      fecha_cierre: datos.fecha_cierre || '',
      fecha_limite: datos.fecha_limite || '',
      creado_por: sesion.userId,
      fecha_creacion: fechaActual(),
      activo: true
    });

    registrarAuditLog(sesion.userId, 'crear', HOJAS.ENCUESTAS, encuestaId, 'Encuesta creada: ' + datos.nombre);
    return respuestaOk({ id: encuestaId, encuestaId: encuestaId, message: 'Encuesta creada.' });
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
    autorizarAccion(token, [ROLES.ADMIN, ROLES.PARTICIPANTE, ROLES.JEFATURA, ROLES.COLABORADOR]);

    var encuesta = findById(HOJAS.ENCUESTAS, encuestaId);
    if (!encuesta || encuesta.activo === false) return respuestaError('Encuesta no encontrada.');

    var preguntas = findWhere(HOJAS.ENCUESTA_PREGUNTAS, { encuesta_id: encuestaId })
      .filter(function(p) { return p.activo !== false; })
      .sort(function(a, b) { return a.orden - b.orden; });

    // Agregar nombres de conducta y competencia
    var conductas = getSheetData(HOJAS.CONDUCTAS_CRITICAS);
    var conductasMap = {};
    conductas.forEach(function(c) { conductasMap[c.id] = c.nombre; });

    var competencias = getSheetData(HOJAS.COMPETENCIAS_PROGRAMA);
    var compMap = {};
    competencias.forEach(function(c) { compMap[c.id] = c; });

    preguntas.forEach(function(p) {
      p.conducta_nombre = conductasMap[p.conducta_id] || '';
      var comp = compMap[p.competencia_id] || {};
      p.competencia_nombre = comp.nombre || '';
      if (!p.foco_desarrollo) p.foco_desarrollo = comp.foco_desarrollo || '';
    });

    // Devolver en ambos formatos para compatibilidad
    encuesta.preguntas = preguntas;
    return respuestaOk({ encuesta: encuesta, preguntas: preguntas });
  } catch (e) {
    return respuestaError(e.message);
  }
}

function actualizarEncuesta(token, encuestaId, datos) {
  try {
    autorizarAccion(token, [ROLES.ADMIN]);
    var cambios = {};
    ['nombre', 'instrucciones', 'fecha_cierre', 'fecha_limite', 'tipo_cuestionario', 'enlace_externo'].forEach(function(c) {
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

    var existentes = findWhere(HOJAS.ENCUESTA_PREGUNTAS, { encuesta_id: datos.encuesta_id })
      .filter(function(p) { return p.activo !== false; });

    var preguntaId = generarId();
    insertRow(HOJAS.ENCUESTA_PREGUNTAS, {
      id: preguntaId,
      encuesta_id: datos.encuesta_id,
      conducta_id: datos.conducta_id || '',
      competencia_id: datos.competencia_id || '',
      texto_pregunta: (datos.texto_pregunta || '').trim(),
      foco_desarrollo: datos.foco_desarrollo || '',
      opcion_nivel_1: datos.opcion_nivel_1 || '',
      opcion_nivel_2: datos.opcion_nivel_2 || '',
      opcion_nivel_3: datos.opcion_nivel_3 || '',
      opcion_nivel_4: datos.opcion_nivel_4 || '',
      tipo_respuesta: datos.tipo_respuesta || 'niveles_competencia',
      obligatoria: datos.obligatoria !== false,
      orden: existentes.length + 1,
      activo: true
    });

    return respuestaOk({ id: preguntaId, preguntaId: preguntaId, message: 'Pregunta agregada.' });
  } catch (e) {
    return respuestaError(e.message);
  }
}

function actualizarPregunta(token, id, datos) {
  try {
    autorizarAccion(token, [ROLES.ADMIN]);
    var cambios = {};
    ['texto_pregunta', 'tipo_respuesta', 'conducta_id', 'competencia_id', 'foco_desarrollo',
     'opcion_nivel_1', 'opcion_nivel_2', 'opcion_nivel_3', 'opcion_nivel_4',
     'obligatoria', 'orden'].forEach(function(c) {
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

function eliminarEncuesta(token, encuestaId) {
  try {
    var sesion = autorizarAccion(token, [ROLES.ADMIN]);
    updateById(HOJAS.ENCUESTAS, encuestaId, { activo: false });
    // Desactivar preguntas asociadas
    var preguntas = findWhere(HOJAS.ENCUESTA_PREGUNTAS, { encuesta_id: encuestaId });
    preguntas.forEach(function(p) { updateById(HOJAS.ENCUESTA_PREGUNTAS, p.id, { activo: false }); });
    registrarAuditLog(sesion.userId, 'eliminar', HOJAS.ENCUESTAS, encuestaId, 'Encuesta eliminada');
    return respuestaOk({ message: 'Encuesta eliminada.' });
  } catch (e) {
    return respuestaError(e.message);
  }
}

// --- Respuestas (participante) ---

function obtenerEncuestaPendiente(token) {
  try {
    var sesion = autorizarAccion(token, [ROLES.PARTICIPANTE, ROLES.JEFATURA, ROLES.COLABORADOR]);

    // Programas del participante (todos los roles)
    var todasAsignaciones = findWhere(HOJAS.PROGRAMA_PARTICIPANTES, { usuario_id: sesion.userId })
      .filter(function(a) { return a.activo !== false; });

    // Mapear roles por programa
    var rolesMap = {};
    todasAsignaciones.forEach(function(a) {
      rolesMap[a.programa_id] = a.rol_programa;
    });

    var programaIds = todasAsignaciones.map(function(a) { return a.programa_id; });

    // Encuestas activas de esos programas
    var encuestas = getSheetData(HOJAS.ENCUESTAS)
      .filter(function(e) {
        return e.activo !== false &&
               e.estado === ESTADOS_ENCUESTA.ACTIVA &&
               programaIds.indexOf(e.programa_id) !== -1;
      });

    // Filtrar segun tipo de cuestionario y rol en el programa
    encuestas = encuestas.filter(function(e) {
      var rolEnProg = rolesMap[e.programa_id] || '';
      if (e.tipo_cuestionario === 'coevaluacion') {
        // Solo colaboradores responden coevaluacion
        return rolEnProg === 'colaborador';
      }
      if (e.tipo_cuestionario === 'autoevaluacion') {
        // Lideres y participantes responden autoevaluacion
        return rolEnProg === 'lider' || rolEnProg === 'participante' || rolEnProg === 'jefatura';
      }
      // Si no tiene tipo_cuestionario definido, mostrar a todos
      return true;
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
    var sesion = autorizarAccion(token, [ROLES.PARTICIPANTE, ROLES.JEFATURA, ROLES.COLABORADOR]);

    var encuesta = findById(HOJAS.ENCUESTAS, encuestaId);
    if (!encuesta || encuesta.estado !== ESTADOS_ENCUESTA.ACTIVA) {
      return respuestaError('Esta encuesta no esta disponible.');
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

// --- Generacion de preguntas desde competencias ---

function generarPreguntasDesdeCompetencias(token, encuestaId) {
  try {
    var sesion = autorizarAccion(token, [ROLES.ADMIN]);

    var encuesta = findById(HOJAS.ENCUESTAS, encuestaId);
    if (!encuesta || encuesta.activo === false) return respuestaError('Encuesta no encontrada.');

    var programaId = encuesta.programa_id;
    var tipoCuestionario = encuesta.tipo_cuestionario || 'autoevaluacion';

    // Obtener competencias del programa
    var competencias = findWhere(HOJAS.COMPETENCIAS_PROGRAMA, { programa_id: programaId })
      .filter(function(c) { return c.activo !== false; });

    if (competencias.length === 0) {
      return respuestaError('No hay competencias asociadas a este programa.');
    }

    var count = 0;
    competencias.forEach(function(comp, index) {
      var textoPregunta = tipoCuestionario === 'coevaluacion'
        ? 'Mi lider habitualmente...'
        : 'Yo habitualmente...';

      var preguntaId = generarId();
      insertRow(HOJAS.ENCUESTA_PREGUNTAS, {
        id: preguntaId,
        encuesta_id: encuestaId,
        conducta_id: '',
        competencia_id: comp.id,
        texto_pregunta: textoPregunta,
        foco_desarrollo: comp.foco_desarrollo || '',
        opcion_nivel_1: comp.nivel_1_texto || '',
        opcion_nivel_2: comp.nivel_2_texto || '',
        opcion_nivel_3: comp.nivel_3_texto || '',
        opcion_nivel_4: comp.nivel_4_texto || '',
        tipo_respuesta: 'niveles_competencia',
        obligatoria: true,
        orden: index + 1,
        activo: true
      });
      count++;
    });

    registrarAuditLog(sesion.userId, 'crear', HOJAS.ENCUESTA_PREGUNTAS, encuestaId, 'Generadas ' + count + ' preguntas desde competencias');
    return respuestaOk({ message: 'Se generaron ' + count + ' preguntas desde competencias.', count: count });
  } catch (e) {
    return respuestaError(e.message);
  }
}

// --- Resultados de encuesta ---

function obtenerResultadosEncuesta(token, encuestaId) {
  try {
    autorizarAccion(token, [ROLES.ADMIN]);

    var encuesta = findById(HOJAS.ENCUESTAS, encuestaId);
    if (!encuesta || encuesta.activo === false) return respuestaError('Encuesta no encontrada.');

    // Obtener preguntas
    var preguntas = findWhere(HOJAS.ENCUESTA_PREGUNTAS, { encuesta_id: encuestaId })
      .filter(function(p) { return p.activo !== false; })
      .sort(function(a, b) { return a.orden - b.orden; });

    // Obtener todas las respuestas de esta encuesta
    var respuestas = findWhere(HOJAS.ENCUESTA_RESPUESTAS, { encuesta_id: encuestaId })
      .filter(function(r) { return r.activo !== false; });

    // Obtener participantes del programa
    var participantes = findWhere(HOJAS.PROGRAMA_PARTICIPANTES, { programa_id: encuesta.programa_id })
      .filter(function(p) { return p.activo !== false; });

    // Mapa de usuarios
    var usuarios = getSheetData(HOJAS.USUARIOS);
    var usuariosMap = {};
    usuarios.forEach(function(u) { usuariosMap[u.id] = u; });

    // Agrupar respuestas por usuario
    var respuestasPorUsuario = {};
    respuestas.forEach(function(r) {
      if (!respuestasPorUsuario[r.usuario_id]) {
        respuestasPorUsuario[r.usuario_id] = [];
      }
      respuestasPorUsuario[r.usuario_id].push(r);
    });

    // Generar resumen de quienes respondieron y quienes no
    var resumen = participantes.map(function(p) {
      var usuario = usuariosMap[p.usuario_id] || {};
      var respondio = respuestasPorUsuario[p.usuario_id] && respuestasPorUsuario[p.usuario_id].length > 0;
      return {
        usuario_id: p.usuario_id,
        nombre_completo: usuario.nombre_completo || '',
        email: usuario.email || '',
        rol_programa: p.rol_programa,
        respondio: respondio,
        cantidad_respuestas: respondio ? respuestasPorUsuario[p.usuario_id].length : 0
      };
    });

    return respuestaOk({
      encuesta: encuesta,
      preguntas: preguntas,
      respuestas_por_usuario: respuestasPorUsuario,
      resumen: resumen,
      total_participantes: participantes.length,
      total_respondieron: resumen.filter(function(r) { return r.respondio; }).length,
      total_pendientes: resumen.filter(function(r) { return !r.respondio; }).length
    });
  } catch (e) {
    return respuestaError(e.message);
  }
}
