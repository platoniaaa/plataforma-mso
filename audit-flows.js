/**
 * Auditoria profunda: interactua con modals y botones especificos
 * para detectar errores que el audit de superficie no captura.
 */
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const BASE = 'https://platoniaaa.github.io/plataforma-mso/v2';
const SHOTS = path.join(__dirname, 'audit-shots');
if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS);

async function login(page, email, password) {
  await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 1500));
  await page.type('#input-email, input[type="email"]', email);
  await page.type('#input-password, input[type="password"]', password);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {}),
    page.click('button[type="submit"], #btn-login'),
  ]);
  await new Promise((r) => setTimeout(r, 3000));
}

async function switchView(page, vid) {
  await page.evaluate((v) => {
    if (typeof window.cargarVista === 'function') window.cargarVista(v);
  }, vid);
  await new Promise((r) => setTimeout(r, 3000));
}

async function runWithListeners(page, label, fn) {
  const consoleErrors = [];
  const pageErrors = [];
  const onConsole = (msg) => {
    if (msg.type() === 'error') {
      const t = msg.text();
      if (/tailwindcss|favicon/i.test(t)) return;
      consoleErrors.push(t);
    }
  };
  const onPageErr = (err) => pageErrors.push(err.message);
  page.on('console', onConsole);
  page.on('pageerror', onPageErr);
  try {
    await fn();
  } catch (e) {
    pageErrors.push('THROW in flow: ' + e.message);
  }
  page.off('console', onConsole);
  page.off('pageerror', onPageErr);
  const issue = consoleErrors.length || pageErrors.length;
  console.log(`  ${issue ? '⚠' : '✓'} ${label}`);
  consoleErrors.forEach((e) => console.log('      ✖ console: ' + e.substring(0, 250)));
  pageErrors.forEach((e) => console.log('      ✖ pageerror: ' + e.substring(0, 250)));
  return { label, consoleErrors, pageErrors };
}

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const results = [];

  // ================ ADMIN FLOWS ================
  console.log('\n=== ADMIN FLOWS ===');
  const adminPage = await browser.newPage();
  await adminPage.setViewport({ width: 1600, height: 900 });
  await login(adminPage, 'admin@mso.cl', '123456');

  // FLOW 1: Abrir programas, click en uno, recorrer TODOS los tabs y abrir modals dentro
  results.push(await runWithListeners(adminPage, 'admin: abrir programa Grow 2.0', async () => {
    await switchView(adminPage, 'programas');
    const progId = await adminPage.evaluate(() => {
      const elems = Array.from(document.querySelectorAll('[onclick]'));
      for (const el of elems) {
        const m = el.getAttribute('onclick').match(/abrirPanelPrograma\(['"]([a-f0-9-]{36})['"]\)/);
        if (m) return m[1];
      }
      return null;
    });
    await adminPage.evaluate((pid) => window.abrirPanelPrograma(pid), progId);
    await new Promise((r) => setTimeout(r, 4000));
  }));

  // FLOW 2: tab Encuestas -> click "Ver respuestas" en la primera
  results.push(await runWithListeners(adminPage, 'admin: panel Encuestas -> Ver respuestas modal', async () => {
    await adminPage.evaluate(() => window.switchTab('encuestas'));
    await new Promise((r) => setTimeout(r, 3000));
    const clicked = await adminPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const target = btns.find((b) => /ver respuestas/i.test(b.innerText));
      if (target) { target.click(); return true; }
      return false;
    });
    if (!clicked) throw new Error('no se encontro boton "Ver respuestas"');
    await new Promise((r) => setTimeout(r, 3000));
    await adminPage.screenshot({ path: path.join(SHOTS, 'FLOW_admin_ver_respuestas.png'), fullPage: true });
    // Cerrar modal
    await adminPage.evaluate(() => {
      if (typeof closeModal === 'function') closeModal('modal-respuestas-encuesta');
    });
  }));

  // FLOW 3: tab Encuestas -> click "Editar"
  results.push(await runWithListeners(adminPage, 'admin: panel Encuestas -> Editar encuesta', async () => {
    await new Promise((r) => setTimeout(r, 1500));
    const clicked = await adminPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const target = btns.find((b) => /^editar$/i.test(b.innerText.trim()));
      if (target) { target.click(); return true; }
      return false;
    });
    if (!clicked) throw new Error('no se encontro boton "Editar"');
    await new Promise((r) => setTimeout(r, 3500));
    await adminPage.screenshot({ path: path.join(SHOTS, 'FLOW_admin_editar_encuesta.png'), fullPage: true });
  }));

  // FLOW 4: Volver al panel, tab Participantes -> abrir modal Agregar Lider
  results.push(await runWithListeners(adminPage, 'admin: panel Participantes -> modal Agregar Lider', async () => {
    await adminPage.evaluate(() => window.switchTab && window.switchTab('participantes'));
    await new Promise((r) => setTimeout(r, 2500));
    const clicked = await adminPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const target = btns.find((b) => /agregar l[ií]der/i.test(b.innerText));
      if (target) { target.click(); return true; }
      return false;
    });
    if (!clicked) throw new Error('no se encontro boton "Agregar Lider"');
    await new Promise((r) => setTimeout(r, 2500));
    await adminPage.screenshot({ path: path.join(SHOTS, 'FLOW_admin_agregar_lider.png'), fullPage: true });
  }));

  // FLOW 5: Tab Informes -> intentar generar Consolidado PRE
  results.push(await runWithListeners(adminPage, 'admin: panel Informes load (ya no descargarPDF)', async () => {
    await adminPage.evaluate(() => window.switchTab && window.switchTab('informes'));
    await new Promise((r) => setTimeout(r, 4000));
    await adminPage.screenshot({ path: path.join(SHOTS, 'FLOW_admin_informes.png'), fullPage: true });
  }));

  // FLOW 6: Clientes -> abrir detalle si existe
  results.push(await runWithListeners(adminPage, 'admin: click en primer cliente', async () => {
    await switchView(adminPage, 'clientes');
    await new Promise((r) => setTimeout(r, 2000));
    const clicked = await adminPage.evaluate(() => {
      const el = document.querySelector('[onclick*="verCliente"], [onclick*="abrirCliente"], .cliente-card');
      if (el) { el.click(); return true; }
      return false;
    });
    if (!clicked) console.log('      (sin accion de click para cliente)');
    await new Promise((r) => setTimeout(r, 2000));
  }));

  await adminPage.close();

  // ================ JEFATURA FLOWS ================
  console.log('\n=== JEFATURA FLOWS ===');
  const lpage = await browser.newPage();
  await lpage.setViewport({ width: 1600, height: 900 });
  await login(lpage, 'jcastillo@sodexo.cl', '123456');

  results.push(await runWithListeners(lpage, 'lider: Mi Equipo cargado + click en card si existe', async () => {
    await switchView(lpage, 'mi-equipo');
    await new Promise((r) => setTimeout(r, 3500));
    await lpage.screenshot({ path: path.join(SHOTS, 'FLOW_lider_mi_equipo.png'), fullPage: true });
    const clicked = await lpage.evaluate(() => {
      const el = document.querySelector('[onclick*="verDetalle"], .equipo-card, button.btn-outline');
      if (el && /equipo|ver/i.test(el.innerText || '')) { el.click(); return true; }
      return false;
    });
    if (clicked) await new Promise((r) => setTimeout(r, 2000));
  }));

  results.push(await runWithListeners(lpage, 'lider: Mis Evaluaciones -> click Responder', async () => {
    await switchView(lpage, 'mis-encuestas');
    await new Promise((r) => setTimeout(r, 3000));
    const clicked = await lpage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const target = btns.find((b) => /responder/i.test(b.innerText));
      if (target) { target.click(); return true; }
      return false;
    });
    if (clicked) {
      await new Promise((r) => setTimeout(r, 4000));
      await lpage.screenshot({ path: path.join(SHOTS, 'FLOW_lider_responder.png'), fullPage: true });
    } else {
      console.log('      (no hay encuestas pendientes para lider)');
    }
  }));

  results.push(await runWithListeners(lpage, 'lider: Incidencias -> abrir modal Nueva', async () => {
    await switchView(lpage, 'reportar');
    await new Promise((r) => setTimeout(r, 2500));
    const clicked = await lpage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const target = btns.find((b) => /nueva|reportar|\+/i.test(b.innerText));
      if (target) { target.click(); return true; }
      return false;
    });
    if (clicked) await new Promise((r) => setTimeout(r, 2000));
    await lpage.screenshot({ path: path.join(SHOTS, 'FLOW_lider_reportar.png'), fullPage: true });
  }));

  await lpage.close();

  // ================ PARTICIPANTE FLOWS ================
  console.log('\n=== PARTICIPANTE FLOWS ===');
  const ppage = await browser.newPage();
  await ppage.setViewport({ width: 1600, height: 900 });
  await login(ppage, 'mjose@sodexo.cl', '123456');

  results.push(await runWithListeners(ppage, 'participante: Mi Progreso cargado', async () => {
    await switchView(ppage, 'mi-progreso');
    await new Promise((r) => setTimeout(r, 4000));
    await ppage.screenshot({ path: path.join(SHOTS, 'FLOW_part_mi_progreso.png'), fullPage: true });
  }));

  results.push(await runWithListeners(ppage, 'participante: Mis Actividades -> click en card', async () => {
    await switchView(ppage, 'mis-actividades');
    await new Promise((r) => setTimeout(r, 3000));
    const clicked = await ppage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const target = btns.find((b) => /responder|marcar/i.test(b.innerText));
      if (target) { target.click(); return true; }
      return false;
    });
    if (clicked) await new Promise((r) => setTimeout(r, 2500));
    await ppage.screenshot({ path: path.join(SHOTS, 'FLOW_part_mis_actividades.png'), fullPage: true });
  }));

  results.push(await runWithListeners(ppage, 'participante: Feedback Recibido', async () => {
    await switchView(ppage, 'feedback-recibido');
    await new Promise((r) => setTimeout(r, 3000));
    await ppage.screenshot({ path: path.join(SHOTS, 'FLOW_part_feedback.png'), fullPage: true });
  }));

  await ppage.close();
  await browser.close();

  const totalIssues = results.reduce((a, r) => a + r.consoleErrors.length + r.pageErrors.length, 0);
  console.log(`\n=== TOTAL FLOWS: ${results.length} | ISSUES: ${totalIssues} ===`);
  fs.writeFileSync('audit-flows-report.json', JSON.stringify(results, null, 2));
})();
