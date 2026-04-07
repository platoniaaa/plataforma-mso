/**
 * DashboardService.gs — Backend para KPIs y datos del dashboard
 * Plataforma TPT - MSO Chile
 */

// ============================================
// HELPERS INTERNOS
// ============================================

/**
 * Obtiene los participantes de un programa filtrados segun rol del usuario
 * @param {Object} sesion - Datos de sesion
 * @param {String} programaId - ID del programa
 * @returns {Array} participantes filtrados
 */
function _obtenerParticipantesFiltrados(sesion, programaId) {
  var participantes = findWhere(HOJAS.PROGRAMA_PARTICIPANTES, { programa_id: programaId })
    .filter(function(p) { return p.activo !== false; });

  if (sesion.rol === ROLES.JEFATURA) {
    // Jefatura solo ve participantes cuyo jefatura_id coincide con su userId
    var usuarios = getSheetData(HOJAS.USUARIOS);
    var idsEquipo = [];
    usuarios.forEach(function(u) {
      if (u.jefatura_id === sesion.userId && u.activo !== false) {
        idsEquipo.push(u.id);
      }
    });
    participantes = participantes.filter(function(p) {
      return idsEquipo.indexOf(p.usuario_id) !== -1;
    });
  } else if (sesion.rol === ROLES.PARTICIPANTE) {
    participantes = participantes.filter(function(p) {
      return p.usuario_id === sesion.userId;
    });
  }

  return participantes;
}

/**
 * Obtiene el mapa de encuestas por programa con su tipo (pre/post)
 */
function _obtenerEncuestasMap(programaId) {
  var encuestas = findWhere(HOJAS.ENCUESTAS, { programa_id: programaId })
    .filter(function(e) { return e.activo !== false; });
  var map = {};
  encuestas.forEach(function(e) { map[e.id] = e; });
  return map;
}

/**
 * Obtiene mapa de preguntas con su conducta_id
 */
function _obtenerPreguntasMap() {
  var preguntas = getSheetData(HOJAS.ENCUESTA_PREGUNTAS)
    .filter(function(p) { return p.activo !== false; });
  var map = {};
  preguntas.forEach(function(p) { map[p.id] = p; });
  return map;
}

// ============================================
// KPIs DEL PROGRAMA
// ============================================

/**
 * Obtiene KPIs principales del dashboard para un programa
 * @param {String} token - Token de sesion
 * @param {String} programaId - ID del programa
 * @returns {Object} {totalParticipantes, observacionesRealizadas, tasaRespuestaPre, tasaRespuestaPost, nivelAplicacion}
 */
function obtenerKPIsPrograma(token, programaId) {
  try {
    var sesion = autorizarAccion(token, [ROLES.ADMIN, ROLES.JEFATURA, ROLES.PARTICIPANTE]);

    var participantes = _obtenerParticipantesFiltrados(sesion, programaId);
    var participanteIds = participantes.map(function(p) { return p.usuario_id; });
    var totalParticipantes = participanteIds.length;

    // Observaciones completadas
    var observaciones = findWhere(HOJAS.OBSERVACIONES_JEFATURA, { programa_id: programaId })
      .filter(function(o) {
        return o.activo !== false && o.estado === ESTADOS_OBSERVACION.COMPLETADA;
      });

    if (sesion.rol === ROLES.JEFATURA) {
      observaciones = observaciones.filter(function(o) {
        return participanteIds.indexOf(o.participante_id) !== -1;
      });
    } else if (sesion.rol === ROLES.PARTICIPANTE) {
      observaciones = observaciones.filter(function(o) {
        return o.participante_id === sesion.userId;
      });
    }

    var observacionesRealizadas = observaciones.length;

    // Encuestas del programa
    var encuestasMap = _obtenerEncuestasMap(programaId);
    var encuestaPreId = null;
    var encuestaPostId = null;
    for (var eId in encuestasMap) {
      if (encuestasMap[eId].tipo === 'pre') encuestaPreId = eId;
      if (encuestasMap[eId].tipo === 'post') encuestaPostId = eId;
    }

    // Respuestas de encuestas
    var todasRespuestas = findWhere(HOJAS.ENCUESTA_RESPUESTAS, { programa_id: programaId })
      .filter(function(r) { return r.activo !== false && r.estado === 'completada'; });

    // Filtrar por participantes visibles
    var respuestasFiltradas = todasRespuestas.filter(function(r) {
      return participanteIds.indexOf(r.usuario_id) !== -1;
    });

    // Tasa de respuesta PRE: usuarios unicos que respondieron la encuesta PRE
    var tasaRespuestaPre = 0;
    if (encuestaPreId && totalParticipantes > 0) {
      var respondieronPre = {};
      respuestasFiltradas.forEach(function(r) {
        if (r.encuesta_id === encuestaPreId) respondieronPre[r.usuario_id] = true;
      });
      tasaRespuestaPre = Math.round(Object.keys(respondieronPre).length / totalParticipantes * 100);
    }

    // Tasa de respuesta POST
    var tasaRespuestaPost = 0;
    if (encuestaPostId && totalParticipantes > 0) {
      var respondieronPost = {};
      respuestasFiltradas.forEach(function(r) {
        if (r.encuesta_id === encuestaPostId) respondieronPost[r.usuario_id] = true;
      });
      tasaRespuestaPost = Math.round(Object.keys(respondieronPost).length / totalParticipantes * 100);
    }

    // Nivel de aplicacion: promedio de valor_numerico POST / 5 * 100
    var nivelAplicacion = 0;
    if (encuestaPostId) {
      var respuestasPost = respuestasFiltradas.filter(function(r) {
        return r.encuesta_id === encuestaPostId;
      });
      if (respuestasPost.length > 0) {
        var sumaPost = 0;
        respuestasPost.forEach(function(r) {
          sumaPost += (typeof r.valor_numerico === 'number' ? r.valor_numerico : parseFloat(r.valor_numerico) || 0);
        });
        nivelAplicacion = Math.round((sumaPost / respuestasPost.length) / 5 * 100);
      }
    }

    return respuestaOk({
      totalParticipantes: totalParticipantes,
      observacionesRealizadas: observacionesRealizadas,
      tasaRespuestaPre: tasaRespuestaPre,
      tasaRespuestaPost: tasaRespuestaPost,
      nivelAplicacion: nivelAplicacion
    });
  } catch (e) {
    return respuestaError(e.message);
  }
}

// ============================================
// COMPARACION PRE vs POST
// ============================================

/**
 * Obtiene comparacion PRE vs POST agrupada por conducta
 * @param {String} token - Token de sesion
 * @param {String} programaId - ID del programa
 * @returns {Array} [{conducta_nombre, conducta_id, promedioPre, promedioPost, variacion}]
 */
function obtenerComparacionPrePost(token, programaId) {
  try {
    var sesion = autorizarAccion(token, [ROLES.ADMIN, ROLES.JEFATURA, ROLES.PARTICIPANTE]);

    var participantes = _obtenerParticipantesFiltrados(sesion, programaId);
    var participanteIds = participantes.map(function(p) { return p.usuario_id; });

    // Encuestas PRE y POST del programa
    var encuestasMap = _obtenerEncuestasMap(programaId);
    var encuestaPreId = null;
    var encuestaPostId = null;
    for (var eId in encuestasMap) {
      if (encuestasMap[eId].tipo === 'pre') encuestaPreId = eId;
      if (encuestasMap[eId].tipo === 'post') encuestaPostId = eId;
    }

    // Mapa de preguntas con conducta_id
    var preguntasMap = _obtenerPreguntasMap();

    // Respuestas filtradas por participantes visibles
    var respuestas = findWhere(HOJAS.ENCUESTA_RESPUESTAS, { programa_id: programaId })
      .filter(function(r) {
        return r.activo !== false &&
               r.estado === 'completada' &&
               participanteIds.indexOf(r.usuario_id) !== -1;
      });

    // Conductas del programa
    var conductas = findWhere(HOJAS.CONDUCTAS_CRITICAS, { programa_id: programaId })
      .filter(function(c) { return c.activo !== false; });
    var conductasMap = {};
    conductas.forEach(function(c) { conductasMap[c.id] = c.nombre; });

    // Agrupar respuestas por conducta y tipo (pre/post)
    var dataPre = {};   // conductaId -> [valores]
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

    // Construir resultado por conducta
    var resultado = conductas.map(function(c) {
      var valoresPre = dataPre[c.id] || [];
      var valoresPost = dataPost[c.id] || [];

      var promedioPre = valoresPre.length > 0
        ? valoresPre.reduce(function(a, b) { return a + b; }, 0) / valoresPre.length
        : 0;
      var promedioPost = valoresPost.length > 0
        ? valoresPost.reduce(function(a, b) { return a + b; }, 0) / valoresPost.length
        : 0;

      var variacion = promedioPre > 0
        ? Math.round(((promedioPost - promedioPre) / promedioPre) * 100)
        : 0;

      return {
        conducta_nombre: c.nombre,
        conducta_id: c.id,
        promedioPre: Math.round(promedioPre * 100) / 100,
        promedioPost: Math.round(promedioPost * 100) / 100,
        variacion: variacion
      };
    });

    return respuestaOk(resultado);
  } catch (e) {
    return respuestaError(e.message);
  }
}

// ============================================
// EVOLUCION TEMPORAL
// ============================================

/**
 * Obtiene evolucion temporal de observaciones para una conducta
 * @param {String} token - Token de sesion
 * @param {String} programaId - ID del programa
 * @param {String} conductaId - ID de la conducta
 * @returns {Array} [{fecha, valor}]
 */
function obtenerEvolucionTemporal(token, programaId, conductaId) {
  try {
    var sesion = autorizarAccion(token, [ROLES.ADMIN, ROLES.JEFATURA, ROLES.PARTICIPANTE]);

    var participantes = _obtenerParticipantesFiltrados(sesion, programaId);
    var participanteIds = participantes.map(function(p) { return p.usuario_id; });

    // Observaciones filtradas por programa, conducta y completadas
    var observaciones = findWhere(HOJAS.OBSERVACIONES_JEFATURA, { programa_id: programaId, conducta_id: conductaId })
      .filter(function(o) {
        return o.activo !== false &&
               o.estado === ESTADOS_OBSERVACION.COMPLETADA &&
               participanteIds.indexOf(o.participante_id) !== -1;
      });

    if (observaciones.length === 0) {
      return respuestaOk([]);
    }

    // Obtener IDs de observaciones
    var obsIds = observaciones.map(function(o) { return o.id; });

    // Mapa de observacion -> fecha (solo dia)
    var obsFechaMap = {};
    observaciones.forEach(function(o) {
      var fecha = o.fecha_observacion ? new Date(o.fecha_observacion) : new Date(o.fecha_creacion);
      var fechaStr = fecha.getFullYear() + '-' +
        ('0' + (fecha.getMonth() + 1)).slice(-2) + '-' +
        ('0' + fecha.getDate()).slice(-2);
      obsFechaMap[o.id] = fechaStr;
    });

    // Obtener detalles de las observaciones
    var detalles = getSheetData(HOJAS.OBSERVACION_DETALLES)
      .filter(function(d) {
        return d.activo !== false && obsIds.indexOf(d.observacion_id) !== -1;
      });

    // Agrupar valores por fecha
    var fechaValores = {};
    detalles.forEach(function(d) {
      var fecha = obsFechaMap[d.observacion_id];
      if (!fecha) return;
      var valor = typeof d.valor_numerico === 'number' ? d.valor_numerico : parseFloat(d.valor_numerico) || 0;
      if (!fechaValores[fecha]) fechaValores[fecha] = [];
      fechaValores[fecha].push(valor);
    });

    // Calcular promedio por fecha y ordenar
    var resultado = [];
    for (var fecha in fechaValores) {
      var valores = fechaValores[fecha];
      var promedio = valores.reduce(function(a, b) { return a + b; }, 0) / valores.length;
      resultado.push({
        fecha: fecha,
        valor: Math.round(promedio * 100) / 100
      });
    }

    resultado.sort(function(a, b) { return a.fecha.localeCompare(b.fecha); });

    return respuestaOk(resultado);
  } catch (e) {
    return respuestaError(e.message);
  }
}

// ============================================
// MAPA DE CALOR
// ============================================

/**
 * Obtiene mapa de calor de nivel de adopcion por conducta
 * @param {String} token - Token de sesion
 * @param {String} programaId - ID del programa
 * @returns {Array} [{conducta_nombre, nivel, color}]
 */
function obtenerMapaCalor(token, programaId) {
  try {
    var sesion = autorizarAccion(token, [ROLES.ADMIN, ROLES.JEFATURA, ROLES.PARTICIPANTE]);

    var participantes = _obtenerParticipantesFiltrados(sesion, programaId);
    var participanteIds = participantes.map(function(p) { return p.usuario_id; });

    // Encuesta POST
    var encuestasMap = _obtenerEncuestasMap(programaId);
    var encuestaPostId = null;
    for (var eId in encuestasMap) {
      if (encuestasMap[eId].tipo === 'post') { encuestaPostId = eId; break; }
    }

    // Conductas del programa
    var conductas = findWhere(HOJAS.CONDUCTAS_CRITICAS, { programa_id: programaId })
      .filter(function(c) { return c.activo !== false; });

    if (!encuestaPostId) {
      // Sin encuesta POST, devolver conductas con nivel 0
      var sinDatos = conductas.map(function(c) {
        return { conducta_nombre: c.nombre, nivel: 0, color: 'rojo' };
      });
      return respuestaOk(sinDatos);
    }

    var preguntasMap = _obtenerPreguntasMap();

    // Respuestas POST filtradas
    var respuestas = findWhere(HOJAS.ENCUESTA_RESPUESTAS, { programa_id: programaId })
      .filter(function(r) {
        return r.activo !== false &&
               r.estado === 'completada' &&
               r.encuesta_id === encuestaPostId &&
               participanteIds.indexOf(r.usuario_id) !== -1;
      });

    // Agrupar por conducta
    var conductaValores = {};
    respuestas.forEach(function(r) {
      var pregunta = preguntasMap[r.pregunta_id];
      if (!pregunta || !pregunta.conducta_id) return;
      var valor = typeof r.valor_numerico === 'number' ? r.valor_numerico : parseFloat(r.valor_numerico) || 0;
      if (!conductaValores[pregunta.conducta_id]) conductaValores[pregunta.conducta_id] = [];
      conductaValores[pregunta.conducta_id].push(valor);
    });

    var resultado = conductas.map(function(c) {
      var valores = conductaValores[c.id] || [];
      var promedio = valores.length > 0
        ? valores.reduce(function(a, b) { return a + b; }, 0) / valores.length
        : 0;

      // Nivel como porcentaje (escala 1-5, entonces /5 * 100)
      var nivel = Math.round(promedio / 5 * 100);
      var color;
      if (nivel >= 70) {
        color = 'verde';
      } else if (nivel >= 40) {
        color = 'amarillo';
      } else {
        color = 'rojo';
      }

      return {
        conducta_nombre: c.nombre,
        nivel: nivel,
        color: color
      };
    });

    return respuestaOk(resultado);
  } catch (e) {
    return respuestaError(e.message);
  }
}

// ============================================
// RESUMEN POR EQUIPO
// ============================================

/**
 * Obtiene resumen de aplicacion agrupado por equipo/area
 * @param {String} token - Token de sesion
 * @param {String} programaId - ID del programa
 * @returns {Array} [{equipo, area, nivelAplicacion, numParticipantes}]
 */
function obtenerResumenPorEquipo(token, programaId) {
  try {
    var sesion = autorizarAccion(token, [ROLES.ADMIN, ROLES.JEFATURA]);

    var participantes = _obtenerParticipantesFiltrados(sesion, programaId);
    var participanteIds = participantes.map(function(p) { return p.usuario_id; });

    // Datos de usuarios para obtener equipo/area
    var usuarios = getSheetData(HOJAS.USUARIOS);
    var usuariosMap = {};
    usuarios.forEach(function(u) { usuariosMap[u.id] = u; });

    // Encuesta POST
    var encuestasMap = _obtenerEncuestasMap(programaId);
    var encuestaPostId = null;
    for (var eId in encuestasMap) {
      if (encuestasMap[eId].tipo === 'post') { encuestaPostId = eId; break; }
    }

    // Respuestas POST filtradas
    var respuestasPorUsuario = {};
    if (encuestaPostId) {
      var respuestas = findWhere(HOJAS.ENCUESTA_RESPUESTAS, { programa_id: programaId })
        .filter(function(r) {
          return r.activo !== false &&
                 r.estado === 'completada' &&
                 r.encuesta_id === encuestaPostId &&
                 participanteIds.indexOf(r.usuario_id) !== -1;
        });

      respuestas.forEach(function(r) {
        var valor = typeof r.valor_numerico === 'number' ? r.valor_numerico : parseFloat(r.valor_numerico) || 0;
        if (!respuestasPorUsuario[r.usuario_id]) respuestasPorUsuario[r.usuario_id] = [];
        respuestasPorUsuario[r.usuario_id].push(valor);
      });
    }

    // Agrupar participantes por equipo+area
    var grupos = {};
    participanteIds.forEach(function(uid) {
      var usuario = usuariosMap[uid];
      if (!usuario) return;
      var equipo = usuario.equipo || 'Sin equipo';
      var area = usuario.area || 'Sin area';
      var key = equipo + '||' + area;

      if (!grupos[key]) {
        grupos[key] = { equipo: equipo, area: area, participantes: [], valores: [] };
      }
      grupos[key].participantes.push(uid);

      // Agregar valores POST del usuario
      var valsUsuario = respuestasPorUsuario[uid] || [];
      valsUsuario.forEach(function(v) { grupos[key].valores.push(v); });
    });

    // Calcular resultado
    var resultado = [];
    for (var key in grupos) {
      var grupo = grupos[key];
      var promedio = grupo.valores.length > 0
        ? grupo.valores.reduce(function(a, b) { return a + b; }, 0) / grupo.valores.length
        : 0;

      resultado.push({
        equipo: grupo.equipo,
        area: grupo.area,
        nivelAplicacion: Math.round(promedio / 5 * 100),
        numParticipantes: grupo.participantes.length
      });
    }

    // Ordenar por nivel de aplicacion descendente
    resultado.sort(function(a, b) { return b.nivelAplicacion - a.nivelAplicacion; });

    return respuestaOk(resultado);
  } catch (e) {
    return respuestaError(e.message);
  }
}

// ============================================
// MI PROGRESO (PARTICIPANTE)
// ============================================

/**
 * Obtiene el progreso personal del participante: PRE vs POST por conducta + feedback recibido
 * @param {String} token - Token de sesion
 * @returns {Object} {comparacion: [{conducta_nombre, promedioPre, promedioPost}], feedback: [{fecha, fortaleza, aspecto_reforzar, recomendacion, conducta_nombre}]}
 */
function obtenerMiProgreso(token) {
  try {
    var sesion = autorizarAccion(token, [ROLES.PARTICIPANTE]);

    // Programas del participante
    var asignaciones = findWhere(HOJAS.PROGRAMA_PARTICIPANTES, { usuario_id: sesion.userId })
      .filter(function(a) { return a.activo !== false; });

    if (asignaciones.length === 0) {
      return respuestaOk({ comparacion: [], feedback: [] });
    }

    var programaIds = asignaciones.map(function(a) { return a.programa_id; });

    // Encuestas de los programas del participante
    var encuestas = getSheetData(HOJAS.ENCUESTAS)
      .filter(function(e) {
        return e.activo !== false && programaIds.indexOf(e.programa_id) !== -1;
      });

    var encuestaPreIds = [];
    var encuestaPostIds = [];
    encuestas.forEach(function(e) {
      if (e.tipo === 'pre') encuestaPreIds.push(e.id);
      if (e.tipo === 'post') encuestaPostIds.push(e.id);
    });

    // Respuestas del participante
    var respuestas = getSheetData(HOJAS.ENCUESTA_RESPUESTAS)
      .filter(function(r) {
        return r.activo !== false &&
               r.estado === 'completada' &&
               r.usuario_id === sesion.userId;
      });

    var preguntasMap = _obtenerPreguntasMap();

    // Conductas de los programas
    var conductas = getSheetData(HOJAS.CONDUCTAS_CRITICAS)
      .filter(function(c) {
        return c.activo !== false && programaIds.indexOf(c.programa_id) !== -1;
      });
    var conductasMap = {};
    conductas.forEach(function(c) { conductasMap[c.id] = c.nombre; });

    // Agrupar por conducta
    var dataPre = {};
    var dataPost = {};

    respuestas.forEach(function(r) {
      var pregunta = preguntasMap[r.pregunta_id];
      if (!pregunta || !pregunta.conducta_id) return;
      var conductaId = pregunta.conducta_id;
      var valor = typeof r.valor_numerico === 'number' ? r.valor_numerico : parseFloat(r.valor_numerico) || 0;

      if (encuestaPreIds.indexOf(r.encuesta_id) !== -1) {
        if (!dataPre[conductaId]) dataPre[conductaId] = [];
        dataPre[conductaId].push(valor);
      } else if (encuestaPostIds.indexOf(r.encuesta_id) !== -1) {
        if (!dataPost[conductaId]) dataPost[conductaId] = [];
        dataPost[conductaId].push(valor);
      }
    });

    var comparacion = conductas.map(function(c) {
      var valoresPre = dataPre[c.id] || [];
      var valoresPost = dataPost[c.id] || [];

      var promedioPre = valoresPre.length > 0
        ? valoresPre.reduce(function(a, b) { return a + b; }, 0) / valoresPre.length
        : 0;
      var promedioPost = valoresPost.length > 0
        ? valoresPost.reduce(function(a, b) { return a + b; }, 0) / valoresPost.length
        : 0;

      return {
        conducta_nombre: c.nombre,
        conducta_id: c.id,
        promedioPre: Math.round(promedioPre * 100) / 100,
        promedioPost: Math.round(promedioPost * 100) / 100
      };
    });

    // Feedback recibido
    var feedbacks = findWhere(HOJAS.FEEDBACK, { participante_id: sesion.userId })
      .filter(function(f) { return f.activo !== false; });

    // Enriquecer feedback con nombre de conducta (via observacion)
    var observacionesMap = {};
    if (feedbacks.length > 0) {
      var obsIds = feedbacks.map(function(f) { return f.observacion_id; }).filter(function(id) { return !!id; });
      var observaciones = getSheetData(HOJAS.OBSERVACIONES_JEFATURA);
      observaciones.forEach(function(o) {
        if (obsIds.indexOf(o.id) !== -1) observacionesMap[o.id] = o;
      });
    }

    var feedbackResult = feedbacks.map(function(f) {
      var obs = observacionesMap[f.observacion_id] || {};
      return {
        fecha: f.fecha_feedback,
        fortaleza: f.fortaleza,
        aspecto_reforzar: f.aspecto_reforzar,
        recomendacion: f.recomendacion,
        conducta_nombre: conductasMap[obs.conducta_id] || ''
      };
    });

    feedbackResult.sort(function(a, b) {
      return (b.fecha || '').localeCompare(a.fecha || '');
    });

    return respuestaOk({
      comparacion: comparacion,
      feedback: feedbackResult
    });
  } catch (e) {
    return respuestaError(e.message);
  }
}

// ============================================
// LISTAR PROGRAMAS PARA DASHBOARD
// ============================================

/**
 * Lista programas accesibles para el dashboard segun rol
 * Admin ve todos, jefatura ve los de su cliente, participante ve los asignados
 * @param {String} token - Token de sesion
 * @returns {Array} [{id, nombre, estado, cliente_nombre}]
 */
function listarProgramasDashboard(token) {
  try {
    var sesion = autorizarAccion(token, [ROLES.ADMIN, ROLES.JEFATURA, ROLES.PARTICIPANTE, ROLES.COLABORADOR]);

    var programas = getSheetData(HOJAS.PROGRAMAS)
      .filter(function(p) { return p.activo !== false; });

    var clientes = getSheetData(HOJAS.CLIENTES);
    var clientesMap = {};
    clientes.forEach(function(c) { clientesMap[c.id] = c.nombre; });

    if (sesion.rol === ROLES.JEFATURA) {
      programas = programas.filter(function(p) {
        return p.cliente_id === sesion.clienteId;
      });
    } else if (sesion.rol === ROLES.PARTICIPANTE || sesion.rol === ROLES.COLABORADOR) {
      var asignaciones = findWhere(HOJAS.PROGRAMA_PARTICIPANTES, { usuario_id: sesion.userId })
        .filter(function(a) { return a.activo !== false; });
      var misProgramaIds = asignaciones.map(function(a) { return a.programa_id; });
      programas = programas.filter(function(p) {
        return misProgramaIds.indexOf(p.id) !== -1;
      });
    }

    var resultado = programas.map(function(p) {
      return {
        id: p.id,
        nombre: p.nombre,
        estado: p.estado,
        cliente_nombre: clientesMap[p.cliente_id] || ''
      };
    });

    return respuestaOk(resultado);
  } catch (e) {
    return respuestaError(e.message);
  }
}
