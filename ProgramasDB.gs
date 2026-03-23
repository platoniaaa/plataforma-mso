/**
 * ProgramasDB.gs — CRUD de programas de transferencia
 * Plataforma TPT - MSO Chile
 */

/**
 * Crea un nuevo programa
 */
function crearPrograma(token, datos) {
  try {
    var sesion = autorizarAccion(token, [ROLES.ADMIN]);

    validarRequerido(datos.nombre, 'Nombre del programa');
    validarRequerido(datos.cliente_id, 'Cliente');
    validarRequerido(datos.fecha_inicio, 'Fecha de inicio');
    validarRequerido(datos.fecha_termino, 'Fecha de término');
    validarRequerido(datos.tipo, 'Tipo de programa');
    validarRequerido(datos.objetivo, 'Objetivo');

    if (new Date(datos.fecha_termino) < new Date(datos.fecha_inicio)) {
      return respuestaError('La fecha de término no puede ser anterior a la fecha de inicio.');
    }

    if (!validarNombreUnico(HOJAS.PROGRAMAS, datos.nombre, { cliente_id: datos.cliente_id })) {
      return respuestaError('Ya existe un programa con ese nombre para este cliente.');
    }

    var lock = LockService.getScriptLock();
    lock.waitLock(10000);

    try {
      var programaId = generarId();
      insertRow(HOJAS.PROGRAMAS, {
        id: programaId,
        nombre: datos.nombre.trim(),
        cliente_id: datos.cliente_id,
        fecha_inicio: datos.fecha_inicio,
        fecha_termino: datos.fecha_termino,
        tipo: datos.tipo,
        objetivo: datos.objetivo.trim(),
        estado: ESTADOS_PROGRAMA.DISENO,
        fecha_medicion_pre: datos.fecha_medicion_pre || '',
        fecha_medicion_post: datos.fecha_medicion_post || '',
        creado_por: sesion.userId,
        fecha_creacion: fechaActual(),
        activo: true
      });

      registrarAuditLog(sesion.userId, 'crear', HOJAS.PROGRAMAS, programaId, 'Programa creado: ' + datos.nombre);
    } finally {
      lock.releaseLock();
    }

    return respuestaOk({ programaId: programaId, message: 'Programa creado exitosamente.' });
  } catch (e) {
    return respuestaError(e.message);
  }
}

/**
 * Lista programas con filtros
 */
function listarProgramas(token, clienteId) {
  try {
    var sesion = autorizarAccion(token, [ROLES.ADMIN, ROLES.JEFATURA]);

    var programas = getSheetData(HOJAS.PROGRAMAS);
    var clientes = getSheetData(HOJAS.CLIENTES);
    var clientesMap = {};
    clientes.forEach(function(c) { clientesMap[c.id] = c.nombre; });

    var resultado = programas
      .filter(function(p) {
        if (p.activo === false || p.activo === 'FALSE') return false;
        if (clienteId && clienteId !== '' && p.cliente_id !== clienteId) return false;
        if (sesion.rol === ROLES.JEFATURA && p.cliente_id !== sesion.clienteId) return false;
        return true;
      })
      .map(function(p) {
        return {
          id: p.id,
          nombre: p.nombre,
          cliente_id: p.cliente_id,
          cliente_nombre: clientesMap[p.cliente_id] || '',
          fecha_inicio: p.fecha_inicio,
          fecha_termino: p.fecha_termino,
          tipo: p.tipo,
          objetivo: p.objetivo,
          estado: p.estado,
          fecha_medicion_pre: p.fecha_medicion_pre,
          fecha_medicion_post: p.fecha_medicion_post,
          fecha_creacion: p.fecha_creacion
        };
      });

    return respuestaOk(resultado);
  } catch (e) {
    return respuestaError(e.message);
  }
}

/**
 * Obtiene un programa con sus datos relacionados
 */
function obtenerPrograma(token, id) {
  try {
    var sesion = autorizarAccion(token, [ROLES.ADMIN, ROLES.JEFATURA]);

    var programa = findById(HOJAS.PROGRAMAS, id);
    if (!programa || programa.activo === false) {
      return respuestaError('Programa no encontrado.');
    }

    if (sesion.rol === ROLES.JEFATURA && programa.cliente_id !== sesion.clienteId) {
      return respuestaError('No tienes acceso a este programa.');
    }

    // Obtener conductas
    var conductas = findWhere(HOJAS.CONDUCTAS_CRITICAS, { programa_id: id })
      .filter(function(c) { return c.activo !== false; });

    // Obtener participantes
    var participantes = findWhere(HOJAS.PROGRAMA_PARTICIPANTES, { programa_id: id })
      .filter(function(p) { return p.activo !== false; });

    // Obtener datos de usuarios participantes
    var usuarios = getSheetData(HOJAS.USUARIOS);
    var usuariosMap = {};
    usuarios.forEach(function(u) { usuariosMap[u.id] = u; });

    var participantesInfo = participantes.map(function(p) {
      var u = usuariosMap[p.usuario_id] || {};
      return {
        id: p.id,
        usuario_id: p.usuario_id,
        nombre: u.nombre_completo || '',
        email: u.email || '',
        rol_programa: p.rol_programa,
        fecha_inicio: p.fecha_inicio
      };
    });

    programa.conductas = conductas;
    programa.participantes = participantesInfo;

    return respuestaOk(programa);
  } catch (e) {
    return respuestaError(e.message);
  }
}

/**
 * Actualiza un programa
 */
function actualizarPrograma(token, id, datos) {
  try {
    var sesion = autorizarAccion(token, [ROLES.ADMIN]);

    var programa = findById(HOJAS.PROGRAMAS, id);
    if (!programa || programa.activo === false) {
      return respuestaError('Programa no encontrado.');
    }

    if (datos.fecha_termino && datos.fecha_inicio) {
      if (new Date(datos.fecha_termino) < new Date(datos.fecha_inicio)) {
        return respuestaError('La fecha de término no puede ser anterior a la fecha de inicio.');
      }
    }

    var cambios = {};
    var campos = ['nombre', 'fecha_inicio', 'fecha_termino', 'tipo', 'objetivo', 'estado',
                  'fecha_medicion_pre', 'fecha_medicion_post'];
    campos.forEach(function(campo) {
      if (datos[campo] !== undefined) cambios[campo] = datos[campo];
    });

    updateById(HOJAS.PROGRAMAS, id, cambios);
    registrarAuditLog(sesion.userId, 'editar', HOJAS.PROGRAMAS, id, 'Programa actualizado');

    return respuestaOk({ message: 'Programa actualizado exitosamente.' });
  } catch (e) {
    return respuestaError(e.message);
  }
}

/**
 * Activa un programa (cambia estado de diseño a activo)
 */
function activarPrograma(token, id) {
  try {
    var sesion = autorizarAccion(token, [ROLES.ADMIN]);

    var programa = findById(HOJAS.PROGRAMAS, id);
    if (!programa) return respuestaError('Programa no encontrado.');

    if (programa.estado !== ESTADOS_PROGRAMA.DISENO) {
      return respuestaError('Solo se pueden activar programas en estado diseño.');
    }

    // Validar que tenga al menos 1 conducta
    var conductas = findWhere(HOJAS.CONDUCTAS_CRITICAS, { programa_id: id })
      .filter(function(c) { return c.activo !== false; });

    if (conductas.length === 0) {
      return respuestaError('El programa debe tener al menos una conducta crítica antes de activarse.');
    }

    updateById(HOJAS.PROGRAMAS, id, { estado: ESTADOS_PROGRAMA.ACTIVO });
    registrarAuditLog(sesion.userId, 'editar', HOJAS.PROGRAMAS, id, 'Programa activado');

    return respuestaOk({ message: 'Programa activado exitosamente.' });
  } catch (e) {
    return respuestaError(e.message);
  }
}

/**
 * Asocia participantes a un programa
 */
function asociarParticipantes(token, programaId, userIds, rolPrograma) {
  try {
    var sesion = autorizarAccion(token, [ROLES.ADMIN]);
    rolPrograma = rolPrograma || 'participante';

    var existentes = findWhere(HOJAS.PROGRAMA_PARTICIPANTES, { programa_id: programaId })
      .filter(function(p) { return p.activo !== false; });
    var existentesIds = existentes.map(function(p) { return p.usuario_id; });

    var agregados = 0;

    userIds.forEach(function(userId) {
      if (existentesIds.indexOf(userId) === -1) {
        insertRow(HOJAS.PROGRAMA_PARTICIPANTES, {
          id: generarId(),
          programa_id: programaId,
          usuario_id: userId,
          rol_programa: rolPrograma,
          fecha_inicio: fechaActual(),
          fecha_termino: '',
          activo: true
        });
        agregados++;
      }
    });

    registrarAuditLog(sesion.userId, 'crear', HOJAS.PROGRAMA_PARTICIPANTES, programaId,
      agregados + ' participantes asociados');

    return respuestaOk({ count: agregados, message: agregados + ' participante(s) asociado(s).' });
  } catch (e) {
    return respuestaError(e.message);
  }
}

/**
 * Desasocia un participante de un programa
 */
function desasociarParticipante(token, programaId, userId) {
  try {
    var sesion = autorizarAccion(token, [ROLES.ADMIN]);

    var relaciones = findWhere(HOJAS.PROGRAMA_PARTICIPANTES, { programa_id: programaId, usuario_id: userId });
    relaciones.forEach(function(r) {
      if (r.activo !== false) {
        updateById(HOJAS.PROGRAMA_PARTICIPANTES, r.id, { activo: false, fecha_termino: fechaActual() });
      }
    });

    return respuestaOk({ message: 'Participante desasociado.' });
  } catch (e) {
    return respuestaError(e.message);
  }
}

/**
 * Obtiene usuarios disponibles para asociar a un programa (del mismo cliente)
 */
function obtenerUsuariosDisponibles(token, programaId) {
  try {
    autorizarAccion(token, [ROLES.ADMIN]);

    var programa = findById(HOJAS.PROGRAMAS, programaId);
    if (!programa) return respuestaError('Programa no encontrado.');

    // Usuarios del cliente
    var usuarios = getSheetData(HOJAS.USUARIOS)
      .filter(function(u) {
        return u.activo !== false &&
               u.estado === ESTADOS_USUARIO.ACTIVO &&
               u.cliente_id === programa.cliente_id &&
               u.rol !== ROLES.ADMIN;
      });

    // Ya asociados
    var asociados = findWhere(HOJAS.PROGRAMA_PARTICIPANTES, { programa_id: programaId })
      .filter(function(p) { return p.activo !== false; })
      .map(function(p) { return p.usuario_id; });

    var disponibles = usuarios
      .filter(function(u) { return asociados.indexOf(u.id) === -1; })
      .map(function(u) {
        return { id: u.id, nombre: u.nombre_completo, email: u.email, rol: u.rol };
      });

    return respuestaOk(disponibles);
  } catch (e) {
    return respuestaError(e.message);
  }
}
