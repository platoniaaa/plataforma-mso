/**
 * Build script: genera versión estática para GitHub Pages
 * Uso: node build-static.js
 * Salida: carpeta docs/
 */
const fs = require('fs');
const path = require('path');

const SRC = __dirname;
const DEST = path.join(SRC, 'docs');

// Limpiar docs/
if (fs.existsSync(DEST)) {
  try { fs.rmSync(DEST, { recursive: true }); } catch(e) {
    console.error('No se pudo limpiar docs/. Cierra programas que lo usen y reintenta.');
    process.exit(1);
  }
}
fs.mkdirSync(DEST, { recursive: true });

// ============================================
// 1. Extraer mock data y funciones del server.js
// ============================================
const serverSrc = fs.readFileSync(path.join(SRC, 'server.js'), 'utf-8');

// Extraer desde "const MOCK_DATA = {" hasta la línea "};"
const mockStart = serverSrc.indexOf('const MOCK_DATA = {');
const backendEnd = serverSrc.indexOf('\n};', serverSrc.indexOf('const backendFunctions = {'));
const mockAndBackend = serverSrc.substring(mockStart, backendEnd + 3);

// ============================================
// 2. Generar mock.js (archivo standalone con mock + google.script.run)
// ============================================
const mockJs = `// Auto-generated mock for GitHub Pages static deploy
${mockAndBackend}

// Google.script.run mock
var google = { script: { run: _createRunner() } };

function _createRunner() {
  return new Proxy({}, {
    get: function(_, prop) {
      if (prop === 'withSuccessHandler') {
        return function(sh) {
          return new Proxy({}, {
            get: function(_, p2) {
              if (p2 === 'withFailureHandler') {
                return function(fh) {
                  return new Proxy({}, {
                    get: function(_, fn) {
                      return function() {
                        var args = [].slice.call(arguments);
                        if (fn === 'getVistaHTML') {
                          var base = document.querySelector('meta[name="base-path"]');
                          var prefix = base ? base.content : '.';
                          fetch(prefix + '/' + args[0] + '.html')
                            .then(function(r) { return r.text(); })
                            .then(function(h) { setTimeout(function() { sh(h); }, 80); })
                            .catch(function(e) { fh(e); });
                          return;
                        }
                        var handler = backendFunctions[fn];
                        if (handler) {
                          try { var r = handler.apply(null, args); setTimeout(function() { sh(r); }, 120); }
                          catch(e) { console.error('[MOCK ERROR]', fn, e); fh(e); }
                        } else {
                          console.warn('[MOCK] Not implemented:', fn);
                          setTimeout(function() { sh({ success: true, data: [] }); }, 120);
                        }
                      };
                    }
                  });
                };
              }
              // sin failureHandler
              return function() {
                var args = [].slice.call(arguments);
                if (p2 === 'getVistaHTML') {
                  var base = document.querySelector('meta[name="base-path"]');
                  var prefix = base ? base.content : '.';
                  fetch(prefix + '/' + args[0] + '.html')
                    .then(function(r) { return r.text(); })
                    .then(function(h) { setTimeout(function() { sh(h); }, 80); });
                  return;
                }
                var handler = backendFunctions[p2];
                if (handler) { setTimeout(function() { sh(handler.apply(null, args)); }, 120); }
                else { setTimeout(function() { sh({ success: true, data: [] }); }, 120); }
              };
            }
          });
        };
      }
      // withFailureHandler sin successHandler previo
      if (prop === 'withFailureHandler') {
        return function() { return _createRunner(); };
      }
      return function() { return _createRunner(); };
    }
  });
}

// Groq AI key (stored in localStorage)
var GROQ_API_KEY = localStorage.getItem('GROQ_API_KEY') || '';
var GROQ_MODEL = 'llama-3.3-70b-versatile';
`;

fs.writeFileSync(path.join(DEST, 'mock.js'), mockJs);

// ============================================
// 3. Leer CSS y JS-utils
// ============================================
const cssContent = fs.readFileSync(path.join(SRC, 'css.html'), 'utf-8');
const jsUtilsContent = fs.readFileSync(path.join(SRC, 'js-utils.html'), 'utf-8');

// ============================================
// 4. Generar login (index.html)
// ============================================
let loginHtml = fs.readFileSync(path.join(SRC, 'login.html'), 'utf-8');
loginHtml = loginHtml.replace("<?!= include('css'); ?>", cssContent);
loginHtml = loginHtml.replace(/<\?=\s*ScriptApp\.getService\(\)\.getUrl\(\)\s*\?>/g, '');
// Fix redirects
loginHtml = loginHtml.replace(/window\.top\.location\.href\s*=\s*['"]\?page=app['"]/g, "window.location.href='app.html'");
loginHtml = loginHtml.replace(/window\.top\.location\.href\s*=\s*['"].*?\?page=app['"]/g, "window.location.href='app.html'");
loginHtml = loginHtml.replace(/window\.top\.location\.href\s*=\s*['"].*?\?page=registro['"]/g, "window.location.href='registro.html'");
// Add mock.js before </body>
loginHtml = loginHtml.replace('</body>', '<script src="mock.js"></script>\n</body>');
// Add base-path meta
loginHtml = loginHtml.replace('<meta charset="UTF-8">', '<meta charset="UTF-8">\n  <meta name="base-path" content=".">');

fs.writeFileSync(path.join(DEST, 'index.html'), loginHtml);

// ============================================
// 5. Generar app.html (main app)
// ============================================
let appHtml = fs.readFileSync(path.join(SRC, 'index.html'), 'utf-8');
appHtml = appHtml.replace("<?!= include('css'); ?>", cssContent);
appHtml = appHtml.replace("<?!= include('js-utils'); ?>", jsUtilsContent);
appHtml = appHtml.replace(/<\?=\s*ScriptApp\.getService\(\)\.getUrl\(\)\s*\?>/g, '');
// Fix login redirects
appHtml = appHtml.replace(/window\.top\.location\.href\s*=\s*['"]\?page=login['"]/g, "window.location.href='index.html'");
appHtml = appHtml.replace(/window\.top\.location\.href\s*=\s*['"].*?\?page=login['"]/g, "window.location.href='index.html'");
// Add mock.js and base-path
appHtml = appHtml.replace('<meta charset="UTF-8">', '<meta charset="UTF-8">\n  <meta name="base-path" content=".">');
appHtml = appHtml.replace('</body>', '<script src="mock.js"></script>\n</body>');

fs.writeFileSync(path.join(DEST, 'app.html'), appHtml);

// ============================================
// 6. Generar registro.html
// ============================================
if (fs.existsSync(path.join(SRC, 'registro.html'))) {
  let regHtml = fs.readFileSync(path.join(SRC, 'registro.html'), 'utf-8');
  regHtml = regHtml.replace("<?!= include('css'); ?>", cssContent);
  regHtml = regHtml.replace(/<\?=\s*ScriptApp\.getService\(\)\.getUrl\(\)\s*\?>/g, '');
  regHtml = regHtml.replace(/window\.top\.location\.href\s*=\s*['"].*?\?page=login['"]/g, "window.location.href='index.html'");
  regHtml = regHtml.replace('<meta charset="UTF-8">', '<meta charset="UTF-8">\n  <meta name="base-path" content=".">');
  regHtml = regHtml.replace('</body>', '<script src="mock.js"></script>\n</body>');
  fs.writeFileSync(path.join(DEST, 'registro.html'), regHtml);
}

// ============================================
// 7. Copiar vistas HTML (sin modificar, se cargan via fetch)
// ============================================
const skipFiles = ['index.html', 'login.html', 'registro.html', 'css.html', 'js-utils.html'];
const htmlFiles = fs.readdirSync(SRC).filter(f => f.endsWith('.html') && !skipFiles.includes(f));

let copied = 0;
htmlFiles.forEach(f => {
  let content = fs.readFileSync(path.join(SRC, f), 'utf-8');
  // Fix /api/ai-chat calls to use Groq directly from browser
  content = content.replace(
    /fetch\('\/api\/ai-chat',\s*\{[\s\S]*?body:\s*JSON\.stringify\(\{\s*messages:\s*(\w+)\s*\}\)\s*\}/g,
    function(match, msgVar) {
      return `fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (GROQ_API_KEY || localStorage.getItem('GROQ_API_KEY') || prompt('Ingresa API Key de Groq:') || '') },
      body: JSON.stringify({ model: GROQ_MODEL || 'llama-3.3-70b-versatile', messages: ${msgVar}, temperature: 0.7, max_tokens: 2048 })
    }`;
    }
  );
  // Fix ai-chat response format (Groq returns choices, not {success, response})
  content = content.replace(
    /\.then\(function\(data\)\s*\{[\s\S]*?if\s*\(data\.success\s*&&\s*data\.response\)/g,
    function(match) {
      return match.replace(
        'if (data.success && data.response)',
        'data.response = data.choices ? data.choices[0].message.content : data.response; if (data.response)'
      ).replace(
        '.then(function(data) {',
        '.then(function(r){return r.json();}).then(function(data) { data.success = !data.error;'
      );
    }
  );
  // Fix /api/ai-stats
  content = content.replace(/fetch\('\/api\/ai-stats'\)/g,
    "Promise.resolve({json:function(){return{encuestas:3,observaciones:5,participantes:5}}})");
  // Fix /api/mock calls
  content = content.replace(
    /fetch\('\/api\/mock',\s*\{\s*method:\s*'POST',\s*headers:\s*\{[^}]+\},\s*body:\s*JSON\.stringify\(\{[^}]+\}\)\s*\}\)/g,
    function(match) {
      const fnMatch = match.match(/fn:\s*'(\w+)'/);
      const argsMatch = match.match(/args:\s*\[([^\]]*)\]/);
      const fn = fnMatch ? fnMatch[1] : '';
      const args = argsMatch ? argsMatch[1] : '';
      return `Promise.resolve({json:function(){var h=backendFunctions['${fn}'];return h?h(${args}):{success:true,data:[]}},text:function(){return''}})`;
    }
  );

  fs.writeFileSync(path.join(DEST, f), content);
  copied++;
});

// ============================================
// 8. Copiar imágenes
// ============================================
const imgFiles = fs.readdirSync(SRC).filter(f => /\.(png|jpg|jpeg|gif|svg|ico)$/i.test(f));
imgFiles.forEach(f => fs.copyFileSync(path.join(SRC, f), path.join(DEST, f)));

console.log('');
console.log('  ✅ Build completado en docs/');
console.log('  📄 ' + (copied + 3) + ' archivos HTML');
console.log('  📦 1 mock.js (' + Math.round(fs.statSync(path.join(DEST, 'mock.js')).size / 1024) + ' KB)');
console.log('  🖼️  ' + imgFiles.length + ' imágenes');
console.log('');
