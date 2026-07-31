import { GRACE_PERIOD_DAYS } from "@/modules/tenancy/subscriptions";

// Minimal inline-styled HTML — no build step, no MJML, and email clients
// strip most CSS anyway. Kept deliberately plain (one accent color, system
// font stack) rather than matching per-tenant branding: these are platform
// and account-security emails (invite, reset, expiry), not customer-facing
// documents like the quote PDF, which already carries tenant branding.

function layout(bodyHtml: string): string {
  return `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:24px;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#18181b;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">
      ${bodyHtml}
      <p style="margin-top:32px;font-size:12px;color:#71717a;">VenderCRM</p>
    </div>
  </body>
</html>`;
}

function button(url: string, label: string): string {
  return `<a href="${url}" style="display:inline-block;margin-top:16px;padding:12px 20px;background:#18181b;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;">${label}</a>`;
}

export function invitationEmail(input: {
  tenantName: string;
  inviterName: string;
  acceptUrl: string;
}): { subject: string; html: string } {
  return {
    subject: `${input.inviterName} te invitó a ${input.tenantName} en VenderCRM`,
    html: layout(`
      <h1 style="font-size:18px;margin:0 0 8px;">Te invitaron a ${input.tenantName}</h1>
      <p style="font-size:14px;line-height:1.5;color:#3f3f46;">
        ${input.inviterName} te invitó a sumarte al equipo en VenderCRM. El enlace vence en 7 días.
      </p>
      ${button(input.acceptUrl, "Aceptar invitación")}
    `),
  };
}

export function passwordResetEmail(input: { resetUrl: string }): {
  subject: string;
  html: string;
} {
  return {
    subject: "Restablecer tu contraseña — VenderCRM",
    html: layout(`
      <h1 style="font-size:18px;margin:0 0 8px;">Restablecé tu contraseña</h1>
      <p style="font-size:14px;line-height:1.5;color:#3f3f46;">
        Pediste restablecer tu contraseña. Si no fuiste vos, ignorá este correo — el enlace vence en una hora.
      </p>
      ${button(input.resetUrl, "Elegir nueva contraseña")}
    `),
  };
}

export function subscriptionExpiryWarningEmail(input: {
  tenantName: string;
  expiresAt: Date;
  daysRemaining: number;
}): { subject: string; html: string } {
  const date = new Intl.DateTimeFormat("es-PY", { day: "2-digit", month: "long", year: "numeric" }).format(
    input.expiresAt,
  );
  return {
    subject: `Tu suscripción a VenderCRM vence en ${input.daysRemaining} días`,
    html: layout(`
      <h1 style="font-size:18px;margin:0 0 8px;">Tu suscripción vence pronto</h1>
      <p style="font-size:14px;line-height:1.5;color:#3f3f46;">
        La suscripción de <strong>${input.tenantName}</strong> vence el <strong>${date}</strong>.
        Después de esa fecha tenés ${GRACE_PERIOD_DAYS} días de acceso de solo lectura antes de que la cuenta
        se suspenda. Contactá a tu proveedor para renovar y evitar interrupciones.
      </p>
    `),
  };
}
