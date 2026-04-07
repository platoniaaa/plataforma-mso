/**
 * Genera versión estática de la plataforma en /docs para GitHub Pages
 * Uso: node build-static.js
 */
var fs = require('fs');
var path = require('path');

var BASE = __dirname;
var DOCS = path.join(BASE, 'docs');

function readF(name) {
  try { return fs.readFileSync(path.join(BASE, name), 'utf8'); } catch(e) { return ''; }
}

// Limpiar docs
if (fs.existsSync(DOCS)) {
  fs.readdirSync(DOCS).forEach(function(f) {
    var fp = path.join(DOCS, f);
    if (fs.statSync(fp).isFile()) fs.unlinkSync(fp);
  });
} else {
  fs.mkdirSync(DOCS);
}

// Leer archivos fuente
var css = readF('css.html');
var jsUtils = readF('js-utils.html');
var indexSrc = readF('index.html');
var loginSrc = readF('login.html');
var registroSrc = readF('registro.html');

// Vistas parciales
var vistas = [
  'dashboard', 'clientes', 'programas', 'conductas', 'actividades', 'checklists',
  'usuarios', 'hallazgos', 'gestion-observaciones', 'correos', 'asistente-ia',
  'feedback-jefatura', 'feedback-recibido', 'mi-equipo', 'mi-progreso',
  'mis-actividades', 'mis-encuestas', 'mis-recursos', 'notificaciones', 'reportar',
  'reportes', 'distribucion-actividades', 'encuestas',
  'panel-programa', 'tab-resumen', 'tab-competencias', 'tab-participantes',
  'tab-encuestas-programa', 'tab-cronograma', 'tab-seguimiento', 'tab-informes',
  'tab-encuesta-editor'
];

var vistasJS = 'var VISTAS_HTML = {};\n';
vistas.forEach(function(v) {
  var html = readF(v + '.html');
  // Escape for JS string
  var escaped = html.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
  vistasJS += 'VISTAS_HTML["' + v + '"] = `' + escaped + '`;\n';
});

// Mock google.script.run
var mockGAS = `
<script>
// ============================================
// MOCK google.script.run para GitHub Pages
// ============================================
${vistasJS}

// Mock data
var MOCK_USERS = {
  'admin@mso.cl': { id: 'usr-001', nombre: 'Administrador MSO', email: 'admin@mso.cl', rol: 'admin', cargo: 'Administrador', cliente_id: null },
  'admin@msochile.cl': { id: 'usr-001', nombre: 'Administrador MSO', email: 'admin@msochile.cl', rol: 'admin', cargo: 'Administrador', cliente_id: null },
  'jcastillo@sodexo.cl': { id: 'usr-002', nombre: 'Juan Castillo', email: 'jcastillo@sodexo.cl', rol: 'participante', cargo: 'Gerente', cliente_id: 'cli-001' },
  'mjose@sodexo.cl': { id: 'usr-003', nombre: 'Miguel Jose', email: 'mjose@sodexo.cl', rol: 'colaborador', cargo: '', cliente_id: 'cli-001' }
};

var MOCK_CLIENTES = [
  { id: 'cli-001', nombre: 'Sodexo', razon_social: 'Sodexo Chile', rubro: 'Servicios', estado: 'Activo', activo: true }
];

var MOCK_PROGRAMAS = [
  { id: 'prog-001', nombre: 'Grow 2.0', cliente_id: 'cli-001', cliente_nombre: 'Sodexo', tipo: 'programa_completo', estado: 'activo', objetivo: 'Desarrollo de liderazgo', fecha_inicio: '2026-01-15', fecha_termino: '2026-06-30' }
];

// Mock ScriptApp URL
var MOCK_BASE_URL = location.href.replace(/\\/[^/]*$/, '');

// Mock google.script.run
if (typeof google === 'undefined') window.google = {};
google.script = {
  run: new Proxy({}, {
    get: function(target, prop) {
      if (prop === 'withSuccessHandler') {
        return function(cb) {
          return new Proxy({}, {
            get: function(t2, fnName) {
              if (fnName === 'withFailureHandler') {
                return function(errCb) {
                  return new Proxy({}, {
                    get: function(t3, fn2) {
                      return function() { mockCall(fn2, Array.from(arguments), cb, errCb); };
                    }
                  });
                };
              }
              return function() { mockCall(fnName, Array.from(arguments), cb, function(){}); };
            }
          });
        };
      }
      if (prop === 'withFailureHandler') {
        return function(errCb) {
          return new Proxy({}, {
            get: function(t2, fnName) {
              if (fnName === 'withSuccessHandler') {
                return function(cb) {
                  return new Proxy({}, {
                    get: function(t3, fn2) {
                      return function() { mockCall(fn2, Array.from(arguments), cb, errCb); };
                    }
                  });
                };
              }
              return function() { mockCall(fnName, Array.from(arguments), function(){}, errCb); };
            }
          });
        };
      }
      return function() { mockCall(prop, Array.from(arguments), function(){}, function(){}); };
    }
  })
};

function mockCall(fnName, args, successCb, failCb) {
  console.log('[Mock] ' + fnName, args);
  setTimeout(function() {
    switch(fnName) {
      case 'getVistaHTML':
        var vista = args[0];
        successCb(VISTAS_HTML[vista] || '<div class="empty-state"><p>Vista: ' + vista + '</p></div>');
        break;
      case 'loginUsuario':
        var email = args[0];
        var user = MOCK_USERS[email];
        if (user) {
          successCb({ success: true, data: { token: 'mock-token-123', usuario: user } });
        } else {
          successCb({ success: false, error: 'Credenciales invalidas (demo: admin@mso.cl / 123456)' });
        }
        break;
      case 'obtenerClientesRegistro':
        successCb(MOCK_CLIENTES.map(function(c) { return { id: c.id, nombre: c.nombre }; }));
        break;
      case 'listarClientes':
        successCb({ success: true, data: MOCK_CLIENTES });
        break;
      case 'listarProgramas':
      case 'listarProgramasDashboard':
        successCb({ success: true, data: MOCK_PROGRAMAS });
        break;
      case 'obtenerPanelPrograma':
        successCb({ success: true, data: {
          programa: MOCK_PROGRAMAS[0],
          participantes: [],
          competencias: [],
          encuestas: [],
          stats: { total_lideres: 0, total_colaboradores: 0, total_competencias: 0, total_encuestas: 0 }
        }});
        break;
      case 'obtenerResumenPrograma':
        successCb({ success: true, data: { total_lideres: 3, total_colaboradores: 3, total_encuestas: 2, autoevaluaciones_completadas: 0, coevaluaciones_completadas: 0, observaciones_realizadas: 0, estado_evaluaciones: [] } });
        break;
      case 'listarCompetencias':
        successCb({ success: true, data: [] });
        break;
      case 'listarEncuestas':
        successCb({ success: true, data: [] });
        break;
      case 'listarArchivosPrograma':
        successCb({ success: true, data: [] });
        break;
      case 'listarUsuarios':
        successCb({ success: true, data: Object.values(MOCK_USERS) });
        break;
      case 'contarNotificacionesPendientes':
        successCb({ success: true, data: { count: 0 } });
        break;
      case 'cerrarSesion':
        successCb({ success: true });
        break;
      case 'obtenerEncuestaPendiente':
        successCb({ success: true, data: null });
        break;
      case 'crearPrograma':
        var nuevoId = 'prog-' + Date.now();
        successCb({ success: true, data: { programaId: nuevoId, message: 'Programa creado.' } });
        break;
      default:
        successCb({ success: true, data: [] });
    }
  }, 300);
}
</script>
`;

// Build index.html
var indexHTML = indexSrc
  .replace("<?!= include('css'); ?>", css)
  .replace("<?!= include('js-utils'); ?>", jsUtils + mockGAS)
  .replace(/window\.top\.location\.href/g, "window.location.href")
  .replace(/'<\?=\s*ScriptApp\.getService\(\)\.getUrl\(\)\s*\?>\?page=login'/g, "'login.html'")
  .replace(/<\?=\s*ScriptApp\.getService\(\)\.getUrl\(\)\s*\?>/g, '.');

fs.writeFileSync(path.join(DOCS, 'index.html'), indexHTML);
console.log('index.html generado');

// Build login.html - reemplazar GAS tags y redirect
var loginHTML = loginSrc
  .replace("<?!= include('css'); ?>", css)
  .replace("<?!= include('js-utils'); ?>", jsUtils + mockGAS)
  .replace(/<\?=\s*ScriptApp\.getService\(\)\.getUrl\(\)\s*\?>\?page=app/g, 'index.html')
  .replace(/<\?=\s*ScriptApp\.getService\(\)\.getUrl\(\)\s*\?>\?page=registro/g, '#')
  .replace(/<\?=\s*ScriptApp\.getService\(\)\.getUrl\(\)\s*\?>/g, '.')
  .replace("window.top.location.href = 'index.html'", "window.location.href = 'index.html'");
fs.writeFileSync(path.join(DOCS, 'login.html'), loginHTML);
console.log('login.html generado');

// Copiar assets
['logo mso.png', 'logo mso blanco.png'].forEach(function(f) {
  var src = path.join(BASE, f);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(DOCS, f));
    console.log(f + ' copiado');
  }
});

console.log('\\nBuild completado en /docs');
console.log('Credenciales demo: admin@mso.cl / 123456');
