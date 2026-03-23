/**
 * Auth.gs — Autenticación, login, registro, gestión de sesiones
 * Plataforma TPT - MSO Chile
 */

/**
 * Registra un nuevo usuario con estado PENDIENTE
 * @param {Object} datos - {nombre, email, password, confirmPassword, cargo, clienteId}
 * @returns {Object} {success, message}
 */
function registrarUsuario(datos) {
  try {
    // Validaciones
    validarRequerido(datos.nombre, 'Nombre completo');
    validarRequerido(datos.email, 'Email');
    validarRequerido(datos.password, 'Contraseña');
    validarRequerido(datos.clienteId, 'Empresa');

    if (!validarEmail(datos.email)) {
      return respuestaError('Ingresa un email válido.');
    }

    validarMinLength(datos.password, 6, 'La contraseña');

    if (datos.password !== datos.confirmPassword) {
      return respuestaError('Las contraseñas no coinciden.');
    }

    // Verificar email único
    if (!validarEmailUnico(datos.email)) {
      return respuestaError('Este email ya está registrado.');
    }

    // Verificar que el cliente existe y está activo
    var cliente = findById(HOJAS.CLIENTES, datos.clienteId);
    if (!cliente || cliente.activo === false) {
      return respuestaError('La empresa seleccionada no existe.');
    }

    var lock = LockService.getScriptLock();
    lock.waitLock(10000);

    try {
      // Crear usuario
      var userId = generarId();
      insertRow(HOJAS.USUARIOS, {
        id: userId,
        nombre_completo: datos.nombre.trim(),
        email: datos.email.trim().toLowerCase(),
        password_hash: hashPassword(datos.password),
        cargo: datos.cargo || '',
        cliente_id: datos.clienteId,
        rol: ROLES.PARTICIPANTE, // Rol por defecto, admin lo cambia después
        area: '',
        equipo: '',
        jefatura_id: '',
        estado: ESTADOS_USUARIO.PENDIENTE,
        fecha_creacion: fechaActual(),
        ultimo_acceso: '',
        activo: true
      });

      // Registrar en audit log
      registrarAuditLog(userId, 'crear', HOJAS.USUARIOS, userId, 'Auto-registro de usuario');

      // Notificar a admins
      notificarNuevoRegistro(datos.nombre, datos.email, cliente.nombre);

    } finally {
      lock.releaseLock();
    }

    return respuestaOk({ message: 'Tu registro fue recibido. Un administrador activará tu cuenta.' });

  } catch (e) {
    console.error('Error en registrarUsuario: ' + e.message);
    return respuestaError(e.message);
  }
}

/**
 * Notifica a los administradores sobre un nuevo registro
 */
function notificarNuevoRegistro(nombre, email, empresa) {
  try {
    var admins = findWhere(HOJAS.USUARIOS, { rol: ROLES.ADMIN, estado: ESTADOS_USUARIO.ACTIVO });
    admins.forEach(function(admin) {
      // Notificación in-app
      insertRow(HOJAS.NOTIFICACIONES, {
        id: generarId(),
        usuario_id: admin.id,
        tipo: 'registro_pendiente',
        titulo: 'Nuevo usuario pendiente de aprobación',
        mensaje: 'Nuevo registro: ' + nombre + ' (' + email + ') de ' + empresa,
        leida: false,
        email_enviado: false,
        fecha: fechaActual()
      });

      // Email
      try {
        MailApp.sendEmail({
          to: admin.email,
          subject: '[MSO TPT] Nuevo usuario pendiente de aprobación',
          htmlBody: '<h3>Nuevo registro en la plataforma</h3>' +
            '<p><strong>Nombre:</strong> ' + nombre + '</p>' +
            '<p><strong>Email:</strong> ' + email + '</p>' +
            '<p><strong>Empresa:</strong> ' + empresa + '</p>' +
            '<p>Ingresa a la plataforma para aprobar o rechazar el registro.</p>'
        });
      } catch (emailError) {
        console.error('Error enviando email de notificación: ' + emailError.message);
      }
    });
  } catch (e) {
    console.error('Error en notificarNuevoRegistro: ' + e.message);
  }
}

/**
 * Inicia sesión de un usuario
 * @param {String} email
 * @param {String} password
 * @returns {Object} {success, token, usuario} o {success:false, error}
 */
function loginUsuario(email, password) {
  try {
    validarRequerido(email, 'Email');
    validarRequerido(password, 'Contraseña');

    email = email.trim().toLowerCase();
    var passwordHash = hashPassword(password);

    var usuarios = getSheetData(HOJAS.USUARIOS);
    var usuario = null;

    for (var i = 0; i < usuarios.length; i++) {
      if (usuarios[i].email === email && usuarios[i].activo !== false) {
        usuario = usuarios[i];
        break;
      }
    }

    if (!usuario) {
      return respuestaError('Credenciales inválidas.');
    }

    if (usuario.password_hash !== passwordHash) {
      return respuestaError('Credenciales inválidas.');
    }

    if (usuario.estado === ESTADOS_USUARIO.PENDIENTE) {
      return respuestaError('Tu cuenta está pendiente de aprobación. Un administrador la activará pronto.');
    }

    if (usuario.estado === ESTADOS_USUARIO.INACTIVO) {
      return respuestaError('Tu cuenta ha sido desactivada. Contacta al administrador.');
    }

    // Generar token de sesión
    var token = generarId();
    var sessionData = {
      userId: usuario.id,
      rol: usuario.rol,
      clienteId: usuario.cliente_id,
      nombre: usuario.nombre_completo,
      email: usuario.email,
      expiry: new Date(Date.now() + SESSION_EXPIRY_HOURS * 60 * 60 * 1000).toISOString()
    };

    PropertiesService.getScriptProperties().setProperty('session_' + token, JSON.stringify(sessionData));

    // Actualizar último acceso
    updateById(HOJAS.USUARIOS, usuario.id, { ultimo_acceso: fechaActual() });

    // Audit log
    registrarAuditLog(usuario.id, 'login', HOJAS.USUARIOS, usuario.id, 'Login exitoso');

    return respuestaOk({
      token: token,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre_completo,
        email: usuario.email,
        rol: usuario.rol,
        clienteId: usuario.cliente_id,
        cargo: usuario.cargo
      }
    });

  } catch (e) {
    console.error('Error en loginUsuario: ' + e.message);
    return respuestaError('Error al iniciar sesión. Intenta de nuevo.');
  }
}

/**
 * Valida un token de sesión
 * @param {String} token
 * @returns {Object|null} {valid, userId, rol, clienteId} o null
 */
function validarToken(token) {
  if (!token) return null;

  try {
    var props = PropertiesService.getScriptProperties();
    var sessionStr = props.getProperty('session_' + token);

    if (!sessionStr) return null;

    var session = JSON.parse(sessionStr);

    // Verificar expiración
    if (new Date(session.expiry) < new Date()) {
      props.deleteProperty('session_' + token);
      return null;
    }

    return {
      valid: true,
      userId: session.userId,
      rol: session.rol,
      clienteId: session.clienteId,
      nombre: session.nombre,
      email: session.email
    };
  } catch (e) {
    console.error('Error validando token: ' + e.message);
    return null;
  }
}

/**
 * Valida token y verifica rol requerido
 * @param {String} token
 * @param {Array} rolesPermitidos - Array de roles permitidos
 * @returns {Object} Datos de sesión
 * @throws {Error} Si no hay permiso
 */
function autorizarAccion(token, rolesPermitidos) {
  var sesion = validarToken(token);
  if (!sesion) {
    throw new Error('Tu sesión ha expirado. Por favor inicia sesión nuevamente.');
  }

  if (rolesPermitidos && rolesPermitidos.indexOf(sesion.rol) === -1) {
    throw new Error('No tienes permisos para realizar esta acción.');
  }

  return sesion;
}

/**
 * Cierra la sesión del usuario
 * @param {String} token
 * @returns {Object} {success}
 */
function cerrarSesion(token) {
  try {
    if (token) {
      var sesion = validarToken(token);
      if (sesion) {
        registrarAuditLog(sesion.userId, 'logout', HOJAS.USUARIOS, sesion.userId, 'Cierre de sesión');
      }
      PropertiesService.getScriptProperties().deleteProperty('session_' + token);
    }
    return respuestaOk({ message: 'Sesión cerrada correctamente.' });
  } catch (e) {
    return respuestaOk({ message: 'Sesión cerrada.' });
  }
}

/**
 * Obtiene lista de clientes activos para el desplegable de registro (función pública)
 * @returns {Array} [{id, nombre}]
 */
function obtenerClientesRegistro() {
  try {
    var clientes = getSheetData(HOJAS.CLIENTES);
    return clientes
      .filter(function(c) { return c.activo !== false && c.estado === ESTADOS_CLIENTE.ACTIVO; })
      .map(function(c) { return { id: c.id, nombre: c.nombre }; })
      .sort(function(a, b) { return a.nombre.localeCompare(b.nombre); });
  } catch (e) {
    console.error('Error en obtenerClientesRegistro: ' + e.message);
    return [];
  }
}
