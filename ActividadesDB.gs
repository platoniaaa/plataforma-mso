/**
 * ActividadesDB.gs — CRUD de Actividades (MS Forms, enlaces, tareas, contenido)
 * Plataforma TPT - MSO Chile
 */

/**
 * Lista todas las actividades activas (admin ve todas, jefatura/participante ve las de sus programas)
 */
function listarActividades(token) {
  var sesion = autorizarAccion(token, [ROLES.ADMIN, ROLES.JEFATURA, ROLES.PARTICIPANTE]);

  try {
    var actividades = getSheetData(HOJAS.ACTIVIDADES).filter(function(a) { return a.activo !== false; });
    var asignaciones = getSheetData(HOJAS.ACTIVIDAD_ASIGNACIONES).filter(function(a) { return a.activo !== false; });
    var usuarios = getSheetData(HOJAS.USUARIOS);
    var programas = getSheetData(HOJAS.PROGRAMAS);

    var usuariosMap = {};
    usuarios.forEach(function(u) { usuariosMap[u.id] = u; });
    var programasMap = {};
    programas.forEach(function(p) { programasMap[p.id] = p; });

    // Filtrar por acceso
    if (sesion.rol !== ROLES.ADMIN) {
      var participaciones = getSheetData(HOJAS.PROGRAMA_PARTICIPANTES)
        .filter(function(pp) { return pp.usuario_id === sesion.userId && pp.activo !== false; });
      var misProgramaIds = participaciones.map(function(pp) { return pp.programa_id; });
      actividades = actividades.filter(function(a) { return misProgramaIds.indexOf(a.programa_id) !== -1; });
    }

    var resultado = actividades.map(function(a) {
      var prog = programasMap[a.programa_id] || {};
      var asigs = asignaciones.filter(function(as) { return as.actividad_id === a.id; });

      return {
        id: a.id,
        nombre: a.nombre,
        tipo: a.tipo,
        enlace: a.enlace,
        descripcion: a.descripcion,
        fecha_limite: a.fecha_limite,
        estado: a.estado,
        asignacion_tipo: a.asignacion_tipo,
        programa_id: a.programa_id,
        programa_nombre: prog.nombre || '',
        fecha_creacion: a.fecha_creacion,
        asignaciones: asigs.map(function(as) {
          var usr = usuariosMap[as.participante_id] || {};
          return {
            participante_id: as.participante_id,
            participante_nombre: usr.nombre_completo || '',
            cargo: usr.cargo || '',
            completada: as.completada === true || as.completada === 'true',
            fecha_completada: as.fecha_completada || null
          };
        })
      };
    });

    return respuestaOk(resultado);
  } catch (e) {
    console.error('Error en listarActividades: ' + e.message);
    return respuestaError(e.message);
  }
}

/**
 * Crea una nueva actividad (admin)
 */
function crearActividad(token, datos) {
  var sesion = autorizarAccion(token, [ROLES.ADMIN]);

  try {
    validarRequerido(datos.nombre, 'Nombre');
    validarRequerido(datos.tipo, 'Tipo');
    validarRequerido(datos.programa_id, 'Programa');

    var lock = LockService.getScriptLock();
    lock.waitLock(10000);

    try {
      var actId = generarId();

      insertRow(HOJAS.ACTIVIDADES, {
        id: actId,
        programa_id: datos.programa_id,
        nombre: datos.nombre.trim(),
        tipo: datos.tipo,
        enlace: datos.enlace || '',
        descripcion: datos.descripcion || '',
        fecha_limite: datos.fecha_limite || '',
        estado: datos.estado || 'borrador',
        asignacion_tipo: datos.asignacion_tipo || 'programa_completo',
        creado_por: sesion.userId,
        fecha_creacion: fechaActual(),
        activo: true
      });

      // Crear asignaciones
      _crearAsignacionesActividad(actId, datos);

      registrarAuditLog(sesion.userId, 'crear', HOJAS.ACTIVIDADES, actId, 'Actividad creada: ' + datos.nombre);

    } finally {
      lock.releaseLock();
    }

    return respuestaOk({ id: actId, message: 'Actividad creada exitosamente.' });
  } catch (e) {
    console.error('Error en crearActividad: ' + e.message);
    return respuestaError(e.message);
  }
}

/**
 * Actualiza una actividad existente (admin)
 */
function actualizarActividad(token, id, datos) {
  var sesion = autorizarAccion(token, [ROLES.ADMIN]);

  try {
    var actividad = findById(HOJAS.ACTIVIDADES, id);
    if (!actividad) return respuestaError('Actividad no encontrada.');

    var lock = LockService.getScriptLock();
    lock.waitLock(10000);

    try {
      var cambios = {};
      if (datos.nombre) cambios.nombre = datos.nombre.trim();
      if (datos.tipo) cambios.tipo = datos.tipo;
      if (datos.enlace !== undefined) cambios.enlace = datos.enlace;
      if (datos.descripcion !== undefined) cambios.descripcion = datos.descripcion;
      if (datos.fecha_limite !== undefined) cambios.fecha_limite = datos.fecha_limite;
      if (datos.estado) cambios.estado = datos.estado;
      if (datos.asignacion_tipo) cambios.asignacion_tipo = datos.asignacion_tipo;

      updateById(HOJAS.ACTIVIDADES, id, cambios);

      // Re-crear asignaciones si cambiaron
      if (datos.participantes_ids || datos.asignacion_tipo) {
        // Desactivar asignaciones anteriores
        var asignaciones = getSheetData(HOJAS.ACTIVIDAD_ASIGNACIONES);
        asignaciones.forEach(function(as) {
          if (as.actividad_id === id && as.activo !== false) {
            updateById(HOJAS.ACTIVIDAD_ASIGNACIONES, as.id, { activo: false });
          }
        });
        _crearAsignacionesActividad(id, datos);
      }

      registrarAuditLog(sesion.userId, 'actualizar', HOJAS.ACTIVIDADES, id, 'Actividad actualizada');

    } finally {
      lock.releaseLock();
    }

    return respuestaOk({ message: 'Actividad actualizada.' });
  } catch (e) {
    console.error('Error en actualizarActividad: ' + e.message);
    return respuestaError(e.message);
  }
}

/**
 * Lista actividades asignadas al participante actual
 */
function listarMisActividades(token) {
  var sesion = autorizarAccion(token, [ROLES.PARTICIPANTE, ROLES.JEFATURA]);

  try {
    var asignaciones = getSheetData(HOJAS.ACTIVIDAD_ASIGNACIONES)
      .filter(function(as) { return as.participante_id === sesion.userId && as.activo !== false; });

    var actividades = getSheetData(HOJAS.ACTIVIDADES).filter(function(a) { return a.activo !== false; });
    var programas = getSheetData(HOJAS.PROGRAMAS);

    var actMap = {};
    actividades.forEach(function(a) { actMap[a.id] = a; });
    var progMap = {};
    programas.forEach(function(p) { progMap[p.id] = p; });

    var resultado = asignaciones.map(function(as) {
      var act = actMap[as.actividad_id];
      if (!act || act.estado === 'borrador') return null;

      var prog = progMap[act.programa_id] || {};
      return {
        id: act.id,
        asignacion_id: as.id,
        nombre: act.nombre,
        tipo: act.tipo,
        enlace: act.enlace,
        descripcion: act.descripcion,
        fecha_limite: act.fecha_limite,
        estado: act.estado,
        programa_nombre: prog.nombre || '',
        completada: as.completada === true || as.completada === 'true',
        fecha_completada: as.fecha_completada || null
      };
    }).filter(function(x) { return x !== null; });

    return respuestaOk(resultado);
  } catch (e) {
    console.error('Error en listarMisActividades: ' + e.message);
    return respuestaError(e.message);
  }
}

/**
 * Marca una actividad como completada por el participante
 */
function marcarActividadCompletada(token, actividadId) {
  var sesion = autorizarAccion(token, [ROLES.PARTICIPANTE, ROLES.JEFATURA]);

  try {
    var asignaciones = getSheetData(HOJAS.ACTIVIDAD_ASIGNACIONES)
      .filter(function(as) {
        return as.actividad_id === actividadId && as.participante_id === sesion.userId && as.activo !== false;
      });

    if (asignaciones.length === 0) return respuestaError('No tienes esta actividad asignada.');

    updateById(HOJAS.ACTIVIDAD_ASIGNACIONES, asignaciones[0].id, {
      completada: true,
      fecha_completada: fechaActual()
    });

    registrarAuditLog(sesion.userId, 'completar', HOJAS.ACTIVIDADES, actividadId, 'Actividad completada por participante');

    return respuestaOk({ message: 'Actividad marcada como completada.' });
  } catch (e) {
    console.error('Error en marcarActividadCompletada: ' + e.message);
    return respuestaError(e.message);
  }
}

/**
 * Helper: Crea asignaciones de una actividad a participantes
 */
function _crearAsignacionesActividad(actividadId, datos) {
  var participantesIds = datos.participantes_ids || [];

  if (datos.asignacion_tipo === 'programa_completo') {
    // Asignar a todos los participantes del programa
    var participaciones = getSheetData(HOJAS.PROGRAMA_PARTICIPANTES)
      .filter(function(pp) { return pp.programa_id === datos.programa_id && pp.rol_programa === 'participante' && pp.activo !== false; });
    participantesIds = participaciones.map(function(pp) { return pp.usuario_id; });
  }

  participantesIds.forEach(function(uid) {
    insertRow(HOJAS.ACTIVIDAD_ASIGNACIONES, {
      id: generarId(),
      actividad_id: actividadId,
      participante_id: uid,
      completada: false,
      fecha_completada: '',
      activo: true
    });
  });
}
