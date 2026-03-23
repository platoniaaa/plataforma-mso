/**
 * ConductasDB.gs — CRUD de conductas críticas y criterios de observación
 * Plataforma TPT - MSO Chile
 */

function crearConducta(token, datos) {
  try {
    var sesion = autorizarAccion(token, [ROLES.ADMIN]);

    validarRequerido(datos.programa_id, 'Programa');
    validarRequerido(datos.nombre, 'Nombre de la conducta');
    validarRequerido(datos.descripcion, 'Descripción');
    validarRequerido(datos.definicion_observable, 'Definición observable');

    if (!validarNombreUnico(HOJAS.CONDUCTAS_CRITICAS, datos.nombre, { programa_id: datos.programa_id })) {
      return respuestaError('Ya existe una conducta con ese nombre en este programa.');
    }

    // Contar conductas existentes para orden
    var existentes = findWhere(HOJAS.CONDUCTAS_CRITICAS, { programa_id: datos.programa_id })
      .filter(function(c) { return c.activo !== false; });

    var conductaId = generarId();
    insertRow(HOJAS.CONDUCTAS_CRITICAS, {
      id: conductaId,
      programa_id: datos.programa_id,
      nombre: datos.nombre.trim(),
      descripcion: datos.descripcion.trim(),
      definicion_observable: datos.definicion_observable.trim(),
      objetivo_negocio: datos.objetivo_negocio || '',
      indicador_observable: datos.indicador_observable || '',
      conducta_no_deseada: datos.conducta_no_deseada || '',
      prioridad: datos.prioridad || 2,
      orden: existentes.length + 1,
      activo: true
    });

    registrarAuditLog(sesion.userId, 'crear', HOJAS.CONDUCTAS_CRITICAS, conductaId, 'Conducta creada: ' + datos.nombre);
    return respuestaOk({ conductaId: conductaId, message: 'Conducta creada exitosamente.' });
  } catch (e) {
    return respuestaError(e.message);
  }
}

function listarConductas(token, programaId) {
  try {
    autorizarAccion(token, [ROLES.ADMIN, ROLES.JEFATURA]);

    var conductas = findWhere(HOJAS.CONDUCTAS_CRITICAS, { programa_id: programaId })
      .filter(function(c) { return c.activo !== false; })
      .sort(function(a, b) { return a.orden - b.orden; });

    // Agregar criterios a cada conducta
    var criterios = getSheetData(HOJAS.CRITERIOS_OBSERVACION)
      .filter(function(cr) { return cr.activo !== false; });

    conductas.forEach(function(c) {
      c.criterios = criterios
        .filter(function(cr) { return cr.conducta_id === c.id; })
        .sort(function(a, b) { return a.orden - b.orden; });
    });

    return respuestaOk(conductas);
  } catch (e) {
    return respuestaError(e.message);
  }
}

function actualizarConducta(token, id, datos) {
  try {
    var sesion = autorizarAccion(token, [ROLES.ADMIN]);

    var cambios = {};
    ['nombre', 'descripcion', 'definicion_observable', 'objetivo_negocio',
     'indicador_observable', 'conducta_no_deseada', 'prioridad', 'orden'].forEach(function(campo) {
      if (datos[campo] !== undefined) cambios[campo] = datos[campo];
    });

    updateById(HOJAS.CONDUCTAS_CRITICAS, id, cambios);
    registrarAuditLog(sesion.userId, 'editar', HOJAS.CONDUCTAS_CRITICAS, id, 'Conducta actualizada');
    return respuestaOk({ message: 'Conducta actualizada.' });
  } catch (e) {
    return respuestaError(e.message);
  }
}

function desactivarConducta(token, id) {
  try {
    var sesion = autorizarAccion(token, [ROLES.ADMIN]);
    updateById(HOJAS.CONDUCTAS_CRITICAS, id, { activo: false });
    registrarAuditLog(sesion.userId, 'desactivar', HOJAS.CONDUCTAS_CRITICAS, id, 'Conducta desactivada');
    return respuestaOk({ message: 'Conducta eliminada.' });
  } catch (e) {
    return respuestaError(e.message);
  }
}

// --- Criterios de Observación ---

function crearCriterio(token, datos) {
  try {
    var sesion = autorizarAccion(token, [ROLES.ADMIN]);
    validarRequerido(datos.conducta_id, 'Conducta');
    validarRequerido(datos.descripcion, 'Descripción del criterio');

    var existentes = findWhere(HOJAS.CRITERIOS_OBSERVACION, { conducta_id: datos.conducta_id })
      .filter(function(c) { return c.activo !== false; });

    var criterioId = generarId();
    insertRow(HOJAS.CRITERIOS_OBSERVACION, {
      id: criterioId,
      conducta_id: datos.conducta_id,
      descripcion: datos.descripcion.trim(),
      obligatorio: datos.obligatorio !== false,
      orden: existentes.length + 1,
      activo: true
    });

    registrarAuditLog(sesion.userId, 'crear', HOJAS.CRITERIOS_OBSERVACION, criterioId, 'Criterio creado');
    return respuestaOk({ criterioId: criterioId, message: 'Criterio agregado.' });
  } catch (e) {
    return respuestaError(e.message);
  }
}

function actualizarCriterio(token, id, datos) {
  try {
    var sesion = autorizarAccion(token, [ROLES.ADMIN]);
    var cambios = {};
    if (datos.descripcion !== undefined) cambios.descripcion = datos.descripcion;
    if (datos.obligatorio !== undefined) cambios.obligatorio = datos.obligatorio;
    if (datos.orden !== undefined) cambios.orden = datos.orden;

    updateById(HOJAS.CRITERIOS_OBSERVACION, id, cambios);
    return respuestaOk({ message: 'Criterio actualizado.' });
  } catch (e) {
    return respuestaError(e.message);
  }
}

function desactivarCriterio(token, id) {
  try {
    autorizarAccion(token, [ROLES.ADMIN]);
    updateById(HOJAS.CRITERIOS_OBSERVACION, id, { activo: false });
    return respuestaOk({ message: 'Criterio eliminado.' });
  } catch (e) {
    return respuestaError(e.message);
  }
}

function reordenarCriterios(token, conductaId, ordenIds) {
  try {
    autorizarAccion(token, [ROLES.ADMIN]);
    ordenIds.forEach(function(id, idx) {
      updateById(HOJAS.CRITERIOS_OBSERVACION, id, { orden: idx + 1 });
    });
    return respuestaOk({ message: 'Orden actualizado.' });
  } catch (e) {
    return respuestaError(e.message);
  }
}
