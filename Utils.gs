/**
 * Utils.gs — Funciones auxiliares, validaciones, formatos
 * Plataforma TPT - MSO Chile
 */

// ============================================
// ACCESO A BASE DE DATOS
// ============================================

/**
 * Obtiene el Spreadsheet de la base de datos
 */
function getDB() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

/**
 * Obtiene una hoja por nombre
 */
function getSheet(nombre) {
  var sheet = getDB().getSheetByName(nombre);
  if (!sheet) {
    throw new Error('Hoja no encontrada: ' + nombre);
  }
  return sheet;
}

/**
 * Lee todos los datos de una hoja como array de objetos
 */
function getSheetData(nombreHoja) {
  var sheet = getSheet(nombreHoja);
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  var headers = data[0];
  var result = [];
  for (var i = 1; i < data.length; i++) {
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      var val = data[i][j];
      // Convertir Date a string para que google.script.run pueda serializarlo
      if (val instanceof Date) {
        val = val.toISOString();
      }
      obj[headers[j]] = val;
    }
    obj._row = i + 1;
    result.push(obj);
  }
  return result;
}

/**
 * Busca un registro por ID en una hoja
 */
function findById(nombreHoja, id) {
  var datos = getSheetData(nombreHoja);
  for (var i = 0; i < datos.length; i++) {
    if (datos[i].id === id) {
      return datos[i];
    }
  }
  return null;
}

/**
 * Busca registros que coincidan con un filtro
 */
function findWhere(nombreHoja, filtros) {
  var datos = getSheetData(nombreHoja);
  return datos.filter(function(row) {
    for (var key in filtros) {
      if (row[key] !== filtros[key]) return false;
    }
    return true;
  });
}

/**
 * Inserta una nueva fila en una hoja
 */
function insertRow(nombreHoja, datos) {
  var sheet = getSheet(nombreHoja);
  // Leer encabezados reales de la hoja (no de ENCABEZADOS) para respetar el orden actual de columnas
  var lastCol = sheet.getLastColumn();
  if (lastCol === 0) {
    // Hoja vacía, usar ENCABEZADOS para crear la primera fila
    var headers = ENCABEZADOS[nombreHoja];
    if (!headers) throw new Error('Encabezados no definidos para: ' + nombreHoja);
    sheet.appendRow(headers);
    lastCol = headers.length;
  }
  var sheetHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

  var row = sheetHeaders.map(function(h) {
    return datos[h] !== undefined ? datos[h] : '';
  });

  sheet.appendRow(row);
  return datos.id;
}

/**
 * Actualiza campos específicos de un registro por ID
 */
function updateById(nombreHoja, id, cambios) {
  var sheet = getSheet(nombreHoja);
  var data = sheet.getDataRange().getValues();
  var headers = data[0];

  var idCol = headers.indexOf('id');
  if (idCol === -1) throw new Error('Columna id no encontrada en: ' + nombreHoja);

  for (var i = 1; i < data.length; i++) {
    if (data[i][idCol] === id) {
      for (var campo in cambios) {
        var colIdx = headers.indexOf(campo);
        if (colIdx !== -1) {
          sheet.getRange(i + 1, colIdx + 1).setValue(cambios[campo]);
        }
      }
      return true;
    }
  }
  return false;
}

// ============================================
// GENERACIÓN DE IDs
// ============================================

/**
 * Genera un UUID único
 */
function generarId() {
  return Utilities.getUuid();
}

// ============================================
// HASH DE CONTRASEÑAS
// ============================================

/**
 * Genera hash SHA-256 de una contraseña
 */
function hashPassword(password) {
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password);
  return digest.map(function(byte) {
    var hex = (byte < 0 ? byte + 256 : byte).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

// ============================================
// VALIDACIONES
// ============================================

/**
 * Valida formato de email
 */
function validarEmail(email) {
  var regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

/**
 * Valida que un campo no esté vacío
 */
function validarRequerido(valor, nombreCampo) {
  if (!valor || (typeof valor === 'string' && valor.trim() === '')) {
    throw new Error('El campo ' + nombreCampo + ' es obligatorio.');
  }
  return true;
}

/**
 * Valida longitud mínima
 */
function validarMinLength(valor, min, nombreCampo) {
  if (!valor || valor.length < min) {
    throw new Error(nombreCampo + ' debe tener al menos ' + min + ' caracteres.');
  }
  return true;
}

/**
 * Valida que un email sea único en una hoja
 */
function validarEmailUnico(email) {
  var usuarios = getSheetData(HOJAS.USUARIOS);
  for (var i = 0; i < usuarios.length; i++) {
    if (usuarios[i].email === email && usuarios[i].activo !== false) {
      return false;
    }
  }
  return true;
}

/**
 * Valida que un nombre sea único dentro de un contexto
 */
function validarNombreUnico(nombreHoja, nombre, filtroExtra) {
  var datos = getSheetData(nombreHoja);
  for (var i = 0; i < datos.length; i++) {
    if (datos[i].nombre === nombre && datos[i].activo !== false) {
      if (filtroExtra) {
        var match = true;
        for (var key in filtroExtra) {
          if (datos[i][key] !== filtroExtra[key]) match = false;
        }
        if (match) return false;
      } else {
        return false;
      }
    }
  }
  return true;
}

// ============================================
// FORMATEO
// ============================================

/**
 * Obtiene fecha actual en formato ISO 8601
 */
function fechaActual() {
  return new Date().toISOString();
}

/**
 * Formatea una fecha para mostrar
 */
function formatearFecha(fecha) {
  if (!fecha) return '';
  var d = new Date(fecha);
  var dia = ('0' + d.getDate()).slice(-2);
  var mes = ('0' + (d.getMonth() + 1)).slice(-2);
  var anio = d.getFullYear();
  return dia + '/' + mes + '/' + anio;
}

/**
 * Formatea fecha y hora para mostrar
 */
function formatearFechaHora(fecha) {
  if (!fecha) return '';
  var d = new Date(fecha);
  return formatearFecha(fecha) + ' ' +
    ('0' + d.getHours()).slice(-2) + ':' +
    ('0' + d.getMinutes()).slice(-2);
}

// ============================================
// AUDIT LOG
// ============================================

/**
 * Registra una acción en el AuditLog
 */
function registrarAuditLog(usuarioId, accion, entidad, entidadId, detalle) {
  try {
    insertRow(HOJAS.AUDIT_LOG, {
      id: generarId(),
      usuario_id: usuarioId,
      accion: accion,
      entidad: entidad,
      entidad_id: entidadId || '',
      detalle: detalle || '',
      fecha: fechaActual()
    });
  } catch (e) {
    console.error('Error al registrar audit log: ' + e.message);
  }
}

// ============================================
// RESPUESTA ESTÁNDAR
// ============================================

/**
 * Crea una respuesta exitosa
 */
function respuestaOk(data) {
  return { success: true, data: data };
}

/**
 * Crea una respuesta de error
 */
function respuestaError(mensaje) {
  return { success: false, error: mensaje };
}

// ============================================
// CONVERSIÓN DE VALORES NUMÉRICOS
// ============================================

/**
 * Convierte un valor de respuesta a valor numérico normalizado (0-5)
 */
function convertirAValorNumerico(valor, tipoRespuesta) {
  switch (tipoRespuesta) {
    case 'niveles_competencia':
      var niv = parseInt(valor);
      return isNaN(niv) ? 0 : niv;
    case 'escala_1_5':
      var num = parseInt(valor);
      return isNaN(num) ? 0 : num;
    case 'alternativas':
      var alt = parseInt(valor);
      return isNaN(alt) ? 0 : alt;
    case 'si_no':
      return valor === 'si' || valor === 'Sí' || valor === true ? 5 : 0;
    case 'logrado_parcial_no':
      if (valor === 'logrado' || valor === 'Logrado') return 5;
      if (valor === 'parcial' || valor === 'Parcial') return 3;
      return 0;
    case 'texto_breve':
    case 'parrafo':
      return 0;
    default:
      var def = parseInt(valor);
      return isNaN(def) ? 0 : def;
  }
}

// ============================================
// INICIALIZACIÓN DE BASE DE DATOS
// ============================================

/**
 * Crea todas las hojas con sus encabezados si no existen
 * Ejecutar UNA vez al configurar el sistema
 */
function inicializarBaseDeDatos() {
  var ss = getDB();

  for (var nombreHoja in ENCABEZADOS) {
    var sheet = ss.getSheetByName(nombreHoja);
    if (!sheet) {
      sheet = ss.insertSheet(nombreHoja);
      sheet.appendRow(ENCABEZADOS[nombreHoja]);
      // Formato de encabezados
      var headerRange = sheet.getRange(1, 1, 1, ENCABEZADOS[nombreHoja].length);
      headerRange.setFontWeight('bold');
      headerRange.setBackground('#1B4F72');
      headerRange.setFontColor('#FFFFFF');
      sheet.setFrozenRows(1);
    }
  }

  // Crear admin por defecto si no existe
  var usuarios = getSheetData(HOJAS.USUARIOS);
  var adminExiste = usuarios.some(function(u) { return u.rol === 'admin'; });

  if (!adminExiste) {
    insertRow(HOJAS.USUARIOS, {
      id: generarId(),
      nombre_completo: 'Administrador MSO',
      email: 'admin@msochile.cl',
      password_hash: hashPassword('admin123'),
      cargo: 'Administrador',
      cliente_id: '',
      rol: 'admin',
      area: '',
      equipo: '',
      jefatura_id: '',
      estado: 'activo',
      fecha_creacion: fechaActual(),
      ultimo_acceso: '',
      activo: true
    });
  }

  // Actualizar encabezados de hojas existentes (agregar columnas faltantes)
  for (var nombreHoja in ENCABEZADOS) {
    var sheet = ss.getSheetByName(nombreHoja);
    if (sheet && sheet.getLastRow() > 0) {
      var lastCol = sheet.getLastColumn();
      var currentHeaders = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
      var expectedHeaders = ENCABEZADOS[nombreHoja];
      var currentSet = {};
      currentHeaders.forEach(function(h) { if (h) currentSet[h] = true; });

      // Agregar columnas faltantes al final
      expectedHeaders.forEach(function(h) {
        if (!currentSet[h]) {
          var nextCol = sheet.getLastColumn() + 1;
          sheet.getRange(1, nextCol).setValue(h).setFontWeight('bold').setBackground('#1B4F72').setFontColor('#FFFFFF');
        }
      });
    }
  }

  return 'Base de datos inicializada correctamente. Columnas actualizadas.';
}

/**
 * Repara hojas cuyas columnas están en orden diferente al esperado.
 * Reordena los datos para que coincidan con ENCABEZADOS.
 * Ejecutar UNA vez si hay datos desalineados.
 */
function repararColumnasHojas() {
  var ss = getDB();
  var reparadas = [];

  for (var nombreHoja in ENCABEZADOS) {
    var sheet = ss.getSheetByName(nombreHoja);
    if (!sheet || sheet.getLastRow() <= 1) continue;

    var lastCol = sheet.getLastColumn();
    var currentHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var expectedHeaders = ENCABEZADOS[nombreHoja];

    // Verificar si el orden es diferente
    var needsRepair = false;
    if (currentHeaders.length !== expectedHeaders.length) {
      needsRepair = true;
    } else {
      for (var i = 0; i < expectedHeaders.length; i++) {
        if (currentHeaders[i] !== expectedHeaders[i]) {
          needsRepair = true;
          break;
        }
      }
    }

    if (!needsRepair) continue;

    // Leer todos los datos como objetos (usando headers actuales)
    var allData = sheet.getDataRange().getValues();
    var oldHeaders = allData[0];
    var rows = [];
    for (var r = 1; r < allData.length; r++) {
      var obj = {};
      for (var c = 0; c < oldHeaders.length; c++) {
        if (oldHeaders[c]) obj[oldHeaders[c]] = allData[r][c];
      }
      rows.push(obj);
    }

    // Reescribir la hoja con el orden correcto
    sheet.clear();
    sheet.appendRow(expectedHeaders);
    var headerRange = sheet.getRange(1, 1, 1, expectedHeaders.length);
    headerRange.setFontWeight('bold').setBackground('#1B4F72').setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);

    rows.forEach(function(obj) {
      var newRow = expectedHeaders.map(function(h) {
        return obj[h] !== undefined ? obj[h] : '';
      });
      sheet.appendRow(newRow);
    });

    reparadas.push(nombreHoja);
  }

  return 'Hojas reparadas: ' + (reparadas.length > 0 ? reparadas.join(', ') : 'ninguna (todo OK)');
}
