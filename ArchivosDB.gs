/**
 * ArchivosDB.gs — Gestión de archivos del programa en Google Drive
 * Plataforma TPT - MSO Chile v2.0
 */

/**
 * Obtiene o crea la carpeta del programa en Drive
 */
function _getCarpetaPrograma(programaId) {
  var programa = findById(HOJAS.PROGRAMAS, programaId);
  var cliente = programa ? findById(HOJAS.CLIENTES, programa.cliente_id) : null;
  var nombreCarpeta = (cliente ? cliente.nombre : 'Sin Cliente') + ' - ' + (programa ? programa.nombre : programaId);

  // Buscar o crear carpeta raíz
  var carpetasRaiz = DriveApp.getFoldersByName(DRIVE_FOLDER_NAME);
  var raiz = carpetasRaiz.hasNext() ? carpetasRaiz.next() : DriveApp.createFolder(DRIVE_FOLDER_NAME);

  // Buscar o crear carpeta Programas
  var carpetasProg = raiz.getFoldersByName('Programas');
  var programas = carpetasProg.hasNext() ? carpetasProg.next() : raiz.createFolder('Programas');

  // Buscar o crear carpeta del programa específico
  var carpetasProgramaEspecifico = programas.getFoldersByName(nombreCarpeta);
  var carpetaPrograma = carpetasProgramaEspecifico.hasNext() ? carpetasProgramaEspecifico.next() : programas.createFolder(nombreCarpeta);

  return carpetaPrograma;
}

/**
 * Lista archivos de un programa
 */
function listarArchivosPrograma(token, programaId) {
  var sesion = autorizarAccion(token, [ROLES.ADMIN, ROLES.JEFATURA, ROLES.PARTICIPANTE, ROLES.COLABORADOR]);

  try {
    var archivos = getSheetData(HOJAS.PROGRAMA_ARCHIVOS)
      .filter(function(a) { return a.programa_id === programaId && a.activo !== false; });

    // Si no es admin, solo mostrar archivos visibles para participantes
    if (sesion.rol !== ROLES.ADMIN) {
      archivos = archivos.filter(function(a) { return a.visible_participantes === true || a.visible_participantes === 'true'; });
    }

    var usuarios = getSheetData(HOJAS.USUARIOS);
    var usrMap = {};
    usuarios.forEach(function(u) { usrMap[u.id] = u; });

    archivos = archivos.map(function(a) {
      var usr = usrMap[a.subido_por] || {};
      a.subido_por_nombre = usr.nombre_completo || '';
      return a;
    });

    archivos.sort(function(a, b) { return (b.fecha_subida || '').localeCompare(a.fecha_subida || ''); });

    return respuestaOk(archivos);
  } catch (e) {
    console.error('Error en listarArchivosPrograma: ' + e.message);
    return respuestaError(e.message);
  }
}

/**
 * Sube un archivo al programa (recibe datos en base64 desde el frontend)
 */
function subirArchivoPrograma(token, programaId, datos) {
  var sesion = autorizarAccion(token, [ROLES.ADMIN]);

  try {
    validarRequerido(programaId, 'Programa');
    validarRequerido(datos.nombre, 'Nombre del archivo');
    validarRequerido(datos.contenido, 'Contenido del archivo');

    var carpeta = _getCarpetaPrograma(programaId);

    // Crear subcarpeta según tipo
    var subCarpetaNombre = datos.tipo === 'cronograma' ? 'Cronograma' :
                           datos.tipo === 'informe' ? 'Informes' : 'Material';
    var subCarpetas = carpeta.getFoldersByName(subCarpetaNombre);
    var subCarpeta = subCarpetas.hasNext() ? subCarpetas.next() : carpeta.createFolder(subCarpetaNombre);

    // Decodificar base64 y crear archivo
    var blob = Utilities.newBlob(Utilities.base64Decode(datos.contenido), datos.mimeType || 'application/octet-stream', datos.nombre);
    var archivo = subCarpeta.createFile(blob);
    archivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    var id = generarId();
    insertRow(HOJAS.PROGRAMA_ARCHIVOS, {
      id: id,
      programa_id: programaId,
      nombre_archivo: datos.nombre,
      tipo: datos.tipo || 'otro',
      mensaje: datos.mensaje || '',
      drive_file_id: archivo.getId(),
      drive_url: archivo.getUrl(),
      mime_type: datos.mimeType || '',
      tamano: datos.tamano || 0,
      subido_por: sesion.userId,
      fecha_subida: fechaActual(),
      visible_participantes: datos.visible_participantes !== false,
      activo: true
    });

    registrarAuditLog(sesion.userId, 'subir_archivo', HOJAS.PROGRAMA_ARCHIVOS, id, 'Archivo subido: ' + datos.nombre);

    return respuestaOk({ id: id, url: archivo.getUrl(), message: 'Archivo subido correctamente.' });
  } catch (e) {
    console.error('Error en subirArchivoPrograma: ' + e.message);
    return respuestaError(e.message);
  }
}

/**
 * Elimina un archivo del programa
 */
function eliminarArchivoPrograma(token, archivoId) {
  var sesion = autorizarAccion(token, [ROLES.ADMIN]);

  try {
    var archivo = findById(HOJAS.PROGRAMA_ARCHIVOS, archivoId);
    if (!archivo) return respuestaError('Archivo no encontrado.');

    updateById(HOJAS.PROGRAMA_ARCHIVOS, archivoId, { activo: false });

    // Mover a papelera en Drive
    try {
      var driveFile = DriveApp.getFileById(archivo.drive_file_id);
      driveFile.setTrashed(true);
    } catch (driveErr) {
      console.error('Error eliminando de Drive: ' + driveErr.message);
    }

    registrarAuditLog(sesion.userId, 'eliminar_archivo', HOJAS.PROGRAMA_ARCHIVOS, archivoId, 'Archivo eliminado: ' + archivo.nombre_archivo);

    return respuestaOk({ message: 'Archivo eliminado.' });
  } catch (e) {
    console.error('Error en eliminarArchivoPrograma: ' + e.message);
    return respuestaError(e.message);
  }
}

/**
 * Actualiza visibilidad de un archivo
 */
function actualizarVisibilidadArchivo(token, archivoId, visible) {
  var sesion = autorizarAccion(token, [ROLES.ADMIN]);

  try {
    updateById(HOJAS.PROGRAMA_ARCHIVOS, archivoId, { visible_participantes: visible });
    return respuestaOk({ message: 'Visibilidad actualizada.' });
  } catch (e) {
    console.error('Error en actualizarVisibilidadArchivo: ' + e.message);
    return respuestaError(e.message);
  }
}
