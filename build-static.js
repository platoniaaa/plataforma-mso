/**
 * Genera version estatica en /docs para GitHub Pages
 * node build-static.js
 */
var fs = require('fs');
var path = require('path');
var BASE = __dirname;
var DOCS = path.join(BASE, 'docs');

function readF(n) { try { return fs.readFileSync(path.join(BASE, n), 'utf8'); } catch(e) { return ''; } }

if (!fs.existsSync(DOCS)) fs.mkdirSync(DOCS);
fs.readdirSync(DOCS).forEach(function(f) {
  var fp = path.join(DOCS, f); if (fs.statSync(fp).isFile()) fs.unlinkSync(fp);
});

var css = readF('css.html');
var jsUtils = readF('js-utils.html');
var indexSrc = readF('index.html');

// Vistas parciales
var vistaNames = [
  'dashboard','clientes','programas','usuarios','hallazgos',
  'gestion-observaciones','correos','asistente-ia',
  'feedback-jefatura','feedback-recibido','mi-equipo','mi-progreso',
  'mis-actividades','mis-encuestas','mis-recursos','notificaciones','reportar',
  'panel-programa','tab-resumen','tab-competencias','tab-participantes',
  'tab-encuestas-programa','tab-cronograma','tab-seguimiento','tab-informes',
  'tab-encuesta-editor'
];

var vistasObj = {};
vistaNames.forEach(function(v) { vistasObj[v] = readF(v + '.html'); });

// Serialize views safely
var vistasJSON = JSON.stringify(vistasObj);
// Escape </script> inside JSON strings so browser doesn't break
vistasJSON = vistasJSON.split('</script>').join('<\\/script>');
vistasJSON = vistasJSON.split('</Script>').join('<\\/Script>');
vistasJSON = vistasJSON.split('</SCRIPT>').join('<\\/SCRIPT>');

// Build mock + views script block
var mockBlock = [];
mockBlock.push('var _V = ' + vistasJSON + ';');
mockBlock.push('');
mockBlock.push('// Mock google.script.run');
mockBlock.push('if(typeof google==="undefined")window.google={};');
mockBlock.push('google.script={run:(function(){');
mockBlock.push('  function h(s,f){return new Proxy({},{get:function(_,n){');
mockBlock.push('    if(n==="withSuccessHandler")return function(c){return h(c,f);};');
mockBlock.push('    if(n==="withFailureHandler")return function(c){return h(s,c);};');
mockBlock.push('    return function(){var a=Array.from(arguments);setTimeout(function(){_mock(n,a,s,f);},150);};');
mockBlock.push('  }})}');
mockBlock.push('  return h(function(){},function(){});');
mockBlock.push('})()};');
mockBlock.push('');
mockBlock.push('function _mock(fn,args,ok,fail){');
mockBlock.push('  switch(fn){');
mockBlock.push('    case "getVistaHTML": ok(_V[args[0]]||"<div style=padding:40px;text-align:center;color:#999>Vista: "+args[0]+"</div>"); break;');
mockBlock.push('    case "listarClientes": ok({success:true,data:[{id:"c1",nombre:"Sodexo",estado:"Activo",activo:true}]}); break;');
mockBlock.push('    case "listarProgramas": case "listarProgramasDashboard": ok({success:true,data:[{id:"p1",nombre:"Grow 2.0",cliente_id:"c1",cliente_nombre:"Sodexo",tipo:"programa_completo",estado:"activo",objetivo:"Desarrollo de liderazgo",fecha_inicio:"2026-01-15",fecha_termino:"2026-06-30"}]}); break;');
mockBlock.push('    case "obtenerPanelPrograma": ok({success:true,data:{programa:{id:"p1",nombre:"Grow 2.0",cliente_id:"c1",cliente_nombre:"Sodexo",tipo:"programa_completo",estado:"activo",objetivo:"Desarrollo de liderazgo",fecha_inicio:"2026-01-15",fecha_termino:"2026-06-30"},participantes:[{usuario_id:"u2",nombre:"Juan Castillo",email:"jcastillo@sodexo.cl",cargo:"Gerente",rol_programa:"lider"},{usuario_id:"u3",nombre:"Miguel Jose",email:"mjose@sodexo.cl",cargo:"",rol_programa:"colaborador",lider_id:"u2"}],competencias:[{id:"comp1",nombre:"Delegar con Proposito Estrategico",foco_desarrollo:"Soltar el control",nivel_1_texto:"Nivel 1",nivel_2_texto:"Nivel 2",nivel_3_texto:"Nivel 3",nivel_4_texto:"Nivel 4"}],encuestas:[],stats:{total_lideres:1,total_colaboradores:1,total_competencias:1,total_encuestas:0}}}); break;');
mockBlock.push('    case "obtenerResumenPrograma": ok({success:true,data:{total_lideres:3,total_colaboradores:3,total_encuestas:2,autoevaluaciones_completadas:1,coevaluaciones_completadas:0,observaciones_realizadas:0,estado_evaluaciones:[]}}); break;');
mockBlock.push('    case "listarCompetencias": ok({success:true,data:[{id:"comp1",nombre:"Delegar con Proposito Estrategico",descripcion:"Capacidad para delegar",foco_desarrollo:"Soltar el control",nivel_1_texto:"Asume tareas clave",nivel_2_texto:"Comienza a delegar",nivel_3_texto:"Delega con claridad",nivel_4_texto:"Delega procesos estrategicos",prioridad:1,orden:1}]}); break;');
mockBlock.push('    case "listarEncuestas": ok({success:true,data:[]}); break;');
mockBlock.push('    case "listarArchivosPrograma": ok({success:true,data:[{id:"a1",nombre_archivo:"Gantt Grow 2.0.xlsx",tipo:"cronograma",mensaje:"Revisen el cronograma",drive_url:"#",fecha_subida:"2026-04-01",subido_por_nombre:"Admin",visible_participantes:true}]}); break;');
mockBlock.push('    case "listarUsuarios": ok({success:true,data:[{id:"u1",nombre_completo:"Admin MSO",email:"admin@mso.cl",rol:"admin",estado:"activo"}]}); break;');
mockBlock.push('    case "contarNotificacionesPendientes": ok({success:true,data:{count:2}}); break;');
mockBlock.push('    case "cerrarSesion": ok({success:true}); break;');
mockBlock.push('    case "obtenerEncuestaPendiente": ok({success:true,data:null}); break;');
mockBlock.push('    case "crearPrograma": ok({success:true,data:{programaId:"p-"+Date.now()}}); break;');
mockBlock.push('    case "obtenerUsuariosDisponibles": ok({success:true,data:[]}); break;');
mockBlock.push('    case "listarCronograma": ok({success:true,data:{hitos:[],fases:{}}}); break;');
mockBlock.push('    case "obtenerMiProgreso": ok({success:true,data:{}}); break;');
mockBlock.push('    case "listarFeedbackRecibido": ok({success:true,data:[]}); break;');
mockBlock.push('    case "listarHallazgos": ok({success:true,data:[]}); break;');
mockBlock.push('    case "listarObservaciones": ok({success:true,data:[]}); break;');
mockBlock.push('    case "listarChecklists": ok({success:true,data:[]}); break;');
mockBlock.push('    case "listarFeedbackEquipo": ok({success:true,data:[]}); break;');
mockBlock.push('    case "listarInformesGenerados": ok({success:true,data:[]}); break;');
mockBlock.push('    case "listarParticipantesPrograma": ok({success:true,data:[]}); break;');
mockBlock.push('    case "obtenerNotificaciones": ok({success:true,data:[]}); break;');
mockBlock.push('    case "listarReportesObservacion": ok({success:true,data:[]}); break;');
mockBlock.push('    case "listarTodasObservacionesAdmin": ok({success:true,data:[]}); break;');
mockBlock.push('    case "listarActividades": ok({success:true,data:[]}); break;');
mockBlock.push('    case "listarMisActividades": ok({success:true,data:[]}); break;');
mockBlock.push('    default: ok({success:true,data:[]}); break;');
mockBlock.push('  }');
mockBlock.push('}');

var mockScriptTag = '<script>\n' + mockBlock.join('\n') + '\n</' + 'script>\n';

// Build index
var out = indexSrc;
out = out.replace("<?!= include('css'); ?>", css);
out = out.replace("<?!= include('js-utils'); ?>", jsUtils + '\n' + mockScriptTag);
out = out.replace(/window\.top\.location\.href/g, 'window.location.href');
out = out.replace(/'<\?= ScriptApp\.getService\(\)\.getUrl\(\) \?>\?page=login'/g, "'login.html'");
out = out.replace(/<\?= ScriptApp\.getService\(\)\.getUrl\(\) \?>\?page=login/g, 'login.html');
out = out.replace(/<\?= ScriptApp\.getService\(\)\.getUrl\(\) \?>/g, '.');
// Fix getBaseUrl login redirect
out = out.replace(/window\.location\.href = getBaseUrl\(\) \+ '\?page=login'/g, "window.location.href = 'login.html'");

fs.writeFileSync(path.join(DOCS, 'index.html'), out);
console.log('index.html: ' + Math.round(out.length/1024) + 'KB');

// Login page
fs.writeFileSync(path.join(DOCS, 'login.html'), '<!DOCTYPE html><html lang=es><head><meta charset=UTF-8><meta name=viewport content="width=device-width,initial-scale=1.0"><title>MSO Chile</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#1B4F72,#8E44AD,#E67E22)}.c{background:#fff;border-radius:16px;padding:48px 40px;width:100%;max-width:420px;box-shadow:0 20px 60px rgba(0,0,0,.3)}.lo{text-align:center;margin-bottom:32px}.lo img{max-width:180px;margin-bottom:12px}.lo p{color:#718096;font-size:14px}.fg{margin-bottom:20px}.fg label{display:block;font-size:14px;font-weight:500;color:#2D3748;margin-bottom:6px}.fc{width:100%;padding:12px 16px;border:1px solid #E2E8F0;border-radius:8px;font-size:15px;outline:none}.fc:focus{border-color:#2E86C1}.bt{width:100%;padding:14px;background:linear-gradient(135deg,#E67E22,#F39C12);color:#fff;border:none;border-radius:8px;font-size:16px;font-weight:600;cursor:pointer}.bt:hover{opacity:.9}.bt:disabled{opacity:.6}.al{padding:12px;border-radius:8px;font-size:14px;margin-bottom:16px;background:#FEE2E2;color:#C0392B}.dm{text-align:center;margin-top:24px;padding-top:20px;border-top:1px solid #E2E8F0}.dm p{font-size:12px;color:#999;margin-bottom:4px}.dm code{background:#F1F5F9;padding:2px 6px;border-radius:4px;font-size:12px;color:#1B4F72}</style></head><body><div class=c><div class=lo><img src="https://lh3.googleusercontent.com/d/1F6ndRSX6rNraFsdVHUV6IfDw0o8uK7mf" alt=MSO onerror="this.style.display=\'none\'"><p>Transferencia al Puesto de Trabajo</p></div><div id=a></div><form id=f><div class=fg><label>Correo electronico</label><input type=email id=e class=fc required value=admin@mso.cl></div><div class=fg><label>Contrasena</label><input type=password id=p class=fc required value=123456></div><button type=submit id=b class=bt>Iniciar Sesion</button></form><div class=dm><p>Credenciales:</p><p><code>admin@mso.cl</code> / <code>123456</code> (Admin)</p><p><code>jcastillo@sodexo.cl</code> / <code>123456</code> (Lider)</p><p><code>mjose@sodexo.cl</code> / <code>123456</code> (Colaborador)</p></div></div><script>var U={"admin@mso.cl":{id:"u1",nombre:"Administrador MSO",email:"admin@mso.cl",rol:"admin",cargo:"Administrador"},"admin@msochile.cl":{id:"u1",nombre:"Administrador MSO",email:"admin@msochile.cl",rol:"admin",cargo:"Administrador"},"jcastillo@sodexo.cl":{id:"u2",nombre:"Juan Castillo",email:"jcastillo@sodexo.cl",rol:"participante",cargo:"Gerente",cliente_id:"c1"},"mjose@sodexo.cl":{id:"u3",nombre:"Miguel Jose",email:"mjose@sodexo.cl",rol:"colaborador",cargo:"",cliente_id:"c1"}};document.getElementById("f").onsubmit=function(v){v.preventDefault();var m=document.getElementById("e").value.trim().toLowerCase(),b=document.getElementById("b");b.disabled=true;b.textContent="Ingresando...";document.getElementById("a").innerHTML="";setTimeout(function(){var u=U[m];if(u){sessionStorage.setItem("tpt_token","t-"+Date.now());sessionStorage.setItem("tpt_usuario",JSON.stringify(u));window.location.href="index.html"}else{document.getElementById("a").innerHTML="<div class=al>Credenciales invalidas.</div>";b.disabled=false;b.textContent="Iniciar Sesion"}},300)};</' + 'script></body></html>');
console.log('login.html generado');

// Assets
['logo mso.png', 'logo mso blanco.png'].forEach(function(f) {
  if (fs.existsSync(path.join(BASE, f))) fs.copyFileSync(path.join(BASE, f), path.join(DOCS, f));
});

console.log('Build OK');
