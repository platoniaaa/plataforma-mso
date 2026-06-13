// Templates HTML para correos MSO TPT. Todos brandeados con paleta MSO.
// Placeholders soportados: {{nombre}}, {{programa}}, {{fecha_cierre}},
// {{lider_nombre}}, {{dias}}, {{url_login}}, {{subset}}

const BRAND_PURPLE = "#3D0C4B";
const BRAND_ORANGE = "#F58220";
const CONTACT_EMAIL = (typeof Deno !== "undefined" && Deno.env.get("CONTACT_EMAIL")) || "carolinamendez@msochile.com";

function baseLayout(opts: { title: string; bodyHtml: string; ctaLabel?: string; ctaUrl?: string }) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${opts.title}</title>
</head>
<body style="margin:0;padding:0;background:#F8F9FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#2D3748;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8F9FA;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.05);">
        <tr><td style="background:${BRAND_PURPLE};padding:24px 32px;">
          <h1 style="color:#FFFFFF;margin:0;font-size:20px;font-weight:600;letter-spacing:0.5px;">MSO Chile · Plataforma TPT</h1>
          <p style="color:#E2E8F0;margin:4px 0 0;font-size:13px;">Transferencia al Puesto de Trabajo</p>
        </td></tr>
        <tr><td style="padding:32px;">
          <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;font-size:22px;">${opts.title}</h2>
          ${opts.bodyHtml}
          ${
    opts.ctaUrl && opts.ctaLabel
      ? `<div style="margin:28px 0 8px;text-align:center;">
            <a href="${opts.ctaUrl}" style="background:${BRAND_ORANGE};color:#FFFFFF;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">${opts.ctaLabel}</a>
          </div>`
      : ""
  }
        </td></tr>
        <tr><td style="background:#F8F9FA;padding:16px 32px;border-top:1px solid #E2E8F0;">
          <p style="color:#4A5568;font-size:12px;margin:0 0 8px;text-align:center;">
            ¿Tienes dudas? Escr&iacute;benos a <a href="mailto:${CONTACT_EMAIL}" style="color:${BRAND_PURPLE};text-decoration:none;font-weight:600;">${CONTACT_EMAIL}</a>
          </p>
          <p style="color:#718096;font-size:11px;margin:0;text-align:center;">
            MSO Chile · Modelos y Soluciones Organizacionales<br>
            Este correo fue generado automaticamente por la plataforma TPT.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function replaceTokens(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_m, k) => (vars[k] != null ? vars[k] : ""));
}

export interface TemplateVars {
  nombre?: string;
  programa?: string;
  fecha_cierre?: string;
  lider_nombre?: string;
  colaborador_nombre?: string;
  dias?: string;
  url_login?: string;
  asunto_manual?: string;
  cuerpo_manual_html?: string;
  reset_url?: string;
  fecha_cambio?: string;
  email?: string;
  password?: string;
}

export interface RenderedTemplate {
  asunto: string;
  html: string;
}

export function renderTemplate(tipo: string, vars: TemplateVars, urlLogin: string): RenderedTemplate {
  const v = { url_login: urlLogin, ...vars };

  switch (tipo) {
    case "bienvenida": {
      const asunto = replaceTokens("Bienvenido/a al programa {{programa}}", v);
      const credsBox = (v.email && v.password)
        ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;">
             <tr><td style="background:#F8F4FB;border:1px solid #E2D4EC;border-radius:8px;padding:16px 20px;">
               <p style="font-size:12px;color:${BRAND_PURPLE};margin:0 0 10px;font-weight:700;letter-spacing:0.5px;">TUS CREDENCIALES DE ACCESO</p>
               <p style="font-size:14px;line-height:1.9;color:#2D3748;margin:0;">
                 <strong>Correo:</strong> ${v.email}<br>
                 <strong>Contrase&ntilde;a:</strong> ${v.password}
               </p>
             </td></tr>
           </table>`
        : "";
      const body = `
        <p style="font-size:15px;line-height:1.6;">Hola <strong>${v.nombre || "participante"}</strong>,</p>
        <p style="font-size:14px;line-height:1.6;color:#4A5568;">Has sido agregado al programa de desarrollo de liderazgo <strong>${v.programa || ""}</strong> en la plataforma MSO TPT.</p>
        ${credsBox}
        <p style="font-size:14px;line-height:1.6;color:#4A5568;"><strong>Importante:</strong> tu cuenta ya est&aacute; creada. <strong>No uses la opci&oacute;n "Crear cuenta"</strong>: ingresa directamente con el bot&oacute;n de abajo usando el correo y la contrase&ntilde;a indicados.</p>
        <p style="font-size:13px;line-height:1.6;color:#718096;">Te recomendamos cambiar tu contrase&ntilde;a en tu primer acceso, desde la opci&oacute;n "&iquest;Olvidaste tu contrase&ntilde;a?" del login.</p>
        <p style="font-size:13px;line-height:1.6;color:#718096;margin-top:16px;">Si tienes dudas, contacta al equipo MSO.</p>
      `;
      return { asunto, html: baseLayout({ title: "Te damos la bienvenida", bodyHtml: body, ctaLabel: "Ingresar a la plataforma", ctaUrl: v.url_login }) };
    }

    case "encuesta_disponible_auto": {
      const asunto = replaceTokens("Autoevaluacion disponible en {{programa}}", v);
      const body = `
        <p style="font-size:15px;line-height:1.6;">Hola <strong>${v.nombre || ""}</strong>,</p>
        <p style="font-size:14px;line-height:1.6;color:#4A5568;">Tienes una <strong>autoevaluacion activa</strong> en el programa <strong>${v.programa || ""}</strong>.</p>
        ${v.fecha_cierre ? `<p style="font-size:14px;line-height:1.6;color:#4A5568;">Fecha de cierre: <strong>${v.fecha_cierre}</strong></p>` : ""}
        <p style="font-size:14px;line-height:1.6;color:#4A5568;">Ingresa a la plataforma para completarla. Tu respuesta honesta es clave para tu plan de desarrollo.</p>
      `;
      return { asunto, html: baseLayout({ title: "Nueva autoevaluacion disponible", bodyHtml: body, ctaLabel: "Responder ahora", ctaUrl: v.url_login }) };
    }

    case "encuesta_disponible_co": {
      const asunto = replaceTokens("Coevaluacion disponible en {{programa}}", v);
      const body = `
        <p style="font-size:15px;line-height:1.6;">Hola <strong>${v.nombre || ""}</strong>,</p>
        <p style="font-size:14px;line-height:1.6;color:#4A5568;">Debes coevaluar a tu lider <strong>${v.lider_nombre || ""}</strong> en el programa <strong>${v.programa || ""}</strong>.</p>
        ${v.fecha_cierre ? `<p style="font-size:14px;line-height:1.6;color:#4A5568;">Fecha de cierre: <strong>${v.fecha_cierre}</strong></p>` : ""}
        <p style="font-size:14px;line-height:1.6;color:#4A5568;">Tu opinion es anonima y fundamental para el proceso de desarrollo de liderazgo.</p>
      `;
      return { asunto, html: baseLayout({ title: "Nueva coevaluacion disponible", bodyHtml: body, ctaLabel: "Responder ahora", ctaUrl: v.url_login }) };
    }

    case "recordatorio": {
      const diasNum = parseInt(v.dias || "", 10);
      let asunto: string;
      let plazoMsg: string;
      let urgenciaMsg: string;
      if (!isNaN(diasNum) && diasNum === 0) {
        asunto = replaceTokens("Cierra hoy: encuesta pendiente en {{programa}}", v);
        plazoMsg = `La encuesta <strong>cierra hoy</strong> (${v.fecha_cierre || ""}). Esta es tu ultima oportunidad para responder.`;
        urgenciaMsg = "Ingresa ahora y completa la encuesta antes del cierre.";
      } else if (!isNaN(diasNum) && diasNum === 1) {
        asunto = replaceTokens("Recordatorio: encuesta cierra manana en {{programa}}", v);
        plazoMsg = `Queda <strong>1 dia</strong> para responder. Cierre: <strong>${v.fecha_cierre || ""}</strong>.`;
        urgenciaMsg = "No la dejes para ultima hora: ingresa hoy y completa la encuesta.";
      } else {
        asunto = replaceTokens("Recordatorio: encuesta pendiente en {{programa}}", v);
        plazoMsg = `Quedan <strong>${v.dias || "pocos"} dias</strong> para responder. Cierre: <strong>${v.fecha_cierre || ""}</strong>.`;
        urgenciaMsg = "Ingresa cuando puedas y completa tu encuesta dentro del plazo.";
      }
      const body = `
        <p style="font-size:15px;line-height:1.6;">Hola <strong>${v.nombre || ""}</strong>,</p>
        <p style="font-size:14px;line-height:1.6;color:#4A5568;">Aun no has respondido tu encuesta en el programa <strong>${v.programa || ""}</strong>.</p>
        <p style="font-size:14px;line-height:1.6;color:#4A5568;">${plazoMsg}</p>
        <p style="font-size:14px;line-height:1.6;color:#4A5568;">${urgenciaMsg}</p>
      `;
      return { asunto, html: baseLayout({ title: "Encuesta pendiente", bodyHtml: body, ctaLabel: "Responder encuesta", ctaUrl: v.url_login }) };
    }

    case "confirmacion": {
      const asunto = replaceTokens("Respuesta registrada en {{programa}}", v);
      const body = `
        <p style="font-size:15px;line-height:1.6;">Hola <strong>${v.nombre || ""}</strong>,</p>
        <p style="font-size:14px;line-height:1.6;color:#4A5568;">Recibimos tu respuesta correctamente. Gracias por participar en el programa <strong>${v.programa || ""}</strong>.</p>
        <p style="font-size:14px;line-height:1.6;color:#4A5568;">Cuando se cierre la medicion y se procesen los resultados, podras revisar tu informe en la plataforma.</p>
      `;
      return { asunto, html: baseLayout({ title: "Respuesta recibida", bodyHtml: body }) };
    }

    case "manual": {
      // El Admin escribe asunto y cuerpo, aqui solo envolvemos en el layout
      const asunto = v.asunto_manual || "Comunicacion del programa";
      const body = v.cuerpo_manual_html || "";
      return { asunto, html: baseLayout({ title: asunto, bodyHtml: body, ctaLabel: "Ingresar a la plataforma", ctaUrl: v.url_login }) };
    }

    case "notif_lider_coeval": {
      const asunto = "Tu colaborador completo la coevaluacion - " + (v.programa || "MSO TPT");
      const body = `
        <p style="font-size:15px;line-height:1.6;">Hola <strong>${v.nombre || "lider"}</strong>,</p>
        <p style="font-size:14px;line-height:1.6;color:#4A5568;">Te informamos que tu colaborador <strong>${v.colaborador_nombre || ""}</strong> acaba de completar la coevaluacion en el programa <strong>${v.programa || ""}</strong>.</p>
        <p style="font-size:14px;line-height:1.6;color:#4A5568;">Cuando todos tus colaboradores hayan respondido y la medicion se cierre, podras revisar tu informe individual con el analisis de brechas.</p>
      `;
      return { asunto, html: baseLayout({ title: "Coevaluacion completada", bodyHtml: body, ctaLabel: "Ingresar a la plataforma", ctaUrl: v.url_login }) };
    }

    case "reset_request": {
      const asunto = "Restablecimiento de contrasena - MSO TPT";
      const body = `
        <p style="font-size:15px;line-height:1.6;">Hola <strong>${v.nombre || ""}</strong>,</p>
        <p style="font-size:14px;line-height:1.6;color:#4A5568;">Recibimos una solicitud para restablecer tu contrasena en la plataforma MSO TPT.</p>
        <p style="font-size:14px;line-height:1.6;color:#4A5568;">Haz click en el boton a continuacion para elegir una nueva contrasena. <strong>Este link expira en 1 hora</strong> y solo puede usarse una vez.</p>
        <p style="font-size:13px;line-height:1.6;color:#718096;margin-top:24px;"><strong>Si no fuiste tu</strong> quien solicito este cambio, puedes ignorar este correo. Tu cuenta sigue segura y tu contrasena no ha cambiado.</p>
      `;
      return { asunto, html: baseLayout({ title: "Restablecer contrasena", bodyHtml: body, ctaLabel: "Restablecer contrasena", ctaUrl: v.reset_url || "#" }) };
    }

    case "reset_confirmacion": {
      const asunto = "Tu contrasena fue actualizada - MSO TPT";
      const body = `
        <p style="font-size:15px;line-height:1.6;">Hola <strong>${v.nombre || ""}</strong>,</p>
        <p style="font-size:14px;line-height:1.6;color:#4A5568;">Tu contrasena en la plataforma MSO TPT fue actualizada exitosamente${v.fecha_cambio ? ` el <strong>${v.fecha_cambio}</strong>` : ""}.</p>
        <p style="font-size:14px;line-height:1.6;color:#4A5568;">Ya puedes iniciar sesion con tu nueva contrasena.</p>
        <div style="background:#FEF3C7;border-left:4px solid #F59E0B;padding:12px 16px;border-radius:6px;margin:20px 0;">
          <p style="font-size:13px;color:#92400E;margin:0;"><strong>&#9888; Si no fuiste tu</strong> quien cambio la contrasena, contacta al equipo MSO <strong>urgentemente</strong>.</p>
        </div>
      `;
      return { asunto, html: baseLayout({ title: "Contrasena actualizada", bodyHtml: body, ctaLabel: "Iniciar sesion", ctaUrl: v.url_login }) };
    }

    default:
      return { asunto: "Notificacion MSO TPT", html: baseLayout({ title: "Notificacion", bodyHtml: "<p>Mensaje automatico.</p>" }) };
  }
}
