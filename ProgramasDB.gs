/**
 * ProgramasDB.gs — CRUD de programas de transferencia
 * Plataforma TPT - MSO Chile v2.0
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

    // Validar que tenga al menos 1 competencia o conducta
    var competencias = getSheetData(HOJAS.COMPETENCIAS_PROGRAMA)
      .filter(function(c) { return c.programa_id === id && c.activo !== false; });
    var conductas = findWhere(HOJAS.CONDUCTAS_CRITICAS, { programa_id: id })
      .filter(function(c) { return c.activo !== false; });

    if (competencias.length === 0 && conductas.length === 0) {
      return respuestaError('El programa debe tener al menos una competencia antes de activarse.');
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
          lider_id: '',
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

/**
 * Obtiene datos completos del panel de un programa
 */
function obtenerPanelPrograma(token, programaId) {
  try {
    var sesion = autorizarAccion(token, [ROLES.ADMIN, ROLES.JEFATURA, ROLES.PARTICIPANTE, ROLES.COLABORADOR]);

    var programa = findById(HOJAS.PROGRAMAS, programaId);
    if (!programa || programa.activo === false) return respuestaError('Programa no encontrado.');

    var cliente = findById(HOJAS.CLIENTES, programa.cliente_id);

    var participaciones = getSheetData(HOJAS.PROGRAMA_PARTICIPANTES)
      .filter(function(p) { return p.programa_id === programaId && p.activo !== false; });
    var usuarios = getSheetData(HOJAS.USUARIOS);
    var usrMap = {};
    usuarios.forEach(function(u) { usrMap[u.id] = u; });

    var participantes = participaciones.map(function(p) {
      var u = usrMap[p.usuario_id] || {};
      return {
        id: p.id, usuario_id: p.usuario_id, nombre: u.nombre_completo || '',
        email: u.email || '', cargo: u.cargo || '',
        rol_programa: p.rol_programa, lider_id: p.lider_id || ''
      };
    });

    var competencias = getSheetData(HOJAS.COMPETENCIAS_PROGRAMA)
      .filter(function(c) { return c.programa_id === programaId && c.activo !== false; });
    competencias.sort(function(a, b) { return (a.orden || 0) - (b.orden || 0); });

    var encuestas = getSheetData(HOJAS.ENCUESTAS)
      .filter(function(e) { return e.programa_id === programaId && e.activo !== false; });

    return respuestaOk({
      programa: {
        id: programa.id, nombre: programa.nombre, cliente_id: programa.cliente_id,
        cliente_nombre: cliente ? cliente.nombre : '', fecha_inicio: programa.fecha_inicio,
        fecha_termino: programa.fecha_termino, tipo: programa.tipo, objetivo: programa.objetivo,
        estado: programa.estado, fecha_medicion_pre: programa.fecha_medicion_pre,
        fecha_medicion_post: programa.fecha_medicion_post, fecha_creacion: programa.fecha_creacion
      },
      participantes: participantes,
      competencias: competencias,
      encuestas: encuestas,
      stats: {
        total_lideres: participantes.filter(function(p) { return p.rol_programa === 'lider'; }).length,
        total_colaboradores: participantes.filter(function(p) { return p.rol_programa === 'colaborador'; }).length,
        total_competencias: competencias.length,
        total_encuestas: encuestas.length
      }
    });
  } catch (e) {
    return respuestaError(e.message);
  }
}

/**
 * Asigna un colaborador a un lider dentro de un programa
 */
function asignarColaborador(token, programaId, liderId, colaboradorUserId, colaboradorData) {
  try {
    var sesion = autorizarAccion(token, [ROLES.ADMIN]);
    var colaboradorId = colaboradorUserId;

    if (!colaboradorId && colaboradorData) {
      var existente = getSheetData(HOJAS.USUARIOS)
        .filter(function(u) { return u.email === colaboradorData.email.trim().toLowerCase() && u.activo !== false; });
      if (existente.length > 0) {
        colaboradorId = existente[0].id;
      } else {
        colaboradorId = generarId();
        var prog = findById(HOJAS.PROGRAMAS, programaId);
        insertRow(HOJAS.USUARIOS, {
          id: colaboradorId, nombre_completo: colaboradorData.nombre.trim(),
          email: colaboradorData.email.trim().toLowerCase(),
          password_hash: hashPassword(colaboradorData.password || '123456'),
          cargo: colaboradorData.cargo || '', cliente_id: prog ? prog.cliente_id : '',
          rol: ROLES.COLABORADOR, area: '', equipo: '', jefatura_id: '',
          estado: ESTADOS_USUARIO.ACTIVO, fecha_creacion: fechaActual(),
          ultimo_acceso: '', activo: true
        });
      }
    }

    if (!colaboradorId) return respuestaError('Debe indicar un colaborador.');

    var yaExiste = getSheetData(HOJAS.PROGRAMA_PARTICIPANTES)
      .filter(function(p) {
        return p.programa_id === programaId && p.usuario_id === colaboradorId &&
               p.rol_programa === 'colaborador' && p.activo !== false;
      });

    if (yaExiste.length > 0) {
      updateById(HOJAS.PROGRAMA_PARTICIPANTES, yaExiste[0].id, { lider_id: liderId });
    } else {
      insertRow(HOJAS.PROGRAMA_PARTICIPANTES, {
        id: generarId(), programa_id: programaId, usuario_id: colaboradorId,
        rol_programa: ROLES_PROGRAMA.COLABORADOR, lider_id: liderId,
        fecha_inicio: fechaActual(), fecha_termino: '', activo: true
      });
    }

    registrarAuditLog(sesion.userId, 'asignar_colaborador', HOJAS.PROGRAMA_PARTICIPANTES, programaId,
      'Colaborador asignado a lider ' + liderId);
    return respuestaOk({ message: 'Colaborador asignado correctamente.' });
  } catch (e) {
    return respuestaError(e.message);
  }
}

/**
 * Obtiene resumen/KPIs del programa
 */
function obtenerResumenPrograma(token, programaId) {
  try {
    var sesion = autorizarAccion(token, [ROLES.ADMIN, ROLES.JEFATURA, ROLES.PARTICIPANTE]);

    var participaciones = getSheetData(HOJAS.PROGRAMA_PARTICIPANTES)
      .filter(function(p) { return p.programa_id === programaId && p.activo !== false; });
    var encuestas = getSheetData(HOJAS.ENCUESTAS)
      .filter(function(e) { return e.programa_id === programaId && e.activo !== false; });
    var respuestas = getSheetData(HOJAS.ENCUESTA_RESPUESTAS)
      .filter(function(r) { return r.programa_id === programaId && r.activo !== false; });
    var observaciones = getSheetData(HOJAS.OBSERVACIONES_JEFATURA)
      .filter(function(o) { return o.programa_id === programaId && o.activo !== false; });
    var usuarios = getSheetData(HOJAS.USUARIOS);
    var usrMap = {};
    usuarios.forEach(function(u) { usrMap[u.id] = u; });

    var lideres = participaciones.filter(function(p) { return p.rol_programa === 'lider'; });
    var colaboradores = participaciones.filter(function(p) { return p.rol_programa === 'colaborador'; });

    var estadoEvaluaciones = lideres.map(function(lider) {
      var u = usrMap[lider.usuario_id] || {};
      var colabPart = colaboradores.filter(function(c) { return c.lider_id === lider.usuario_id; });
      var colabUser = colabPart.length > 0 ? (usrMap[colabPart[0].usuario_id] || {}) : {};

      var resultado = {
        lider_id: lider.usuario_id, lider_nombre: u.nombre_completo || '',
        lider_cargo: u.cargo || '', colaborador_nombre: colabUser.nombre_completo || '',
        colaborador_email: colabUser.email || '',
        auto_pre: false, co_pre: false, auto_post: false, co_post: false
      };

      encuestas.forEach(function(enc) {
        var tieneRespuesta = respuestas.some(function(r) {
          if (enc.tipo_cuestionario === 'coevaluacion') {
            return r.encuesta_id === enc.id && colabPart.length > 0 && r.usuario_id === colabPart[0].usuario_id;
          }
          return r.encuesta_id === enc.id && r.usuario_id === lider.usuario_id;
        });
        if (enc.tipo_cuestionario === 'autoevaluacion' && enc.tipo === 'pre') resultado.auto_pre = tieneRespuesta;
        if (enc.tipo_cuestionario === 'coevaluacion' && enc.tipo === 'pre') resultado.co_pre = tieneRespuesta;
        if (enc.tipo_cuestionario === 'autoevaluacion' && enc.tipo === 'post') resultado.auto_post = tieneRespuesta;
        if (enc.tipo_cuestionario === 'coevaluacion' && enc.tipo === 'post') resultado.co_post = tieneRespuesta;
      });
      return resultado;
    });

    var respondieronAuto = {}, respondieronCo = {};
    respuestas.forEach(function(r) {
      var enc = encuestas.filter(function(e) { return e.id === r.encuesta_id; })[0];
      if (enc) {
        if (enc.tipo_cuestionario === 'autoevaluacion') respondieronAuto[r.usuario_id] = true;
        if (enc.tipo_cuestionario === 'coevaluacion') respondieronCo[r.usuario_id] = true;
      }
    });

    return respuestaOk({
      total_lideres: lideres.length,
      total_colaboradores: colaboradores.length,
      total_encuestas: encuestas.length,
      autoevaluaciones_completadas: Object.keys(respondieronAuto).length,
      coevaluaciones_completadas: Object.keys(respondieronCo).length,
      observaciones_realizadas: observaciones.length,
      estado_evaluaciones: estadoEvaluaciones
    });
  } catch (e) {
    return respuestaError(e.message);
  }
}

/**
 * Importa participantes desde Excel (crea usuarios + asocia al programa)
 */
function importarParticipantesExcel(token, programaId, participantesData) {
  try {
    var sesion = autorizarAccion(token, [ROLES.ADMIN]);
    var programa = findById(HOJAS.PROGRAMAS, programaId);
    if (!programa) return respuestaError('Programa no encontrado.');

    var lock = LockService.getScriptLock();
    lock.waitLock(30000);

    var creados = 0;
    var asociados = 0;

    try {
      var usuariosExistentes = getSheetData(HOJAS.USUARIOS);
      var emailMap = {};
      usuariosExistentes.forEach(function(u) {
        if (u.activo !== false) emailMap[u.email] = u;
      });

      var participacionesExistentes = getSheetData(HOJAS.PROGRAMA_PARTICIPANTES)
        .filter(function(p) { return p.programa_id === programaId && p.activo !== false; });
      var yaAsociados = {};
      participacionesExistentes.forEach(function(p) { yaAsociados[p.usuario_id] = true; });

      participantesData.forEach(function(p) {
        var email = p.email.trim().toLowerCase();
        if (!email) return;

        // Buscar o crear usuario lider
        var usuario = emailMap[email];
        if (!usuario) {
          var userId = generarId();
          insertRow(HOJAS.USUARIOS, {
            id: userId,
            nombre_completo: p.nombre.trim(),
            email: email,
            password_hash: hashPassword(p.password || '123456'),
            cargo: p.cargo || '',
            cliente_id: programa.cliente_id,
            rol: p.rol === 'colaborador' ? ROLES.COLABORADOR : ROLES.PARTICIPANTE,
            area: '', equipo: '', jefatura_id: '',
            estado: ESTADOS_USUARIO.ACTIVO,
            fecha_creacion: fechaActual(),
            ultimo_acceso: '', activo: true
          });
          usuario = { id: userId, email: email };
          emailMap[email] = usuario;
          creados++;
        }

        // Asociar al programa como lider (si no esta ya)
        var rolProg = p.rol === 'colaborador' ? 'colaborador' : 'lider';
        if (!yaAsociados[usuario.id]) {
          insertRow(HOJAS.PROGRAMA_PARTICIPANTES, {
            id: generarId(), programa_id: programaId, usuario_id: usuario.id,
            rol_programa: rolProg, lider_id: '', fecha_inicio: fechaActual(),
            fecha_termino: '', activo: true
          });
          yaAsociados[usuario.id] = true;
          asociados++;
        }

        // Si tiene colaborador, crear/buscar y asignar
        if (p.colaborador_email && p.colaborador_nombre && rolProg === 'lider') {
          var colabEmail = p.colaborador_email.trim().toLowerCase();
          var colabUsuario = emailMap[colabEmail];

          if (!colabUsuario) {
            var colabId = generarId();
            insertRow(HOJAS.USUARIOS, {
              id: colabId,
              nombre_completo: p.colaborador_nombre.trim(),
              email: colabEmail,
              password_hash: hashPassword('123456'),
              cargo: '',
              cliente_id: programa.cliente_id,
              rol: ROLES.COLABORADOR,
              area: '', equipo: '', jefatura_id: '',
              estado: ESTADOS_USUARIO.ACTIVO,
              fecha_creacion: fechaActual(),
              ultimo_acceso: '', activo: true
            });
            colabUsuario = { id: colabId, email: colabEmail };
            emailMap[colabEmail] = colabUsuario;
            creados++;
          }

          // Asociar colaborador al programa
          if (!yaAsociados[colabUsuario.id]) {
            insertRow(HOJAS.PROGRAMA_PARTICIPANTES, {
              id: generarId(), programa_id: programaId, usuario_id: colabUsuario.id,
              rol_programa: 'colaborador', lider_id: usuario.id,
              fecha_inicio: fechaActual(), fecha_termino: '', activo: true
            });
            yaAsociados[colabUsuario.id] = true;
            asociados++;
          } else {
            // Actualizar lider_id si ya existe
            var existente = participacionesExistentes.filter(function(pp) {
              return pp.usuario_id === colabUsuario.id && pp.rol_programa === 'colaborador';
            });
            if (existente.length > 0) {
              updateById(HOJAS.PROGRAMA_PARTICIPANTES, existente[0].id, { lider_id: usuario.id });
            }
          }
        }
      });

      registrarAuditLog(sesion.userId, 'importar', HOJAS.PROGRAMA_PARTICIPANTES, programaId,
        'Importados ' + asociados + ' participantes (' + creados + ' usuarios creados) desde Excel');

    } finally {
      lock.releaseLock();
    }

    return respuestaOk({
      creados: creados,
      asociados: asociados,
      message: asociados + ' participantes importados (' + creados + ' usuarios nuevos creados).'
    });
  } catch (e) {
    console.error('Error en importarParticipantesExcel: ' + e.message);
    return respuestaError(e.message);
  }
}
