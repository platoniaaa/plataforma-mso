/**
 * Code.gs — Punto de entrada, doGet(), rutas principales
 * Plataforma TPT - MSO Chile
 */

/**
 * Punto de entrada principal - Sirve la aplicación web
 */
function doGet(e) {
  var page = e && e.parameter && e.parameter.page ? e.parameter.page : 'login';

  var template;

  switch (page) {
    case 'login':
      template = HtmlService.createTemplateFromFile('login');
      break;
    case 'registro':
      template = HtmlService.createTemplateFromFile('registro');
      break;
    case 'app':
      template = HtmlService.createTemplateFromFile('index');
      break;
    default:
      template = HtmlService.createTemplateFromFile('login');
  }

  return template.evaluate()
    .setTitle('MSO Chile - Transferencia al Puesto de Trabajo')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
}

/**
 * Include - permite incluir archivos HTML dentro de otros
 * Usado para css.html y js-utils.html
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Obtiene el contenido HTML de una vista parcial
 * Usado para cargar contenido dinámico en el layout principal
 */
function getVistaHTML(nombreVista) {
  try {
    return HtmlService.createHtmlOutputFromFile(nombreVista).getContent();
  } catch (e) {
    return '<div class="p-8 text-center text-red-500">Error al cargar la vista: ' + nombreVista + '</div>';
  }
}
