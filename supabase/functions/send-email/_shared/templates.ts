// Templates HTML para correos MSO TPT. Todos brandeados con paleta MSO.
// Placeholders soportados: {{nombre}}, {{programa}}, {{fecha_cierre}},
// {{lider_nombre}}, {{dias}}, {{url_login}}, {{subset}}

const BRAND_PURPLE = "#3D0C4B";
const BRAND_ORANGE = "#F58220";

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
  dias?: string;
  url_login?: string;
  asunto_manual?: string;
  cuerpo_manual_html?: string;
  reset_url?: string;
  fecha_cambio?: string;
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
      const body = `
        <p style="font-size:15px;line-height:1.6;">Hola <strong>${v.nombre || "participante"}</strong>,</p>
        <p style="font-size:14px;line-height:1.6;color:#4A5568;">Has sido agregado al programa de desarrollo de liderazgo <strong>${v.programa || ""}</strong> en la plataforma MSO TPT.</p>
        <p style="font-size:14px;line-height:1.6;color:#4A5568;">Durante el programa responderas encuestas de evaluacion y podras revisar tu progreso y feedback. Ingresa a la plataforma cuando recibas las notificaciones correspondientes.</p>
        <p style="font-size:13px;line-height:1.6;color:#718096;margin-top:20px;">Si tienes dudas, contacta al equipo MSO.</p>
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
      const asunto = replaceTokens("Recordatorio: encuesta pendiente en {{programa}}", v);
      const body = `
        <p style="font-size:15px;line-height:1.6;">Hola <strong>${v.nombre || ""}</strong>,</p>
        <p style="font-size:14px;line-height:1.6;color:#4A5568;">Aun no has respondido tu encuesta en el programa <strong>${v.programa || ""}</strong>.</p>
        <p style="font-size:14px;line-height:1.6;color:#4A5568;">Quedan <strong>${v.dias || "pocos"} dia(s)</strong> para la fecha de cierre (<strong>${v.fecha_cierre || ""}</strong>).</p>
        <p style="font-size:14px;line-height:1.6;color:#4A5568;">No demores tu participacion: ingresa y completa la encuesta hoy.</p>
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
