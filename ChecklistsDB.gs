/**
 * ChecklistsDB.gs — CRUD de checklists de observacion
 * Plataforma TPT - MSO Chile
 */

function crearChecklist(token, datos) {
  try {
    var sesion = autorizarAccion(token, [ROLES.ADMIN]);

    validarRequerido(datos.programa_id, 'Programa');
    validarRequerido(datos.nombre, 'Nombre del checklist');
    validarRequerido(datos.conducta_id, 'Conducta asociada');
    validarRequerido(datos.tipo_respuesta, 'Tipo de respuesta');

    // Validar tipo_respuesta valido
    var tiposValidos = ['si_no', 'logrado_parcial_no', 'escala_1_5'];
    if (tiposValidos.indexOf(datos.tipo_respuesta) === -1) {
      return respuestaError('Tipo de respuesta no valido. Opciones: ' + tiposValidos.join(', '));
    }

    // Validar nombre unico dentro del programa
    if (!validarNombreUnico(HOJAS.CHECKLISTS, datos.nombre, { programa_id: datos.programa_id })) {
      return respuestaError('Ya existe un checklist con ese nombre en este programa.');
    }

    // Validar que la conducta pertenece al programa
    var conducta = findById(HOJAS.CONDUCTAS_CRITICAS, datos.conducta_id);
    if (!conducta || conducta.activo === false) {
      return respuestaError('Conducta no encontrada.');
    }
    if (conducta.programa_id !== datos.programa_id) {
      return respuestaError('La conducta seleccionada no pertenece a este programa.');
    }

    var checklistId = generarId();
    insertRow(HOJAS.CHECKLISTS, {
      id: checklistId,
      programa_id: datos.programa_id,
      nombre: datos.nombre.trim(),
      conducta_id: datos.conducta_id,
      tipo_respuesta: datos.tipo_respuesta,
      estado: ESTADOS_ENCUESTA.BORRADOR,
      creado_por: sesion.userId,
      fecha_creacion: fechaActual(),
      activo: true
    });

    registrarAuditLog(sesion.userId, 'crear', HOJAS.CHECKLISTS, checklistId, 'Checklist creado: ' + datos.nombre);
    return respuestaOk({ checklistId: checklistId, message: 'Checklist creado exitosamente.' });
  } catch (e) {
    return respuestaError(e.message);
  }
}

function listarChecklists(token, programaId) {
  try {
    autorizarAccion(token, [ROLES.ADMIN, ROLES.JEFATURA]);

    var checklists = findWhere(HOJAS.CHECKLISTS, { programa_id: programaId })
      .filter(function(c) { return c.activo !== false; });

    // Agregar nombre de conducta
    var conductas = getSheetData(HOJAS.CONDUCTAS_CRITICAS);
    var conductasMap = {};
    conductas.forEach(function(c) { conductasMap[c.id] = c.nombre; });

    checklists.forEach(function(cl) {
      cl.conducta_nombre = conductasMap[cl.conducta_id] || '';
    });

    return respuestaOk(checklists);
  } catch (e) {
    return respuestaError(e.message);
  }
}

function activarChecklist(token, checklistId) {
  try {
    var sesion = autorizarAccion(token, [ROLES.ADMIN]);

    var checklist = findById(HOJAS.CHECKLISTS, checklistId);
    if (!checklist || checklist.activo === false) {
      return respuestaError('Checklist no encontrado.');
    }

    if (checklist.estado !== ESTADOS_ENCUESTA.BORRADOR) {
      return respuestaError('Solo se pueden activar checklists en estado borrador.');
    }

    updateById(HOJAS.CHECKLISTS, checklistId, {
      estado: ESTADOS_ENCUESTA.ACTIVA
    });

    registrarAuditLog(sesion.userId, 'editar', HOJAS.CHECKLISTS, checklistId, 'Checklist activado');
    return respuestaOk({ message: 'Checklist activado exitosamente.' });
  } catch (e) {
    return respuestaError(e.message);
  }
}

function cerrarChecklist(token, checklistId) {
  try {
    var sesion = autorizarAccion(token, [ROLES.ADMIN]);

    var checklist = findById(HOJAS.CHECKLISTS, checklistId);
    if (!checklist || checklist.activo === false) {
      return respuestaError('Checklist no encontrado.');
    }

    if (checklist.estado !== ESTADOS_ENCUESTA.ACTIVA) {
      return respuestaError('Solo se pueden cerrar checklists en estado activo.');
    }

    updateById(HOJAS.CHECKLISTS, checklistId, {
      estado: ESTADOS_ENCUESTA.CERRADA
    });

    registrarAuditLog(sesion.userId, 'editar', HOJAS.CHECKLISTS, checklistId, 'Checklist cerrado');
    return respuestaOk({ message: 'Checklist cerrado exitosamente.' });
  } catch (e) {
    return respuestaError(e.message);
  }
}
