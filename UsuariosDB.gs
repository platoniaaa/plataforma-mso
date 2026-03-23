/**
 * UsuariosDB.gs — CRUD de usuarios, carga masiva, aprobación
 * Plataforma TPT - MSO Chile
 */

/**
 * Lista usuarios con filtros opcionales
 */
function listarUsuarios(token, filtros) {
  try {
    var sesion = autorizarAccion(token, [ROLES.ADMIN]);
    filtros = filtros || {};

    var usuarios = getSheetData(HOJAS.USUARIOS);
    var resultado = usuarios
      .filter(function(u) {
        if (u.activo === false) return false;
        if (filtros.clienteId && u.cliente_id !== filtros.clienteId) return false;
        if (filtros.rol && u.rol !== filtros.rol) return false;
        if (filtros.estado && u.estado !== filtros.estado) return false;
        return true;
      })
      .map(function(u) {
        return {
          id: u.id,
          nombre_completo: u.nombre_completo,
          email: u.email,
          cargo: u.cargo,
          cliente_id: u.cliente_id,
          rol: u.rol,
          area: u.area,
          equipo: u.equipo,
          jefatura_id: u.jefatura_id,
          estado: u.estado,
          fecha_creacion: u.fecha_creacion,
          ultimo_acceso: u.ultimo_acceso
        };
      });

    // Agregar nombre de cliente
    var clientes = getSheetData(HOJAS.CLIENTES);
    var clientesMap = {};
    clientes.forEach(function(c) { clientesMap[c.id] = c.nombre; });

    resultado.forEach(function(u) {
      u.cliente_nombre = clientesMap[u.cliente_id] || 'MSO Chile';
    });

    return respuestaOk(resultado);
  } catch (e) {
    return respuestaError(e.message);
  }
}

/**
 * Crea un usuario manualmente (Admin)
 */
function crearUsuarioManual(token, datos) {
  try {
    var sesion = autorizarAccion(token, [ROLES.ADMIN]);

    validarRequerido(datos.nombre_completo, 'Nombre completo');
    validarRequerido(datos.email, 'Email');
    validarRequerido(datos.rol, 'Rol');

    if (!validarEmail(datos.email)) {
      return respuestaError('Ingresa un email válido.');
    }

    if (!validarEmailUnico(datos.email)) {
      return respuestaError('Este email ya está registrado.');
    }

    var password = datos.password || 'mso2026';

    var lock = LockService.getScriptLock();
    lock.waitLock(10000);

    try {
      var userId = generarId();
      insertRow(HOJAS.USUARIOS, {
        id: userId,
        nombre_completo: datos.nombre_completo.trim(),
        email: datos.email.trim().toLowerCase(),
        password_hash: hashPassword(password),
        cargo: datos.cargo || '',
        cliente_id: datos.cliente_id || '',
        rol: datos.rol,
        area: datos.area || '',
        equipo: datos.equipo || '',
        jefatura_id: datos.jefatura_id || '',
        estado: ESTADOS_USUARIO.ACTIVO,
        fecha_creacion: fechaActual(),
        ultimo_acceso: '',
        activo: true
      });

      registrarAuditLog(sesion.userId, 'crear', HOJAS.USUARIOS, userId, 'Usuario creado por admin: ' + datos.email);
    } finally {
      lock.releaseLock();
    }

    return respuestaOk({ userId: userId, message: 'Usuario creado exitosamente.' });
  } catch (e) {
    return respuestaError(e.message);
  }
}

/**
 * Actualiza datos de un usuario
 */
function actualizarUsuario(token, id, datos) {
  try {
    var sesion = autorizarAccion(token, [ROLES.ADMIN]);

    var usuario = findById(HOJAS.USUARIOS, id);
    if (!usuario || usuario.activo === false) {
      return respuestaError('Usuario no encontrado.');
    }

    var cambios = {};
    var campos = ['nombre_completo', 'cargo', 'cliente_id', 'rol', 'area', 'equipo', 'jefatura_id', 'estado'];
    campos.forEach(function(campo) {
      if (datos[campo] !== undefined) {
        cambios[campo] = datos[campo];
      }
    });

    updateById(HOJAS.USUARIOS, id, cambios);
    registrarAuditLog(sesion.userId, 'editar', HOJAS.USUARIOS, id, 'Usuario actualizado');

    return respuestaOk({ message: 'Usuario actualizado exitosamente.' });
  } catch (e) {
    return respuestaError(e.message);
  }
}

/**
 * Aprueba un usuario pendiente (activa + asigna rol)
 */
function aprobarUsuario(token, id, rol, jefaturaId) {
  try {
    var sesion = autorizarAccion(token, [ROLES.ADMIN]);

    var usuario = findById(HOJAS.USUARIOS, id);
    if (!usuario) {
      return respuestaError('Usuario no encontrado.');
    }

    if (usuario.estado !== ESTADOS_USUARIO.PENDIENTE) {
      return respuestaError('Este usuario no está en estado pendiente.');
    }

    var cambios = {
      estado: ESTADOS_USUARIO.ACTIVO,
      rol: rol || usuario.rol
    };

    if (jefaturaId) {
      cambios.jefatura_id = jefaturaId;
    }

    updateById(HOJAS.USUARIOS, id, cambios);
    registrarAuditLog(sesion.userId, 'editar', HOJAS.USUARIOS, id, 'Usuario aprobado con rol: ' + cambios.rol);

    // Notificar al usuario
    try {
      insertRow(HOJAS.NOTIFICACIONES, {
        id: generarId(),
        usuario_id: id,
        tipo: 'registro_aprobado',
        titulo: 'Cuenta activada',
        mensaje: 'Tu cuenta ha sido activada. Ya puedes acceder a la plataforma.',
        leida: false,
        email_enviado: false,
        fecha: fechaActual()
      });

      MailApp.sendEmail({
        to: usuario.email,
        subject: '[MSO TPT] Tu cuenta ha sido activada',
        htmlBody: '<h3>¡Bienvenido/a a la plataforma!</h3>' +
          '<p>Hola ' + usuario.nombre_completo + ',</p>' +
          '<p>Tu cuenta ha sido activada con el rol de <strong>' + cambios.rol + '</strong>.</p>' +
          '<p>Ya puedes acceder a la plataforma.</p>'
      });
    } catch (notifError) {
      console.error('Error en notificación: ' + notifError.message);
    }

    return respuestaOk({ message: 'Usuario aprobado exitosamente.' });
  } catch (e) {
    return respuestaError(e.message);
  }
}

/**
 * Desactiva un usuario
 */
function desactivarUsuario(token, id) {
  try {
    var sesion = autorizarAccion(token, [ROLES.ADMIN]);

    if (sesion.userId === id) {
      return respuestaError('No puedes desactivar tu propia cuenta.');
    }

    var usuario = findById(HOJAS.USUARIOS, id);
    if (!usuario) {
      return respuestaError('Usuario no encontrado.');
    }

    updateById(HOJAS.USUARIOS, id, { activo: false, estado: ESTADOS_USUARIO.INACTIVO });
    registrarAuditLog(sesion.userId, 'desactivar', HOJAS.USUARIOS, id, 'Usuario desactivado: ' + usuario.email);

    return respuestaOk({ message: 'Usuario desactivado.' });
  } catch (e) {
    return respuestaError(e.message);
  }
}

/**
 * Resetea la contraseña de un usuario
 */
function resetearPassword(token, id, nuevaPassword) {
  try {
    var sesion = autorizarAccion(token, [ROLES.ADMIN]);

    nuevaPassword = nuevaPassword || 'mso2026';

    updateById(HOJAS.USUARIOS, id, { password_hash: hashPassword(nuevaPassword) });
    registrarAuditLog(sesion.userId, 'editar', HOJAS.USUARIOS, id, 'Contraseña reseteada');

    return respuestaOk({ message: 'Contraseña reseteada exitosamente.' });
  } catch (e) {
    return respuestaError(e.message);
  }
}

/**
 * Carga masiva de usuarios desde datos de Excel
 */
function cargaMasivaUsuarios(token, clienteId, datosExcel) {
  try {
    var sesion = autorizarAccion(token, [ROLES.ADMIN]);

    if (!datosExcel || !datosExcel.length) {
      return respuestaError('No se recibieron datos para procesar.');
    }

    var creados = 0;
    var errores = [];
    var emailsProcesados = {};

    var lock = LockService.getScriptLock();
    lock.waitLock(30000);

    try {
      // Obtener jefaturas existentes para mapear jefatura_email
      var usuarios = getSheetData(HOJAS.USUARIOS);
      var emailToId = {};
      usuarios.forEach(function(u) {
        if (u.activo !== false) emailToId[u.email] = u.id;
      });

      datosExcel.forEach(function(fila, idx) {
        var numFila = idx + 2; // +2 por encabezado y 0-index

        try {
          // Validaciones
          if (!fila.nombre_completo) {
            errores.push('Fila ' + numFila + ': Nombre completo es obligatorio.');
            return;
          }
          if (!fila.email) {
            errores.push('Fila ' + numFila + ': Email es obligatorio.');
            return;
          }
          if (!validarEmail(fila.email)) {
            errores.push('Fila ' + numFila + ': Email inválido (' + fila.email + ').');
            return;
          }

          var emailLower = fila.email.trim().toLowerCase();

          // Verificar duplicados dentro del mismo Excel
          if (emailsProcesados[emailLower]) {
            errores.push('Fila ' + numFila + ': Email duplicado en el archivo (' + emailLower + ').');
            return;
          }

          // Verificar si ya existe en el sistema
          if (emailToId[emailLower]) {
            errores.push('Fila ' + numFila + ': Email ya registrado (' + emailLower + ').');
            return;
          }

          var rol = (fila.rol || 'participante').toLowerCase();
          if (rol !== 'participante' && rol !== 'jefatura') {
            errores.push('Fila ' + numFila + ': Rol inválido. Debe ser "participante" o "jefatura".');
            return;
          }

          // Buscar jefatura por email si se proporcionó
          var jefaturaId = '';
          if (fila.jefatura_email) {
            jefaturaId = emailToId[fila.jefatura_email.trim().toLowerCase()] || '';
          }

          var userId = generarId();
          var passwordDefault = 'mso2026';

          insertRow(HOJAS.USUARIOS, {
            id: userId,
            nombre_completo: fila.nombre_completo.trim(),
            email: emailLower,
            password_hash: hashPassword(passwordDefault),
            cargo: fila.cargo || '',
            cliente_id: clienteId,
            rol: rol,
            area: fila.area || '',
            equipo: fila.equipo || '',
            jefatura_id: jefaturaId,
            estado: ESTADOS_USUARIO.ACTIVO,
            fecha_creacion: fechaActual(),
            ultimo_acceso: '',
            activo: true
          });

          emailsProcesados[emailLower] = true;
          emailToId[emailLower] = userId;
          creados++;

        } catch (filaError) {
          errores.push('Fila ' + numFila + ': ' + filaError.message);
        }
      });
    } finally {
      lock.releaseLock();
    }

    registrarAuditLog(sesion.userId, 'crear', HOJAS.USUARIOS, '', 'Carga masiva: ' + creados + ' usuarios creados');

    return respuestaOk({
      creados: creados,
      errores: errores,
      message: 'Se procesaron ' + creados + ' de ' + datosExcel.length + ' registros.'
    });
  } catch (e) {
    return respuestaError(e.message);
  }
}

/**
 * Obtiene jefaturas de un cliente específico
 */
function obtenerJefaturasCliente(token, clienteId) {
  try {
    autorizarAccion(token, [ROLES.ADMIN]);

    var usuarios = getSheetData(HOJAS.USUARIOS);
    var jefaturas = usuarios
      .filter(function(u) {
        return u.activo !== false &&
               u.estado === ESTADOS_USUARIO.ACTIVO &&
               u.rol === ROLES.JEFATURA &&
               u.cliente_id === clienteId;
      })
      .map(function(u) {
        return { id: u.id, nombre: u.nombre_completo, email: u.email };
      });

    return respuestaOk(jefaturas);
  } catch (e) {
    return respuestaError(e.message);
  }
}
