/**
 * Build para deploy en GitHub Pages - Genera maqueta completa funcional
 * Uso: node build-deploy.js
 * Salida: carpeta deploy/
 */
const fs = require('fs');
const path = require('path');

const SRC = __dirname;
const DEST = path.join(SRC, 'deploy');

// Limpiar
if (fs.existsSync(DEST)) fs.rmSync(DEST, { recursive: true, force: true });
fs.mkdirSync(DEST, { recursive: true });

function read(f) { return fs.readFileSync(path.join(SRC, f), 'utf-8'); }

const cssContent = read('css.html');
const jsUtilsContent = read('js-utils.html');
const serverSrc = read('server.js');

// ============================================
// 1. Extraer MOCK_DATA y backendFunctions del server.js
// ============================================
// Find MOCK_DATA block
const mdStart = serverSrc.indexOf('const MOCK_DATA = {');
const mdSearch = serverSrc.indexOf('\n};', mdStart);
const mockDataBlock = serverSrc.substring(mdStart, mdSearch + 3);

// Find backendFunctions block
const bfStart = serverSrc.indexOf('const backendFunctions = {');
const bfSearch = serverSrc.indexOf('\n};', serverSrc.indexOf('generarReporte:', bfStart));
const backendBlock = serverSrc.substring(bfStart, bfSearch + 3);

console.log('  Mock data: ' + mockDataBlock.split('\n').length + ' lines');
console.log('  Backend functions: ' + backendBlock.split('\n').length + ' lines');

// ============================================
// 2. Generar mock.js
// ============================================
const mockJs = `// ============================================
// MOCK.JS - Auto-generated for GitHub Pages deploy
// All data + backend + google.script.run simulation
// ============================================

${mockDataBlock}

${backendBlock}

// ============================================
// Groq AI (direct from browser)
// ============================================
var GROQ_API_KEY = localStorage.getItem('GROQ_API_KEY') || '';
var GROQ_MODEL = 'llama-3.3-70b-versatile';

function callGroqFromBrowser(messages) {
  if (!GROQ_API_KEY) {
    var k = prompt('Para generar reportes con IA, ingresa tu API Key de Groq.\\n\\nPuedes obtenerla en https://console.groq.com/keys\\n\\n(Cancela para omitir)');
    if (k) { GROQ_API_KEY = k.trim(); localStorage.setItem('GROQ_API_KEY', k.trim()); }
    else { return Promise.reject(new Error('API Key no proporcionada')); }
  }

  return fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + GROQ_API_KEY
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: messages,
      temperature: 0.7,
      max_tokens: 2048
    })
  })
  .then(function(r) { return r.json(); })
  .then(function(data) {
    if (data.choices && data.choices[0]) {
      return { success: true, response: data.choices[0].message.content };
    }
    if (data.error) throw new Error(data.error.message);
    throw new Error('Respuesta inesperada de Groq');
  });
}

// ============================================
// google.script.run mock
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
                        // getVistaHTML: load HTML file via fetch
                        if (fn === 'getVistaHTML') {
                          fetch(args[0] + '.html')
                            .then(function(r) {
                              if (!r.ok) throw new Error('Vista no encontrada: ' + args[0]);
                              return r.text();
                            })
                            .then(function(html) { setTimeout(function() { onOk(html); }, 60); })
                            .catch(function(e) { onErr(e); });
                          return;
                        }
                        // Backend function
                        var handler = backendFunctions[fn];
                        if (handler) {
                          try {
                            var result = handler.apply(null, args);
                            setTimeout(function() { onOk(result); }, 100);
                          } catch(e) {
                            console.error('[MOCK ERROR]', fn, e);
                            onErr(e);
                          }
                        } else {
                          console.warn('[MOCK] Not implemented:', fn);
                          setTimeout(function() { onOk({ success: true, data: [] }); }, 100);
                        }
                      };
                    }
                  });
                };
              }
              // Direct call (no failureHandler)
              return function() {
                var args = [].slice.call(arguments);
                if (p2 === 'getVistaHTML') {
                  fetch(args[0] + '.html')
                    .then(function(r) { return r.text(); })
                    .then(function(html) { setTimeout(function() { onOk(html); }, 60); });
                  return;
                }
                var handler = backendFunctions[p2];
                if (handler) {
                  try { setTimeout(function() { onOk(handler.apply(null, args)); }, 100); }
                  catch(e) { console.error('[MOCK]', p2, e); }
                } else {
                  setTimeout(function() { onOk({ success: true, data: [] }); }, 100);
                }
              };
            }
          });
        };
      }
      if (prop === 'withFailureHandler') {
        return function() { return _mkRunner(); };
      }
      return function() { return _mkRunner(); };
    }
  });
}

console.log('%c[MSO Demo] Maqueta estática activa - mock.js cargado', 'color: #F58220; font-weight: bold;');
`;

fs.writeFileSync(path.join(DEST, 'mock.js'), mockJs);

// ============================================
// 3. Generar index.html (LOGIN)
// ============================================
let loginSrc = read('login.html');
loginSrc = loginSrc.replace("<?!= include('css'); ?>", cssContent);
loginSrc = loginSrc.replace("<?!= include('js-utils'); ?>", jsUtilsContent);
loginSrc = loginSrc.replace(/<\?=\s*ScriptApp\.getService\(\)\.getUrl\(\)\s*\?>/g, '');
loginSrc = loginSrc.replace(/window\.top\.location\.href\s*=\s*['"][^'"]*\?page=app['"]/g, "window.location.href='app.html'");
loginSrc = loginSrc.replace(/window\.top\.location\.href\s*=\s*['"][^'"]*\?page=registro['"]/g, "window.location.href='registro.html'");
// Remove <base target="_top"> which breaks form submit in GitHub Pages
loginSrc = loginSrc.replace('<base target="_top">', '');
// Load mock.js BEFORE the login script (so google.script.run exists)
loginSrc = loginSrc.replace('<script>', '<script src="mock.js"></' + 'script>\n<script>');
fs.writeFileSync(path.join(DEST, 'index.html'), loginSrc);

// ============================================
// 4. Generar app.html (MAIN APP)
// ============================================
let appSrc = read('index.html');
appSrc = appSrc.replace("<?!= include('css'); ?>", cssContent);
appSrc = appSrc.replace("<?!= include('js-utils'); ?>", jsUtilsContent);
appSrc = appSrc.replace(/<\?=\s*ScriptApp\.getService\(\)\.getUrl\(\)\s*\?>/g, '');
appSrc = appSrc.replace('<base target="_top">', '');
appSrc = appSrc.replace(/window\.top\.location\.href\s*=\s*['"][^'"]*\?page=login['"]/g, "window.location.href='index.html'");
// Load mock.js in <head> so it's available before any script runs
appSrc = appSrc.replace('</head>', '<script src="mock.js"></' + 'script>\n</head>');
fs.writeFileSync(path.join(DEST, 'app.html'), appSrc);

// ============================================
// 5. Generar registro.html
// ============================================
if (fs.existsSync(path.join(SRC, 'registro.html'))) {
  let regSrc = read('registro.html');
  regSrc = regSrc.replace("<?!= include('css'); ?>", cssContent);
  regSrc = regSrc.replace("<?!= include('js-utils'); ?>", jsUtilsContent);
  regSrc = regSrc.replace(/<\?=\s*ScriptApp\.getService\(\)\.getUrl\(\)\s*\?>/g, '');
  regSrc = regSrc.replace('<base target="_top">', '');
  regSrc = regSrc.replace(/window\.top\.location\.href\s*=\s*['"][^'"]*\?page=login['"]/g, "window.location.href='index.html'");
  regSrc = regSrc.replace('<script>', '<script src="mock.js"></' + 'script>\n<script>');
  fs.writeFileSync(path.join(DEST, 'registro.html'), regSrc);
}

// ============================================
// 6. Copiar vistas (con fix de /api/ai-chat para Groq directo)
// ============================================
const skip = ['index.html', 'login.html', 'registro.html', 'css.html', 'js-utils.html'];
const views = fs.readdirSync(SRC).filter(f => f.endsWith('.html') && !skip.includes(f));

views.forEach(f => {
  let content = read(f);

  // Replace /api/ai-chat with direct Groq call (multiline)
  content = content.replace(
    /fetch\('\/api\/ai-chat',\s*\{[\s\S]*?body:\s*JSON\.stringify\(\{\s*messages:\s*\[([^\]]+)\]\s*\}\)\s*\}\)/g,
    'callGroqFromBrowser([$1])'
  );
  // Also fix the .then chain for Groq response format
  content = content.replace(
    /\.then\(function\(data\)\s*\{[\s\S]{0,200}?if\s*\(data\.success\s*&&\s*data\.response\)/g,
    function(match) {
      return match.replace('if (data.success && data.response)', 'if (data.response)');
    }
  );

  // Replace /api/ai-stats
  content = content.replace(
    /fetch\('\/api\/ai-stats'\)\s*\.then\(function\(r\)\s*\{\s*return\s*r\.json\(\);\s*\}\)/g,
    "Promise.resolve({encuestas:3,observaciones:5,participantes:5})"
  );

  // Replace /api/mock calls
  content = content.replace(
    /fetch\('\/api\/mock',\s*\{[^}]*body:\s*JSON\.stringify\(\{\s*fn:\s*'([^']+)',\s*args:\s*\[([^\]]*)\]\s*\}\)\s*\}\)\s*\.then\(function\(r\)\s*\{\s*return\s*r\.json\(\);\s*\}\)/g,
    function(_, fn, args) {
      return "Promise.resolve((function(){var h=backendFunctions['" + fn + "'];return h?h(" + args + "):{success:true,data:[]}})())";
    }
  );

  fs.writeFileSync(path.join(DEST, f), content);
});

// ============================================
// 7. Copiar imágenes
// ============================================
const imgs = fs.readdirSync(SRC).filter(f => /\.(png|jpg|jpeg|gif|svg|ico)$/i.test(f));
imgs.forEach(f => fs.copyFileSync(path.join(SRC, f), path.join(DEST, f)));

// ============================================
// 8. Generar .nojekyll (para GitHub Pages)
// ============================================
fs.writeFileSync(path.join(DEST, '.nojekyll'), '');

// ============================================
// DONE
// ============================================
const totalFiles = fs.readdirSync(DEST).length;
const mockSize = Math.round(fs.statSync(path.join(DEST, 'mock.js')).size / 1024);
const appSize = Math.round(fs.statSync(path.join(DEST, 'app.html')).size / 1024);

console.log('');
console.log('  ✅ Build completado en deploy/');
console.log('  📄 ' + totalFiles + ' archivos totales');
console.log('  📦 mock.js: ' + mockSize + ' KB');
console.log('  📱 app.html: ' + appSize + ' KB');
console.log('  🖼️  ' + imgs.length + ' imágenes');
console.log('');
console.log('  Credenciales:');
console.log('    Admin:        admin@mso.cl / 123456');
console.log('    Jefatura:     jrodriguez@losandes.cl / 123456');
console.log('    Participante: lmartinez@losandes.cl / 123456');
console.log('');
