/**
 * Genera version estatica en /docs para GitHub Pages
 * Uso: node build-static.js
 */
var fs = require('fs');
var path = require('path');
var BASE = __dirname;
var DOCS = path.join(BASE, 'docs');

function readF(n) { try { return fs.readFileSync(path.join(BASE, n), 'utf8'); } catch(e) { return ''; } }

// Limpiar docs (solo archivos)
if (!fs.existsSync(DOCS)) fs.mkdirSync(DOCS);
fs.readdirSync(DOCS).forEach(function(f) {
  var fp = path.join(DOCS, f);
  if (fs.statSync(fp).isFile()) fs.unlinkSync(fp);
});

var css = readF('css.html');
var jsUtils = readF('js-utils.html');
var indexSrc = readF('index.html');

// Vistas parciales
var vistas = [
  'dashboard','clientes','programas','usuarios','hallazgos',
  'gestion-observaciones','correos','asistente-ia',
  'feedback-jefatura','feedback-recibido','mi-equipo','mi-progreso',
  'mis-actividades','mis-encuestas','mis-recursos','notificaciones','reportar',
  'panel-programa','tab-resumen','tab-competencias','tab-participantes',
  'tab-encuestas-programa','tab-cronograma','tab-seguimiento','tab-informes',
  'tab-encuesta-editor'
];

// Construir objeto JS con todas las vistas
var vistasObj = {};
vistas.forEach(function(v) { vistasObj[v] = readF(v + '.html'); });

// Mock GAS completo
var mockScript = '<script>\n';
mockScript += '// Vistas embebidas\nvar _V = {};\n';
vistas.forEach(function(v) {
  var html = vistasObj[v]
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${');
  mockScript += '_V["' + v + '"] = `' + html + '`;\n';
});

mockScript += '\n// Mock google.script.run\n';
mockScript += 'if(typeof google==="undefined")window.google={};\n';
mockScript += 'google.script={run:(function(){\n';
mockScript += '  function handler(sCb,fCb){return new Proxy({},{get:function(_,fn){\n';
mockScript += '    if(fn==="withSuccessHandler")return function(cb){return handler(cb,fCb);};\n';
mockScript += '    if(fn==="withFailureHandler")return function(cb){return handler(sCb,cb);};\n';
mockScript += '    return function(){var a=Array.from(arguments);setTimeout(function(){mock(fn,a,sCb,fCb);},200);};\n';
mockScript += '  }})}\n';
mockScript += '  return handler(function(){},function(){});\n';
mockScript += '})()};\n\n';

mockScript += 'function mock(fn,args,ok,fail){\n';
mockScript += '  console.log("[Mock]",fn,args);\n';
mockScript += '  switch(fn){\n';
mockScript += '    case "getVistaHTML": ok(_V[args[0]]||"<div class=\\"empty-state\\"><p>Vista: "+args[0]+"</p></div>"); break;\n';
mockScript += '    case "loginUsuario": ok({success:true,data:{token:"t",usuario:{id:"u1",nombre:"Admin",email:"admin@mso.cl",rol:"admin"}}}); break;\n';
mockScript += '    case "listarClientes": ok({success:true,data:[{id:"c1",nombre:"Sodexo",estado:"Activo",activo:true}]}); break;\n';
mockScript += '    case "listarProgramas": case "listarProgramasDashboard": ok({success:true,data:[{id:"p1",nombre:"Grow 2.0",cliente_id:"c1",cliente_nombre:"Sodexo",tipo:"programa_completo",estado:"activo",objetivo:"Desarrollo de liderazgo",fecha_inicio:"2026-01-15",fecha_termino:"2026-06-30"}]}); break;\n';
mockScript += '    case "obtenerPanelPrograma": ok({success:true,data:{programa:{id:"p1",nombre:"Grow 2.0",cliente_id:"c1",cliente_nombre:"Sodexo",tipo:"programa_completo",estado:"activo",objetivo:"Desarrollo de liderazgo",fecha_inicio:"2026-01-15",fecha_termino:"2026-06-30"},participantes:[{usuario_id:"u2",nombre:"Juan Castillo",email:"jcastillo@sodexo.cl",cargo:"Gerente",rol_programa:"lider"},{usuario_id:"u3",nombre:"Miguel Jose",email:"mjose@sodexo.cl",cargo:"",rol_programa:"colaborador",lider_id:"u2"}],competencias:[{id:"comp1",nombre:"Delegar con Proposito Estrategico",foco_desarrollo:"Soltar el control",nivel_1_texto:"Nivel 1 texto",nivel_2_texto:"Nivel 2 texto",nivel_3_texto:"Nivel 3 texto",nivel_4_texto:"Nivel 4 texto"}],encuestas:[],stats:{total_lideres:1,total_colaboradores:1,total_competencias:1,total_encuestas:0}}}); break;\n';
mockScript += '    case "obtenerResumenPrograma": ok({success:true,data:{total_lideres:3,total_colaboradores:3,total_encuestas:2,autoevaluaciones_completadas:1,coevaluaciones_completadas:0,observaciones_realizadas:0,estado_evaluaciones:[]}}); break;\n';
mockScript += '    case "listarCompetencias": ok({success:true,data:[{id:"comp1",nombre:"Delegar con Proposito Estrategico",descripcion:"Capacidad para delegar",foco_desarrollo:"Soltar el control",nivel_1_texto:"Asume tareas clave directamente",nivel_2_texto:"Comienza a delegar con orientacion",nivel_3_texto:"Delega con claridad",nivel_4_texto:"Delega procesos estrategicos",prioridad:1,orden:1}]}); break;\n';
mockScript += '    case "listarEncuestas": ok({success:true,data:[]}); break;\n';
mockScript += '    case "listarArchivosPrograma": ok({success:true,data:[{id:"a1",nombre_archivo:"Gantt Grow 2.0.xlsx",tipo:"cronograma",mensaje:"Revisen el cronograma antes del taller",drive_url:"#",fecha_subida:"2026-04-01",subido_por_nombre:"Admin",visible_participantes:true}]}); break;\n';
mockScript += '    case "listarUsuarios": ok({success:true,data:[{id:"u1",nombre_completo:"Admin MSO",email:"admin@mso.cl",rol:"admin",estado:"activo"},{id:"u2",nombre_completo:"Juan Castillo",email:"jcastillo@sodexo.cl",rol:"participante",estado:"activo"}]}); break;\n';
mockScript += '    case "contarNotificacionesPendientes": ok({success:true,data:{count:2}}); break;\n';
mockScript += '    case "obtenerNotificaciones": ok({success:true,data:[{id:"n1",titulo:"Encuesta disponible",mensaje:"Tienes una encuesta pendiente",tipo:"encuesta",fecha:"2026-04-06",leida:false}]}); break;\n';
mockScript += '    case "cerrarSesion": ok({success:true}); break;\n';
mockScript += '    case "obtenerEncuestaPendiente": ok({success:true,data:null}); break;\n';
mockScript += '    case "crearPrograma": ok({success:true,data:{programaId:"p-"+Date.now(),message:"Programa creado."}}); break;\n';
mockScript += '    case "obtenerUsuariosDisponibles": ok({success:true,data:[]}); break;\n';
mockScript += '    case "listarCronograma": ok({success:true,data:{hitos:[],fases:{}}}); break;\n';
mockScript += '    case "obtenerMiProgreso": ok({success:true,data:{}}); break;\n';
mockScript += '    case "listarFeedbackRecibido": ok({success:true,data:[]}); break;\n';
mockScript += '    case "listarHallazgos": ok({success:true,data:[]}); break;\n';
mockScript += '    case "listarReportesObservacion": ok({success:true,data:[]}); break;\n';
mockScript += '    case "obtenerKPIsPrograma": ok({success:true,data:{}}); break;\n';
mockScript += '    default: ok({success:true,data:[]}); break;\n';
mockScript += '  }\n}\n';
mockScript += '</script>\n';

// Build index.html
var out = indexSrc
  .replace("<?!= include('css'); ?>", css)
  .replace("<?!= include('js-utils'); ?>", jsUtils + '\n' + mockScript)
  .replace(/window\.top\.location\.href/g, 'window.location.href')
  .replace(/'<\?=\s*ScriptApp\.getService\(\)\.getUrl\(\)\s*\?>\?page=login'/g, "'login.html'")
  .replace(/<\?=\s*ScriptApp\.getService\(\)\.getUrl\(\)\s*\?>\?page=login/g, 'login.html')
  .replace(/<\?=\s*ScriptApp\.getService\(\)\.getUrl\(\)\s*\?>/g, '.')
  // Fix all login redirects
  .replace(/window\.location\.href\s*=\s*google\.script\.run\.getUrl[\s\S]*?'login\.html';/g, "window.location.href = 'login.html';")
  .replace(/var url = window\.location\.href\.split\('\?'\)\[0\];\s*\n\s*window\.location\.href = url \+ '\?page=login';/g, '')
  .replace(/window\.location\.href\s*=\s*getBaseUrl\(\)\s*\+\s*'\?page=login'/g, "window.location.href = 'login.html'");

fs.writeFileSync(path.join(DOCS, 'index.html'), out);
console.log('index.html: ' + Math.round(out.length/1024) + 'KB');

// Copiar assets
['logo mso.png', 'logo mso blanco.png'].forEach(function(f) {
  if (fs.existsSync(path.join(BASE, f))) {
    fs.copyFileSync(path.join(BASE, f), path.join(DOCS, f));
  }
});

console.log('Build OK en /docs');
