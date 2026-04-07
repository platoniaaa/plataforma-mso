/**
 * ClientesDB.gs — CRUD de clientes
 * Plataforma TPT - MSO Chile
 */

/**
 * Crea un nuevo cliente
 */
function crearCliente(token, datos) {
  try {
    var sesion = autorizarAccion(token, [ROLES.ADMIN]);

    validarRequerido(datos.nombre, 'Nombre del cliente');
    validarRequerido(datos.contacto_nombre, 'Nombre del contacto');
    validarRequerido(datos.contacto_email, 'Email del contacto');

    if (!validarEmail(datos.contacto_email)) {
      return respuestaError('Ingresa un email de contacto válido.');
    }

    if (!validarNombreUnico(HOJAS.CLIENTES, datos.nombre)) {
      return respuestaError('Ya existe un cliente con ese nombre.');
    }

    var lock = LockService.getScriptLock();
    lock.waitLock(10000);

    try {
      var clienteId = generarId();
      insertRow(HOJAS.CLIENTES, {
        id: clienteId,
        nombre: datos.nombre.trim(),
        razon_social: datos.razon_social || '',
        rubro: datos.rubro || '',
        pais: datos.pais || 'Chile',
        contacto_nombre: datos.contacto_nombre.trim(),
        contacto_email: datos.contacto_email.trim().toLowerCase(),
        estado: ESTADOS_CLIENTE.ACTIVO,
        fecha_creacion: fechaActual(),
        creado_por: sesion.userId,
        activo: true
      });

      registrarAuditLog(sesion.userId, 'crear', HOJAS.CLIENTES, clienteId, 'Cliente creado: ' + datos.nombre);
    } finally {
      lock.releaseLock();
    }

    return respuestaOk({ clienteId: clienteId, message: 'Cliente creado exitosamente.' });
  } catch (e) {
    console.error('Error en crearCliente: ' + e.message);
    return respuestaError(e.message);
  }
}

/**
 * Lista todos los clientes activos
 */
function listarClientes(token) {
  try {
    autorizarAccion(token, [ROLES.ADMIN]);

    var clientes = getSheetData(HOJAS.CLIENTES);
    var resultado = clientes
      .filter(function(c) { return c.activo !== false && c.activo !== 'FALSE'; })
      .map(function(c) {
        return {
          id: c.id,
          nombre: c.nombre,
          razon_social: c.razon_social,
          rubro: c.rubro,
          pais: c.pais,
          contacto_nombre: c.contacto_nombre,
          contacto_email: c.contacto_email,
          estado: c.estado,
          fecha_creacion: c.fecha_creacion
        };
      });

    return respuestaOk(resultado);
  } catch (e) {
    console.error('Error en listarClientes: ' + e.message);
    return respuestaError(e.message);
  }
}

/**
 * Obtiene un cliente por ID
 */
function obtenerCliente(token, id) {
  try {
    autorizarAccion(token, [ROLES.ADMIN]);

    var cliente = findById(HOJAS.CLIENTES, id);
    if (!cliente || cliente.activo === false) {
      return respuestaError('Cliente no encontrado.');
    }

    return respuestaOk(cliente);
  } catch (e) {
    return respuestaError(e.message);
  }
}

/**
 * Actualiza un cliente
 */
function actualizarCliente(token, id, datos) {
  try {
    var sesion = autorizarAccion(token, [ROLES.ADMIN]);

    var cliente = findById(HOJAS.CLIENTES, id);
    if (!cliente || cliente.activo === false) {
      return respuestaError('Cliente no encontrado.');
    }

    if (datos.nombre && datos.nombre !== cliente.nombre) {
      if (!validarNombreUnico(HOJAS.CLIENTES, datos.nombre)) {
        return respuestaError('Ya existe un cliente con ese nombre.');
      }
    }

    if (datos.contacto_email && !validarEmail(datos.contacto_email)) {
      return respuestaError('Ingresa un email de contacto válido.');
    }

    var cambios = {};
    var campos = ['nombre', 'razon_social', 'rubro', 'pais', 'contacto_nombre', 'contacto_email', 'estado'];
    campos.forEach(function(campo) {
      if (datos[campo] !== undefined) {
        cambios[campo] = typeof datos[campo] === 'string' ? datos[campo].trim() : datos[campo];
      }
    });

    updateById(HOJAS.CLIENTES, id, cambios);
    registrarAuditLog(sesion.userId, 'editar', HOJAS.CLIENTES, id, 'Cliente actualizado');

    return respuestaOk({ message: 'Cliente actualizado exitosamente.' });
  } catch (e) {
    return respuestaError(e.message);
  }
}

/**
 * Desactiva un cliente (eliminación lógica)
 */
function desactivarCliente(token, id) {
  try {
    var sesion = autorizarAccion(token, [ROLES.ADMIN]);

    var cliente = findById(HOJAS.CLIENTES, id);
    if (!cliente) {
      return respuestaError('Cliente no encontrado.');
    }

    // Verificar que no tenga programas activos
    var programas = findWhere(HOJAS.PROGRAMAS, { cliente_id: id, estado: ESTADOS_PROGRAMA.ACTIVO });
    var programasActivos = programas.filter(function(p) { return p.activo !== false; });

    if (programasActivos.length > 0) {
      return respuestaError('Este cliente tiene programas activos. Finaliza los programas antes de desactivar el cliente.');
    }

    updateById(HOJAS.CLIENTES, id, { activo: false, estado: ESTADOS_CLIENTE.INACTIVO });
    registrarAuditLog(sesion.userId, 'desactivar', HOJAS.CLIENTES, id, 'Cliente desactivado: ' + cliente.nombre);

    return respuestaOk({ message: 'Cliente desactivado exitosamente.' });
  } catch (e) {
    return respuestaError(e.message);
  }
}
