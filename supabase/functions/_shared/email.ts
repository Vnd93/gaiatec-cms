// E-mails transacionais branded (Gaiatec Sistemas), enviados via Resend.
// Usado pelas Edge Functions rdo-invite e rdo-team (não dependem do template do GoTrue).

const FROM = "Gaiatec Sistemas <nao-responda@gaiatecsistemas.com>";
const LOGO = "https://gaiatecsistemas.com.br/logo-gaiatec.png";

function shell(opts: { heading: string; body: string; button: string; link: string; footer: string }): string {
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:0;background:#f4f4f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e7e7ea;border-radius:14px;overflow:hidden;font-family:Montserrat,Arial,Helvetica,sans-serif;">
<tr><td style="padding:30px 34px 0 34px;">
<img src="${LOGO}" alt="Gaiatec Sistemas" width="195" style="display:block;border:0;height:auto;outline:none;text-decoration:none;" />
<div style="margin-top:16px;font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#71717a;font-weight:600;">Relatório Diário de Obra</div>
<div style="height:1px;background:#e7e7ea;margin-top:22px;"></div></td></tr>
<tr><td style="padding:26px 34px 0 34px;">
<h1 style="margin:0;font-size:21px;font-weight:600;color:#09090b;letter-spacing:-0.4px;">${opts.heading}</h1>
<p style="margin:14px 0 0 0;font-size:14px;line-height:1.65;color:#3f3f46;">${opts.body}</p></td></tr>
<tr><td style="padding:24px 34px 4px 34px;">
<a href="${opts.link}" style="display:inline-block;background:#0057de;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:13px 32px;border-radius:8px;font-family:Montserrat,Arial,Helvetica,sans-serif;">${opts.button}</a></td></tr>
<tr><td style="padding:16px 34px 30px 34px;">
<p style="margin:0;font-size:12px;line-height:1.6;color:#a1a1aa;">Se o botão não funcionar, copie e cole este link no navegador:<br />
<a href="${opts.link}" style="color:#0057de;word-break:break-all;">${opts.link}</a></p></td></tr>
<tr><td style="padding:18px 34px;background:#fafafa;border-top:1px solid #e7e7ea;">
<p style="margin:0;font-size:11px;line-height:1.6;color:#a1a1aa;">Gaiatec Sistemas — Acompanhamento de Obra · ${opts.footer}</p></td></tr>
</table></td></tr></table></body></html>`;
}

export function inviteEmail(link: string) {
  return {
    subject: "Seu acesso ao Relatório Diário de Obra — Gaiatec Sistemas",
    html: shell({
      heading: "Você recebeu um acesso",
      body: "A <strong>Gaiatec Sistemas</strong> convidou você para o sistema de <strong>Relatório Diário de Obra</strong>. Crie sua senha para começar a registrar e acompanhar as obras.",
      button: "Criar minha senha",
      link,
      footer: "Se você não esperava este convite, pode ignorá-lo com segurança.",
    }),
  };
}

export function recoveryEmail(link: string) {
  return {
    subject: "Definir senha — Relatório Diário de Obra (Gaiatec Sistemas)",
    html: shell({
      heading: "Defina sua senha de acesso",
      body: "Recebemos um pedido para criar ou redefinir a sua senha de acesso ao <strong>Relatório Diário de Obra</strong> da <strong>Gaiatec Sistemas</strong>. Clique abaixo para definir uma nova senha.",
      button: "Definir senha",
      link,
      footer: "Se você não solicitou, pode ignorar este e-mail.",
    }),
  };
}

/** Envia um e-mail via Resend. Lança em caso de falha. */
export async function sendEmail(resendKey: string, to: string, msg: { subject: string; html: string }): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [to], subject: msg.subject, html: msg.html }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Resend ${res.status}: ${t.slice(0, 200)}`);
  }
}
