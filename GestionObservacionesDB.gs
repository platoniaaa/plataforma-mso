/**
 * GestionObservacionesDB.gs — Funciones de gestión administrativa de observaciones y reportes
 * Plataforma TPT - MSO Chile
 */

/**
 * Lista todas las observaciones para admin (con datos enriquecidos)
 */
function listarTodasObservacionesAdmin(token) {
  var sesion = autorizarAccion(token, [ROLES.ADMIN]);

  try {
    var observaciones = getSheetData(HOJAS.OBSERVACIONES_JEFATURA).filter(function(o) { return o.activo !== false; });
    var usuarios = getSheetData(HOJAS.USUARIOS);
    var programas = getSheetData(HOJAS.PROGRAMAS);
    var conductas = getSheetData(HOJAS.CONDUCTAS_CRITICAS);
    var checklists = getSheetData(HOJAS.CHECKLISTS);

    var usrMap = {};
    usuarios.forEach(function(u) { usrMap[u.id] = u; });
    var progMap = {};
    programas.forEach(function(p) { progMap[p.id] = p; });
    var condMap = {};
    conductas.forEach(function(c) { condMap[c.id] = c; });
    var chkMap = {};
    checklists.forEach(function(c) { chkMap[c.id] = c; });

    var resultado = observaciones.map(function(o) {
      var observador = usrMap[o.observador_id] || {};
      var participante = usrMap[o.participante_id] || {};
      var programa = progMap[o.programa_id] || {};
      var conducta = condMap[o.conducta_id] || {};
      var checklist = chkMap[o.checklist_id] || {};

      return {
        id: o.id,
        checklist_id: o.checklist_id,
        checklist_nombre: checklist.nombre || '',
        programa_id: o.programa_id,
        programa_nombre: programa.nombre || '',
        conducta_id: o.conducta_id,
        conducta_nombre: conducta.nombre || '',
        observador_id: o.observador_id,
        observador_nombre: observador.nombre_completo || '',
        participante_id: o.participante_id,
        participante_nombre: participante.nombre_completo || '',
        tipo_medicion: o.tipo_medicion,
        fecha_observacion: o.fecha_observacion,
        comentario: o.comentario,
        estado: o.estado,
        fecha_creacion: o.fecha_creacion
      };
    });

    // Ordenar por fecha más reciente
    resultado.sort(function(a, b) {
      return (b.fecha_creacion || '').localeCompare(a.fecha_creacion || '');
    });

    return respuestaOk(resultado);
  } catch (e) {
    console.error('Error en listarTodasObservacionesAdmin: ' + e.message);
    return respuestaError(e.message);
  }
}

/**
 * Cambia el estado de una observación (admin)
 */
function cambiarEstadoObservacion(token, observacionId, nuevoEstado, comentario) {
  var sesion = autorizarAccion(token, [ROLES.ADMIN]);

  try {
    var obs = findById(HOJAS.OBSERVACIONES_JEFATURA, observacionId);
    if (!obs) return respuestaError('Observación no encontrada.');

    updateById(HOJAS.OBSERVACIONES_JEFATURA, observacionId, { estado: nuevoEstado });

    registrarAuditLog(
      sesion.userId,
      'cambiar_estado',
      HOJAS.OBSERVACIONES_JEFATURA,
      observacionId,
      'Estado cambiado a: ' + nuevoEstado + (comentario ? ' | ' + comentario : '')
    );

    return respuestaOk({ message: 'Estado actualizado correctamente.' });
  } catch (e) {
    console.error('Error en cambiarEstadoObservacion: ' + e.message);
    return respuestaError(e.message);
  }
}

/**
 * Lista reportes/incidencias de observación
 */
function listarReportesObservacion(token) {
  var sesion = autorizarAccion(token, [ROLES.ADMIN, ROLES.JEFATURA, ROLES.PARTICIPANTE]);

  try {
    var reportes = getSheetData(HOJAS.REPORTES_OBSERVACION).filter(function(r) { return r.activo !== false; });
    var historial = getSheetData(HOJAS.REPORTE_HISTORIAL);

    // Si no es admin, solo ver los propios
    if (sesion.rol !== ROLES.ADMIN) {
      reportes = reportes.filter(function(r) { return r.autor_id === sesion.userId; });
    }

    var resultado = reportes.map(function(r) {
      var hist = historial.filter(function(h) { return h.reporte_id === r.id; });
      hist.sort(function(a, b) { return (a.fecha || '').localeCompare(b.fecha || ''); });

      return {
        id: r.id,
        programa_id: r.programa_id,
        categoria: r.categoria,
        tipo: r.tipo,
        titulo: r.titulo,
        comentario: r.comentario,
        autor_id: r.autor_id,
        autor_nombre: r.autor_nombre,
        estado_gestion: r.estado_gestion,
        elemento_id: r.elemento_id,
        fecha: r.fecha,
        historial: hist.map(function(h) {
          return {
            estado_nuevo: h.estado_nuevo,
            admin_nombre: h.admin_nombre,
            fecha: h.fecha,
            comentario: h.comentario
          };
        })
      };
    });

    resultado.sort(function(a, b) {
      return (b.fecha || '').localeCompare(a.fecha || '');
    });

    return respuestaOk(resultado);
  } catch (e) {
    console.error('Error en listarReportesObservacion: ' + e.message);
    return respuestaError(e.message);
  }
}

/**
 * Crea un reporte/incidencia de observación
 */
function crearReporteObservacion(token, datos) {
  var sesion = autorizarAccion(token, [ROLES.ADMIN, ROLES.JEFATURA, ROLES.PARTICIPANTE]);

  try {
    validarRequerido(datos.titulo, 'Título');
    validarRequerido(datos.comentario, 'Comentario');
    validarRequerido(datos.categoria, 'Categoría');

    var lock = LockService.getScriptLock();
    lock.waitLock(10000);

    try {
      var repId = generarId();

      insertRow(HOJAS.REPORTES_OBSERVACION, {
        id: repId,
        programa_id: datos.programa_id || '',
        categoria: datos.categoria,
        tipo: datos.tipo || datos.categoria,
        titulo: datos.titulo.trim(),
        comentario: datos.comentario.trim(),
        autor_id: sesion.userId,
        autor_nombre: sesion.nombre,
        estado_gestion: 'pendiente',
        elemento_id: datos.elemento_id || '',
        fecha: fechaActual(),
        activo: true
      });

      registrarAuditLog(sesion.userId, 'crear', HOJAS.REPORTES_OBSERVACION, repId, 'Reporte creado: ' + datos.titulo);

      // Notificar admins
      var admins = findWhere(HOJAS.USUARIOS, { rol: ROLES.ADMIN, estado: ESTADOS_USUARIO.ACTIVO });
      admins.forEach(function(admin) {
        enviarNotificacion(admin.id, 'reporte', 'Nuevo reporte recibido', sesion.nombre + ' reportó: ' + datos.titulo);
      });

    } finally {
      lock.releaseLock();
    }

    return respuestaOk({ id: repId, message: 'Reporte enviado correctamente.' });
  } catch (e) {
    console.error('Error en crearReporteObservacion: ' + e.message);
    return respuestaError(e.message);
  }
}
