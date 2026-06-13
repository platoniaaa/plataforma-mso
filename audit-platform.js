/**
 * Auditoria automatica de la plataforma MSO TPT (v3 - funciones reales).
 */
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const BASE = 'https://platoniaaa.github.io/plataforma-mso/v2';
const SHOTS = path.join(__dirname, 'audit-shots');
if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS);

const ROLES = [
  {
    label: 'ADMIN',
    email: 'admin@mso.cl',
    password: '123456',
    views: [
      'dashboard',
      'clientes',
      'programas',
      'usuarios',
      'hallazgos',
      'gestion-observaciones',
      'correos',
    ],
    panelTabs: ['resumen', 'competencias', 'participantes', 'encuestas', 'cronograma', 'seguimiento', 'informes'],
  },
  {
    label: 'JEFATURA',
    email: 'jcastillo@sodexo.cl',
    password: '123456',
    views: ['home-lider', 'mis-encuestas', 'mi-equipo', 'mis-recursos', 'reportar'],
  },
  {
    label: 'PARTICIPANTE',
    email: 'mjose@sodexo.cl',
    password: '123456',
    views: ['mis-actividades', 'mis-encuestas', 'mis-recursos', 'mi-progreso', 'feedback-recibido', 'reportar'],
  },
];

async function analyzeView(page) {
  return await page.evaluate(() => {
    const findings = [];
    const isVisible = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
    };

    const main = document.getElementById('content-area') ||
      document.querySelector('main, .main-content') || document.body;
    const mainText = main.innerText || '';

    const patterns = [
      { rx: /error al cargar/i, type: 'error-texto' },
      { rx: /error de conexi[oó]n/i, type: 'error-conexion' },
      { rx: /no implementado/i, type: 'stub-texto' },
      { rx: /\bundefined\b/, type: 'undefined-literal' },
      { rx: /\[object object\]/i, type: 'object-to-string' },
      { rx: /\bNaN\b/, type: 'NaN' },
    ];
    patterns.forEach(({ rx, type }) => {
      const m = mainText.match(rx);
      if (m) findings.push(type + ': "' + m[0] + '"');
    });

    const spinners = Array.from(main.querySelectorAll('.spinner, .spinner-lg')).filter(isVisible);
    if (spinners.length > 0) findings.push('spinners visibles en main: ' + spinners.length);

    const tables = Array.from(main.querySelectorAll('table'));
    tables.forEach((t, i) => {
      const rows = Array.from(t.querySelectorAll('tbody tr'));
      const suspect = rows.filter((r) =>
        Array.from(r.querySelectorAll('td')).some((td) => /^\s*(undefined|null|NaN)\s*$/i.test(td.innerText))
      );
      if (suspect.length > 0) findings.push('tabla ' + i + ': ' + suspect.length + ' filas con undefined/null');
    });

    return findings;
  });
}

async function safeSwitchView(page, vistaId) {
  await page.evaluate((vid) => {
    if (typeof window.cargarVista === 'function') window.cargarVista(vid);
    else if (typeof window.loadView === 'function') window.loadView(vid);
  }, vistaId);
  await new Promise((r) => setTimeout(r, 3500));
}

async function auditRole(browser, role) {
  const report = { role: role.label, views: [], panelTabs: [] };
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900 });

  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const txt = msg.text();
      if (/tailwindcss.*production|favicon/i.test(txt)) return;
      consoleErrors.push(txt);
    }
  });
  page.on('pageerror', (err) => pageErrors.push(err.message));

  console.log(`\n=== ${role.label} (${role.email}) ===`);
  await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 1500));

  try {
    await page.type('#input-email, input[type="email"]', role.email);
    await page.type('#input-password, input[type="password"]', role.password);
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {}),
      page.click('button[type="submit"], #btn-login'),
    ]);
    await new Promise((r) => setTimeout(r, 3000));
  } catch (e) {
    report.loginError = e.message;
    await page.close();
    return report;
  }

  for (const vid of role.views) {
    consoleErrors.length = 0;
    pageErrors.length = 0;
    await safeSwitchView(page, vid);
    const findings = await analyzeView(page);
    await page.screenshot({ path: path.join(SHOTS, `${role.label}_${vid}.png`), fullPage: true });
    report.views.push({
      id: vid,
      findings,
      consoleErrors: [...consoleErrors],
      pageErrors: [...pageErrors],
    });
    const issue = findings.length || consoleErrors.length || pageErrors.length;
    console.log(`  ${issue ? '⚠' : '✓'} ${vid}`);
    findings.forEach((f) => console.log('      · ' + f));
    consoleErrors.forEach((e) => console.log('      ✖ console: ' + e.substring(0, 250)));
    pageErrors.forEach((e) => console.log('      ✖ pageerror: ' + e.substring(0, 250)));
  }

  // Admin panel del programa
  if (role.label === 'ADMIN' && role.panelTabs) {
    // Navegar a programas y obtener el primer programaId
    await safeSwitchView(page, 'programas');
    const programaId = await page.evaluate(() => {
      // Buscar cualquier elemento con onclick que llame a abrirPanelPrograma('uuid')
      const elems = Array.from(document.querySelectorAll('[onclick]'));
      for (const el of elems) {
        const m = el.getAttribute('onclick').match(/abrirPanelPrograma\(['"]([a-f0-9-]{36})['"]\)/);
        if (m) return m[1];
      }
      // Fallback: buscar data-programa-id o similar
      const el2 = document.querySelector('[data-programa-id]');
      if (el2) return el2.getAttribute('data-programa-id');
      return null;
    });
    console.log('  programaId detectado:', programaId);

    if (programaId) {
      await page.evaluate((pid) => window.abrirPanelPrograma(pid), programaId);
      await new Promise((r) => setTimeout(r, 4000));

      for (const tab of role.panelTabs) {
        consoleErrors.length = 0;
        pageErrors.length = 0;
        try {
          await page.evaluate((tid) => {
            if (typeof window.switchTab === 'function') window.switchTab(tid);
          }, tab);
          await new Promise((r) => setTimeout(r, 3500));
        } catch (e) {}

        const findings = await analyzeView(page);
        await page.screenshot({ path: path.join(SHOTS, `ADMIN_panel_${tab}.png`), fullPage: true });
        report.panelTabs.push({
          id: tab,
          findings,
          consoleErrors: [...consoleErrors],
          pageErrors: [...pageErrors],
        });
        const issue = findings.length || consoleErrors.length || pageErrors.length;
        console.log(`  PANEL ${issue ? '⚠' : '✓'} ${tab}`);
        findings.forEach((f) => console.log('      · ' + f));
        consoleErrors.forEach((e) => console.log('      ✖ console: ' + e.substring(0, 250)));
        pageErrors.forEach((e) => console.log('      ✖ pageerror: ' + e.substring(0, 250)));
      }
    } else {
      console.log('  ! no se pudo encontrar programaId en la lista');
    }
  }

  await page.close();
  return report;
}

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const results = [];
  for (const role of ROLES) {
    try {
      results.push(await auditRole(browser, role));
    } catch (e) {
      console.error('Error auditando rol', role.label, e.message);
      results.push({ role: role.label, fatalError: e.message });
    }
  }
  await browser.close();

  fs.writeFileSync('audit-report.json', JSON.stringify(results, null, 2));
  console.log('\n=== REPORTE GUARDADO en audit-report.json ===');
})();
