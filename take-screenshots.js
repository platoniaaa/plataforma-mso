/**
 * Toma capturas de pantalla de todos los módulos de la plataforma
 * y genera un documento HTML profesional con el flujo visual.
 *
 * Uso: node take-screenshots.js
 * Requiere: servidor corriendo en localhost:3000
 */
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:3000';
const SHOTS_DIR = path.join(__dirname, 'screenshots');
const OUTPUT = path.join(__dirname, 'Flujo_Visual_Plataforma_TPT.html');

if (!fs.existsSync(SHOTS_DIR)) fs.mkdirSync(SHOTS_DIR);

// Definir todas las vistas a capturar por rol
const CAPTURES = [
  // Login
  { id: 'login', label: 'Inicio de Sesión', section: 'Acceso', role: null, url: `${BASE}/?page=login`, wait: 1500 },

  // ADMIN
  { id: 'admin-dashboard', label: 'Dashboard', section: 'Administrador', role: 'admin', vista: 'dashboard', wait: 2000 },
  { id: 'admin-clientes', label: 'Gestión de Clientes', section: 'Administrador', role: 'admin', vista: 'clientes', wait: 1500 },
  { id: 'admin-programas', label: 'Gestión de Programas', section: 'Administrador', role: 'admin', vista: 'programas', wait: 1500 },
  { id: 'admin-panel-programa', label: 'Panel de Programa - Resumen', section: 'Administrador', role: 'admin', panel: 'prog-001', wait: 2500 },
  { id: 'admin-usuarios', label: 'Gestión de Usuarios', section: 'Administrador', role: 'admin', vista: 'usuarios', wait: 1500 },
  { id: 'admin-hallazgos', label: 'Hallazgos y Recomendaciones', section: 'Administrador', role: 'admin', vista: 'hallazgos', wait: 1500 },
  { id: 'admin-incidencias', label: 'Gestión de Incidencias', section: 'Administrador', role: 'admin', vista: 'gestion-observaciones', wait: 1500 },
  { id: 'admin-correos', label: 'Correos y Plantillas', section: 'Administrador', role: 'admin', vista: 'correos', wait: 1500 },
  { id: 'admin-reportes', label: 'Reportes con IA', section: 'Administrador', role: 'admin', vista: 'asistente-ia', wait: 1500 },

  // JEFATURA
  { id: 'jef-dashboard', label: 'Dashboard', section: 'Jefatura', role: 'jefatura', vista: 'dashboard', wait: 2000 },
  { id: 'jef-programas', label: 'Programas', section: 'Jefatura', role: 'jefatura', vista: 'programas', wait: 1500 },
  { id: 'jef-mi-equipo', label: 'Mi Equipo', section: 'Jefatura', role: 'jefatura', vista: 'mi-equipo', wait: 1500 },
  { id: 'jef-feedback', label: 'Feedback', section: 'Jefatura', role: 'jefatura', vista: 'feedback', wait: 1500 },
  { id: 'jef-actividades', label: 'Mis Actividades', section: 'Jefatura', role: 'jefatura', vista: 'mis-actividades', wait: 1500 },
  { id: 'jef-incidencias', label: 'Incidencias', section: 'Jefatura', role: 'jefatura', vista: 'reportar', wait: 1500 },

  // PARTICIPANTE
  { id: 'part-encuestas', label: 'Mis Encuestas', section: 'Participante', role: 'participante', vista: 'mis-encuestas', wait: 1500 },
  { id: 'part-progreso', label: 'Mi Progreso', section: 'Participante', role: 'participante', vista: 'mi-progreso', wait: 2000 },
  { id: 'part-recursos', label: 'Archivos y Recursos', section: 'Participante', role: 'participante', vista: 'mis-recursos', wait: 1500 },
  { id: 'part-feedback', label: 'Feedback Recibido', section: 'Participante', role: 'participante', vista: 'feedback-recibido', wait: 1500 },
  { id: 'part-incidencias', label: 'Incidencias', section: 'Participante', role: 'participante', vista: 'reportar', wait: 1500 },
];

const CREDENTIALS = {
  admin: { email: 'admin@mso.cl', password: '123456' },
  jefatura: { email: 'jrodriguez@losandes.cl', password: '123456' },
  participante: { email: 'lmartinez@losandes.cl', password: '123456' },
};

async function login(page, role) {
  const cred = CREDENTIALS[role];
  await page.goto(`${BASE}/?page=login`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('#email', { timeout: 5000 });
  await page.type('#email', cred.email, { delay: 30 });
  await page.type('#password', cred.password, { delay: 30 });
  await page.click('#btn-login');
  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 2000));
}

async function navigateToView(page, vista) {
  await page.evaluate((v) => {
    if (typeof cargarVista === 'function') cargarVista(v);
  }, vista);
  await new Promise(r => setTimeout(r, 2000));
}

async function navigateToPanel(page, progId) {
  await page.evaluate((id) => {
    if (typeof abrirPanelPrograma === 'function') abrirPanelPrograma(id);
  }, progId);
  await new Promise(r => setTimeout(r, 3000));
}

async function run() {
  console.log('  Iniciando Puppeteer...');
  const browser = await puppeteer.launch({
    headless: 'new',
    defaultViewport: { width: 1440, height: 900 },
    args: ['--no-sandbox']
  });

  const page = await browser.newPage();
  let currentRole = null;
  const results = [];

  for (const cap of CAPTURES) {
    process.stdout.write(`  📸 ${cap.id}...`);

    try {
      // Login if needed
      if (cap.role && cap.role !== currentRole) {
        await login(page, cap.role);
        currentRole = cap.role;
      }

      // Navigate
      if (cap.url) {
        await page.goto(cap.url, { waitUntil: 'networkidle2' });
      } else if (cap.panel) {
        await navigateToPanel(page, cap.panel);
      } else if (cap.vista) {
        await navigateToView(page, cap.vista);
      }

      await new Promise(r => setTimeout(r, cap.wait || 1500));

      // Screenshot
      const filepath = path.join(SHOTS_DIR, `${cap.id}.png`);
      await page.screenshot({ path: filepath, fullPage: false });

      results.push({ ...cap, file: filepath, success: true });
      console.log(' ✅');
    } catch (err) {
      console.log(' ❌ ' + err.message);
      results.push({ ...cap, success: false, error: err.message });
    }
  }

  await browser.close();
  console.log(`\n  ${results.filter(r => r.success).length}/${results.length} capturas exitosas\n`);

  // Generate HTML document
  generateDocument(results);
}

function generateDocument(results) {
  console.log('  Generando documento HTML...');

  const sections = {};
  results.forEach(r => {
    if (!sections[r.section]) sections[r.section] = [];
    sections[r.section].push(r);
  });

  const sectionColors = {
    'Acceso': '#5DADE2',
    'Administrador': '#1A3C6E',
    'Jefatura': '#F58220',
    'Participante': '#27AE60'
  };

  const sectionDescriptions = {
    'Acceso': 'Pantalla de inicio de sesión. Los usuarios ingresan con su correo electrónico y contraseña. El sistema reconoce el rol automáticamente y redirige al panel correspondiente.',
    'Administrador': 'Panel de administración con control total de la plataforma: gestión de clientes, programas, usuarios, encuestas, actividades, incidencias, correos y reportes con inteligencia artificial.',
    'Jefatura': 'Vista de jefatura/líder con acceso a los programas asignados, gestión de su equipo, entrega de feedback, seguimiento de actividades y reporte de incidencias.',
    'Participante': 'Vista del participante/colaborador con acceso a sus encuestas pendientes, progreso personal, recursos del programa, feedback recibido y reporte de incidencias.'
  };

  let html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Flujo Visual - Plataforma TPT MSO Chile</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body { font-family: 'Inter', 'Segoe UI', sans-serif; color: #2D3436; line-height: 1.6; background: #f5f5f5; }

  @media print {
    body { background: white; }
    .page-break { page-break-before: always; }
    @page { size: A4 landscape; margin: 15mm; }
  }

  .cover {
    background: linear-gradient(135deg, rgba(61,12,75,0.95) 0%, rgba(26,60,110,0.95) 100%),
                url('https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1400&h=600&fit=crop') center/cover;
    color: white;
    padding: 80px 60px;
    text-align: center;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
  }

  .cover h1 { font-size: 42px; font-weight: 800; margin-bottom: 12px; letter-spacing: 1px; }
  .cover h2 { font-size: 22px; font-weight: 400; opacity: 0.9; margin-bottom: 40px; }
  .cover .meta { font-size: 14px; opacity: 0.7; margin-top: 40px; }
  .cover .logo { width: 120px; margin-bottom: 30px; filter: brightness(0) invert(1); }

  .cover-kpis {
    display: flex; gap: 40px; margin: 30px 0;
  }
  .cover-kpi { text-align: center; }
  .cover-kpi-val { font-size: 48px; font-weight: 800; color: #F58220; }
  .cover-kpi-label { font-size: 13px; opacity: 0.8; }

  .container { max-width: 1200px; margin: 0 auto; padding: 40px 30px; }

  .section-header {
    padding: 30px 40px;
    border-radius: 16px;
    color: white;
    margin-bottom: 30px;
  }
  .section-header h2 { font-size: 28px; font-weight: 700; margin-bottom: 6px; }
  .section-header p { font-size: 14px; opacity: 0.9; max-width: 700px; }

  .screen-card {
    background: white;
    border-radius: 12px;
    overflow: hidden;
    margin-bottom: 30px;
    box-shadow: 0 2px 12px rgba(0,0,0,0.08);
  }

  .screen-label {
    padding: 14px 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid #eee;
  }

  .screen-label h3 { font-size: 16px; font-weight: 600; color: #2D3436; }
  .screen-label .badge {
    padding: 4px 12px;
    border-radius: 20px;
    font-size: 11px;
    font-weight: 600;
    color: white;
  }

  .screen-img {
    width: 100%;
    display: block;
    border: none;
  }

  .screen-error {
    padding: 40px;
    text-align: center;
    color: #999;
    font-style: italic;
  }

  .toc {
    background: white;
    border-radius: 12px;
    padding: 40px;
    margin-bottom: 40px;
    box-shadow: 0 2px 12px rgba(0,0,0,0.08);
  }
  .toc h2 { font-size: 22px; color: #1A3C6E; margin-bottom: 20px; }
  .toc-section { margin-bottom: 16px; }
  .toc-section h4 { font-size: 14px; font-weight: 700; margin-bottom: 6px; }
  .toc-item { font-size: 13px; color: #555; padding: 2px 0 2px 16px; }

  .footer {
    text-align: center;
    padding: 30px;
    font-size: 11px;
    color: #999;
    border-top: 1px solid #eee;
    margin-top: 40px;
  }

  .flow-arrow {
    text-align: center;
    padding: 8px 0;
    color: #ccc;
    font-size: 24px;
  }
</style>
</head>
<body>

<!-- PORTADA -->
<div class="cover">
  <img src="https://lh3.googleusercontent.com/d/1F6ndRSX6rNraFsdVHUV6IfDw0o8uK7mf" alt="MSO" class="logo">
  <h1>PLATAFORMA TPT</h1>
  <h2>Transferencia al Puesto de Trabajo</h2>
  <p style="opacity:0.8;max-width:600px;margin:0 auto;">Flujo visual de módulos y funcionalidades de la plataforma de gestión de programas de desarrollo organizacional</p>
  <div class="cover-kpis">
    <div class="cover-kpi"><div class="cover-kpi-val">${Object.keys(sections).length}</div><div class="cover-kpi-label">Secciones</div></div>
    <div class="cover-kpi"><div class="cover-kpi-val">${results.length}</div><div class="cover-kpi-label">Pantallas</div></div>
    <div class="cover-kpi"><div class="cover-kpi-val">3</div><div class="cover-kpi-label">Roles</div></div>
    <div class="cover-kpi"><div class="cover-kpi-val">10+</div><div class="cover-kpi-label">Módulos</div></div>
  </div>
  <div class="meta">MSO Chile — Modelos y Soluciones Organizacionales<br>${new Date().toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
</div>

<!-- TABLA DE CONTENIDOS -->
<div class="container page-break">
  <div class="toc">
    <h2>Tabla de Contenidos</h2>
    ${Object.entries(sections).map(([name, items]) => `
      <div class="toc-section">
        <h4 style="color:${sectionColors[name] || '#333'};">${name}</h4>
        ${items.map(i => `<div class="toc-item">• ${i.label}</div>`).join('')}
      </div>
    `).join('')}
  </div>
</div>

<!-- SECCIONES -->
`;

  Object.entries(sections).forEach(([sectionName, items]) => {
    const color = sectionColors[sectionName] || '#333';
    const desc = sectionDescriptions[sectionName] || '';

    html += `
<div class="container page-break">
  <div class="section-header" style="background:${color};">
    <h2>${sectionName}</h2>
    <p>${desc}</p>
  </div>
`;

    items.forEach((item, idx) => {
      if (item.success && fs.existsSync(item.file)) {
        const imgData = fs.readFileSync(item.file).toString('base64');
        html += `
  <div class="screen-card">
    <div class="screen-label">
      <h3>${item.label}</h3>
      <span class="badge" style="background:${color};">${sectionName}</span>
    </div>
    <img class="screen-img" src="data:image/png;base64,${imgData}" alt="${item.label}">
  </div>
`;
      } else {
        html += `
  <div class="screen-card">
    <div class="screen-label">
      <h3>${item.label}</h3>
      <span class="badge" style="background:${color};">${sectionName}</span>
    </div>
    <div class="screen-error">Captura no disponible: ${item.error || 'archivo no encontrado'}</div>
  </div>
`;
      }

      if (idx < items.length - 1) {
        html += `<div class="flow-arrow">▼</div>`;
      }
    });

    html += `</div>`;
  });

  html += `
<div class="footer">
  Plataforma TPT — MSO Chile | Documento generado el ${new Date().toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' })} | Confidencial
</div>

</body>
</html>`;

  fs.writeFileSync(OUTPUT, html);
  console.log('  ✅ Documento generado: ' + OUTPUT);
  console.log('  📄 Abre en Chrome y usa Ctrl+P para guardar como PDF');
}

run().catch(err => { console.error('Error:', err); process.exit(1); });
