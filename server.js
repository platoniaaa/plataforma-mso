/**
 * Servidor local de desarrollo para la Plataforma TPT - MSO Chile
 * Simula el entorno Google Apps Script con datos mock
 *
 * Uso: node server.js
 * Abre: http://localhost:3000
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const BASE_DIR = __dirname;
const BASE_URL = `http://localhost:${PORT}`;

// ============================================
// DATOS MOCK
// ============================================
const MOCK_DATA = {
  clientes: [
    { id: 'cli-001', nombre: 'Minera Los Andes S.A.', razon_social: 'Minera Los Andes SpA', rubro: 'Minería', pais: 'Chile', contacto_nombre: 'María González', contacto_email: 'mgonzalez@losandes.cl', estado: 'Activo' },
    { id: 'cli-002', nombre: 'Retail Express Ltda.', razon_social: 'Retail Express Limitada', rubro: 'Retail', pais: 'Chile', contacto_nombre: 'Carlos Muñoz', contacto_email: 'cmunoz@retailexpress.cl', estado: 'Activo' },
    { id: 'cli-003', nombre: 'Banco del Sur', razon_social: 'Banco del Sur S.A.', rubro: 'Banca', pais: 'Chile', contacto_nombre: 'Ana Torres', contacto_email: 'atorres@bancosur.cl', estado: 'Inactivo' },
    { id: 'cli-004', nombre: 'Tech Solutions Chile', razon_social: 'Tech Solutions SpA', rubro: 'Tecnología', pais: 'Chile', contacto_nombre: 'Pedro Soto', contacto_email: 'psoto@techsolutions.cl', estado: 'Activo' },
  ],
  programas: [
    { id: 'prog-001', nombre: 'Liderazgo Seguro 2026', cliente_id: 'cli-001', cliente_nombre: 'Minera Los Andes S.A.', tipo: 'programa_completo', estado: 'activo', objetivo: 'Desarrollar competencias de liderazgo en seguridad para supervisores de faena', fecha_inicio: '2026-01-15', fecha_termino: '2026-06-30', fecha_medicion_pre: '2026-01-20', fecha_medicion_post: '2026-06-15' },
    { id: 'prog-002', nombre: 'Servicio al Cliente Retail', cliente_id: 'cli-002', cliente_nombre: 'Retail Express Ltda.', tipo: 'piloto', estado: 'diseno', objetivo: 'Mejorar indicadores de atención al cliente en tiendas', fecha_inicio: '2026-03-01', fecha_termino: '2026-08-31', fecha_medicion_pre: '2026-03-10', fecha_medicion_post: '2026-08-20' },
    { id: 'prog-003', nombre: 'Gestión de Riesgos Operacionales', cliente_id: 'cli-004', cliente_nombre: 'Tech Solutions Chile', tipo: 'intervencion', estado: 'activo', objetivo: 'Transferir prácticas de gestión de riesgos al equipo de operaciones', fecha_inicio: '2026-02-01', fecha_termino: '2026-07-31', fecha_medicion_pre: '2026-02-10', fecha_medicion_post: '2026-07-20' },
    { id: 'prog-004', nombre: 'Comunicación Efectiva Banca', cliente_id: 'cli-003', cliente_nombre: 'Banco del Sur', tipo: 'programa_completo', estado: 'finalizado', objetivo: 'Fortalecer habilidades de comunicación en equipos comerciales', fecha_inicio: '2025-06-01', fecha_termino: '2025-12-15', fecha_medicion_pre: '2025-06-10', fecha_medicion_post: '2025-12-01' },
  ],
  conductas: [
    { id: 'cond-001', nombre: 'Liderazgo Visible en Terreno', descripcion: 'El líder realiza recorridos regulares observando comportamientos seguros e inseguros', programa_id: 'prog-001', prioridad: 1, estado: 'activa' },
    { id: 'cond-002', nombre: 'Retroalimentación Positiva', descripcion: 'Entrega feedback constructivo de manera oportuna', programa_id: 'prog-001', prioridad: 2, estado: 'activa' },
    { id: 'cond-003', nombre: 'Gestión de Riesgos Críticos', descripcion: 'Identifica y gestiona riesgos críticos antes del inicio de tareas', programa_id: 'prog-001', prioridad: 3, estado: 'activa' },
    { id: 'cond-004', nombre: 'Comunicación Asertiva', descripcion: 'Comunica de forma clara y respetuosa las expectativas de seguridad', programa_id: 'prog-001', prioridad: 4, estado: 'activa' },
    { id: 'cond-005', nombre: 'Escucha Activa', descripcion: 'Demuestra escucha activa con clientes internos y externos', programa_id: 'prog-002', prioridad: 1, estado: 'activa' },
    { id: 'cond-006', nombre: 'Resolución de Conflictos', descripcion: 'Maneja situaciones conflictivas con empatía', programa_id: 'prog-002', prioridad: 2, estado: 'activa' },
  ],
  usuarios: [
    { id: 'usr-001', nombre: 'Admin Demo', email: 'admin@mso.cl', rol: 'admin', cargo: 'Administrador', cliente_id: null, estado: 'Activo' },
    { id: 'usr-002', nombre: 'Javier Rodríguez', email: 'jrodriguez@losandes.cl', rol: 'jefatura', cargo: 'Superintendente Mina', cliente_id: 'cli-001', estado: 'Activo' },
    { id: 'usr-003', nombre: 'Laura Martínez', email: 'lmartinez@losandes.cl', rol: 'participante', cargo: 'Supervisora Planta', cliente_id: 'cli-001', estado: 'Activo' },
    { id: 'usr-004', nombre: 'Roberto Díaz', email: 'rdiaz@losandes.cl', rol: 'participante', cargo: 'Jefe de Turno', cliente_id: 'cli-001', estado: 'Activo' },
    { id: 'usr-005', nombre: 'Camila Herrera', email: 'cherrera@retailexpress.cl', rol: 'jefatura', cargo: 'Gerente de Tienda', cliente_id: 'cli-002', estado: 'Activo' },
    { id: 'usr-006', nombre: 'Diego Fuentes', email: 'dfuentes@retailexpress.cl', rol: 'participante', cargo: 'Vendedor Senior', cliente_id: 'cli-002', estado: 'Activo' },
    { id: 'usr-007', nombre: 'Sofía Vargas', email: 'svargas@techsolutions.cl', rol: 'participante', cargo: 'Analista de Operaciones', cliente_id: 'cli-004', estado: 'Activo' },
    { id: 'usr-008', nombre: 'Andrés Morales', email: 'amorales@losandes.cl', rol: 'participante', cargo: 'Operador Senior', cliente_id: 'cli-001', estado: 'Inactivo' },
  ],
  encuestas: [
    { id: 'enc-001', nombre: 'Encuesta PRE - Liderazgo Seguro', programa_id: 'prog-001', programa_nombre: 'Liderazgo Seguro 2026', tipo: 'pre', estado: 'activa', fecha_creacion: '2026-01-18', total_respuestas: 12, total_esperadas: 15 },
    { id: 'enc-002', nombre: 'Encuesta POST - Liderazgo Seguro', programa_id: 'prog-001', programa_nombre: 'Liderazgo Seguro 2026', tipo: 'post', estado: 'borrador', fecha_creacion: '2026-01-18', total_respuestas: 0, total_esperadas: 15 },
    { id: 'enc-003', nombre: 'Encuesta PRE - Servicio Cliente', programa_id: 'prog-002', programa_nombre: 'Servicio al Cliente Retail', tipo: 'pre', estado: 'borrador', fecha_creacion: '2026-02-28', total_respuestas: 0, total_esperadas: 8 },
  ],
  checklists: [
    { id: 'chk-001', nombre: 'Checklist Observación Terreno', programa_id: 'prog-001', programa_nombre: 'Liderazgo Seguro 2026', conductas: 4, estado: 'activa', observaciones_realizadas: 23 },
    { id: 'chk-002', nombre: 'Checklist Atención al Cliente', programa_id: 'prog-002', programa_nombre: 'Servicio al Cliente Retail', conductas: 2, estado: 'borrador', observaciones_realizadas: 0 },
  ],
  hallazgos: [
    { id: 'hall-001', programa_id: 'prog-001', programa_nombre: 'Liderazgo Seguro 2026', conducta_nombre: 'Liderazgo Visible en Terreno', tipo: 'fortaleza', descripcion: 'Los supervisores muestran consistencia en recorridos matutinos', fecha: '2026-02-15', autor: 'Admin Demo' },
    { id: 'hall-002', programa_id: 'prog-001', programa_nombre: 'Liderazgo Seguro 2026', conducta_nombre: 'Retroalimentación Positiva', tipo: 'oportunidad', descripcion: 'Se observa bajo uso de refuerzo positivo durante cambios de turno', fecha: '2026-02-20', autor: 'Admin Demo', recomendacion: 'Implementar práctica de reconocimiento al inicio de cada turno' },
    { id: 'hall-003', programa_id: 'prog-001', programa_nombre: 'Liderazgo Seguro 2026', conducta_nombre: 'Gestión de Riesgos Críticos', tipo: 'critico', descripcion: 'Falta aplicación sistemática de análisis de riesgo pre-tarea', fecha: '2026-03-01', autor: 'Admin Demo', recomendacion: 'Reforzar protocolo AST con sesión práctica en terreno' },
  ],
  notificaciones: [
    { id: 'not-001', mensaje: 'Nueva encuesta PRE disponible para completar', tipo: 'encuesta', fecha: '2026-03-20', leida: false },
    { id: 'not-002', mensaje: 'Javier Rodríguez completó observación en terreno', tipo: 'observacion', fecha: '2026-03-19', leida: false },
    { id: 'not-003', mensaje: 'Programa "Liderazgo Seguro 2026" tiene nuevos hallazgos', tipo: 'hallazgo', fecha: '2026-03-18', leida: true },
  ],
  actividades: [
    {
      id: 'act-001',
      nombre: 'Encuesta de Clima Laboral Q1 2026',
      tipo: 'ms_forms',
      programa_id: 'prog-001',
      programa_nombre: 'Liderazgo Seguro 2026',
      enlace: 'https://forms.office.com/Pages/ResponsePage.aspx?id=ejemplo-clima-laboral',
      descripcion: 'Por favor completa esta encuesta de clima laboral. Tus respuestas son anónimas y nos ayudarán a mejorar el ambiente de trabajo.',
      fecha_limite: '2026-04-15',
      estado: 'activa',
      asignacion_tipo: 'programa_completo',
      fecha_creacion: '2026-03-10',
      asignaciones: [
        { participante_id: 'usr-003', participante_nombre: 'Laura Martínez', cargo: 'Supervisora Planta', completada: true, fecha_completada: '2026-03-15' },
        { participante_id: 'usr-004', participante_nombre: 'Roberto Díaz', cargo: 'Jefe de Turno', completada: false, fecha_completada: null },
      ]
    },
    {
      id: 'act-002',
      nombre: 'Material de Lectura: Liderazgo en Seguridad',
      tipo: 'contenido',
      programa_id: 'prog-001',
      programa_nombre: 'Liderazgo Seguro 2026',
      enlace: 'https://drive.google.com/file/d/ejemplo-material-lectura/view',
      descripcion: 'Lee este documento sobre prácticas de liderazgo en seguridad. Es fundamental para la próxima sesión del programa.',
      fecha_limite: '2026-04-01',
      estado: 'activa',
      asignacion_tipo: 'programa_completo',
      fecha_creacion: '2026-03-08',
      asignaciones: [
        { participante_id: 'usr-003', participante_nombre: 'Laura Martínez', cargo: 'Supervisora Planta', completada: true, fecha_completada: '2026-03-12' },
        { participante_id: 'usr-004', participante_nombre: 'Roberto Díaz', cargo: 'Jefe de Turno', completada: true, fecha_completada: '2026-03-14' },
      ]
    },
    {
      id: 'act-003',
      nombre: 'Evaluación de Conocimientos (Google Forms)',
      tipo: 'enlace_externo',
      programa_id: 'prog-002',
      programa_nombre: 'Servicio al Cliente Retail',
      enlace: 'https://docs.google.com/forms/d/e/ejemplo-evaluacion/viewform',
      descripcion: 'Completa esta evaluación de conocimientos sobre atención al cliente. Tienes 30 minutos.',
      fecha_limite: '2026-04-10',
      estado: 'activa',
      asignacion_tipo: 'programa_completo',
      fecha_creacion: '2026-03-15',
      asignaciones: [
        { participante_id: 'usr-006', participante_nombre: 'Diego Fuentes', cargo: 'Vendedor Senior', completada: false, fecha_completada: null },
      ]
    },
    {
      id: 'act-004',
      nombre: 'Tarea: Plan de Acción Individual',
      tipo: 'tarea',
      programa_id: 'prog-001',
      programa_nombre: 'Liderazgo Seguro 2026',
      enlace: '',
      descripcion: 'Elabora un plan de acción individual con al menos 3 compromisos de mejora basados en tu feedback recibido. Envíalo a tu jefatura directa.',
      fecha_limite: '2026-04-20',
      estado: 'activa',
      asignacion_tipo: 'seleccion',
      fecha_creacion: '2026-03-18',
      asignaciones: [
        { participante_id: 'usr-003', participante_nombre: 'Laura Martínez', cargo: 'Supervisora Planta', completada: false, fecha_completada: null },
      ]
    },
    {
      id: 'act-005',
      nombre: 'Encuesta de Satisfacción del Programa',
      tipo: 'ms_forms',
      programa_id: 'prog-003',
      programa_nombre: 'Gestión de Riesgos Operacionales',
      enlace: 'https://forms.office.com/Pages/ResponsePage.aspx?id=ejemplo-satisfaccion',
      descripcion: 'Ayúdanos a mejorar. Completa esta breve encuesta sobre tu experiencia en el programa.',
      fecha_limite: null,
      estado: 'borrador',
      asignacion_tipo: 'programa_completo',
      fecha_creacion: '2026-03-20',
      asignaciones: [
        { participante_id: 'usr-007', participante_nombre: 'Sofía Vargas', cargo: 'Analista de Operaciones', completada: false, fecha_completada: null },
      ]
    },
  ],
  reportesObservacion: [
    {
      id: 'rep-001',
      programa_id: 'prog-001',
      programa_nombre: 'Liderazgo Seguro 2026',
      tipo: 'observacion_positiva',
      titulo: 'Supervisor aplicando liderazgo visible en terreno',
      comentario: 'Durante la visita a la faena norte, se observó al supervisor Roberto Díaz realizando un recorrido de seguridad junto a su equipo. Demostró excelente comunicación y refuerzo positivo hacia los trabajadores que cumplían con los protocolos de seguridad.',
      fecha: '2026-03-18',
      autor_id: 'usr-002',
      autor_nombre: 'Javier Rodríguez',
      estado_gestion: 'en_revision',
      evidencias: [
        { id: 'ev-001', nombre: 'recorrido-terreno.jpg', url: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=400&h=300&fit=crop', tipo: 'image/jpeg' },
        { id: 'ev-002', nombre: 'equipo-seguridad.jpg', url: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=400&h=300&fit=crop', tipo: 'image/jpeg' },
      ],
      historial: [
        { estado_nuevo: 'en_revision', admin_nombre: 'Admin Demo', fecha: '2026-03-19', comentario: 'Observación recibida. Se verificará en la próxima visita a faena norte.' }
      ]
    },
    {
      id: 'rep-002',
      programa_id: 'prog-001',
      programa_nombre: 'Liderazgo Seguro 2026',
      tipo: 'incidente',
      titulo: 'Falta de uso de EPP en zona de carga',
      comentario: 'Se detectó que 3 trabajadores en la zona de carga no portaban casco de seguridad ni chaleco reflectante durante la operación del turno tarde. Se informó al supervisor inmediato para tomar acción correctiva.',
      fecha: '2026-03-15',
      autor_id: 'usr-003',
      autor_nombre: 'Laura Martínez',
      estado_gestion: 'en_proceso',
      evidencias: [
        { id: 'ev-003', nombre: 'zona-carga-evidencia.jpg', url: 'https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=400&h=300&fit=crop', tipo: 'image/jpeg' },
      ],
      historial: [
        { estado_nuevo: 'en_revision', admin_nombre: 'Admin Demo', fecha: '2026-03-16', comentario: 'Incidente confirmado. Se contactará al supervisor de turno tarde.' },
        { estado_nuevo: 'en_proceso', admin_nombre: 'Admin Demo', fecha: '2026-03-17', comentario: 'Se programó capacitación de refuerzo sobre uso de EPP para el equipo del turno tarde. Fecha: 25/03/2026.' }
      ]
    },
    {
      id: 'rep-003',
      programa_id: 'prog-001',
      programa_nombre: 'Liderazgo Seguro 2026',
      tipo: 'sugerencia',
      titulo: 'Implementar tablero visual de conductas en sala de reunión',
      comentario: 'Propongo instalar un tablero visual en la sala de reuniones donde se muestren las conductas críticas del programa y el avance semanal. Esto ayudaría a mantener el foco del equipo y generar conversaciones diarias sobre seguridad.',
      fecha: '2026-03-12',
      autor_id: 'usr-004',
      autor_nombre: 'Roberto Díaz',
      estado_gestion: 'resuelta',
      evidencias: [],
      historial: [
        { estado_nuevo: 'en_revision', admin_nombre: 'Admin Demo', fecha: '2026-03-13', comentario: 'Buena sugerencia. Se evaluará con el equipo de operaciones.' },
        { estado_nuevo: 'resuelta', admin_nombre: 'Admin Demo', fecha: '2026-03-20', comentario: 'Se instaló el tablero en sala de reuniones del edificio norte. Se agradeció la iniciativa a Roberto.' }
      ]
    },
    {
      id: 'rep-004',
      programa_id: 'prog-003',
      programa_nombre: 'Gestión de Riesgos Operacionales',
      tipo: 'no_conformidad',
      titulo: 'Protocolo de gestión de riesgos no se aplicó en mantenimiento',
      comentario: 'Durante la intervención de mantenimiento programada del servidor principal, no se completó el formulario de análisis de riesgo previo. El equipo procedió directamente con la tarea sin la evaluación correspondiente.',
      fecha: '2026-03-10',
      autor_id: 'usr-007',
      autor_nombre: 'Sofía Vargas',
      estado_gestion: 'pendiente',
      evidencias: [
        { id: 'ev-004', nombre: 'formulario-vacio.jpg', url: 'https://images.unsplash.com/photo-1586281380349-632531db7ed4?w=400&h=300&fit=crop', tipo: 'image/jpeg' },
        { id: 'ev-005', nombre: 'equipo-mantenimiento.jpg', url: 'https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?w=400&h=300&fit=crop', tipo: 'image/jpeg' },
        { id: 'ev-006', nombre: 'registro-actividad.jpg', url: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=400&h=300&fit=crop', tipo: 'image/jpeg' },
      ],
      historial: []
    },
    {
      id: 'rep-005',
      programa_id: 'prog-002',
      programa_nombre: 'Servicio al Cliente Retail',
      tipo: 'observacion_positiva',
      titulo: 'Excelente manejo de reclamo en tienda',
      comentario: 'El vendedor Diego Fuentes demostró escucha activa y resolución efectiva ante un cliente molesto por un producto defectuoso. Logró revertir la experiencia negativa y el cliente se retiró satisfecho.',
      fecha: '2026-03-08',
      autor_id: 'usr-005',
      autor_nombre: 'Camila Herrera',
      estado_gestion: 'no_resuelta',
      evidencias: [],
      historial: [
        { estado_nuevo: 'en_revision', admin_nombre: 'Admin Demo', fecha: '2026-03-09', comentario: 'Se verificará con la tienda.' },
        { estado_nuevo: 'no_resuelta', admin_nombre: 'Admin Demo', fecha: '2026-03-11', comentario: 'No se pudo confirmar la observación. El cliente no dejó datos de contacto para seguimiento.' }
      ]
    },
  ],
};

// ============================================
// FUNCIONES MOCK DEL BACKEND
// ============================================
const backendFunctions = {
  // Auth
  loginUsuario: (email, password) => {
    if (email === 'admin@mso.cl' && password === '123456') {
      return { success: true, data: { token: 'mock-token-admin', usuario: MOCK_DATA.usuarios[0] } };
    }
    if (email === 'jrodriguez@losandes.cl' && password === '123456') {
      return { success: true, data: { token: 'mock-token-jefatura', usuario: MOCK_DATA.usuarios[1] } };
    }
    if (email === 'lmartinez@losandes.cl' && password === '123456') {
      return { success: true, data: { token: 'mock-token-participante', usuario: MOCK_DATA.usuarios[2] } };
    }
    return { success: false, error: 'Credenciales inválidas. Prueba: admin@mso.cl / 123456' };
  },
  cerrarSesion: () => ({ success: true }),
  registrarUsuario: (datos) => ({ success: true, data: { id: 'usr-new' } }),
  obtenerClientesRegistro: () => MOCK_DATA.clientes.filter(c => c.estado === 'Activo').map(c => ({ id: c.id, nombre: c.nombre })),

  // Clientes
  listarClientes: () => ({ success: true, data: MOCK_DATA.clientes }),
  crearCliente: (token, datos) => ({ success: true, data: { id: 'cli-new' } }),
  actualizarCliente: (token, id, datos) => ({ success: true }),
  desactivarCliente: (token, id) => ({ success: true }),

  // Programas
  listarProgramas: () => ({ success: true, data: MOCK_DATA.programas }),
  listarProgramasDashboard: () => ({ success: true, data: MOCK_DATA.programas }),
  crearPrograma: (token, datos) => ({ success: true, data: { id: 'prog-new' } }),
  actualizarPrograma: (token, id, datos) => ({ success: true }),
  activarPrograma: (token, id) => ({ success: true }),
  obtenerPrograma: (token, id) => {
    const prog = MOCK_DATA.programas.find(p => p.id === id) || MOCK_DATA.programas[0];
    return {
      success: true,
      data: {
        ...prog,
        conductas: MOCK_DATA.conductas.filter(c => c.programa_id === prog.id),
        participantes: MOCK_DATA.usuarios.filter(u => u.cliente_id === prog.cliente_id && u.rol !== 'admin').map(u => ({
          usuario_id: u.id, nombre: u.nombre, email: u.email, rol_programa: u.rol
        }))
      }
    };
  },
  obtenerUsuariosDisponibles: () => ({ success: true, data: [] }),
  asociarParticipantes: () => ({ success: true, data: { count: 0 } }),
  desasociarParticipante: () => ({ success: true }),

  // Conductas
  listarConductas: () => ({ success: true, data: MOCK_DATA.conductas }),
  crearConducta: () => ({ success: true, data: { id: 'cond-new' } }),
  actualizarConducta: () => ({ success: true }),

  // Encuestas
  listarEncuestas: () => ({ success: true, data: MOCK_DATA.encuestas }),
  crearEncuesta: () => ({ success: true, data: { id: 'enc-new' } }),
  actualizarEncuesta: () => ({ success: true }),
  obtenerEncuesta: (token, id) => ({
    success: true,
    data: {
      ...(MOCK_DATA.encuestas.find(e => e.id === id) || MOCK_DATA.encuestas[0]),
      preguntas: [
        { id: 'preg-1', texto: '¿Con qué frecuencia aplica esta conducta?', tipo: 'escala', conducta_nombre: 'Liderazgo Visible en Terreno' },
        { id: 'preg-2', texto: '¿Qué tan efectiva considera esta práctica?', tipo: 'escala', conducta_nombre: 'Retroalimentación Positiva' },
      ]
    }
  }),
  listarEncuestasParticipante: () => ({
    success: true,
    data: [
      { id: 'enc-001', nombre: 'Encuesta PRE - Liderazgo Seguro', programa_nombre: 'Liderazgo Seguro 2026', tipo: 'pre', estado: 'pendiente', fecha_limite: '2026-04-01' },
    ]
  }),
  enviarRespuestaEncuesta: () => ({ success: true }),

  // Checklists
  listarChecklists: () => ({ success: true, data: MOCK_DATA.checklists }),
  crearChecklist: () => ({ success: true, data: { id: 'chk-new' } }),
  listarObservacionesJefatura: () => ({
    success: true,
    data: [
      { id: 'obs-001', fecha: '2026-03-15', programa_nombre: 'Liderazgo Seguro 2026', participante_nombre: 'Laura Martínez', checklist_nombre: 'Checklist Observación Terreno', puntaje: 4.2, estado: 'completada' },
      { id: 'obs-002', fecha: '2026-03-10', programa_nombre: 'Liderazgo Seguro 2026', participante_nombre: 'Roberto Díaz', checklist_nombre: 'Checklist Observación Terreno', puntaje: 3.5, estado: 'completada' },
    ]
  }),
  guardarObservacion: () => ({ success: true }),

  // Usuarios
  listarUsuarios: () => ({ success: true, data: MOCK_DATA.usuarios }),
  crearUsuario: () => ({ success: true, data: { id: 'usr-new' } }),
  actualizarUsuario: () => ({ success: true }),
  cambiarEstadoUsuario: () => ({ success: true }),

  // Hallazgos
  listarHallazgos: () => ({ success: true, data: MOCK_DATA.hallazgos }),
  crearHallazgo: () => ({ success: true, data: { id: 'hall-new' } }),
  actualizarHallazgo: () => ({ success: true }),

  // Dashboard
  obtenerKPIsPrograma: () => ({
    success: true,
    data: {
      totalParticipantes: 15,
      observacionesRealizadas: 23,
      tasaRespuestaPre: 80,
      tasaRespuestaPost: 45,
      nivelAplicacion: 68
    }
  }),
  obtenerComparacionPrePost: () => ({
    success: true,
    data: [
      { conducta_nombre: 'Liderazgo Visible', promedioPre: 2.8, promedioPost: 4.1, variacion: 46 },
      { conducta_nombre: 'Retroalimentación', promedioPre: 2.3, promedioPost: 3.8, variacion: 65 },
      { conducta_nombre: 'Gestión Riesgos', promedioPre: 3.1, promedioPost: 3.9, variacion: 26 },
      { conducta_nombre: 'Comunicación', promedioPre: 3.5, promedioPost: 4.3, variacion: 23 },
    ]
  }),
  obtenerMapaCalor: () => ({
    success: true,
    data: [
      { conducta_nombre: 'Liderazgo Visible en Terreno', nivel: 82, color: 'verde' },
      { conducta_nombre: 'Retroalimentación Positiva', nivel: 58, color: 'amarillo' },
      { conducta_nombre: 'Gestión de Riesgos Críticos', nivel: 35, color: 'rojo' },
      { conducta_nombre: 'Comunicación Asertiva', nivel: 71, color: 'verde' },
    ]
  }),
  obtenerResumenPorEquipo: () => ({
    success: true,
    data: [
      { equipo: 'Supervisores Mina Norte', area: 'Operaciones Mina', numParticipantes: 5, nivelAplicacion: 75 },
      { equipo: 'Supervisores Planta', area: 'Procesamiento', numParticipantes: 4, nivelAplicacion: 62 },
      { equipo: 'Jefes de Turno', area: 'Operaciones Mina', numParticipantes: 6, nivelAplicacion: 38 },
    ]
  }),
  obtenerMiProgreso: () => ({
    success: true,
    data: {
      comparacion: [
        { conducta_nombre: 'Liderazgo Visible', promedioPre: 3.0, promedioPost: 4.2 },
        { conducta_nombre: 'Retroalimentación', promedioPre: 2.5, promedioPost: 4.0 },
        { conducta_nombre: 'Gestión Riesgos', promedioPre: 3.2, promedioPost: 3.8 },
        { conducta_nombre: 'Comunicación', promedioPre: 3.8, promedioPost: 4.5 },
      ],
      feedback: [
        { fecha: '2026-03-10', conducta_nombre: 'Liderazgo Visible', fortaleza: 'Excelente presencia en terreno', aspecto_reforzar: 'Documentar observaciones', recomendacion: 'Llevar libreta de campo' },
        { fecha: '2026-02-25', conducta_nombre: 'Retroalimentación', fortaleza: 'Buen tono al comunicar', aspecto_reforzar: 'Frecuencia del feedback', recomendacion: 'Establecer rutina diaria de reconocimiento' },
      ]
    }
  }),

  // Feedback
  listarFeedbackJefatura: () => ({
    success: true,
    data: [
      { id: 'fb-001', fecha: '2026-03-15', participante_nombre: 'Laura Martínez', conducta_nombre: 'Liderazgo Visible', fortaleza: 'Excelente presencia', aspecto_reforzar: 'Documentación', recomendacion: 'Usar libreta', estado: 'enviado' },
      { id: 'fb-002', fecha: '2026-03-10', participante_nombre: 'Roberto Díaz', conducta_nombre: 'Gestión Riesgos', fortaleza: 'Buena identificación', aspecto_reforzar: 'Seguimiento', recomendacion: 'Check diario', estado: 'borrador' },
    ]
  }),
  crearFeedback: () => ({ success: true, data: { id: 'fb-new' } }),
  enviarFeedback: () => ({ success: true }),
  listarFeedbackRecibido: () => ({
    success: true,
    data: [
      { id: 'fb-001', fecha: '2026-03-15', jefatura_nombre: 'Javier Rodríguez', conducta_nombre: 'Liderazgo Visible', fortaleza: 'Excelente presencia en terreno', aspecto_reforzar: 'Documentar observaciones', recomendacion: 'Llevar libreta de campo' },
    ]
  }),
  listarMiEquipo: () => ({
    success: true,
    data: [
      { id: 'usr-003', nombre: 'Laura Martínez', email: 'lmartinez@losandes.cl', cargo: 'Supervisora Planta', nivelAplicacion: 75, ultimaObservacion: '2026-03-15' },
      { id: 'usr-004', nombre: 'Roberto Díaz', email: 'rdiaz@losandes.cl', cargo: 'Jefe de Turno', nivelAplicacion: 52, ultimaObservacion: '2026-03-10' },
    ]
  }),

  // Funciones adicionales para vistas existentes
  listarParticipantesPrograma: (token, progId) => {
    const prog = MOCK_DATA.programas.find(p => p.id === progId);
    if (!prog) return { success: true, data: [] };
    return {
      success: true,
      data: MOCK_DATA.usuarios.filter(u => u.cliente_id === prog.cliente_id && u.rol !== 'admin').map(u => ({
        id: u.id, nombre: u.nombre, email: u.email, cargo: u.cargo, rol_programa: u.rol
      }))
    };
  },
  listarObservaciones: () => ({ success: true, data: [] }),
  listarFeedbackEquipo: () => ({
    success: true,
    data: [
      { id: 'fb-eq-001', participante_id: 'usr-003', participante_nombre: 'Laura Martínez', fecha_feedback: '2026-03-15', fortaleza: 'Excelente presencia en terreno', aspecto_reforzar: 'Documentar observaciones', recomendacion: 'Usar libreta de campo' },
      { id: 'fb-eq-002', participante_id: 'usr-004', participante_nombre: 'Roberto Díaz', fecha_feedback: '2026-03-10', fortaleza: 'Buena identificación de riesgos', aspecto_reforzar: 'Seguimiento post-identificación', recomendacion: 'Implementar check diario' },
    ]
  }),
  registrarFeedback: () => ({ success: true }),
  obtenerEncuestaPendiente: () => ({
    success: true,
    data: [
      { id: 'enc-001', nombre: 'Encuesta PRE - Liderazgo Seguro', programa_nombre: 'Liderazgo Seguro 2026', tipo: 'pre', estado: 'pendiente', fecha_cierre: '2026-04-01' },
    ]
  }),
  obtenerEncuestaCompleta: (token, id) => ({
    success: true,
    data: {
      id: id,
      nombre: 'Encuesta PRE - Liderazgo Seguro',
      instrucciones: 'Evalúa cada conducta según tu percepción actual en una escala de 1 (muy bajo) a 5 (muy alto).',
      preguntas: [
        { id: 'preg-1', texto_pregunta: '¿Con qué frecuencia observas liderazgo visible en terreno?', tipo_respuesta: 'escala_1_5', conducta_nombre: 'Liderazgo Visible en Terreno', obligatoria: true },
        { id: 'preg-2', texto_pregunta: '¿Qué tan efectiva es la retroalimentación que recibes?', tipo_respuesta: 'escala_1_5', conducta_nombre: 'Retroalimentación Positiva', obligatoria: true },
        { id: 'preg-3', texto_pregunta: '¿Se aplica análisis de riesgo antes de cada tarea?', tipo_respuesta: 'si_no', conducta_nombre: 'Gestión de Riesgos Críticos', obligatoria: true },
        { id: 'preg-4', texto_pregunta: '¿Cómo evalúas la comunicación de tu supervisor?', tipo_respuesta: 'logrado_parcial_no', conducta_nombre: 'Comunicación Asertiva', obligatoria: true },
        { id: 'preg-5', texto_pregunta: '¿Qué sugerencias tienes para mejorar?', tipo_respuesta: 'texto_breve', conducta_nombre: null, obligatoria: false },
      ]
    }
  }),
  enviarRespuestas: () => ({ success: true, data: { message: 'Respuestas registradas exitosamente.' } }),
  obtenerNotificaciones: () => ({
    success: true,
    data: MOCK_DATA.notificaciones.map(n => ({
      ...n,
      titulo: n.tipo === 'encuesta' ? 'Encuesta Pendiente' : n.tipo === 'observacion' ? 'Nueva Observación' : 'Actualización'
    }))
  }),
  marcarComoLeida: () => ({ success: true }),
  listarConductas: (token, progId) => ({
    success: true,
    data: MOCK_DATA.conductas.filter(c => !progId || c.programa_id === progId)
  }),
  crearConducta: () => ({ success: true, data: { id: 'cond-new' } }),
  actualizarConducta: () => ({ success: true }),
  crearRecomendacion: () => ({ success: true }),
  eliminarRecomendacion: () => ({ success: true }),

  // Notificaciones
  contarNotificacionesPendientes: () => ({
    success: true,
    data: { count: 2 }
  }),
  listarNotificaciones: () => ({
    success: true,
    data: MOCK_DATA.notificaciones
  }),
  marcarNotificacionLeida: () => ({ success: true }),

  // Reportes de Observación (jefatura + participante)
  listarReportesObservacion: () => ({ success: true, data: MOCK_DATA.reportesObservacion }),
  crearReporteObservacion: (token, payload) => {
    const newId = 'rep-' + Date.now();
    const prog = MOCK_DATA.programas.find(p => p.id === payload.programa_id);
    const newReporte = {
      id: newId,
      programa_id: payload.programa_id,
      programa_nombre: prog ? prog.nombre : 'Programa',
      tipo: payload.tipo,
      titulo: payload.titulo,
      comentario: payload.comentario,
      fecha: new Date().toISOString().split('T')[0],
      autor_id: 'usr-001',
      autor_nombre: 'Usuario Demo',
      estado_gestion: 'pendiente',
      evidencias: (payload.evidencias || []).map((ev, i) => ({
        id: 'ev-new-' + i,
        nombre: ev.nombre,
        url: ev.dataUrl,
        tipo: ev.tipo
      })),
      historial: []
    };
    MOCK_DATA.reportesObservacion.unshift(newReporte);
    return { success: true, data: { id: newId } };
  },
  actualizarReporteObservacion: (token, payload) => ({ success: true }),

  // Gestión de Observaciones (admin)
  listarTodasObservacionesAdmin: () => ({ success: true, data: MOCK_DATA.reportesObservacion }),
  cambiarEstadoObservacion: (token, obsId, nuevoEstado, comentario) => {
    const obs = MOCK_DATA.reportesObservacion.find(o => o.id === obsId);
    if (obs) {
      obs.estado_gestion = nuevoEstado;
      if (!obs.historial) obs.historial = [];
      obs.historial.push({
        estado_nuevo: nuevoEstado,
        admin_nombre: 'Admin Demo',
        fecha: new Date().toISOString().split('T')[0],
        comentario: comentario
      });
    }
    return { success: true };
  },

  // Actividades (Admin)
  listarActividades: () => ({ success: true, data: MOCK_DATA.actividades }),
  crearActividad: (token, datos) => {
    const newId = 'act-' + Date.now();
    const prog = MOCK_DATA.programas.find(p => p.id === datos.programa_id);
    let asignaciones = [];

    if (datos.asignacion_tipo === 'programa_completo') {
      // Asignar a todos los participantes del programa
      asignaciones = MOCK_DATA.usuarios
        .filter(u => u.cliente_id === (prog ? prog.cliente_id : null) && u.rol === 'participante')
        .map(u => ({
          participante_id: u.id,
          participante_nombre: u.nombre,
          cargo: u.cargo,
          completada: false,
          fecha_completada: null
        }));
    } else if (datos.participantes_ids && datos.participantes_ids.length > 0) {
      asignaciones = datos.participantes_ids.map(pid => {
        const u = MOCK_DATA.usuarios.find(x => x.id === pid);
        return {
          participante_id: pid,
          participante_nombre: u ? u.nombre : 'Desconocido',
          cargo: u ? u.cargo : '',
          completada: false,
          fecha_completada: null
        };
      });
    }

    const newAct = {
      id: newId,
      nombre: datos.nombre,
      tipo: datos.tipo,
      programa_id: datos.programa_id,
      programa_nombre: prog ? prog.nombre : 'Programa',
      enlace: datos.enlace || '',
      descripcion: datos.descripcion || '',
      fecha_limite: datos.fecha_limite || null,
      estado: datos.estado || 'borrador',
      asignacion_tipo: datos.asignacion_tipo,
      fecha_creacion: new Date().toISOString().split('T')[0],
      asignaciones: asignaciones
    };

    MOCK_DATA.actividades.unshift(newAct);
    return { success: true, data: { id: newId } };
  },
  actualizarActividad: (token, id, datos) => {
    const act = MOCK_DATA.actividades.find(a => a.id === id);
    if (act) {
      Object.assign(act, {
        nombre: datos.nombre || act.nombre,
        tipo: datos.tipo || act.tipo,
        enlace: datos.enlace !== undefined ? datos.enlace : act.enlace,
        descripcion: datos.descripcion !== undefined ? datos.descripcion : act.descripcion,
        fecha_limite: datos.fecha_limite || act.fecha_limite,
        estado: datos.estado || act.estado,
      });
    }
    return { success: true };
  },

  // Actividades (Participante)
  listarMisActividades: (token) => {
    // Determinar el usuario según el token
    let userId = 'usr-003'; // default participante
    if (token === 'mock-token-jefatura') userId = 'usr-002';

    const misAct = [];
    MOCK_DATA.actividades.forEach(act => {
      if (act.estado !== 'activa') return;
      const asig = (act.asignaciones || []).find(a => a.participante_id === userId);
      if (asig) {
        misAct.push({
          id: act.id,
          nombre: act.nombre,
          tipo: act.tipo,
          programa_nombre: act.programa_nombre,
          enlace: act.enlace,
          descripcion: act.descripcion,
          fecha_limite: act.fecha_limite,
          completada: asig.completada,
          fecha_completada: asig.fecha_completada
        });
      }
    });
    return { success: true, data: misAct };
  },
  marcarActividadCompletada: (token, actId) => {
    let userId = 'usr-003';
    if (token === 'mock-token-jefatura') userId = 'usr-002';

    const act = MOCK_DATA.actividades.find(a => a.id === actId);
    if (act) {
      const asig = (act.asignaciones || []).find(a => a.participante_id === userId);
      if (asig) {
        asig.completada = true;
        asig.fecha_completada = new Date().toISOString().split('T')[0];
      }
    }
    return { success: true };
  },

  // Reportes
  generarReporte: () => ({
    success: true,
    data: { url: '#', mensaje: 'Reporte generado (modo demo)' }
  }),
};

// ============================================
// PROCESAMIENTO DE TEMPLATES
// ============================================

function readFileContent(filename) {
  const filepath = path.join(BASE_DIR, filename);
  if (!fs.existsSync(filepath)) return null;
  return fs.readFileSync(filepath, 'utf-8');
}

/**
 * Procesa las directivas de template de Google Apps Script
 */
function processTemplate(html) {
  // Reemplazar <?!= include('xxx'); ?> con el contenido del archivo
  html = html.replace(/<\?!=\s*include\(['"](\w[\w-]*)'\);\s*\?>/g, (match, filename) => {
    const content = readFileContent(filename + '.html');
    return content || `<!-- include ${filename} not found -->`;
  });

  // Reemplazar <?= ScriptApp.getService().getUrl() ?> con la URL local
  html = html.replace(/<\?=\s*ScriptApp\.getService\(\)\.getUrl\(\)\s*\?>/g, BASE_URL);

  return html;
}

/**
 * Genera el script mock de google.script.run
 */
function getMockScript() {
  return `
<script>
// ============================================
// MOCK: google.script.run
// Simula las llamadas al backend de Google Apps Script
// ============================================
var google = {
  script: {
    run: new Proxy({}, {
      get: function(target, prop) {
        if (prop === 'withSuccessHandler') {
          return function(successHandler) {
            return new Proxy({}, {
              get: function(t2, p2) {
                if (p2 === 'withFailureHandler') {
                  return function(failureHandler) {
                    return new Proxy({}, {
                      get: function(t3, fnName) {
                        return function() {
                          var args = Array.prototype.slice.call(arguments);
                          console.log('[MOCK] google.script.run.' + fnName + '(', args, ')');
                          // Llamar al endpoint mock
                          fetch('/api/mock', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ fn: fnName, args: args })
                          })
                          .then(function(r) { return r.json(); })
                          .then(function(result) {
                            console.log('[MOCK] Response:', result);
                            setTimeout(function() { successHandler(result); }, 200);
                          })
                          .catch(function(err) {
                            console.error('[MOCK] Error:', err);
                            failureHandler(err);
                          });
                        };
                      }
                    });
                  };
                }
                // Si no hay failureHandler, ejecutar directamente
                return function() {
                  var args = Array.prototype.slice.call(arguments);
                  console.log('[MOCK] google.script.run.' + p2 + '(', args, ')');
                  fetch('/api/mock', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fn: p2, args: args })
                  })
                  .then(function(r) { return r.json(); })
                  .then(function(result) {
                    setTimeout(function() { successHandler(result); }, 200);
                  });
                };
              }
            });
          };
        }
        if (prop === 'withFailureHandler') {
          return function(failureHandler) {
            return new Proxy({}, {
              get: function(t2, p2) {
                if (p2 === 'withSuccessHandler') {
                  return function(successHandler) {
                    return new Proxy({}, {
                      get: function(t3, fnName) {
                        return function() {
                          var args = Array.prototype.slice.call(arguments);
                          fetch('/api/mock', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ fn: fnName, args: args })
                          })
                          .then(function(r) { return r.json(); })
                          .then(function(result) {
                            setTimeout(function() { successHandler(result); }, 200);
                          })
                          .catch(function(err) { failureHandler(err); });
                        };
                      }
                    });
                  };
                }
                return function() {
                  var args = Array.prototype.slice.call(arguments);
                  fetch('/api/mock', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fn: p2, args: args })
                  })
                  .then(function(r) { return r.json(); })
                  .then(function(result) { /* no success handler */ })
                  .catch(function(err) { failureHandler(err); });
                };
              }
            });
          };
        }
        // Direct function call
        return function() {
          var args = Array.prototype.slice.call(arguments);
          fetch('/api/mock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fn: prop, args: args })
          });
        };
      }
    })
  }
};
console.log('%c[MSO Dev Server] Mock de google.script.run activo', 'color: #F58220; font-weight: bold;');
console.log('%cCredenciales demo:', 'color: #3D0C4B; font-weight: bold;');
console.log('  Admin:        admin@mso.cl / 123456');
console.log('  Jefatura:     jrodriguez@losandes.cl / 123456');
console.log('  Participante: lmartinez@losandes.cl / 123456');
</script>
`;
}

/**
 * Inyecta el mock de google.script.run ANTES de cualquier otro script
 */
function injectMock(html) {
  // Inyectar el mock justo después del <head> o al inicio del <body>
  const mockScript = getMockScript();

  if (html.includes('<head>')) {
    // Para páginas completas (login, registro, index)
    html = html.replace('<head>', '<head>\n' + mockScript);
  } else {
    // Para vistas parciales, no inyectar (ya está en el layout principal)
  }

  return html;
}

// ============================================
// SERVIDOR HTTP
// ============================================

const server = http.createServer((req, res) => {
  const url = new URL(req.url, BASE_URL);
  const pathname = url.pathname;

  // API Mock endpoint
  if (pathname === '/api/mock' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { fn, args } = JSON.parse(body);
        const handler = backendFunctions[fn];
        let result;
        if (handler) {
          result = handler(...(args || []));
        } else {
          console.log(`[MOCK] Función no implementada: ${fn}`);
          result = { success: true, data: [] };
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        console.error('[ERROR]', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // API: obtener vista HTML (simula getVistaHTML)
  if (pathname === '/api/vista' && req.method === 'GET') {
    const vista = url.searchParams.get('nombre');
    const content = readFileContent(vista + '.html');
    if (content) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(content);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end('<div class="empty-state"><p>Vista no encontrada: ' + vista + '</p></div>');
    }
    return;
  }

  // Páginas principales
  const page = url.searchParams.get('page') || 'login';

  if (pathname === '/' || pathname === '') {
    let filename;
    switch (page) {
      case 'app': filename = 'index.html'; break;
      case 'registro': filename = 'registro.html'; break;
      case 'login':
      default: filename = 'login.html'; break;
    }

    let html = readFileContent(filename);
    if (!html) {
      res.writeHead(404);
      res.end('Archivo no encontrado: ' + filename);
      return;
    }

    html = processTemplate(html);
    html = injectMock(html);

    // Para la vista principal, reemplazar la carga dinámica de vistas
    // para que use fetch en vez de google.script.run.getVistaHTML
    if (filename === 'index.html') {
      html = html.replace(
        /google\.script\.run\s*\n?\s*\.withSuccessHandler\(function\(html\)\s*\{[\s\S]*?\}\)\s*\n?\s*\.withFailureHandler\(function\(error\)\s*\{[\s\S]*?\}\)\s*\n?\s*\.getVistaHTML\(vista\.html\);/,
        `fetch('/api/vista?nombre=' + vista.html)
          .then(function(r) { return r.text(); })
          .then(function(html) {
            document.getElementById('content-area').innerHTML = html;
            ejecutarScripts(document.getElementById('content-area'));
            closeSidebar();
          })
          .catch(function(error) {
            document.getElementById('content-area').innerHTML =
              '<div class="empty-state"><p>Error al cargar la vista. Intenta de nuevo.</p></div>';
          });`
      );
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  // Archivos estáticos (imágenes, etc.)
  const extMap = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.css': 'text/css',
    '.js': 'application/javascript',
  };

  const ext = path.extname(pathname).toLowerCase();
  if (extMap[ext]) {
    const filePath = path.join(BASE_DIR, decodeURIComponent(pathname));
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': extMap[ext] });
      res.end(content);
      return;
    }
  }

  // 404
  res.writeHead(404);
  res.end('Not Found');
});

server.listen(PORT, () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════════════════╗');
  console.log('  ║   MSO Chile - Plataforma TPT (Dev Server)       ║');
  console.log('  ╠══════════════════════════════════════════════════╣');
  console.log(`  ║   🌐 http://localhost:${PORT}                      ║`);
  console.log('  ╠══════════════════════════════════════════════════╣');
  console.log('  ║   Credenciales demo:                            ║');
  console.log('  ║   Admin:        admin@mso.cl / 123456           ║');
  console.log('  ║   Jefatura:     jrodriguez@losandes.cl / 123456 ║');
  console.log('  ║   Participante: lmartinez@losandes.cl / 123456  ║');
  console.log('  ╚══════════════════════════════════════════════════╝');
  console.log('');
});
