/**
 * Config.gs — Constantes globales y configuración del sistema
 * Plataforma TPT - MSO Chile
 */

// ============================================
// ID DEL SPREADSHEET (BASE DE DATOS)
// Reemplazar con el ID real del Google Spreadsheet
// ============================================
var SPREADSHEET_ID = '1Tawhb-i6ZOs0viMGYBYGB0opFZDKUNRJzZH03T97gqo';

// ============================================
// NOMBRES DE LAS HOJAS (TABLAS)
// ============================================
var HOJAS = {
  CLIENTES: 'Clientes',
  USUARIOS: 'Usuarios',
  PROGRAMAS: 'Programas',
  PROGRAMA_PARTICIPANTES: 'ProgramaParticipantes',
  CONDUCTAS_CRITICAS: 'ConductasCriticas',
  CRITERIOS_OBSERVACION: 'CriteriosObservacion',
  ENCUESTAS: 'Encuestas',
  ENCUESTA_PREGUNTAS: 'EncuestaPreguntas',
  ENCUESTA_RESPUESTAS: 'EncuestaRespuestas',
  CHECKLISTS: 'Checklists',
  OBSERVACIONES_JEFATURA: 'ObservacionesJefatura',
  OBSERVACION_DETALLES: 'ObservacionDetalles',
  FEEDBACK: 'Feedback',
  HALLAZGOS: 'Hallazgos',
  RECOMENDACIONES: 'Recomendaciones',
  AUDIT_LOG: 'AuditLog',
  NOTIFICACIONES: 'Notificaciones'
};

// ============================================
// ENCABEZADOS DE CADA HOJA
// ============================================
var ENCABEZADOS = {
  Clientes: ['id', 'nombre', 'razon_social', 'rubro', 'pais', 'contacto_nombre', 'contacto_email', 'estado', 'fecha_creacion', 'creado_por', 'activo'],
  Usuarios: ['id', 'nombre_completo', 'email', 'password_hash', 'cargo', 'cliente_id', 'rol', 'area', 'equipo', 'jefatura_id', 'estado', 'fecha_creacion', 'ultimo_acceso', 'activo'],
  Programas: ['id', 'nombre', 'cliente_id', 'fecha_inicio', 'fecha_termino', 'tipo', 'objetivo', 'estado', 'fecha_medicion_pre', 'fecha_medicion_post', 'creado_por', 'fecha_creacion', 'activo'],
  ProgramaParticipantes: ['id', 'programa_id', 'usuario_id', 'rol_programa', 'fecha_inicio', 'fecha_termino', 'activo'],
  ConductasCriticas: ['id', 'programa_id', 'nombre', 'descripcion', 'definicion_observable', 'objetivo_negocio', 'indicador_observable', 'conducta_no_deseada', 'prioridad', 'orden', 'activo'],
  CriteriosObservacion: ['id', 'conducta_id', 'descripcion', 'obligatorio', 'orden', 'activo'],
  Encuestas: ['id', 'programa_id', 'nombre', 'tipo', 'instrucciones', 'estado', 'fecha_activacion', 'fecha_cierre', 'creado_por', 'fecha_creacion', 'activo'],
  EncuestaPreguntas: ['id', 'encuesta_id', 'conducta_id', 'texto_pregunta', 'tipo_respuesta', 'obligatoria', 'orden', 'activo'],
  EncuestaRespuestas: ['id', 'encuesta_id', 'pregunta_id', 'usuario_id', 'programa_id', 'valor_respuesta', 'valor_numerico', 'fecha_respuesta', 'estado', 'activo'],
  Checklists: ['id', 'programa_id', 'nombre', 'conducta_id', 'tipo_respuesta', 'estado', 'creado_por', 'fecha_creacion', 'activo'],
  ObservacionesJefatura: ['id', 'checklist_id', 'programa_id', 'conducta_id', 'observador_id', 'participante_id', 'tipo_medicion', 'fecha_observacion', 'comentario', 'estado', 'fecha_creacion', 'activo'],
  ObservacionDetalles: ['id', 'observacion_id', 'criterio_id', 'valor_respuesta', 'valor_numerico', 'activo'],
  Feedback: ['id', 'programa_id', 'observacion_id', 'jefatura_id', 'participante_id', 'fortaleza', 'aspecto_reforzar', 'recomendacion', 'fecha_feedback', 'activo'],
  Hallazgos: ['id', 'programa_id', 'conducta_id', 'hallazgo', 'segmento_afectado', 'criticidad', 'interpretacion', 'estado_decision', 'creado_por', 'fecha_creacion', 'activo'],
  Recomendaciones: ['id', 'hallazgo_id', 'recomendacion', 'conducta_id', 'prioridad', 'responsable_sugerido', 'fecha_creacion', 'activo'],
  AuditLog: ['id', 'usuario_id', 'accion', 'entidad', 'entidad_id', 'detalle', 'fecha'],
  Notificaciones: ['id', 'usuario_id', 'tipo', 'titulo', 'mensaje', 'leida', 'email_enviado', 'fecha']
};

// ============================================
// ROLES
// ============================================
var ROLES = {
  ADMIN: 'admin',
  JEFATURA: 'jefatura',
  PARTICIPANTE: 'participante'
};

// ============================================
// ESTADOS
// ============================================
var ESTADOS_USUARIO = {
  ACTIVO: 'activo',
  INACTIVO: 'inactivo',
  PENDIENTE: 'pendiente'
};

var ESTADOS_PROGRAMA = {
  DISENO: 'diseno',
  ACTIVO: 'activo',
  FINALIZADO: 'finalizado',
  SUSPENDIDO: 'suspendido'
};

var ESTADOS_ENCUESTA = {
  BORRADOR: 'borrador',
  ACTIVA: 'activa',
  CERRADA: 'cerrada'
};

var ESTADOS_OBSERVACION = {
  BORRADOR: 'borrador',
  COMPLETADA: 'completada'
};

var ESTADOS_CLIENTE = {
  ACTIVO: 'Activo',
  INACTIVO: 'Inactivo'
};

// ============================================
// TIPOS
// ============================================
var TIPOS_PROGRAMA = ['piloto', 'programa_completo', 'intervencion'];
var TIPOS_ENCUESTA = ['pre', 'post'];
var TIPOS_RESPUESTA = ['escala_1_5', 'si_no', 'logrado_parcial_no', 'texto_breve'];
var TIPOS_MEDICION = ['pre', 'post', 'seguimiento'];

// ============================================
// CONFIGURACIÓN DE SESIÓN
// ============================================
var SESSION_EXPIRY_HOURS = 8;

// ============================================
// COLORES MSO CHILE
// ============================================
var COLORES = {
  PRIMARIO: '#1B4F72',
  SECUNDARIO: '#2E86C1',
  FONDO: '#FFFFFF',
  FONDO_ALT: '#F8F9FA',
  TEXTO: '#2D3748',
  TEXTO_SEC: '#718096',
  EXITO: '#27AE60',
  ADVERTENCIA: '#F39C12',
  ERROR: '#E74C3C',
  BORDE: '#E2E8F0'
};
