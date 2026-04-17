// ============================================
// SUPABASE CLIENT - Reemplazo de mock.js
// Mantiene la interfaz google.script.run para compatibilidad
// ============================================

var SUPABASE_URL = 'https://loezdutwrucnoebhofjt.supabase.co';
var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxvZXpkdXR3cnVjbm9lYmhvZmp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5MTY0MzEsImV4cCI6MjA5MTQ5MjQzMX0.CvJnaQ1T-MryjiimGnjo2gRgIKmYBuYPE-n1691n7Ek';

// Cargar SDK de Supabase
var _supabaseReady = false;
var _supabase = null;
var _supabaseReadyPromise = null;

function initSupabase() {
  if (_supabaseReady) return true;
  if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
    _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    _supabaseReady = true;
    console.log('%c[MSO] Supabase conectado', 'color: #10B981; font-weight: bold;');
    return true;
  }
  return false;
}

// Intentar inicializar inmediatamente (script ya cargado)
initSupabase();

// Helper: firma las URLs de evidencias de una lista de observaciones (en batch)
async function _enrichObsList(rows) {
  var paths = [];
  rows.forEach(function(row) {
    (row.evidencias || []).forEach(function(e) { if (e && e.storage_path) paths.push(e.storage_path); });
  });
  var urlMap = {};
  if (paths.length) {
    try {
      var signed = await _supabase.storage.from('evidencias-observaciones').createSignedUrls(paths, 3600);
      if (signed && signed.data) {
        signed.data.forEach(function(s) { if (s && s.path) urlMap[s.path] = s.signedUrl; });
      }
    } catch (e) { console.error('[enrichObs] sign', e); }
  }
  return rows.map(function(row) {
    var mapped = _mapObsRow(row);
    mapped.evidencias = (row.evidencias || []).map(function(e) {
      return {
        nombre: e && e.nombre,
        tipo: e && e.tipo,
        storage_path: e && e.storage_path,
        url: e && e.storage_path ? (urlMap[e.storage_path] || '') : (e && e.dataUrl ? e.dataUrl : '')
      };
    });
    return mapped;
  });
}

// Helper: dispara un correo via Edge Function send-email (fire-and-forget)
// Nunca rompe el flujo principal si falla
function _fireEmail(payload) {
  try {
    fetch(SUPABASE_URL + '/functions/v1/send-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'apikey': SUPABASE_KEY
      },
      body: JSON.stringify(payload)
    }).then(function(r) { return r.json(); })
      .then(function(data) {
        if (!data || !data.success) {
          console.warn('[send-email] ' + payload.evento + ' no exitoso:', data);
        }
      })
      .catch(function(e) { console.warn('[send-email] exception', e); });
  } catch (e) {
    console.warn('[send-email] sync exception', e);
  }
}

// Helper: normaliza una fila de observaciones a la forma que espera el frontend
function _mapObsRow(row) {
  return {
    id: row.id,
    programa_id: row.programa_id,
    programa_nombre: row.programas ? row.programas.nombre : '',
    autor_id: row.autor_id,
    autor_nombre: row.autor ? row.autor.nombre : '',
    tipo: row.tipo,
    categoria: row.categoria,
    elemento_id: row.elemento_id,
    titulo: row.titulo || '',
    comentario: row.comentario || '',
    descripcion: row.comentario || '',
    estado_gestion: row.estado_gestion || 'pendiente',
    comentario_gestion: row.comentario_gestion || '',
    fecha: row.fecha || row.created_at,
    evidencias: Array.isArray(row.evidencias) ? row.evidencias : []
  };
}

// Promesa que se resuelve cuando Supabase esta listo
_supabaseReadyPromise = new Promise(function(resolve) {
  if (_supabaseReady) { resolve(); return; }
  var attempts = 0;
  var interval = setInterval(function() {
    attempts++;
    if (initSupabase()) {
      clearInterval(interval);
      resolve();
    } else if (attempts > 100) { // 5 segundos max
      clearInterval(interval);
      console.error('[MSO] Timeout esperando SDK de Supabase');
      resolve();
    }
  }, 50);
});

async function ensureSupabaseReady() {
  if (_supabaseReady) return;
  await _supabaseReadyPromise;
}

// ============================================
// BACKEND FUNCTIONS (reemplazan backendFunctions de mock.js)
// ============================================

var backendFunctions = {

  // ============================================
  // AUTH
  // ============================================
  loginUsuario: async function(email, password) {
    try {
      // Login directo contra tabla usuarios (demo sin RLS)
      var perfil = await _supabase.from('usuarios').select('*').eq('email', email).eq('password_visible', password).single();
      if (perfil.error || !perfil.data) {
        return { success: false, error: 'Credenciales invalidas. Verifica tu correo y contrasena.' };
      }
      return {
        success: true,
        data: {
          token: 'demo-token',
          usuario: perfil.data
        }
      };
    } catch(e) {
      return { success: false, error: 'Error de conexion. Intenta nuevamente.' };
    }
  },

  cerrarSesion: async function() {
    return { success: true };
  },

  // ============================================
  // PASSWORD RESET (Edge Functions)
  // ============================================
  solicitarResetPassword: async function(email) {
    try {
      var r = await fetch(SUPABASE_URL + '/functions/v1/password-reset-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + SUPABASE_KEY,
          'apikey': SUPABASE_KEY
        },
        body: JSON.stringify({ email: email })
      });
      return await r.json();
    } catch (e) {
      // Incluso ante error de red, damos el mismo mensaje para no filtrar nada
      return { success: true, message: 'Si el email esta registrado, recibiras un link en tu bandeja. Revisa tambien tu carpeta de spam.' };
    }
  },

  confirmarResetPassword: async function(token, nuevaPassword) {
    try {
      var r = await fetch(SUPABASE_URL + '/functions/v1/password-reset-confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + SUPABASE_KEY,
          'apikey': SUPABASE_KEY
        },
        body: JSON.stringify({ token: token, new_password: nuevaPassword })
      });
      return await r.json();
    } catch (e) {
      return { success: false, error: 'Error de conexion. Intenta nuevamente.' };
    }
  },

  registrarUsuario: async function(datos) {
    try {
      var result = await _supabase.auth.signUp({
        email: datos.email,
        password: datos.password || '123456'
      });
      if (result.error) return { success: false, error: result.error.message };
      var perfil = await _supabase.from('usuarios').insert({
        auth_id: result.data.user.id,
        nombre: datos.nombre || datos.nombre_completo || '',
        email: datos.email,
        rol: datos.rol || 'participante',
        cargo: datos.cargo || '',
        cliente_id: datos.cliente_id || null
      }).select().single();
      return { success: true, data: { id: perfil.data ? perfil.data.id : null } };
    } catch(e) {
      return { success: false, error: e.message };
    }
  },

  obtenerClientesRegistro: async function() {
    var r = await _supabase.from('clientes').select('id, nombre').eq('estado', 'Activo');
    return r.data || [];
  },

  // ============================================
  // CLIENTES
  // ============================================
  listarClientes: async function() {
    var r = await _supabase.from('clientes').select('*').order('created_at', { ascending: false });
    return { success: true, data: r.data || [] };
  },

  crearCliente: async function(token, datos) {
    var payload = {
      nombre: datos.nombre || '',
      razon_social: datos.razon_social || '',
      rubro: datos.rubro || '',
      pais: datos.pais || 'Chile',
      contacto_nombre: datos.contacto_nombre || '',
      contacto_email: datos.contacto_email || '',
      estado: 'Activo'
    };
    if (datos.fecha_expiracion) payload.fecha_expiracion = datos.fecha_expiracion;
    if (datos.dias_gracia !== undefined && datos.dias_gracia !== '' && datos.dias_gracia !== null) {
      payload.dias_gracia = Number(datos.dias_gracia);
    }
    var r = await _supabase.from('clientes').insert(payload).select().single();
    if (r.error) return { success: false, error: r.error.message };
    return { success: true, data: { id: r.data.id } };
  },

  actualizarCliente: async function(token, id, datos) {
    var payload = {};
    Object.keys(datos || {}).forEach(function(k) {
      if (k === 'id') return;
      var v = datos[k];
      if (k === 'fecha_expiracion') {
        payload.fecha_expiracion = (v && String(v).trim()) ? String(v).substring(0, 10) : null;
      } else if (k === 'dias_gracia') {
        payload.dias_gracia = (v === '' || v === null || v === undefined) ? 15 : Number(v);
      } else {
        payload[k] = v;
      }
    });
    var r = await _supabase.from('clientes').update(payload).eq('id', id);
    if (r.error) return { success: false, error: r.error.message };
    return { success: true };
  },

  desactivarCliente: async function(token, id) {
    var cli = await _supabase.from('clientes').select('estado').eq('id', id).single();
    var nuevoEstado = (cli.data && cli.data.estado === 'Activo') ? 'Inactivo' : 'Activo';
    await _supabase.from('clientes').update({ estado: nuevoEstado }).eq('id', id);
    return { success: true };
  },

  eliminarCliente: async function(token, id) {
    await _supabase.from('clientes').delete().eq('id', id);
    return { success: true };
  },

  obtenerConfigPlataforma: async function() {
    try {
      var r = await _supabase.from('plataforma_config').select('*').eq('id', 1).maybeSingle();
      if (r.error || !r.data) {
        return { success: true, data: { activa: true, modo_solo_lectura: false, mensaje: null } };
      }
      return { success: true, data: r.data };
    } catch (e) {
      return { success: true, data: { activa: true, modo_solo_lectura: false, mensaje: null } };
    }
  },

  obtenerEstadoLicencia: async function(token, clienteId) {
    if (!clienteId) {
      var usuario = null;
      try { usuario = JSON.parse(sessionStorage.getItem('tpt_usuario') || 'null'); } catch (e) {}
      if (usuario && usuario.rol === 'admin') {
        return { success: true, data: { estado: 'activa', dias_restantes: null, es_admin_mso: true } };
      }
      if (usuario && usuario.id) {
        var pp = await _supabase.from('participantes_programa')
          .select('programa_id').eq('usuario_id', usuario.id).limit(1).maybeSingle();
        if (pp.data && pp.data.programa_id) {
          var prog = await _supabase.from('programas').select('cliente_id').eq('id', pp.data.programa_id).maybeSingle();
          if (prog.data && prog.data.cliente_id) clienteId = prog.data.cliente_id;
        }
      }
    }
    if (!clienteId) return { success: true, data: { estado: 'activa', dias_restantes: null } };
    var cli = await _supabase.from('clientes').select('id, nombre, fecha_expiracion, dias_gracia').eq('id', clienteId).maybeSingle();
    if (!cli.data || !cli.data.fecha_expiracion) {
      return { success: true, data: { estado: 'activa', dias_restantes: null, cliente_id: clienteId } };
    }
    var hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    var exp = new Date(cli.data.fecha_expiracion + 'T12:00:00');
    exp.setHours(0, 0, 0, 0);
    var diffMs = exp.getTime() - hoy.getTime();
    var dias = Math.round(diffMs / (1000 * 60 * 60 * 24));
    var gracia = Number(cli.data.dias_gracia || 15);
    var estado = 'activa';
    var nivel_aviso = null;
    if (dias <= 0) {
      if (Math.abs(dias) <= gracia) estado = 'solo_lectura';
      else estado = 'solo_lectura';
    } else if (dias <= 7) {
      nivel_aviso = 'urgente';
    } else if (dias <= 30) {
      nivel_aviso = 'proximo';
    }
    return {
      success: true,
      data: {
        cliente_id: cli.data.id,
        cliente_nombre: cli.data.nombre,
        fecha_expiracion: cli.data.fecha_expiracion,
        dias_restantes: dias,
        dias_gracia: gracia,
        estado: estado,
        nivel_aviso: nivel_aviso
      }
    };
  },

  // ============================================
  // PROGRAMAS
  // ============================================
  listarProgramas: async function() {
    var r = await _supabase.from('programas').select('*, clientes(nombre)').order('created_at', { ascending: false });
    var data = (r.data || []).map(function(p) {
      p.cliente_nombre = p.clientes ? p.clientes.nombre : '';
      delete p.clientes;
      return p;
    });
    return { success: true, data: data };
  },

  listarProgramasDashboard: async function(token, userId) {
    // Detectar rol del usuario actual desde sessionStorage
    var rol = null;
    try {
      var u = JSON.parse(sessionStorage.getItem('tpt_usuario') || 'null');
      if (u) rol = u.rol;
    } catch (e) {}

    // Admin o usuario sin id -> devolver todos los programas
    if (!userId || rol === 'admin') {
      var r = await _supabase.from('programas').select('*, clientes(nombre)').order('created_at', { ascending: false });
      var data = (r.data || []).map(function(p) {
        p.cliente_nombre = p.clientes ? p.clientes.nombre : '';
        delete p.clientes;
        return p;
      });
      return { success: true, data: data };
    }
    // Otros roles -> filtrar por participantes_programa
    var pp = await _supabase.from('participantes_programa').select('programa_id').eq('usuario_id', userId);
    var progIds = (pp.data || []).map(function(p) { return p.programa_id; });
    if (progIds.length === 0) return { success: true, data: [] };
    var r2 = await _supabase.from('programas').select('*, clientes(nombre)').in('id', progIds);
    var data2 = (r2.data || []).map(function(p) {
      p.cliente_nombre = p.clientes ? p.clientes.nombre : '';
      delete p.clientes;
      return p;
    });
    return { success: true, data: data2 };
  },

  crearPrograma: async function(token, datos) {
    var r = await _supabase.from('programas').insert({
      nombre: datos.nombre || 'Nuevo Programa',
      cliente_id: datos.cliente_id || null,
      tipo: datos.tipo || 'piloto',
      estado: datos.estado || 'diseno',
      objetivo: datos.objetivo || '',
      fecha_inicio: datos.fecha_inicio || null,
      fecha_termino: datos.fecha_termino || null,
      fecha_medicion_pre: datos.fecha_medicion_pre || null,
      fecha_medicion_post: datos.fecha_medicion_post || null
    }).select().single();
    if (r.error) return { success: false, error: r.error.message };
    return { success: true, data: { id: r.data.id, programaId: r.data.id } };
  },

  actualizarPrograma: async function(token, id, datos) {
    var r = await _supabase.from('programas').update(datos).eq('id', id);
    if (r.error) return { success: false, error: r.error.message };
    return { success: true };
  },

  activarPrograma: async function(token, id) {
    var r = await _supabase.from('programas').update({ estado: 'activo' }).eq('id', id);
    if (r.error) return { success: false, error: r.error.message };
    return { success: true };
  },

  desactivarPrograma: async function(token, id) {
    var r = await _supabase.from('programas').update({ estado: 'suspendido' }).eq('id', id);
    if (r.error) return { success: false, error: r.error.message };
    return { success: true };
  },

  eliminarPrograma: async function(token, id) {
    await _supabase.from('programas').delete().eq('id', id);
    return { success: true };
  },

  obtenerPrograma: async function(token, id) {
    var r = await _supabase.from('programas').select('*, clientes(nombre)').eq('id', id).single();
    if (r.error) return { success: false, error: 'Programa no encontrado' };
    var prog = r.data;
    prog.cliente_nombre = prog.clientes ? prog.clientes.nombre : '';
    var cond = await _supabase.from('competencias').select('*').eq('programa_id', id).order('orden');
    var parts = await _supabase.from('participantes_programa')
      .select('*, usuarios(id, nombre, email, cargo, rol)')
      .eq('programa_id', id);
    return {
      success: true,
      data: {
        ...prog,
        conductas: cond.data || [],
        participantes: (parts.data || []).map(function(p) {
          return {
            usuario_id: p.usuarios.id,
            nombre: p.usuarios.nombre,
            email: p.usuarios.email,
            rol_programa: p.rol_programa
          };
        })
      }
    };
  },

  // ============================================
  // USUARIOS
  // ============================================
  listarUsuarios: async function() {
    var r = await _supabase.from('usuarios').select('*, clientes(nombre)').order('created_at', { ascending: false });
    var data = (r.data || []).map(function(u) {
      u.cliente_nombre = u.clientes ? u.clientes.nombre : '';
      delete u.clientes;
      return u;
    });
    return { success: true, data: data };
  },

  crearUsuario: async function(token, datos) {
    // Crear en auth primero
    var authResult = await _supabase.auth.admin ? null : null; // No tenemos admin API desde frontend
    // Crear perfil directamente (el usuario se registrara despues o el admin lo crea desde Supabase)
    var r = await _supabase.from('usuarios').insert({
      nombre: datos.nombre || datos.nombre_completo || '',
      email: datos.email || '',
      rol: datos.rol || 'participante',
      cargo: datos.cargo || '',
      cliente_id: datos.cliente_id || null,
      estado: 'Activo',
      password_visible: datos.password || '123456'
    }).select().single();
    if (r.error) return { success: false, error: r.error.message };
    return { success: true, data: { id: r.data.id } };
  },

  actualizarUsuario: async function(token, id, datos) {
    await _supabase.from('usuarios').update(datos).eq('id', id);
    return { success: true };
  },

  cambiarEstadoUsuario: async function(token, id) {
    var usr = await _supabase.from('usuarios').select('estado').eq('id', id).single();
    var nuevoEstado = (usr.data && usr.data.estado === 'Activo') ? 'Inactivo' : 'Activo';
    await _supabase.from('usuarios').update({ estado: nuevoEstado }).eq('id', id);
    return { success: true };
  },

  // ============================================
  // PARTICIPANTES PROGRAMA
  // ============================================
  obtenerPanelPrograma: async function(token, progId) {
    var prog = await _supabase.from('programas').select('*, clientes(nombre)').eq('id', progId).single();
    if (prog.error) return { success: false, error: 'Programa no encontrado' };
    var p = prog.data;
    p.cliente_nombre = p.clientes ? p.clientes.nombre : '';

    var parts = await _supabase.from('participantes_programa')
      .select('*, usuarios!participantes_programa_usuario_id_fkey(id, nombre, email, cargo, estado, rol, password_visible)')
      .eq('programa_id', progId);

    var comps = await _supabase.from('competencias').select('*').eq('programa_id', progId).order('orden');
    var encs = await _supabase.from('encuestas').select('*').eq('programa_id', progId);

    var participantes = (parts.data || []).map(function(a) {
      var u = a.usuarios;
      if (!u) return null;
      var lider = a.lider_id ? (parts.data || []).find(function(x) { return x.usuario_id === a.lider_id; }) : null;
      return {
        usuario_id: u.id, nombre: u.nombre, nombre_lider: u.nombre,
        email: u.email, email_lider: u.email, cargo: u.cargo,
        password_visible: u.password_visible || '',
        rol_programa: a.rol_programa || 'lider',
        lider_id: a.lider_id || null,
        lider_nombre: lider && lider.usuarios ? lider.usuarios.nombre : null,
        estado: u.estado
      };
    }).filter(Boolean);

    var competencias = (comps.data || []).map(function(c) {
      return {
        id: c.id, nombre: c.nombre, descripcion: c.descripcion || '',
        foco_desarrollo: c.foco_desarrollo || '',
        nivel_1_texto: c.nivel_1_texto || 'Conoce el concepto',
        nivel_2_texto: c.nivel_2_texto || 'Aplica con guia',
        nivel_3_texto: c.nivel_3_texto || 'Aplica consistentemente',
        nivel_4_texto: c.nivel_4_texto || 'Es referente',
        interpretacion_nivel_1: c.interpretacion_nivel_1 || '',
        interpretacion_nivel_2: c.interpretacion_nivel_2 || '',
        interpretacion_nivel_3: c.interpretacion_nivel_3 || '',
        interpretacion_nivel_4: c.interpretacion_nivel_4 || '',
        prioridad: c.orden, orden: c.orden
      };
    });

    return {
      success: true,
      data: {
        programa: p,
        participantes: participantes,
        competencias: competencias,
        encuestas: encs.data || [],
        stats: {
          total_lideres: participantes.filter(function(x) { return x.rol_programa === 'lider'; }).length,
          total_colaboradores: participantes.filter(function(x) { return x.rol_programa === 'colaborador'; }).length,
          total_competencias: competencias.length,
          total_encuestas: (encs.data || []).length
        }
      }
    };
  },

  listarParticipantesPrograma: async function(token, progId) {
    try {
      if (!progId) return { success: true, data: [] };
      if (!_supabase) return { success: false, error: 'Supabase no inicializado' };
      var r = await _supabase.from('participantes_programa')
        .select('*, usuarios!participantes_programa_usuario_id_fkey(id, nombre, email, cargo, rol, password_visible)')
        .eq('programa_id', progId);
      if (r.error) {
        console.error('[listarParticipantesPrograma] supabase error', r.error);
        return { success: false, error: r.error.message || 'Error al consultar participantes' };
      }
      var data = (r.data || []).map(function(a) {
        var u = a.usuarios;
        if (Array.isArray(u)) u = u[0];
        if (!u) return null;
        return {
          id: u.id,
          usuario_id: u.id,
          nombre: u.nombre || '',
          email: u.email || '',
          cargo: u.cargo || '',
          password_visible: u.password_visible || '',
          rol_programa: a.rol_programa,
          lider_id: a.lider_id || null
        };
      }).filter(Boolean);
      return { success: true, data: data };
    } catch (e) {
      console.error('[listarParticipantesPrograma] exception', e);
      return { success: false, error: (e && e.message) || 'Error inesperado' };
    }
  },

  obtenerUsuariosDisponibles: async function(token, progId) {
    var asociados = await _supabase.from('participantes_programa').select('usuario_id').eq('programa_id', progId);
    var ids = (asociados.data || []).map(function(a) { return a.usuario_id; });
    var query = _supabase.from('usuarios').select('*').neq('rol', 'admin');
    if (ids.length > 0) {
      // Supabase no tiene NOT IN directo, filtrar en JS
      var todos = await query;
      var data = (todos.data || []).filter(function(u) { return ids.indexOf(u.id) === -1; });
      return { success: true, data: data };
    }
    var todos = await query;
    return { success: true, data: todos.data || [] };
  },

  asociarParticipantes: async function(token, progId, datos) {
    var items = Array.isArray(datos) ? datos : [datos];
    var inserts = items.map(function(d) {
      return {
        programa_id: progId,
        usuario_id: d.usuario_id || d.id || d,
        rol_programa: d.rol_programa || d.rol || 'lider',
        lider_id: d.lider_id || null
      };
    });
    var r = await _supabase.from('participantes_programa').upsert(inserts, { onConflict: 'programa_id,usuario_id' });
    // Disparar correo de bienvenida (fire-and-forget)
    _fireEmail({
      evento: 'bienvenida',
      programa_id: progId,
      usuario_ids: inserts.map(function(i) { return i.usuario_id; })
    });
    return { success: true, data: { count: inserts.length } };
  },

  desasociarParticipante: async function(token, progId, userId) {
    await _supabase.from('participantes_programa').delete().eq('programa_id', progId).eq('usuario_id', userId);
    return { success: true };
  },

  eliminarTodosParticipantes: async function(token, progId) {
    var r = await _supabase.from('participantes_programa').select('usuario_id').eq('programa_id', progId);
    var userIds = (r.data || []).map(function(p) { return p.usuario_id; });
    if (!userIds.length) return { success: true, data: { count: 0 } };
    await _supabase.from('participantes_programa').delete().eq('programa_id', progId);
    await _supabase.from('usuarios').delete().in('id', userIds).neq('rol', 'admin');
    return { success: true, data: { count: userIds.length } };
  },

  // ============================================
  // COMPETENCIAS
  // ============================================
  listarCompetencias: async function(token, progId) {
    var query = _supabase.from('competencias').select('*').order('orden');
    if (progId) query = query.eq('programa_id', progId);
    var r = await query;
    return { success: true, data: r.data || [] };
  },

  crearCompetencia: async function(token, datos) {
    var r = await _supabase.from('competencias').insert(datos).select().single();
    if (r.error) return { success: false, error: r.error.message };
    return { success: true, data: { id: r.data.id } };
  },

  actualizarCompetencia: async function(token, id, datos) {
    await _supabase.from('competencias').update(datos).eq('id', id);
    return { success: true };
  },

  desactivarCompetencia: async function(token, id) {
    await _supabase.from('competencias').delete().eq('id', id);
    return { success: true };
  },

  desactivarConducta: async function(token, id) {
    await _supabase.from('competencias').delete().eq('id', id);
    return { success: true };
  },

  importarCompetenciasExcel: async function(token, progId, competencias) {
    var del = await _supabase.from('competencias').delete().eq('programa_id', progId);
    if (del.error) {
      console.error('[importarCompetenciasExcel] error borrando previas', del.error);
      return { success: false, error: del.error.message };
    }
    var inserts = (competencias || []).map(function(c, i) {
      return {
        programa_id: progId,
        orden: i + 1,
        estado: 'activa',
        nombre: c.nombre || '',
        descripcion: c.descripcion || '',
        foco_desarrollo: c.foco_desarrollo || '',
        nivel_1_texto: c.nivel_1_texto || '',
        nivel_2_texto: c.nivel_2_texto || '',
        nivel_3_texto: c.nivel_3_texto || '',
        nivel_4_texto: c.nivel_4_texto || '',
        interpretacion_nivel_1: c.interpretacion_nivel_1 || '',
        interpretacion_nivel_2: c.interpretacion_nivel_2 || '',
        interpretacion_nivel_3: c.interpretacion_nivel_3 || '',
        interpretacion_nivel_4: c.interpretacion_nivel_4 || ''
      };
    });
    if (inserts.length === 0) {
      return { success: true, data: { message: '0 competencias importadas.' } };
    }
    var r = await _supabase.from('competencias').insert(inserts).select();
    if (r.error) {
      console.error('[importarCompetenciasExcel] error insertando', r.error);
      return { success: false, error: r.error.message };
    }
    return { success: true, data: { message: (r.data || []).length + ' competencias importadas.' } };
  },

  // ============================================
  // ENCUESTAS
  // ============================================
  listarEncuestas: async function(token, progId) {
    var query = _supabase.from('encuestas').select('*').order('created_at', { ascending: false });
    if (progId) query = query.eq('programa_id', progId);
    var r = await query;
    var encuestas = r.data || [];
    if (encuestas.length === 0) return { success: true, data: [] };

    // Para cada encuesta, calcular: num_preguntas, total_respuestas (evaluadores distintos), total_esperadas
    var encIds = encuestas.map(function(e) { return e.id; });

    // Contar preguntas por encuesta
    var pregs = await _supabase.from('preguntas').select('encuesta_id').in('encuesta_id', encIds);
    var pregsPorEnc = {};
    (pregs.data || []).forEach(function(p) {
      pregsPorEnc[p.encuesta_id] = (pregsPorEnc[p.encuesta_id] || 0) + 1;
    });

    // Obtener respuestas (solo evaluador_id + encuesta_id) para contar evaluadores distintos
    var resp = await _supabase.from('respuestas').select('encuesta_id, evaluador_id').in('encuesta_id', encIds);
    var evalsPorEnc = {};
    (resp.data || []).forEach(function(rr) {
      if (!evalsPorEnc[rr.encuesta_id]) evalsPorEnc[rr.encuesta_id] = {};
      evalsPorEnc[rr.encuesta_id][rr.evaluador_id] = true;
    });

    // Calcular esperadas por programa_id: lideres para auto, colaboradores para co
    var progsEnc = {};
    encuestas.forEach(function(e) { progsEnc[e.programa_id] = true; });
    var pp = await _supabase.from('participantes_programa').select('programa_id, rol_programa')
      .in('programa_id', Object.keys(progsEnc));
    var countsPorPrograma = {};
    (pp.data || []).forEach(function(x) {
      if (!countsPorPrograma[x.programa_id]) countsPorPrograma[x.programa_id] = { lider: 0, colaborador: 0 };
      if (x.rol_programa === 'lider') countsPorPrograma[x.programa_id].lider++;
      else if (x.rol_programa === 'colaborador') countsPorPrograma[x.programa_id].colaborador++;
    });

    var data = encuestas.map(function(e) {
      var counts = countsPorPrograma[e.programa_id] || { lider: 0, colaborador: 0 };
      var esperadas = (e.tipo_cuestionario === 'coevaluacion') ? counts.colaborador : counts.lider;
      var evalsMap = evalsPorEnc[e.id] || {};
      var respondidas = Object.keys(evalsMap).length;
      e.num_preguntas = pregsPorEnc[e.id] || 0;
      e.total_respuestas = respondidas;
      e.total_esperadas = esperadas;
      return e;
    });
    return { success: true, data: data };
  },

  crearEncuesta: async function(token, datos) {
    var prog = datos.programa_id ?
      await _supabase.from('programas').select('nombre').eq('id', datos.programa_id).single() : null;
    var r = await _supabase.from('encuestas').insert({
      programa_id: datos.programa_id || null,
      nombre: datos.nombre || '',
      tipo: datos.tipo || 'pre',
      tipo_cuestionario: datos.tipo_cuestionario || 'autoevaluacion',
      estado: 'borrador',
      instrucciones: datos.instrucciones || '',
      fecha_cierre: datos.fecha_cierre || null
    }).select().single();
    if (r.error) return { success: false, error: r.error.message };
    return { success: true, data: { id: r.data.id } };
  },

  actualizarEncuesta: async function(token, id, datos) {
    // Detectar transicion a 'activa' para disparar correo
    var estadoPrevio = null;
    if (datos && datos.estado === 'activa') {
      var prev = await _supabase.from('encuestas').select('estado').eq('id', id).single();
      estadoPrevio = prev.data ? prev.data.estado : null;
    }
    await _supabase.from('encuestas').update(datos).eq('id', id);
    if (datos && datos.estado === 'activa' && estadoPrevio !== 'activa') {
      _fireEmail({ evento: 'encuesta_disponible', encuesta_id: id });
    }
    return { success: true };
  },

  activarEncuesta: async function(token, id) {
    // Solo dispara correo si antes no estaba activa
    var prev = await _supabase.from('encuestas').select('estado').eq('id', id).single();
    var estadoPrevio = prev.data ? prev.data.estado : null;
    await _supabase.from('encuestas').update({ estado: 'activa' }).eq('id', id);
    if (estadoPrevio !== 'activa') {
      _fireEmail({ evento: 'encuesta_disponible', encuesta_id: id });
    }
    return { success: true };
  },

  cerrarEncuesta: async function(token, id) {
    await _supabase.from('encuestas').update({ estado: 'cerrada' }).eq('id', id);
    return { success: true };
  },

  eliminarEncuesta: async function(token, id) {
    await _supabase.from('encuestas').delete().eq('id', id);
    return { success: true };
  },

  obtenerEncuestaCompleta: async function(token, id) {
    var enc = await _supabase.from('encuestas').select('*').eq('id', id).single();
    if (enc.error) {
      console.error('[obtenerEncuestaCompleta] error encuesta', enc.error);
      return { success: false, error: enc.error.message };
    }
    var pregs = await _supabase.from('preguntas').select('*')
      .eq('encuesta_id', id).order('orden', { ascending: true });
    if (pregs.error) {
      console.error('[obtenerEncuestaCompleta] error preguntas', pregs.error);
    }
    console.log('[obtenerEncuestaCompleta] preguntas cargadas:', (pregs.data || []).length, pregs.data);
    return {
      success: true,
      data: {
        id: enc.data.id,
        nombre: enc.data.nombre,
        instrucciones: enc.data.instrucciones,
        tipo: enc.data.tipo,
        tipo_cuestionario: enc.data.tipo_cuestionario,
        estado: enc.data.estado,
        preguntas: pregs.data || []
      }
    };
  },

  obtenerEncuestaPendiente: async function(token) {
    var userId = null;
    try {
      var u = JSON.parse(sessionStorage.getItem('tpt_usuario') || 'null');
      if (u && u.id) userId = u.id;
    } catch (e) {}
    if (!userId) return { success: true, data: [] };

    var pp = await _supabase.from('participantes_programa')
      .select('programa_id, rol_programa').eq('usuario_id', userId);
    var rows = pp.data || [];
    if (rows.length === 0) return { success: true, data: [] };

    var rolPorPrograma = {};
    rows.forEach(function(r) { rolPorPrograma[r.programa_id] = r.rol_programa; });
    var progIds = Object.keys(rolPorPrograma);

    var encs = await _supabase.from('encuestas').select('*, programas(nombre)')
      .in('programa_id', progIds).eq('estado', 'activa');
    var candidates = (encs.data || []).filter(function(e) {
      var rol = rolPorPrograma[e.programa_id];
      var tipoCuest = e.tipo_cuestionario || 'autoevaluacion';
      if (rol === 'lider') return tipoCuest === 'autoevaluacion';
      if (rol === 'colaborador') return tipoCuest === 'coevaluacion';
      return false;
    });
    if (candidates.length === 0) return { success: true, data: [] };

    // Identificar que encuestas ya fueron respondidas por este usuario
    // y quedarse con la fecha mas reciente de respuesta por encuesta
    var encIds = candidates.map(function(e) { return e.id; });
    var resp = await _supabase.from('respuestas')
      .select('encuesta_id, created_at').eq('evaluador_id', userId).in('encuesta_id', encIds);
    var ultimaFechaPorEncuesta = {};
    (resp.data || []).forEach(function(r) {
      var prev = ultimaFechaPorEncuesta[r.encuesta_id];
      if (!prev || (r.created_at && r.created_at > prev)) {
        ultimaFechaPorEncuesta[r.encuesta_id] = r.created_at;
      }
    });

    var data = candidates.map(function(e) {
      var fechaResp = ultimaFechaPorEncuesta[e.id] || null;
      return {
        id: e.id,
        nombre: e.nombre,
        programa_nombre: e.programas ? e.programas.nombre : '',
        tipo: e.tipo,
        tipo_cuestionario: e.tipo_cuestionario,
        estado: fechaResp ? 'completada' : 'pendiente',
        fecha_completada: fechaResp,
        fecha_cierre: e.fecha_cierre || ''
      };
    });
    return { success: true, data: data };
  },

  // ============================================
  // PREGUNTAS
  // ============================================
  agregarPregunta: async function(token, datos) {
    // Calcular siguiente orden
    var existing = await _supabase.from('preguntas').select('orden')
      .eq('encuesta_id', datos.encuesta_id).order('orden', { ascending: false }).limit(1);
    var nextOrden = 1;
    if (existing.data && existing.data.length > 0 && existing.data[0].orden) {
      nextOrden = existing.data[0].orden + 1;
    }
    var payload = {
      encuesta_id: datos.encuesta_id,
      texto_pregunta: datos.texto_pregunta || '',
      tipo_respuesta: datos.tipo_respuesta || 'niveles_competencia',
      competencia_id: datos.competencia_id || null,
      foco_desarrollo: datos.foco_desarrollo || '',
      opcion_nivel_1: datos.opcion_nivel_1 || '',
      opcion_nivel_2: datos.opcion_nivel_2 || '',
      opcion_nivel_3: datos.opcion_nivel_3 || '',
      opcion_nivel_4: datos.opcion_nivel_4 || '',
      orden: nextOrden
    };
    var r = await _supabase.from('preguntas').insert(payload).select().single();
    if (r.error) {
      console.error('[agregarPregunta] error', r.error);
      return { success: false, error: r.error.message };
    }
    return { success: true, data: { id: r.data.id } };
  },

  actualizarPregunta: async function(token, id, datos) {
    var valid = ['texto_pregunta','tipo_respuesta','competencia_id','foco_desarrollo',
                 'opcion_nivel_1','opcion_nivel_2','opcion_nivel_3','opcion_nivel_4',
                 'obligatoria','orden'];
    var payload = {};
    Object.keys(datos || {}).forEach(function(k) {
      if (valid.indexOf(k) === -1) return;
      var v = datos[k];
      // Normalizar UUIDs vacios a null
      if (k === 'competencia_id' && (v === '' || v === undefined)) v = null;
      payload[k] = v;
    });
    if (Object.keys(payload).length === 0) return { success: true };
    var r = await _supabase.from('preguntas').update(payload).eq('id', id);
    if (r.error) {
      console.error('[actualizarPregunta] error', r.error, 'payload:', payload);
      return { success: false, error: r.error.message };
    }
    return { success: true };
  },

  eliminarPregunta: async function(token, id) {
    await _supabase.from('preguntas').delete().eq('id', id);
    return { success: true };
  },

  // ============================================
  // RESPUESTAS
  // ============================================
  enviarRespuestas: async function(token, encuestaId, respuestas) {
    // Obtener usuario actual
    var userId = null;
    try {
      var u = JSON.parse(sessionStorage.getItem('tpt_usuario') || 'null');
      if (u && u.id) userId = u.id;
    } catch (e) {}
    if (!userId) return { success: false, error: 'Usuario no identificado' };

    // Normalizar argumentos: aceptar signature vieja (token, {respuestas:[...]})
    if (typeof encuestaId === 'object' && encuestaId !== null) {
      respuestas = encuestaId.respuestas;
      encuestaId = encuestaId.encuestaId || encuestaId.encuesta_id;
    }
    if (!encuestaId || !respuestas || respuestas.length === 0) {
      return { success: false, error: 'Faltan datos de la encuesta' };
    }

    // Obtener info de la encuesta para saber si es auto o co
    var encR = await _supabase.from('encuestas').select('tipo_cuestionario, programa_id').eq('id', encuestaId).single();
    if (encR.error || !encR.data) return { success: false, error: 'Encuesta no encontrada' };
    var tipoCuest = encR.data.tipo_cuestionario || 'autoevaluacion';

    // Determinar evaluado_id
    var evaluadoId = userId;  // default: autoevaluacion = self
    if (tipoCuest === 'coevaluacion') {
      // El colaborador evalua a su lider
      var pp = await _supabase.from('participantes_programa')
        .select('lider_id').eq('usuario_id', userId).eq('programa_id', encR.data.programa_id).maybeSingle();
      if (pp.data && pp.data.lider_id) {
        evaluadoId = pp.data.lider_id;
      } else {
        return { success: false, error: 'No tienes un lider asignado para esta coevaluacion' };
      }
    }

    // Construir filas con todos los campos requeridos
    var rows = respuestas.map(function(r) {
      return {
        encuesta_id: encuestaId,
        pregunta_id: r.preguntaId || r.pregunta_id,
        evaluador_id: userId,
        evaluado_id: evaluadoId,
        valor: String(r.valor != null ? r.valor : '')
      };
    });

    var up = await _supabase.from('respuestas').upsert(rows, {
      onConflict: 'encuesta_id,pregunta_id,evaluador_id,evaluado_id'
    });
    if (up.error) {
      console.error('[enviarRespuestas] error', up.error);
      return { success: false, error: up.error.message };
    }
    // Disparar correo de confirmacion al usuario que respondio (fire-and-forget)
    _fireEmail({ evento: 'confirmacion', usuario_id: userId, encuesta_id: encuestaId });
    // Si fue una coevaluacion, ademas notificar al lider asignado
    if (tipoCuest === 'coevaluacion') {
      _fireEmail({ evento: 'notif_lider_coeval', usuario_id: userId, encuesta_id: encuestaId });
    }
    return { success: true, data: { message: 'Respuestas registradas.' } };
  },

  enviarRespuestaEncuesta: async function() { return { success: true }; },

  rehacerEncuesta: async function(token, encuestaId) {
    var userId = null;
    try {
      var u = JSON.parse(sessionStorage.getItem('tpt_usuario') || 'null');
      if (u && u.id) userId = u.id;
    } catch (e) {}
    if (!userId) return { success: false, error: 'Usuario no identificado' };
    var del = await _supabase.from('respuestas').delete()
      .eq('encuesta_id', encuestaId).eq('evaluador_id', userId);
    if (del.error) return { success: false, error: del.error.message };
    return { success: true };
  },

  // ============================================
  // ARCHIVOS
  // ============================================
  listarArchivosPrograma: async function(token, progId) {
    var r = await _supabase.from('archivos_programa').select('*')
      .eq('programa_id', progId).order('created_at', { ascending: false });
    if (r.error) {
      console.error('[listarArchivosPrograma] error', r.error);
      return { success: true, data: [] };
    }
    var data = [];
    for (var i = 0; i < (r.data || []).length; i++) {
      var a = r.data[i];
      a.subido_por_nombre = '';
      a.fecha_subida = a.created_at;
      if (a.storage_path) {
        try {
          var signed = await _supabase.storage.from('archivos-programa')
            .createSignedUrl(a.storage_path, 3600);
          if (signed.data && signed.data.signedUrl) {
            a.drive_url = signed.data.signedUrl;
          }
        } catch (e) {
          console.warn('[listarArchivosPrograma] signed url error', e);
        }
      }
      data.push(a);
    }
    return { success: true, data: data };
  },

  subirArchivoPrograma: async function(token, progId, datos) {
    if (typeof progId === 'object' && progId !== null) {
      datos = progId;
      progId = datos.programa_id;
    }
    datos = datos || {};
    var nombre = datos.nombre || datos.nombre_archivo || 'archivo';
    var storage_path = '';

    if (datos.contenido) {
      try {
        var byteChars = atob(datos.contenido);
        var bytes = new Uint8Array(byteChars.length);
        for (var i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
        var blob = new Blob([bytes], { type: datos.mimeType || 'application/octet-stream' });
        var cleanName = nombre.replace(/[^a-zA-Z0-9._-]/g, '_');
        var path = progId + '/' + Date.now() + '_' + cleanName;
        var up = await _supabase.storage.from('archivos-programa')
          .upload(path, blob, { contentType: datos.mimeType || 'application/octet-stream', upsert: false });
        if (up.error) {
          console.error('[subirArchivoPrograma] upload error', up.error);
          return { success: false, error: 'Error al subir archivo: ' + up.error.message };
        }
        storage_path = up.data.path;
      } catch (e) {
        console.error('[subirArchivoPrograma] blob error', e);
        return { success: false, error: 'Error procesando el archivo: ' + e.message };
      }
    }

    var payload = {
      programa_id: progId || datos.programa_id,
      nombre_archivo: nombre,
      tipo: datos.tipo || 'material',
      mensaje: datos.mensaje || '',
      drive_url: datos.drive_url || '',
      storage_path: storage_path,
      visible_participantes: datos.visible_participantes !== false
    };
    var r = await _supabase.from('archivos_programa').insert(payload).select().single();
    if (r.error) {
      console.error('[subirArchivoPrograma] db error', r.error);
      if (storage_path) {
        await _supabase.storage.from('archivos-programa').remove([storage_path]);
      }
      return { success: false, error: r.error.message };
    }
    return { success: true, data: { id: r.data.id } };
  },

  eliminarArchivoPrograma: async function(token, id) {
    var info = await _supabase.from('archivos_programa').select('storage_path').eq('id', id).single();
    if (info.data && info.data.storage_path) {
      await _supabase.storage.from('archivos-programa').remove([info.data.storage_path]);
    }
    await _supabase.from('archivos_programa').delete().eq('id', id);
    return { success: true };
  },

  actualizarVisibilidadArchivo: async function(token, id, visible) {
    await _supabase.from('archivos_programa').update({ visible_participantes: visible }).eq('id', id);
    return { success: true };
  },

  // ============================================
  // NOTIFICACIONES
  // ============================================
  contarNotificacionesPendientes: async function() {
    var userId = null;
    try {
      var u = JSON.parse(sessionStorage.getItem('tpt_usuario') || 'null');
      if (u && u.id) userId = u.id;
    } catch (e) {}
    if (!userId) return { success: true, data: { count: 0 } };
    var r = await _supabase.from('notificaciones').select('id', { count: 'exact' })
      .eq('usuario_id', userId).eq('leida', false);
    return { success: true, data: { count: r.count || 0 } };
  },

  listarNotificaciones: async function() {
    var userId = null;
    try {
      var u = JSON.parse(sessionStorage.getItem('tpt_usuario') || 'null');
      if (u && u.id) userId = u.id;
    } catch (e) {}
    if (!userId) return { success: true, data: [] };
    var r = await _supabase.from('notificaciones').select('*')
      .eq('usuario_id', userId).order('created_at', { ascending: false });
    return { success: true, data: r.data || [] };
  },

  marcarNotificacionLeida: async function(token, id) {
    await _supabase.from('notificaciones').update({ leida: true }).eq('id', id);
    return { success: true };
  },

  obtenerNotificaciones: async function() {
    return backendFunctions.listarNotificaciones();
  },

  marcarComoLeida: async function(token, id) {
    return backendFunctions.marcarNotificacionLeida(token, id);
  },

  // ============================================
  // DASHBOARD / KPIs
  // ============================================
  obtenerKPIsPrograma: async function(token, progId) {
    if (!progId) {
      return { success: true, data: { totalParticipantes: 0, observacionesRealizadas: 0, tasaRespuestaPre: 0, tasaRespuestaPost: 0, nivelAplicacion: 0 } };
    }
    // Participantes
    var parts = await _supabase.from('participantes_programa').select('usuario_id, rol_programa').eq('programa_id', progId);
    var asociados = parts.data || [];
    var lideres = asociados.filter(function(a) { return a.rol_programa === 'lider'; });
    var colaboradores = asociados.filter(function(a) { return a.rol_programa === 'colaborador'; });
    var total = asociados.length;

    // Encuestas del programa agrupadas por tipo (pre/post) y tipo_cuestionario
    var encs = await _supabase.from('encuestas').select('id, tipo, tipo_cuestionario').eq('programa_id', progId);
    var encList = encs.data || [];
    function idsPorTipo(t) {
      return encList.filter(function(e) { return e.tipo === t; }).map(function(e) { return e.id; });
    }
    function idsPorTipoYCuest(t, tc) {
      return encList.filter(function(e) { return e.tipo === t && (e.tipo_cuestionario || 'autoevaluacion') === tc; }).map(function(e) { return e.id; });
    }
    var preIds = idsPorTipo('pre');
    var postIds = idsPorTipo('post');

    async function contarEvaluadoresUnicos(encIds) {
      if (encIds.length === 0) return 0;
      var r = await _supabase.from('respuestas').select('evaluador_id').in('encuesta_id', encIds);
      var set = {};
      (r.data || []).forEach(function(x) { set[x.evaluador_id] = true; });
      return Object.keys(set).length;
    }

    function esperadasPara(ids) {
      // Para encuestas auto esperamos 1 respuesta por lider; para co, 1 por colaborador
      var esp = 0;
      ids.forEach(function(encId) {
        var e = encList.find(function(x) { return x.id === encId; });
        if (!e) return;
        var tc = e.tipo_cuestionario || 'autoevaluacion';
        esp += (tc === 'coevaluacion') ? colaboradores.length : lideres.length;
      });
      return esp;
    }

    var completadasPre = await contarEvaluadoresUnicos(preIds);
    var completadasPost = await contarEvaluadoresUnicos(postIds);
    // Calcular con mas granularidad para distinguir auto y co
    var espPre = esperadasPara(preIds);
    var espPost = esperadasPara(postIds);
    // Simplificado: usar suma de evaluadores unicos por encuesta como "respuestas" esperadas / 1
    // Pero para tasa, necesitamos respuestas completas por encuesta
    // Hacer un recuento mas preciso: por cada encuesta, contar evaluadores distintos
    async function totalEvalSumPorEncuestas(ids) {
      var tot = 0;
      for (var i = 0; i < ids.length; i++) {
        var n = await contarEvaluadoresUnicos([ids[i]]);
        tot += n;
      }
      return tot;
    }
    var realPre = await totalEvalSumPorEncuestas(preIds);
    var realPost = await totalEvalSumPorEncuestas(postIds);

    var tasaPre = espPre > 0 ? Math.round((realPre / espPre) * 100) : 0;
    var tasaPost = espPost > 0 ? Math.round((realPost / espPost) * 100) : 0;

    // Nivel de aplicacion: promedio de respuestas POST (valor 1-4) normalizado a 0-100%
    var nivelAplicacion = 0;
    if (postIds.length > 0) {
      var resp = await _supabase.from('respuestas').select('valor').in('encuesta_id', postIds);
      var vals = (resp.data || []).map(function(r) {
        var n = parseFloat(r.valor);
        return isNaN(n) ? null : n;
      }).filter(function(v) { return v !== null && v >= 1 && v <= 4; });
      if (vals.length > 0) {
        var sum = vals.reduce(function(a, b) { return a + b; }, 0);
        var avg = sum / vals.length; // 1..4
        nivelAplicacion = Math.round(((avg - 1) / 3) * 100); // 0..100
      }
    }

    return {
      success: true,
      data: {
        totalParticipantes: total,
        observacionesRealizadas: 0,
        tasaRespuestaPre: tasaPre,
        tasaRespuestaPost: tasaPost,
        nivelAplicacion: nivelAplicacion
      }
    };
  },

  obtenerComparacionPrePost: async function(token, progId) {
    if (!progId) return { success: true, data: [] };
    // Competencias del programa
    var comps = await _supabase.from('competencias').select('id, nombre').eq('programa_id', progId).order('orden');
    if (!comps.data || comps.data.length === 0) return { success: true, data: [] };

    // Encuestas con tipo
    var encs = await _supabase.from('encuestas').select('id, tipo').eq('programa_id', progId);
    var encMap = {};
    (encs.data || []).forEach(function(e) { encMap[e.id] = e.tipo; });

    // Preguntas con su competencia_id para las encuestas del programa
    var encIds = Object.keys(encMap);
    if (encIds.length === 0) return { success: true, data: comps.data.map(function(c) { return { conducta_nombre: c.nombre, promedioPre: 0, promedioPost: 0, variacion: 0 }; }) };

    var pregs = await _supabase.from('preguntas').select('id, competencia_id, encuesta_id').in('encuesta_id', encIds);
    var pregMap = {};
    (pregs.data || []).forEach(function(p) { pregMap[p.id] = p; });

    // Respuestas de esas preguntas
    var pregIds = Object.keys(pregMap);
    if (pregIds.length === 0) return { success: true, data: comps.data.map(function(c) { return { conducta_nombre: c.nombre, promedioPre: 0, promedioPost: 0, variacion: 0 }; }) };

    var resps = await _supabase.from('respuestas').select('pregunta_id, valor').in('pregunta_id', pregIds);

    // Agrupar valores por competencia y tipo (pre/post)
    var acum = {};
    (resps.data || []).forEach(function(r) {
      var p = pregMap[r.pregunta_id];
      if (!p || !p.competencia_id) return;
      var tipo = encMap[p.encuesta_id];
      if (tipo !== 'pre' && tipo !== 'post') return;
      var n = parseFloat(r.valor);
      if (isNaN(n)) return;
      if (!acum[p.competencia_id]) acum[p.competencia_id] = { pre: [], post: [] };
      acum[p.competencia_id][tipo].push(n);
    });

    function avg(arr) {
      if (!arr || arr.length === 0) return 0;
      var s = arr.reduce(function(a, b) { return a + b; }, 0);
      return Math.round((s / arr.length) * 10) / 10;
    }

    var data = comps.data.map(function(c) {
      var a = acum[c.id] || { pre: [], post: [] };
      var pre = avg(a.pre);
      var post = avg(a.post);
      return {
        conducta_nombre: c.nombre,
        promedioPre: pre,
        promedioPost: post,
        variacion: pre > 0 ? Math.round(((post - pre) / pre) * 100) : 0
      };
    });
    return { success: true, data: data };
  },

  obtenerMapaCalor: async function(token, progId) {
    if (!progId) return { success: true, data: [] };

    // Competencias del programa
    var comps = await _supabase.from('competencias').select('id, nombre').eq('programa_id', progId).order('orden');
    if (!comps.data || comps.data.length === 0) return { success: true, data: [] };

    // Encuestas POST del programa
    var encs = await _supabase.from('encuestas').select('id').eq('programa_id', progId).eq('tipo', 'post');
    var encIds = (encs.data || []).map(function(e) { return e.id; });
    if (encIds.length === 0) {
      // Sin POST aun: devolver cada conducta con nivel 0 / color rojo
      return {
        success: true,
        data: comps.data.map(function(c) {
          return { conducta_nombre: c.nombre, nivel: 0, color: 'bajo' };
        })
      };
    }

    // Preguntas vinculadas a competencias
    var pregs = await _supabase.from('preguntas')
      .select('id, competencia_id').in('encuesta_id', encIds);
    var pregMap = {};
    (pregs.data || []).forEach(function(p) {
      if (p.competencia_id) pregMap[p.id] = p.competencia_id;
    });
    var pregIds = Object.keys(pregMap);
    if (pregIds.length === 0) {
      return {
        success: true,
        data: comps.data.map(function(c) {
          return { conducta_nombre: c.nombre, nivel: 0, color: 'bajo' };
        })
      };
    }

    // Respuestas POST: agregar valores por competencia
    var resps = await _supabase.from('respuestas').select('pregunta_id, valor').in('pregunta_id', pregIds);
    var acum = {}; // competencia_id -> [valores]
    (resps.data || []).forEach(function(r) {
      var compId = pregMap[r.pregunta_id];
      if (!compId) return;
      var n = parseFloat(r.valor);
      if (isNaN(n) || n < 1 || n > 4) return;
      if (!acum[compId]) acum[compId] = [];
      acum[compId].push(n);
    });

    var data = comps.data.map(function(c) {
      var vals = acum[c.id] || [];
      var nivel = 0;
      if (vals.length > 0) {
        var avg = vals.reduce(function(a, b) { return a + b; }, 0) / vals.length;
        nivel = Math.round(((avg - 1) / 3) * 100);
      }
      var color = nivel >= 70 ? 'alto' : nivel >= 40 ? 'medio' : 'bajo';
      return { conducta_nombre: c.nombre, nivel: nivel, color: color };
    });
    return { success: true, data: data };
  },

  obtenerDatosInformeConsolidado: async function(token, progId, momento) {
    if (!progId) return { success: false, error: 'Programa no identificado' };
    momento = momento || 'post'; // default post (informe completo)

    var prog = await _supabase.from('programas').select('*, clientes(nombre)').eq('id', progId).single();
    if (prog.error) return { success: false, error: 'Programa no encontrado' };

    var comps = await _supabase.from('competencias').select('id, nombre, descripcion, foco_desarrollo').eq('programa_id', progId).order('orden');
    var competencias = comps.data || [];

    var parts = await _supabase.from('participantes_programa')
      .select('usuario_id, rol_programa, usuarios!participantes_programa_usuario_id_fkey(nombre, cargo)')
      .eq('programa_id', progId);
    var participantes = (parts.data || []).filter(function(p) { return p.usuarios; });
    var lideresList = participantes.filter(function(p) { return p.rol_programa === 'lider'; });
    var colaboradoresList = participantes.filter(function(p) { return p.rol_programa === 'colaborador'; });
    var totalLideres = lideresList.length;
    var totalColaboradores = colaboradoresList.length;

    var encs = await _supabase.from('encuestas').select('id, tipo, tipo_cuestionario, estado').eq('programa_id', progId);
    var encList = encs.data || [];
    var encMap = {};
    encList.forEach(function(e) { encMap[e.id] = e; });

    // Disponibilidad por momento y tipo
    var disponibilidad = {
      pre_auto: encList.some(function(e) { return e.tipo === 'pre' && (e.tipo_cuestionario || 'autoevaluacion') === 'autoevaluacion'; }),
      pre_co: encList.some(function(e) { return e.tipo === 'pre' && e.tipo_cuestionario === 'coevaluacion'; }),
      post_auto: encList.some(function(e) { return e.tipo === 'post' && (e.tipo_cuestionario || 'autoevaluacion') === 'autoevaluacion'; }),
      post_co: encList.some(function(e) { return e.tipo === 'post' && e.tipo_cuestionario === 'coevaluacion'; })
    };

    var encIds = Object.keys(encMap);
    var pregsData = encIds.length > 0
      ? await _supabase.from('preguntas').select('id, competencia_id, encuesta_id').in('encuesta_id', encIds)
      : { data: [] };
    var pregMap = {};
    (pregsData.data || []).forEach(function(p) { pregMap[p.id] = p; });
    var pregIds = Object.keys(pregMap);

    var respsData = pregIds.length > 0
      ? await _supabase.from('respuestas').select('pregunta_id, valor, evaluador_id, evaluado_id').in('pregunta_id', pregIds)
      : { data: [] };
    var respuestas = respsData.data || [];

    // Agregar por competencia
    var agregado = {};
    competencias.forEach(function(c) {
      agregado[c.id] = {
        nombre: c.nombre, descripcion: c.descripcion || '', foco_desarrollo: c.foco_desarrollo || '',
        auto_pre: [], auto_post: [], co_pre: [], co_post: []
      };
    });
    var evaluadoresUnicos = { auto_pre: {}, auto_post: {}, co_pre: {}, co_post: {} };
    respuestas.forEach(function(r) {
      var p = pregMap[r.pregunta_id];
      if (!p || !p.competencia_id || !agregado[p.competencia_id]) return;
      var enc = encMap[p.encuesta_id];
      if (!enc) return;
      var v = parseFloat(r.valor);
      if (isNaN(v)) return;
      var tipoCuest = enc.tipo_cuestionario || 'autoevaluacion';
      var mto = enc.tipo || 'pre';
      var key = (tipoCuest === 'coevaluacion' ? 'co_' : 'auto_') + mto;
      agregado[p.competencia_id][key].push(v);
      evaluadoresUnicos[key][r.evaluador_id] = true;
    });

    function avg(arr) {
      if (!arr || arr.length === 0) return null; // null = sin dato
      return Math.round((arr.reduce(function(a, b) { return a + b; }, 0) / arr.length) * 100) / 100;
    }
    function diff(a, b) {
      if (a === null || b === null) return null;
      return Math.round((a - b) * 100) / 100;
    }

    // Flags de disponibilidad segun el momento pedido
    var tieneRespuestasPre = respuestas.some(function(r) {
      var p = pregMap[r.pregunta_id];
      if (!p) return false;
      var e = encMap[p.encuesta_id];
      return e && e.tipo === 'pre';
    });
    var tieneRespuestasPost = respuestas.some(function(r) {
      var p = pregMap[r.pregunta_id];
      if (!p) return false;
      var e = encMap[p.encuesta_id];
      return e && e.tipo === 'post';
    });

    // Validacion: si piden POST sin PRE historico, marcar flag
    var sinPreHistorico = (momento === 'post' && !tieneRespuestasPre);

    var analisisCompetencias = competencias.map(function(c) {
      var ag = agregado[c.id];
      var autoPre = avg(ag.auto_pre), autoPost = avg(ag.auto_post);
      var coPre = avg(ag.co_pre), coPost = avg(ag.co_post);
      var base = {
        nombre: c.nombre,
        foco_desarrollo: c.foco_desarrollo,
        auto_pre: autoPre, co_pre: coPre,
        brecha_pre: diff(autoPre, coPre),
        n_auto_pre: ag.auto_pre.length,
        n_co_pre: ag.co_pre.length
      };
      if (momento === 'post') {
        base.auto_post = autoPost;
        base.co_post = coPost;
        base.brecha_post = diff(autoPost, coPost);
        base.evolucion_auto = diff(autoPost, autoPre);
        base.evolucion_co = diff(coPost, coPre);
        base.cierre_brecha = (base.brecha_pre !== null && base.brecha_post !== null)
          ? Math.round((Math.abs(base.brecha_pre) - Math.abs(base.brecha_post)) * 100) / 100
          : null;
        base.n_auto_post = ag.auto_post.length;
        base.n_co_post = ag.co_post.length;
      }
      return base;
    });

    return {
      success: true,
      data: {
        momento: momento,
        programa: {
          id: prog.data.id,
          nombre: prog.data.nombre,
          cliente_nombre: prog.data.clientes ? prog.data.clientes.nombre : '',
          fecha_inicio: prog.data.fecha_inicio,
          fecha_termino: prog.data.fecha_termino,
          objetivo: prog.data.objetivo || ''
        },
        totalLideres: totalLideres,
        totalColaboradores: totalColaboradores,
        lideresConAuto: Object.keys(evaluadoresUnicos[momento === 'post' ? 'auto_post' : 'auto_pre']).length,
        colabConCo: Object.keys(evaluadoresUnicos[momento === 'post' ? 'co_post' : 'co_pre']).length,
        totalRespuestas: respuestas.length,
        tieneRespuestasPre: tieneRespuestasPre,
        tieneRespuestasPost: tieneRespuestasPost,
        sinPreHistorico: sinPreHistorico,
        disponibilidad: disponibilidad,
        competencias: analisisCompetencias
      }
    };
  },

  obtenerDatosInformeIndividual: async function(token, progId, userId, momento) {
    if (!progId || !userId) return { success: false, error: 'Parametros faltantes' };
    momento = momento || 'post';

    var prog = await _supabase.from('programas').select('*, clientes(nombre)').eq('id', progId).single();
    if (prog.error) return { success: false, error: 'Programa no encontrado' };

    var usr = await _supabase.from('usuarios').select('id, nombre, email, cargo').eq('id', userId).single();
    if (usr.error) return { success: false, error: 'Usuario no encontrado' };

    var comps = await _supabase.from('competencias').select('id, nombre, foco_desarrollo').eq('programa_id', progId).order('orden');
    var competencias = comps.data || [];

    var encs = await _supabase.from('encuestas').select('id, tipo, tipo_cuestionario').eq('programa_id', progId);
    var encMap = {};
    (encs.data || []).forEach(function(e) { encMap[e.id] = e; });
    var encIds = Object.keys(encMap);

    var pregsData = encIds.length > 0
      ? await _supabase.from('preguntas').select('id, competencia_id, encuesta_id').in('encuesta_id', encIds)
      : { data: [] };
    var pregMap = {};
    (pregsData.data || []).forEach(function(p) { pregMap[p.id] = p; });
    var pregIds = Object.keys(pregMap);

    var respsData = pregIds.length > 0
      ? await _supabase.from('respuestas').select('pregunta_id, valor, evaluador_id, evaluado_id')
          .in('pregunta_id', pregIds).eq('evaluado_id', userId)
      : { data: [] };
    var respuestas = respsData.data || [];

    var agregado = {};
    competencias.forEach(function(c) {
      agregado[c.id] = {
        nombre: c.nombre, foco_desarrollo: c.foco_desarrollo || '',
        auto_pre: [], auto_post: [], co_pre: [], co_post: []
      };
    });
    respuestas.forEach(function(r) {
      var p = pregMap[r.pregunta_id];
      if (!p || !p.competencia_id || !agregado[p.competencia_id]) return;
      var enc = encMap[p.encuesta_id];
      if (!enc) return;
      var v = parseFloat(r.valor);
      if (isNaN(v)) return;
      var esAuto = (r.evaluador_id === r.evaluado_id);
      var mto = enc.tipo || 'pre';
      var key = (esAuto ? 'auto_' : 'co_') + mto;
      agregado[p.competencia_id][key].push(v);
    });

    function avg(arr) {
      if (!arr || arr.length === 0) return null;
      return Math.round((arr.reduce(function(a, b) { return a + b; }, 0) / arr.length) * 100) / 100;
    }
    function diff(a, b) {
      if (a === null || b === null) return null;
      return Math.round((a - b) * 100) / 100;
    }

    var tieneRespuestasPre = respuestas.some(function(r) {
      var p = pregMap[r.pregunta_id]; if (!p) return false;
      var e = encMap[p.encuesta_id]; return e && e.tipo === 'pre';
    });
    var tieneRespuestasPost = respuestas.some(function(r) {
      var p = pregMap[r.pregunta_id]; if (!p) return false;
      var e = encMap[p.encuesta_id]; return e && e.tipo === 'post';
    });
    var sinPreHistorico = (momento === 'post' && !tieneRespuestasPre);

    var analisisCompetencias = competencias.map(function(c) {
      var ag = agregado[c.id];
      var autoPre = avg(ag.auto_pre), autoPost = avg(ag.auto_post);
      var coPre = avg(ag.co_pre), coPost = avg(ag.co_post);
      var base = {
        nombre: c.nombre,
        foco_desarrollo: c.foco_desarrollo,
        auto_pre: autoPre, co_pre: coPre,
        brecha_pre: diff(autoPre, coPre),
        n_auto_pre: ag.auto_pre.length,
        n_co_pre: ag.co_pre.length
      };
      if (momento === 'post') {
        base.auto_post = autoPost;
        base.co_post = coPost;
        base.brecha_post = diff(autoPost, coPost);
        base.evolucion_auto = diff(autoPost, autoPre);
        base.evolucion_co = diff(coPost, coPre);
        base.cierre_brecha = (base.brecha_pre !== null && base.brecha_post !== null)
          ? Math.round((Math.abs(base.brecha_pre) - Math.abs(base.brecha_post)) * 100) / 100
          : null;
        base.n_auto_post = ag.auto_post.length;
        base.n_co_post = ag.co_post.length;
      }
      return base;
    });

    return {
      success: true,
      data: {
        momento: momento,
        programa: {
          nombre: prog.data.nombre,
          cliente_nombre: prog.data.clientes ? prog.data.clientes.nombre : ''
        },
        participante: {
          id: usr.data.id,
          nombre: usr.data.nombre,
          email: usr.data.email,
          cargo: usr.data.cargo || ''
        },
        totalRespuestas: respuestas.length,
        tieneRespuestasPre: tieneRespuestasPre,
        tieneRespuestasPost: tieneRespuestasPost,
        sinPreHistorico: sinPreHistorico,
        competencias: analisisCompetencias
      }
    };
  },

  obtenerResumenPorEquipo: async function(token, progId) {
    if (!progId) return { success: true, data: [] };

    // Asociados del programa agrupados por cargo
    var parts = await _supabase.from('participantes_programa')
      .select('usuario_id, rol_programa, usuarios!participantes_programa_usuario_id_fkey(id, nombre, cargo)')
      .eq('programa_id', progId);
    var asociados = parts.data || [];

    var grupos = {};
    asociados.forEach(function(a) {
      if (!a.usuarios) return;
      var equipo = a.usuarios.cargo || 'Sin asignar';
      if (!grupos[equipo]) {
        grupos[equipo] = { equipo: equipo, area: '-', numParticipantes: 0, lideres: 0, colaboradores: 0, userIds: [] };
      }
      grupos[equipo].numParticipantes++;
      grupos[equipo].userIds.push(a.usuario_id);
      if (a.rol_programa === 'lider') grupos[equipo].lideres++;
      else grupos[equipo].colaboradores++;
    });

    // Calcular nivel de aplicacion por equipo usando respuestas POST
    // (promedio de valores 1..4 normalizado a 0..100)
    var encs = await _supabase.from('encuestas').select('id').eq('programa_id', progId).eq('tipo', 'post');
    var encIds = (encs.data || []).map(function(e) { return e.id; });
    var nivelPorUser = {};
    if (encIds.length > 0) {
      var resps = await _supabase.from('respuestas')
        .select('valor, evaluado_id').in('encuesta_id', encIds);
      var acum = {};
      (resps.data || []).forEach(function(r) {
        var n = parseFloat(r.valor);
        if (isNaN(n) || n < 1 || n > 4) return;
        if (!acum[r.evaluado_id]) acum[r.evaluado_id] = [];
        acum[r.evaluado_id].push(n);
      });
      Object.keys(acum).forEach(function(uid) {
        var vals = acum[uid];
        var avg = vals.reduce(function(a, b) { return a + b; }, 0) / vals.length;
        nivelPorUser[uid] = ((avg - 1) / 3) * 100;
      });
    }

    var data = Object.values(grupos).map(function(g) {
      var niveles = g.userIds.map(function(uid) { return nivelPorUser[uid]; }).filter(function(v) { return typeof v === 'number'; });
      var nivelProm = 0;
      if (niveles.length > 0) {
        nivelProm = Math.round(niveles.reduce(function(a, b) { return a + b; }, 0) / niveles.length);
      }
      return {
        equipo: g.equipo,
        area: g.area,
        numParticipantes: g.numParticipantes,
        nivelAplicacion: nivelProm,
        estado: g.numParticipantes > 0 ? 'Activo' : 'Pendiente'
      };
    });
    return { success: true, data: data };
  },

  obtenerMiProgreso: async function(token) {
    try {
      var u = null; try { u = JSON.parse(sessionStorage.getItem('tpt_usuario') || 'null'); } catch (e) {}
      if (!u || !u.id) return { success: true, data: { comparacion: [], feedback: [] } };
      var userId = u.id;

      // 1. Programa(s) del usuario
      var pp = await _supabase.from('participantes_programa')
        .select('programa_id').eq('usuario_id', userId);
      var progIds = (pp.data || []).map(function(p) { return p.programa_id; });
      if (progIds.length === 0) return { success: true, data: { comparacion: [], feedback: [] } };

      // 2. Competencias del primer programa (participantes normalmente estan en uno)
      var compsR = await _supabase.from('competencias')
        .select('id, nombre').in('programa_id', progIds).order('orden');
      var comps = compsR.data || [];
      if (comps.length === 0) return { success: true, data: { comparacion: [], feedback: [] } };

      // 3. Encuestas PRE y POST
      var encsR = await _supabase.from('encuestas')
        .select('id, tipo').in('programa_id', progIds);
      var preIds = [], postIds = [];
      (encsR.data || []).forEach(function(e) {
        if (e.tipo === 'pre') preIds.push(e.id);
        else if (e.tipo === 'post') postIds.push(e.id);
      });
      var allEncIds = preIds.concat(postIds);
      if (allEncIds.length === 0) return { success: true, data: { comparacion: [], feedback: [] } };

      // 4. Preguntas -> competencia
      var pregsR = await _supabase.from('preguntas')
        .select('id, competencia_id, encuesta_id').in('encuesta_id', allEncIds);
      var pregMap = {};
      (pregsR.data || []).forEach(function(p) {
        if (p.competencia_id) pregMap[p.id] = p.competencia_id;
      });
      var pregIdsArr = Object.keys(pregMap);
      if (pregIdsArr.length === 0) return { success: true, data: { comparacion: [], feedback: [] } };

      // 5. Respuestas donde YO soy el evaluado (recibidas sobre mi)
      var respsR = await _supabase.from('respuestas')
        .select('encuesta_id, pregunta_id, valor').eq('evaluado_id', userId).in('pregunta_id', pregIdsArr);

      // 6. Agregar por competencia / PRE vs POST
      var preSet = {}; preIds.forEach(function(id) { preSet[id] = true; });
      var acum = {}; // compId -> { pre: [], post: [] }
      comps.forEach(function(c) { acum[c.id] = { pre: [], post: [] }; });
      (respsR.data || []).forEach(function(r) {
        var compId = pregMap[r.pregunta_id];
        if (!compId || !acum[compId]) return;
        var n = parseFloat(r.valor);
        if (isNaN(n) || n < 1 || n > 4) return;
        if (preSet[r.encuesta_id]) acum[compId].pre.push(n);
        else acum[compId].post.push(n);
      });

      function avg(arr) {
        if (!arr.length) return null;
        var s = arr.reduce(function(a, b) { return a + b; }, 0);
        return Math.round((s / arr.length) * 10) / 10;
      }

      var comparacion = comps.map(function(c) {
        var ag = acum[c.id] || { pre: [], post: [] };
        return {
          conducta_nombre: c.nombre,
          promedioPre: avg(ag.pre),
          promedioPost: avg(ag.post)
        };
      }).filter(function(row) {
        return row.promedioPre !== null || row.promedioPost !== null;
      });

      // Feedback: no hay tabla todavia. Placeholder vacio.
      return { success: true, data: { comparacion: comparacion, feedback: [] } };
    } catch (e) {
      console.error('[obtenerMiProgreso] exception', e);
      return { success: false, error: (e && e.message) || 'Error en obtenerMiProgreso' };
    }
  },

  obtenerResumenPrograma: async function(token, progId) {
    var parts = await _supabase.from('participantes_programa')
      .select('*, usuarios!participantes_programa_usuario_id_fkey(id, nombre)')
      .eq('programa_id', progId);
    var asociados = parts.data || [];
    var lideresArr = asociados.filter(function(a) { return a.rol_programa === 'lider'; });
    var colaboradoresArr = asociados.filter(function(a) { return a.rol_programa === 'colaborador'; });

    // Encuestas del programa con tipo (pre/post) y tipo_cuestionario (auto/coeval)
    var encs = await _supabase.from('encuestas').select('id, tipo, tipo_cuestionario').eq('programa_id', progId);
    var encsData = encs.data || [];
    function encIds(tipo, cuest) {
      return encsData.filter(function(e) { return e.tipo === tipo && e.tipo_cuestionario === cuest; }).map(function(e) { return e.id; });
    }
    var autoPreIds = encIds('pre', 'autoevaluacion');
    var autoPostIds = encIds('post', 'autoevaluacion');
    var coPreIds = encIds('pre', 'coevaluacion');
    var coPostIds = encIds('post', 'coevaluacion');
    var allAutoIds = autoPreIds.concat(autoPostIds);
    var allCoIds = coPreIds.concat(coPostIds);

    // Traer todas las respuestas relevantes del programa en un solo query por grupo
    async function respuestasOf(ids) {
      if (!ids.length) return [];
      var r = await _supabase.from('respuestas').select('encuesta_id, evaluador_id, evaluado_id').in('encuesta_id', ids);
      return r.data || [];
    }
    var respAuto = await respuestasOf(allAutoIds);
    var respCo = await respuestasOf(allCoIds);

    // Sets para lookup rapido: "encuestaId::userId"
    function buildSet(resps, key) {
      var s = {};
      resps.forEach(function(r) { s[r.encuesta_id + '::' + r[key]] = true; });
      return s;
    }
    var autoSet = buildSet(respAuto, 'evaluador_id'); // auto: evaluador = lider
    var coSet = buildSet(respCo, 'evaluado_id');      // co:   evaluado  = lider

    function liderHizo(liderId, ids, set) {
      for (var i = 0; i < ids.length; i++) { if (set[ids[i] + '::' + liderId]) return true; }
      return false;
    }

    // KPIs de completadas (evaluadores unicos)
    var autoCompletadasSet = {};
    respAuto.forEach(function(r) { autoCompletadasSet[r.evaluador_id] = true; });
    var coCompletadasSet = {};
    respCo.forEach(function(r) { coCompletadasSet[r.evaluador_id] = true; });

    // Construir filas de evaluaciones: una por (lider, colaborador) o lider solo si no tiene colab
    var evaluaciones = [];
    lideresArr.forEach(function(l) {
      var nombreL = l.usuarios ? l.usuarios.nombre : '(sin nombre)';
      var liderId = l.usuario_id;
      var autoPre = liderHizo(liderId, autoPreIds, autoSet);
      var autoPost = liderHizo(liderId, autoPostIds, autoSet);
      var coPre = liderHizo(liderId, coPreIds, coSet);
      var coPost = liderHizo(liderId, coPostIds, coSet);
      var colabs = colaboradoresArr.filter(function(c) { return c.lider_id === liderId; });
      if (colabs.length === 0) {
        evaluaciones.push({ lider: nombreL, colaborador: null, autoPre: autoPre, coPre: coPre, autoPost: autoPost, coPost: coPost });
      } else {
        colabs.forEach(function(c) {
          evaluaciones.push({
            lider: nombreL,
            colaborador: c.usuarios ? c.usuarios.nombre : '(sin nombre)',
            autoPre: autoPre, coPre: coPre, autoPost: autoPost, coPost: coPost
          });
        });
      }
    });

    // Contar observaciones realizadas en el programa
    var obsCount = 0;
    try {
      var obsR = await _supabase.from('observaciones').select('id', { count: 'exact', head: true }).eq('programa_id', progId);
      if (!obsR.error && typeof obsR.count === 'number') obsCount = obsR.count;
    } catch (e) { /* tabla puede no existir todavia */ }

    return {
      totalLideres: lideresArr.length,
      totalColaboradores: colaboradoresArr.length,
      autoevaluacionesCompletadas: Object.keys(autoCompletadasSet).length,
      coevaluacionesCompletadas: Object.keys(coCompletadasSet).length,
      observacionesRealizadas: obsCount,
      evaluaciones: evaluaciones
    };
  },

  // ============================================
  // HOME LIDER
  // ============================================
  obtenerHomeLider: async function(token, userId) {
    if (!userId) return { success: false, error: 'Usuario no identificado' };
    // Buscar programas donde esta asociado
    var pp = await _supabase.from('participantes_programa').select('programa_id, rol_programa, lider_id').eq('usuario_id', userId);
    if (!pp.data || pp.data.length === 0) {
      return { success: true, data: { programa: null, pendientes: [], colaboradores: [] } };
    }
    var progId = pp.data[0].programa_id;
    var prog = await _supabase.from('programas').select('*, clientes(nombre)').eq('id', progId).single();
    if (!prog.data) return { success: true, data: { programa: null, pendientes: [], colaboradores: [] } };

    var programa = prog.data;
    programa.cliente_nombre = programa.clientes ? programa.clientes.nombre : '';

    // Buscar colaboradores
    var allParts = await _supabase.from('participantes_programa')
      .select('*, usuarios(id, nombre, cargo, email)')
      .eq('programa_id', progId);
    var colaboradores = (allParts.data || []).filter(function(a) {
      return a.lider_id === userId || (a.rol_programa === 'colaborador' && !a.lider_id);
    }).map(function(a) {
      return a.usuarios ? { id: a.usuarios.id, nombre: a.usuarios.nombre, cargo: a.usuarios.cargo || '', email: a.usuarios.email } : null;
    }).filter(Boolean);

    // Buscar coevaluaciones pendientes
    var encsCo = await _supabase.from('encuestas').select('*')
      .eq('programa_id', progId).eq('tipo_cuestionario', 'coevaluacion').eq('estado', 'activa');
    var pendientes = [];
    colaboradores.forEach(function(colab) {
      (encsCo.data || []).forEach(function(enc) {
        pendientes.push({
          tipo: 'coevaluacion',
          titulo: 'Coevaluacion de ' + colab.nombre,
          descripcion: enc.nombre,
          participante: colab,
          encuesta_id: enc.id,
          estado: 'pendiente'
        });
      });
    });

    return {
      success: true,
      data: {
        programa: { id: programa.id, nombre: programa.nombre, cliente_nombre: programa.cliente_nombre, estado: programa.estado },
        pendientes: pendientes,
        colaboradores: colaboradores,
        stepper: {
          autoevaluacion: 'pendiente',
          coevaluacion: (encsCo.data || []).length > 0 ? 'en-progreso' : 'pendiente',
          informe_individual: 'pendiente',
          informe_ejecutivo: 'pendiente'
        }
      }
    };
  },

  // ============================================
  // FUNCIONES STUB (se implementaran despues)
  // ============================================
  listarConductas: async function(token, progId) { return backendFunctions.listarCompetencias(token, progId); },
  crearConducta: async function(token, datos) { return backendFunctions.crearCompetencia(token, datos); },
  actualizarConducta: async function(token, id, datos) { return backendFunctions.actualizarCompetencia(token, id, datos); },
  listarChecklists: async function() { return { success: true, data: [] }; },
  crearChecklist: async function() { return { success: true, data: { id: null } }; },
  activarChecklist: async function() { return { success: true }; },
  cerrarChecklist: async function() { return { success: true }; },
  listarHallazgos: async function() { return { success: true, data: [] }; },
  crearHallazgo: async function() { return { success: true, data: { id: null } }; },
  actualizarHallazgo: async function() { return { success: true }; },
  listarFeedbackJefatura: async function() { return { success: true, data: [] }; },
  crearFeedback: async function() { return { success: true, data: { id: null } }; },
  enviarFeedback: async function() { return { success: true }; },
  registrarFeedback: async function(token, payload) {
    payload = payload || {};
    var userId = null;
    try {
      var u = JSON.parse(sessionStorage.getItem('tpt_usuario') || 'null');
      if (u && u.id) userId = u.id;
    } catch (e) {}
    if (!userId) return { success: false, error: 'Usuario no identificado' };
    if (!payload.programaId || !payload.participanteId) {
      return { success: false, error: 'Faltan programa o colaborador' };
    }
    if (!payload.fortaleza || !payload.aspecto_reforzar || !payload.recomendacion) {
      return { success: false, error: 'Completa todos los campos obligatorios' };
    }
    var ins = await _supabase.from('feedback').insert({
      programa_id: payload.programaId,
      lider_id: userId,
      participante_id: payload.participanteId,
      observacion_id: payload.observacionId || null,
      fortaleza: payload.fortaleza,
      aspecto_reforzar: payload.aspecto_reforzar,
      recomendacion: payload.recomendacion
    }).select().single();
    if (ins.error) {
      console.error('[registrarFeedback] error', ins.error);
      return { success: false, error: ins.error.message };
    }
    return { success: true, data: { id: ins.data.id } };
  },
  listarFeedbackRecibido: async function(token) {
    var userId = null;
    try {
      var u = JSON.parse(sessionStorage.getItem('tpt_usuario') || 'null');
      if (u && u.id) userId = u.id;
    } catch (e) {}
    if (!userId) return { success: true, data: [] };
    var r = await _supabase.from('feedback')
      .select('*, lider:usuarios!feedback_lider_id_fkey(id,nombre), programa:programas(nombre)')
      .eq('participante_id', userId)
      .order('created_at', { ascending: false });
    if (r.error) return { success: false, error: r.error.message };
    var data = (r.data || []).map(function(f) {
      return {
        id: f.id,
        fecha_feedback: f.created_at,
        fortaleza: f.fortaleza,
        aspecto_reforzar: f.aspecto_reforzar,
        recomendacion: f.recomendacion,
        lider_nombre: f.lider ? f.lider.nombre : '',
        programa_nombre: f.programa ? f.programa.nombre : ''
      };
    });
    return { success: true, data: data };
  },
  listarFeedbackEquipo: async function(token, progId) {
    var userId = null;
    try {
      var u = JSON.parse(sessionStorage.getItem('tpt_usuario') || 'null');
      if (u && u.id) userId = u.id;
    } catch (e) {}
    if (!userId || !progId) return { success: true, data: [] };
    var r = await _supabase.from('feedback')
      .select('*, participante:usuarios!feedback_participante_id_fkey(id,nombre)')
      .eq('programa_id', progId)
      .eq('lider_id', userId)
      .order('created_at', { ascending: false });
    if (r.error) return { success: false, error: r.error.message };
    var data = (r.data || []).map(function(f) {
      return {
        id: f.id,
        fecha_feedback: f.created_at,
        fortaleza: f.fortaleza,
        aspecto_reforzar: f.aspecto_reforzar,
        recomendacion: f.recomendacion,
        participante_nombre: f.participante ? f.participante.nombre : ''
      };
    });
    return { success: true, data: data };
  },
  listarMiEquipo: async function() { return { success: true, data: [] }; },
  listarObservacionesJefatura: async function() { return { success: true, data: [] }; },
  guardarObservacion: async function() { return { success: true }; },
  listarObservaciones: async function(token, progId) {
    if (!progId) return { success: true, data: [] };
    var r = await _supabase.from('observaciones')
      .select('*, autor:usuarios!observaciones_autor_id_fkey(id, nombre)')
      .eq('programa_id', progId)
      .order('fecha', { ascending: false });
    if (r.error) {
      console.error('[listarObservaciones]', r.error);
      return { success: true, data: [] };
    }
    // Mapear a la forma que espera tab-seguimiento.html
    var data = (r.data || []).map(function(o) {
      return {
        id: o.id,
        programa_id: o.programa_id,
        lider_id: o.autor_id,
        lider_nombre: o.autor ? o.autor.nombre : '',
        usuario_id: o.autor_id,
        usuario_nombre: o.autor ? o.autor.nombre : '',
        fecha: o.fecha || o.created_at,
        fecha_creacion: o.created_at,
        contexto: o.categoria || o.tipo || '',
        tipo: o.tipo,
        titulo: o.titulo || '',
        resumen: o.titulo || o.comentario || '',
        descripcion: o.comentario || '',
        comentario: o.comentario || '',
        estado_gestion: o.estado_gestion
      };
    });
    return { success: true, data: data };
  },
  // ============================================
  // ANALISIS CUALITATIVO (Edge Function + xAI Grok)
  // ============================================
  listarPreguntasAbiertas: async function(token, encuestaId) {
    if (!encuestaId) return { success: true, data: [] };
    var r = await _supabase.from('preguntas')
      .select('id, texto_pregunta, tipo_respuesta, orden')
      .eq('encuesta_id', encuestaId)
      .in('tipo_respuesta', ['texto_breve', 'parrafo'])
      .order('orden');
    if (r.error) { console.error('listarPreguntasAbiertas', r.error); return { success: true, data: [] }; }
    return { success: true, data: r.data || [] };
  },

  analizarRespuestasAbiertas: async function(token, encuestaId, preguntaId, opts) {
    var u = null; try { u = JSON.parse(sessionStorage.getItem('tpt_usuario') || 'null'); } catch (e) {}
    if (!u || !u.id) return { success: false, error: 'No autenticado' };
    opts = opts || {};
    try {
      var r = await fetch(SUPABASE_URL + '/functions/v1/analizar-respuestas-abiertas', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + SUPABASE_KEY,
          'apikey': SUPABASE_KEY
        },
        body: JSON.stringify({
          userId: u.id,
          encuestaId: encuestaId,
          preguntaId: preguntaId,
          tipoAnalisis: opts.tipoAnalisis || 'individual',
          forzarRegenerar: !!opts.forzarRegenerar
        })
      });
      return await r.json();
    } catch (e) {
      return { success: false, error: 'Analisis cualitativo no disponible: ' + (e.message || e) };
    }
  },

  // ============================================
  // CORREOS (Resend via Edge Function send-email)
  // ============================================
  enviarCorreoManual: async function(token, datos) {
    var u = null; try { u = JSON.parse(sessionStorage.getItem('tpt_usuario') || 'null'); } catch(e) {}
    if (!u || !u.id) return { success: false, error: 'No autenticado' };
    datos = datos || {};
    try {
      var r = await fetch(SUPABASE_URL + '/functions/v1/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + SUPABASE_KEY,
          'apikey': SUPABASE_KEY
        },
        body: JSON.stringify({
          evento: 'manual',
          userId: u.id,
          programa_id: datos.programa_id,
          encuesta_id: datos.encuesta_id || null,
          subset: datos.subset || 'todos',
          asunto: datos.asunto,
          cuerpo_html: datos.cuerpo_html,
          adjuntos: datos.adjuntos || []
        })
      });
      return await r.json();
    } catch (e) {
      return { success: false, error: 'Error de conexion: ' + (e.message || e) };
    }
  },

  listarCorreosEnviados: async function(token, progId) {
    var query = _supabase.from('correos_enviados')
      .select('*, programas(nombre), enviado_por_usuario:usuarios!correos_enviados_enviado_por_fkey(nombre)')
      .order('fecha_enviado', { ascending: false })
      .limit(100);
    if (progId) query = query.eq('programa_id', progId);
    var r = await query;
    if (r.error) {
      console.error('[listarCorreosEnviados]', r.error);
      return { success: true, data: [] };
    }
    var data = (r.data || []).map(function(c) {
      return {
        id: c.id,
        fecha: c.fecha_enviado,
        evento: c.evento,
        template: c.tipo_template,
        asunto: c.asunto,
        programa_id: c.programa_id,
        programa_nombre: c.programas ? c.programas.nombre : '',
        enviado_por_nombre: c.enviado_por_usuario ? c.enviado_por_usuario.nombre : '(automatico)',
        destinatarios: c.destinatarios || [],
        adjuntos: c.adjuntos || [],
        cuerpo: c.cuerpo_html || '',
        estado: c.estado,
        error: c.error
      };
    });
    return { success: true, data: data };
  },

  listarReportesObservacion: async function(token) {
    var u = null; try { u = JSON.parse(sessionStorage.getItem('tpt_usuario') || 'null'); } catch(e) {}
    if (!u || !u.id) return { success: true, data: [] };
    var r = await _supabase.from('observaciones')
      .select('*, programas(nombre), autor:usuarios!observaciones_autor_id_fkey(nombre)')
      .eq('autor_id', u.id).order('fecha', { ascending: false });
    if (r.error) { console.error('listarReportesObservacion', r.error); return { success: true, data: [] }; }
    return { success: true, data: await _enrichObsList(r.data || []) };
  },
  crearReporteObservacion: async function(token, payload) {
    var u = null; try { u = JSON.parse(sessionStorage.getItem('tpt_usuario') || 'null'); } catch(e) {}
    if (!u || !u.id) return { success: false, error: 'Usuario no identificado' };
    if (!payload || !payload.programa_id || !payload.titulo) return { success: false, error: 'Datos incompletos' };

    // Subir evidencias a Supabase Storage
    var evidenciasMeta = [];
    var uploadedPaths = [];
    if (Array.isArray(payload.evidencias) && payload.evidencias.length) {
      for (var i = 0; i < payload.evidencias.length; i++) {
        var ev = payload.evidencias[i];
        if (!ev || !ev.dataUrl) { evidenciasMeta.push({ nombre: ev && ev.nombre, tipo: ev && ev.tipo }); continue; }
        try {
          var m = ev.dataUrl.match(/^data:([^;]+);base64,(.*)$/);
          if (!m) throw new Error('dataUrl invalido');
          var mime = m[1];
          var b64 = m[2];
          var byteChars = atob(b64);
          var bytes = new Uint8Array(byteChars.length);
          for (var j = 0; j < byteChars.length; j++) bytes[j] = byteChars.charCodeAt(j);
          var blob = new Blob([bytes], { type: mime });
          var cleanName = (ev.nombre || 'evidencia').replace(/[^a-zA-Z0-9._-]/g, '_');
          var path = payload.programa_id + '/' + u.id + '/' + Date.now() + '_' + i + '_' + cleanName;
          var up = await _supabase.storage.from('evidencias-observaciones')
            .upload(path, blob, { contentType: mime, upsert: false });
          if (up.error) throw up.error;
          uploadedPaths.push(up.data.path);
          evidenciasMeta.push({ nombre: ev.nombre, tipo: mime, storage_path: up.data.path });
        } catch (e) {
          console.error('[crearReporteObservacion] upload evidencia', e);
          // rollback de lo ya subido
          if (uploadedPaths.length) await _supabase.storage.from('evidencias-observaciones').remove(uploadedPaths);
          return { success: false, error: 'Error subiendo evidencia: ' + (e.message || e) };
        }
      }
    }

    var row = {
      programa_id: payload.programa_id,
      autor_id: u.id,
      tipo: payload.tipo || payload.categoria || 'otro',
      categoria: payload.categoria || payload.tipo || 'otro',
      elemento_id: payload.elemento_id || null,
      titulo: payload.titulo,
      comentario: payload.comentario || '',
      estado_gestion: 'pendiente',
      fecha: new Date().toISOString(),
      evidencias: evidenciasMeta
    };
    var r = await _supabase.from('observaciones').insert(row).select().single();
    if (r.error) {
      console.error('crearReporteObservacion', r.error);
      if (uploadedPaths.length) await _supabase.storage.from('evidencias-observaciones').remove(uploadedPaths);
      return { success: false, error: r.error.message };
    }
    return { success: true, data: { id: r.data.id } };
  },
  actualizarReporteObservacion: async function(token, id, datos) {
    var allowed = ['titulo', 'comentario', 'categoria', 'tipo', 'elemento_id'];
    var upd = {};
    Object.keys(datos || {}).forEach(function(k) { if (allowed.indexOf(k) >= 0) upd[k] = datos[k]; });
    var r = await _supabase.from('observaciones').update(upd).eq('id', id);
    if (r.error) return { success: false, error: r.error.message };
    return { success: true };
  },
  listarTodasObservacionesAdmin: async function(token) {
    var r = await _supabase.from('observaciones')
      .select('*, programas(nombre), autor:usuarios!observaciones_autor_id_fkey(nombre)')
      .order('fecha', { ascending: false });
    if (r.error) { console.error('listarTodasObservacionesAdmin', r.error); return { success: true, data: [] }; }
    return { success: true, data: await _enrichObsList(r.data || []) };
  },
  cambiarEstadoObservacion: async function(token, obsId, nuevoEstado, comentario) {
    var upd = { estado_gestion: nuevoEstado };
    if (comentario) upd.comentario_gestion = comentario;
    var r = await _supabase.from('observaciones').update(upd).eq('id', obsId);
    if (r.error) return { success: false, error: r.error.message };
    return { success: true };
  },
  listarMisActividades: async function() { return { success: true, data: [] }; },
  marcarActividadCompletada: async function() { return { success: true }; },
  listarActividades: async function() { return { success: true, data: [] }; },
  crearActividad: async function() { return { success: true, data: { id: null } }; },
  actualizarActividad: async function() { return { success: true }; },
  listarEncuestasParticipante: async function() { return backendFunctions.obtenerEncuestaPendiente(); },
  generarReporte: async function() { return { success: true, data: { url: '#', mensaje: 'Reporte generado' } }; },
  generarInformeConsolidado: async function() { return { success: true, data: { url: '#', mensaje: 'Informe generado' } }; },
  generarInformeIndividual: async function() { return { success: true, data: { url: '#', mensaje: 'Informe generado' } }; },
  exportarDatosExcel: async function() { return { success: true, data: { url: '#' } }; },
  // ============================================
  // HITOS (Carta Gantt del programa)
  // ============================================
  listarHitosPrograma: async function(token, progId) {
    if (!progId) return { success: true, data: [] };
    var r = await _supabase.from('hitos_programa')
      .select('*').eq('programa_id', progId).order('orden', { ascending: true });
    if (r.error) {
      console.error('[listarHitosPrograma]', r.error);
      return { success: true, data: [] };
    }
    return { success: true, data: r.data || [] };
  },

  crearHito: async function(token, progId, datos) {
    datos = datos || {};
    if (!progId || !datos.actividad || !datos.fecha_inicio || !datos.fecha_termino) {
      return { success: false, error: 'Datos incompletos' };
    }
    // Calcular orden = max + 1
    var existing = await _supabase.from('hitos_programa').select('orden')
      .eq('programa_id', progId).order('orden', { ascending: false }).limit(1);
    var nextOrden = 1;
    if (existing.data && existing.data.length > 0 && existing.data[0].orden) {
      nextOrden = existing.data[0].orden + 1;
    }
    var row = {
      programa_id: progId,
      actividad: datos.actividad,
      fase: datos.fase || null,
      fecha_inicio: datos.fecha_inicio,
      fecha_termino: datos.fecha_termino,
      orden: datos.orden != null ? datos.orden : nextOrden,
      color: datos.color || null,
      encuesta_id: datos.encuesta_id || null
    };
    var r = await _supabase.from('hitos_programa').insert(row).select().single();
    if (r.error) return { success: false, error: r.error.message };
    return { success: true, data: r.data };
  },

  actualizarHito: async function(token, id, datos) {
    if (!id) return { success: false, error: 'ID requerido' };
    var allowed = ['actividad', 'fase', 'fecha_inicio', 'fecha_termino', 'orden', 'color', 'encuesta_id'];
    var upd = {};
    Object.keys(datos || {}).forEach(function(k) { if (allowed.indexOf(k) >= 0) upd[k] = datos[k]; });
    var r = await _supabase.from('hitos_programa').update(upd).eq('id', id);
    if (r.error) return { success: false, error: r.error.message };
    return { success: true };
  },

  eliminarHito: async function(token, id) {
    if (!id) return { success: false, error: 'ID requerido' };
    var r = await _supabase.from('hitos_programa').delete().eq('id', id);
    if (r.error) return { success: false, error: r.error.message };
    return { success: true };
  },

  importarHitosExcel: async function(token, progId, hitos, opts) {
    opts = opts || {};
    if (!progId || !Array.isArray(hitos) || hitos.length === 0) {
      return { success: false, error: 'Sin hitos para importar' };
    }

    // Validar filas
    var filasValidas = [];
    var errores = [];
    hitos.forEach(function(h, i) {
      if (!h.actividad || !h.fecha_inicio || !h.fecha_termino) {
        errores.push('Fila ' + (i + 1) + ': faltan campos obligatorios');
        return;
      }
      if (new Date(h.fecha_termino) < new Date(h.fecha_inicio)) {
        errores.push('Fila ' + (i + 1) + ': fecha_termino anterior a fecha_inicio');
        return;
      }
      filasValidas.push({
        programa_id: progId,
        actividad: String(h.actividad).trim(),
        fase: h.fase ? String(h.fase).trim() : null,
        fecha_inicio: h.fecha_inicio,
        fecha_termino: h.fecha_termino,
        orden: i + 1,
        color: h.color || null
      });
    });
    if (filasValidas.length === 0) {
      return { success: false, error: 'Ninguna fila valida. ' + errores.join(' | ') };
    }

    // Reemplazar vs agregar
    if (opts.reemplazar) {
      var del = await _supabase.from('hitos_programa').delete().eq('programa_id', progId);
      if (del.error) return { success: false, error: 'Error borrando hitos previos: ' + del.error.message };
    } else {
      // Si solo agrega, offsetear el orden para no chocar
      var existing = await _supabase.from('hitos_programa').select('orden')
        .eq('programa_id', progId).order('orden', { ascending: false }).limit(1);
      var offset = (existing.data && existing.data.length > 0 && existing.data[0].orden) ? existing.data[0].orden : 0;
      filasValidas.forEach(function(f, i) { f.orden = offset + i + 1; });
    }

    var ins = await _supabase.from('hitos_programa').insert(filasValidas);
    if (ins.error) return { success: false, error: 'Error insertando: ' + ins.error.message };

    // Auto-ajustar fechas del programa a min/max de los hitos
    var fechas = filasValidas.map(function(f) { return f.fecha_inicio; }).concat(
      filasValidas.map(function(f) { return f.fecha_termino; })
    );
    fechas.sort();
    var fechaIniProg = fechas[0];
    var fechaFinProg = fechas[fechas.length - 1];

    // Si es "agregar", consideramos tambien los hitos previos del programa
    if (!opts.reemplazar) {
      var todos = await _supabase.from('hitos_programa')
        .select('fecha_inicio, fecha_termino').eq('programa_id', progId);
      var rangos = (todos.data || []).map(function(h) { return [h.fecha_inicio, h.fecha_termino]; });
      var flat = [].concat.apply([], rangos);
      flat.sort();
      if (flat.length > 0) {
        fechaIniProg = flat[0];
        fechaFinProg = flat[flat.length - 1];
      }
    }
    await _supabase.from('programas').update({
      fecha_inicio: fechaIniProg,
      fecha_termino: fechaFinProg
    }).eq('id', progId);

    // Auto-linkear hitos a encuestas por keywords y actualizar fecha_cierre
    var encs = await _supabase.from('encuestas').select('id, tipo, tipo_cuestionario').eq('programa_id', progId);
    var encsPrograma = encs.data || [];
    var actualizaciones = [];

    filasValidas.forEach(function(h) {
      var actLower = String(h.actividad).toLowerCase();
      var esFinal = /final|post|cierre/.test(actLower);
      var esInicial = /inicial|pre|linea base|l\u00ednea base|diagn/.test(actLower);
      var esAuto = /auto/.test(actLower);
      var esCo = /coev|co-/.test(actLower) || /co\s/.test(actLower);
      var esAutoYCo = esAuto && esCo;

      encsPrograma.forEach(function(e) {
        var matchTipo = (esFinal && e.tipo === 'post') || (esInicial && e.tipo === 'pre');
        if (!matchTipo) return;
        var matchCuest = false;
        if (esAutoYCo) matchCuest = true; // ambos tipos
        else if (esAuto && e.tipo_cuestionario === 'autoevaluacion') matchCuest = true;
        else if (esCo && e.tipo_cuestionario === 'coevaluacion') matchCuest = true;
        if (matchCuest) actualizaciones.push({ id: e.id, fecha_cierre: h.fecha_termino, actividad: h.actividad });
      });
    });

    // Aplicar la ultima actualizacion por encuesta (si hay varias, gana la ultima)
    var ultimoPorEnc = {};
    actualizaciones.forEach(function(a) { ultimoPorEnc[a.id] = a; });
    var encsActualizadas = [];
    for (var encId in ultimoPorEnc) {
      var a = ultimoPorEnc[encId];
      await _supabase.from('encuestas').update({ fecha_cierre: a.fecha_cierre }).eq('id', encId);
      encsActualizadas.push({ encuesta_id: encId, fecha_cierre: a.fecha_cierre, desde_actividad: a.actividad });
    }

    return {
      success: true,
      data: {
        importados: filasValidas.length,
        errores: errores,
        programa_fecha_inicio: fechaIniProg,
        programa_fecha_termino: fechaFinProg,
        encuestas_actualizadas: encsActualizadas
      }
    };
  },

  listarInformesGenerados: async function(token, progId) {
    if (!progId) return { success: true, data: [] };
    var r = await _supabase.from('informes_generados')
      .select('*, usuarios!informes_generados_generado_por_fkey(nombre), participante:usuarios!informes_generados_participante_id_fkey(nombre)')
      .eq('programa_id', progId).order('created_at', { ascending: false });
    if (r.error) {
      // Si la tabla no existe todavia, degradar con gracia
      if (String(r.error.message || '').indexOf('informes_generados') !== -1) {
        console.warn('[listarInformesGenerados] tabla informes_generados no existe aun');
        return { success: true, data: [] };
      }
      return { success: false, error: r.error.message };
    }
    var data = (r.data || []).map(function(i) {
      var tipoLabel = (i.tipo === 'consolidado' ? 'Consolidado' : 'Individual') + ' ' + (i.momento || 'post').toUpperCase();
      var nombre = tipoLabel;
      if (i.participante) nombre += ' - ' + i.participante.nombre;
      return {
        id: i.id,
        nombre: nombre,
        tipo: i.tipo,
        momento: i.momento,
        participante_id: i.participante_id,
        participante_nombre: i.participante ? i.participante.nombre : null,
        generado_por: i.usuarios ? i.usuarios.nombre : '',
        fecha: i.created_at,
        url: null
      };
    });
    return { success: true, data: data };
  },

  registrarInformeGenerado: async function(token, progId, tipo, momento, participanteId) {
    var userId = null;
    try {
      var u = JSON.parse(sessionStorage.getItem('tpt_usuario') || 'null');
      if (u && u.id) userId = u.id;
    } catch (e) {}
    var payload = {
      programa_id: progId,
      tipo: tipo,
      momento: momento || 'post',
      participante_id: participanteId || null,
      generado_por: userId
    };
    var r = await _supabase.from('informes_generados').insert(payload).select().single();
    if (r.error) {
      console.warn('[registrarInformeGenerado]', r.error);
      return { success: false, error: r.error.message };
    }
    return { success: true, data: { id: r.data.id } };
  },
  listarCronograma: async function() { return { success: true, data: { hitos: [], fases: {} } }; },
  obtenerResultadosEncuesta: async function(token, encuestaId) {
    if (!encuestaId) return { success: false, error: 'Encuesta no identificada' };
    // 1. Encuesta + programa
    var encR = await _supabase.from('encuestas')
      .select('id, nombre, programa_id, tipo, tipo_cuestionario').eq('id', encuestaId).single();
    if (encR.error || !encR.data) return { success: false, error: 'Encuesta no encontrada' };
    var encuesta = encR.data;

    // 2. Competencias del programa (columnas de la tabla)
    var compsR = await _supabase.from('competencias')
      .select('id, nombre').eq('programa_id', encuesta.programa_id).order('orden');
    var competencias = (compsR.data || []).map(function(c) {
      return { id: c.id, nombre: c.nombre };
    });

    // 3. Preguntas de esta encuesta (map pregunta -> competencia)
    var pregsR = await _supabase.from('preguntas')
      .select('id, competencia_id, tipo_respuesta').eq('encuesta_id', encuestaId);
    var pregMap = {};
    (pregsR.data || []).forEach(function(p) {
      pregMap[p.id] = { competencia_id: p.competencia_id, tipo_respuesta: p.tipo_respuesta };
    });
    var pregIds = Object.keys(pregMap);

    // 4. Participantes esperados segun tipo_cuestionario (lider/colaborador)
    var rolEsperado = encuesta.tipo_cuestionario === 'coevaluacion' ? 'colaborador' : 'lider';
    var partsR = await _supabase.from('participantes_programa')
      .select('usuario_id, rol_programa, usuarios!participantes_programa_usuario_id_fkey(id, nombre, cargo, email)')
      .eq('programa_id', encuesta.programa_id).eq('rol_programa', rolEsperado);
    var participantes = (partsR.data || [])
      .filter(function(p) { return p.usuarios; })
      .map(function(p) {
        return {
          id: p.usuarios.id,
          nombre: p.usuarios.nombre,
          cargo: p.usuarios.cargo || '',
          email: p.usuarios.email || ''
        };
      });

    // 5. Respuestas de esta encuesta
    var respuestas = [];
    if (pregIds.length > 0) {
      var respsR = await _supabase.from('respuestas')
        .select('pregunta_id, valor, evaluador_id, evaluado_id, created_at').in('pregunta_id', pregIds);
      // Agregar por (participante, competencia): promedio de niveles 1-4
      var acum = {}; // "userId::compId" -> [vals]
      (respsR.data || []).forEach(function(r) {
        var p = pregMap[r.pregunta_id];
        if (!p || !p.competencia_id) return;
        // Para coevaluacion evaluador != evaluado; para autoevaluacion son iguales.
        // El "participante" de la tabla es el rol esperado (lider o colaborador).
        // En auto: evaluador == participante (lider).
        // En co: evaluador == colaborador (participante de la tabla).
        var partId = r.evaluador_id;
        var n = parseFloat(r.valor);
        if (isNaN(n) || n < 1 || n > 4) return;
        var key = partId + '::' + p.competencia_id;
        if (!acum[key]) acum[key] = [];
        acum[key].push(n);
      });
      Object.keys(acum).forEach(function(key) {
        var parts = key.split('::');
        var vals = acum[key];
        var avg = vals.reduce(function(a, b) { return a + b; }, 0) / vals.length;
        respuestas.push({
          participante_id: parts[0],
          competencia_id: parts[1],
          nivel: Math.round(avg * 10) / 10
        });
      });
    }

    return {
      success: true,
      data: {
        encuesta: { id: encuesta.id, nombre: encuesta.nombre, tipo: encuesta.tipo, tipo_cuestionario: encuesta.tipo_cuestionario },
        participantes: participantes,
        competencias: competencias,
        respuestas: respuestas
      }
    };
  },
  resetearPassword: async function() { return { success: true }; },
  generarPreguntasDesdeCompetencias: async function() { return { success: true, data: { count: 0 } }; },
  actualizarPreguntasEncuesta: async function() { return { success: true }; },
  importarParticipantesExcel: async function(token, progId, participantes) {
    var count = 0;
    var errores = [];

    async function upsertUsuario(nombre, email, rol, cargo, password) {
      if (!email) return null;
      var pwd = password || '123456';
      var existing = await _supabase.from('usuarios').select('*').eq('email', email).maybeSingle();
      if (existing.data) {
        if (!existing.data.password_visible) {
          await _supabase.from('usuarios').update({ password_visible: pwd }).eq('id', existing.data.id);
          existing.data.password_visible = pwd;
        }
        return existing.data;
      }
      var payload = {
        nombre: nombre || email, email: email,
        rol: rol, cargo: cargo || '', estado: 'Activo',
        password_visible: pwd
      };
      var ins = await _supabase.from('usuarios').insert(payload).select().single();
      if (ins.error) {
        console.error('[importarParticipantesExcel] error creando usuario', email, ins.error);
        errores.push(email + ': ' + ins.error.message);
        return null;
      }
      return ins.data;
    }

    async function asociar(usuarioId, rolPrograma, liderId) {
      var assoc = await _supabase.from('participantes_programa').upsert({
        programa_id: progId, usuario_id: usuarioId,
        rol_programa: rolPrograma, lider_id: liderId || null
      }, { onConflict: 'programa_id,usuario_id' });
      if (assoc.error) {
        console.error('[importarParticipantesExcel] error asociando', usuarioId, assoc.error);
        errores.push('asociacion ' + usuarioId + ': ' + assoc.error.message);
        return false;
      }
      return true;
    }

    for (var i = 0; i < (participantes || []).length; i++) {
      var p = participantes[i];
      if (!p.email || !p.nombre) continue;

      var lider = await upsertUsuario(p.nombre, p.email, 'jefatura', p.cargo, p.password);
      if (!lider) continue;

      var ok = await asociar(lider.id, p.rol || 'lider', null);
      if (ok) count++;

      if (p.colaborador_nombre && p.colaborador_email) {
        var colab = await upsertUsuario(p.colaborador_nombre, p.colaborador_email, 'participante', '', null);
        if (colab) {
          var ok2 = await asociar(colab.id, 'colaborador', lider.id);
          if (ok2) count++;
        }
      }
    }

    if (errores.length) console.warn('[importarParticipantesExcel] errores:', errores);
    return {
      success: true,
      data: {
        message: count + ' participantes importados.' + (errores.length ? ' (' + errores.length + ' con errores - revisa consola)' : '')
      }
    };
  },
  asignarColaborador: async function(token, progId, datos) {
    var colabR = await _supabase.from('usuarios').insert({
      nombre: datos.nombre || datos.colaborador_nombre || '',
      email: datos.email || datos.colaborador_email || '',
      rol: 'participante', estado: 'Activo',
      password_visible: datos.password || '123456'
    }).select().single();
    if (colabR.data) {
      await _supabase.from('participantes_programa').insert({
        programa_id: progId, usuario_id: colabR.data.id,
        rol_programa: 'colaborador', lider_id: datos.lider_id || null
      });
    }
    return { success: true };
  },
};

// ============================================
// Groq AI via Edge Function proxy (v2 - bulletproof, no key en frontend)
// ============================================
var GROQ_MODEL = 'llama-3.3-70b-versatile';

function callGroqFromBrowser(messages) {
  console.log('[Groq-v2] via proxy');
  return fetch(SUPABASE_URL + '/functions/v1/groq-proxy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'apikey': SUPABASE_KEY
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: messages,
      temperature: 0.7,
      max_tokens: 2048
    })
  })
  .then(function(r) {
    console.log('[Groq-v2] proxy HTTP status:', r.status);
    return r.text().then(function(txt) {
      console.log('[Groq-v2] proxy raw body:', txt.substring(0, 500));
      var data;
      try { data = JSON.parse(txt); } catch (e) { throw new Error('Respuesta no-JSON: ' + txt.substring(0, 200)); }
      if (data && data.success) return data;
      throw new Error((data && data.error) || 'Respuesta inesperada de groq-proxy');
    });
  });
}

// ============================================
// google.script.run mock (misma interfaz, ahora async)
// ============================================
var google = { script: { run: _mkRunner() } };

function _mkRunner() {
  return new Proxy({}, {
    get: function(_, prop) {
      if (prop === 'withSuccessHandler') {
        return function(onOk) {
          return new Proxy({}, {
            get: function(_, p2) {
              if (p2 === 'withFailureHandler') {
                return function(onErr) {
                  return new Proxy({}, {
                    get: function(_, fn) {
                      return function() {
                        var args = [].slice.call(arguments);
                        if (fn === 'getVistaHTML') {
                          fetch(args[0] + '.html?_=' + Date.now())
                            .then(function(r) {
                              if (!r.ok) throw new Error('Vista no encontrada: ' + args[0]);
                              return r.text();
                            })
                            .then(function(html) { setTimeout(function() { onOk(html); }, 60); })
                            .catch(function(e) { if (onErr) onErr(e); });
                          return;
                        }
                        var handler = backendFunctions[fn];
                        if (handler) {
                          ensureSupabaseReady().then(function() {
                            try {
                              var result = handler.apply(null, args);
                              if (result && typeof result.then === 'function') {
                                result.then(function(r) { onOk(r); }).catch(function(e) {
                                  console.error('[SUPABASE ERROR]', fn, e);
                                  if (onErr) onErr(e);
                                });
                              } else {
                                setTimeout(function() { onOk(result); }, 50);
                              }
                            } catch(e) {
                              console.error('[SUPABASE ERROR]', fn, e);
                              if (onErr) onErr(e);
                            }
                          });
                        } else {
                          console.warn('[SUPABASE] Not implemented:', fn);
                          setTimeout(function() { onOk({ success: true, data: [] }); }, 50);
                        }
                      };
                    }
                  });
                };
              }
              return function() {
                var args = [].slice.call(arguments);
                if (p2 === 'getVistaHTML') {
                  fetch(args[0] + '.html?_=' + Date.now())
                    .then(function(r) { return r.text(); })
                    .then(function(html) { setTimeout(function() { onOk(html); }, 60); });
                  return;
                }
                var handler = backendFunctions[p2];
                if (handler) {
                  ensureSupabaseReady().then(function() {
                    try {
                      var result = handler.apply(null, args);
                      if (result && typeof result.then === 'function') {
                        result.then(function(r) { onOk(r); }).catch(function(e) { console.error('[SUPABASE]', p2, e); });
                      } else {
                        setTimeout(function() { onOk(result); }, 50);
                      }
                    } catch(e) { console.error('[SUPABASE]', p2, e); }
                  });
                } else {
                  setTimeout(function() { onOk({ success: true, data: [] }); }, 50);
                }
              };
            }
          });
        };
      }
      if (prop === 'withFailureHandler') {
        return function() { return _mkRunner(); };
      }
      // Llamada directa sin withSuccessHandler (ej: feSaveTxt -> actualizarPregunta)
      var handler = backendFunctions[prop];
      if (handler) {
        return function() {
          var args = [].slice.call(arguments);
          ensureSupabaseReady().then(function() {
            try {
              var result = handler.apply(null, args);
              if (result && typeof result.then === 'function') {
                result.catch(function(e) { console.error('[SUPABASE] direct call', prop, e); });
              }
            } catch (e) {
              console.error('[SUPABASE] direct call', prop, e);
            }
          });
        };
      }
      return function() { return _mkRunner(); };
    }
  });
}

console.log('%c[MSO] Supabase client cargado - conectando a ' + SUPABASE_URL, 'color: #F58220; font-weight: bold;');
