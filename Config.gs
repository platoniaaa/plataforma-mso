/**
 * Config.gs — Constantes globales y configuración del sistema
 * Plataforma TPT - MSO Chile v2.0
 */

// ============================================
// ID DEL SPREADSHEET (BASE DE DATOS)
// ============================================
var SPREADSHEET_ID = '182QFzUQhX0y4EL55GR90YzvE5-57nJocQe_YPzp9FIA';

// ============================================
// ID DE CARPETA RAÍZ EN DRIVE (para archivos)
// Se crea automáticamente si no existe
// ============================================
var DRIVE_FOLDER_NAME = 'MSO Plataforma';

// ============================================
// NOMBRES DE LAS HOJAS (TABLAS)
// ============================================
var HOJAS = {
  CLIENTES: 'Clientes',
  USUARIOS: 'Usuarios',
  PROGRAMAS: 'Programas',
  PROGRAMA_PARTICIPANTES: 'ProgramaParticipantes',
  CONDUCTAS_CRITICAS: 'ConductasCriticas',
  COMPETENCIAS_PROGRAMA: 'CompetenciasPrograma',
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
  NOTIFICACIONES: 'Notificaciones',
  ACTIVIDADES: 'Actividades',
  ACTIVIDAD_ASIGNACIONES: 'ActividadAsignaciones',
  REPORTES_OBSERVACION: 'ReportesObservacion',
  REPORTE_HISTORIAL: 'ReporteHistorial',
  CRONOGRAMA_PROGRAMA: 'CronogramaPrograma',
  PROGRAMA_ARCHIVOS: 'ProgramaArchivos',
  INFORMES_GENERADOS: 'InformesGenerados'
};

// ============================================
// ENCABEZADOS DE CADA HOJA
// ============================================
var ENCABEZADOS = {
  Clientes: ['id', 'nombre', 'razon_social', 'rubro', 'pais', 'contacto_nombre', 'contacto_email', 'estado', 'fecha_creacion', 'creado_por', 'activo'],
  Usuarios: ['id', 'nombre_completo', 'email', 'password_hash', 'cargo', 'cliente_id', 'rol', 'area', 'equipo', 'jefatura_id', 'estado', 'fecha_creacion', 'ultimo_acceso', 'activo'],
  Programas: ['id', 'nombre', 'cliente_id', 'fecha_inicio', 'fecha_termino', 'tipo', 'objetivo', 'estado', 'fecha_medicion_pre', 'fecha_medicion_post', 'creado_por', 'fecha_creacion', 'activo'],
  ProgramaParticipantes: ['id', 'programa_id', 'usuario_id', 'rol_programa', 'lider_id', 'fecha_inicio', 'fecha_termino', 'activo'],
  ConductasCriticas: ['id', 'programa_id', 'nombre', 'descripcion', 'definicion_observable', 'objetivo_negocio', 'indicador_observable', 'conducta_no_deseada', 'prioridad', 'orden', 'activo'],
  CompetenciasPrograma: ['id', 'programa_id', 'nombre', 'descripcion', 'foco_desarrollo', 'nivel_1_texto', 'nivel_2_texto', 'nivel_3_texto', 'nivel_4_texto', 'interpretacion_nivel_1', 'interpretacion_nivel_2', 'interpretacion_nivel_3', 'interpretacion_nivel_4', 'prioridad', 'orden', 'activo'],
  CriteriosObservacion: ['id', 'conducta_id', 'descripcion', 'obligatorio', 'orden', 'activo'],
  Encuestas: ['id', 'programa_id', 'nombre', 'tipo', 'tipo_cuestionario', 'instrucciones', 'estado', 'fecha_activacion', 'fecha_cierre', 'fecha_limite', 'creado_por', 'fecha_creacion', 'activo'],
  EncuestaPreguntas: ['id', 'encuesta_id', 'conducta_id', 'competencia_id', 'texto_pregunta', 'foco_desarrollo', 'opcion_nivel_1', 'opcion_nivel_2', 'opcion_nivel_3', 'opcion_nivel_4', 'tipo_respuesta', 'obligatoria', 'orden', 'activo'],
  EncuestaRespuestas: ['id', 'encuesta_id', 'pregunta_id', 'usuario_id', 'programa_id', 'valor_respuesta', 'valor_numerico', 'fecha_respuesta', 'estado', 'activo'],
  Checklists: ['id', 'programa_id', 'nombre', 'conducta_id', 'tipo_respuesta', 'estado', 'creado_por', 'fecha_creacion', 'activo'],
  ObservacionesJefatura: ['id', 'checklist_id', 'programa_id', 'conducta_id', 'observador_id', 'participante_id', 'tipo_medicion', 'fecha_observacion', 'comentario', 'estado', 'fecha_creacion', 'activo'],
  ObservacionDetalles: ['id', 'observacion_id', 'criterio_id', 'valor_respuesta', 'valor_numerico', 'activo'],
  Feedback: ['id', 'programa_id', 'observacion_id', 'jefatura_id', 'participante_id', 'fortaleza', 'aspecto_reforzar', 'recomendacion', 'fecha_feedback', 'activo'],
  Hallazgos: ['id', 'programa_id', 'conducta_id', 'hallazgo', 'segmento_afectado', 'criticidad', 'interpretacion', 'estado_decision', 'creado_por', 'fecha_creacion', 'activo'],
  Recomendaciones: ['id', 'hallazgo_id', 'recomendacion', 'conducta_id', 'prioridad', 'responsable_sugerido', 'fecha_creacion', 'activo'],
  AuditLog: ['id', 'usuario_id', 'accion', 'entidad', 'entidad_id', 'detalle', 'fecha'],
  Notificaciones: ['id', 'usuario_id', 'tipo', 'titulo', 'mensaje', 'leida', 'email_enviado', 'fecha'],
  Actividades: ['id', 'programa_id', 'nombre', 'tipo', 'enlace', 'descripcion', 'fecha_limite', 'estado', 'asignacion_tipo', 'creado_por', 'fecha_creacion', 'activo'],
  ActividadAsignaciones: ['id', 'actividad_id', 'participante_id', 'completada', 'fecha_completada', 'activo'],
  ReportesObservacion: ['id', 'programa_id', 'categoria', 'tipo', 'titulo', 'comentario', 'autor_id', 'autor_nombre', 'estado_gestion', 'elemento_id', 'fecha', 'activo'],
  ReporteHistorial: ['id', 'reporte_id', 'estado_nuevo', 'admin_id', 'admin_nombre', 'comentario', 'fecha'],
  CronogramaPrograma: ['id', 'programa_id', 'fase', 'nombre_hito', 'fecha_inicio', 'fecha_fin', 'responsable', 'estado', 'orden', 'activo'],
  ProgramaArchivos: ['id', 'programa_id', 'nombre_archivo', 'tipo', 'mensaje', 'drive_file_id', 'drive_url', 'mime_type', 'tamano', 'subido_por', 'fecha_subida', 'visible_participantes', 'activo'],
  InformesGenerados: ['id', 'programa_id', 'usuario_id', 'tipo_informe', 'nombre', 'drive_file_id', 'drive_url', 'generado_por', 'fecha_generacion', 'activo']
};

// ============================================
// ROLES
// ============================================
var ROLES = {
  ADMIN: 'admin',
  JEFATURA: 'jefatura',
  PARTICIPANTE: 'participante',
  COLABORADOR: 'colaborador'
};

// ============================================
// ROLES DE PROGRAMA
// ============================================
var ROLES_PROGRAMA = {
  LIDER: 'lider',
  COLABORADOR: 'colaborador',
  JEFATURA: 'jefatura'
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

var ESTADOS_HITO = {
  PENDIENTE: 'pendiente',
  EN_CURSO: 'en_curso',
  COMPLETADO: 'completado'
};

// ============================================
// TIPOS
// ============================================
var TIPOS_PROGRAMA = ['piloto', 'programa_completo', 'intervencion'];
var TIPOS_ENCUESTA = ['pre', 'post'];
var TIPOS_CUESTIONARIO = ['autoevaluacion', 'coevaluacion'];
var TIPOS_RESPUESTA = ['escala_1_5', 'si_no', 'logrado_parcial_no', 'texto_breve', 'niveles_competencia'];
var TIPOS_MEDICION = ['pre', 'post', 'seguimiento'];
var TIPOS_ARCHIVO = ['cronograma', 'material', 'instructivo', 'presentacion', 'informe', 'otro'];
var TIPOS_INFORME = ['individual', 'consolidado', 'datos_brutos'];

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
