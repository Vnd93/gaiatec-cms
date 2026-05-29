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

export interface ResumoRelatorio {
  id?: string;
  contrato: string;
  cliente: string;
  cnpj?: string;
  razaoSocial?: string;
  nomeFantasia?: string;
  engGaiatec?: string;
  crea?: string;
  engCliente?: string;
  creaCliente?: string;
  emailCliente?: string;
  inicio?: string;
  fim?: string;
  local?: string;
  fotos?: number;
  assinatura?: string;
  finalizadoPor?: string;
  finalizadoEm?: string;
}

function resumoRows(r: ResumoRelatorio): string {
  const row = (label: string, value?: string) =>
    value && String(value).trim()
      ? `<tr><td style="padding:8px 0;border-bottom:1px solid #f0f0f1;font-size:10.5px;color:#a1a1aa;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;width:44%;vertical-align:top;">${label}</td><td style="padding:8px 0;border-bottom:1px solid #f0f0f1;font-size:13px;color:#27272a;line-height:1.5;">${value}</td></tr>`
      : "";
  return [
    row("Contrato", r.contrato),
    row("Cliente", r.cliente),
    row("CNPJ", r.cnpj),
    row("Razão social", r.razaoSocial),
    row("Nome fantasia", r.nomeFantasia),
    row("Eng. Gaiatec Sistemas", r.engGaiatec),
    row("CREA (Gaiatec)", r.crea),
    row("Eng. do cliente", r.engCliente),
    row("CREA (cliente)", r.creaCliente),
    row("E-mail do cliente", r.emailCliente),
    row("Início", r.inicio),
    row("Término", r.fim),
    row("Localização", r.local),
    row("Fotos", r.fotos != null ? String(r.fotos) : ""),
    row("Assinatura", r.assinatura),
    row("Finalizado por", r.finalizadoPor),
    row("Finalizado em", r.finalizadoEm),
  ].join("");
}

function resumoShell(opts: { badge: string; badgeBg: string; badgeColor: string; badgeBorder: string; heading: string; intro: string; rows: string; footer: string }): string {
  const link = "https://gaiatecsistemas.com.br/relatorio-de-obra";
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:0;background:#f4f4f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e7e7ea;border-radius:14px;overflow:hidden;font-family:Montserrat,Arial,Helvetica,sans-serif;">
<tr><td style="padding:30px 34px 0 34px;">
<img src="${LOGO}" alt="Gaiatec Sistemas" width="195" style="display:block;border:0;height:auto;outline:none;text-decoration:none;" />
<div style="margin-top:16px;font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#71717a;font-weight:600;">Relatório Diário de Obra</div>
<div style="height:1px;background:#e7e7ea;margin-top:22px;"></div></td></tr>
<tr><td style="padding:24px 34px 0 34px;">
<span style="display:inline-block;background:${opts.badgeBg};color:${opts.badgeColor};border:1px solid ${opts.badgeBorder};font-size:10px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;padding:3px 10px;border-radius:6px;">${opts.badge}</span>
<h1 style="margin:14px 0 0 0;font-size:21px;font-weight:600;color:#09090b;letter-spacing:-0.4px;">${opts.heading}</h1>
<p style="margin:12px 0 0 0;font-size:14px;line-height:1.65;color:#3f3f46;">${opts.intro}</p></td></tr>
<tr><td style="padding:18px 34px 0 34px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${opts.rows}</table></td></tr>
<tr><td style="padding:22px 34px 4px 34px;">
<a href="${link}" style="display:inline-block;background:#0057de;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 28px;border-radius:8px;font-family:Montserrat,Arial,Helvetica,sans-serif;">Abrir no sistema</a></td></tr>
<tr><td style="padding:18px 34px;background:#fafafa;border-top:1px solid #e7e7ea;margin-top:18px;">
<p style="margin:0;font-size:11px;line-height:1.6;color:#a1a1aa;">${opts.footer}</p></td></tr>
</table></td></tr></table></body></html>`;
}

/** E-mail ao admin quando um relatório é finalizado (PDF vai anexado). */
export function relatorioFinalizadoEmail(r: ResumoRelatorio) {
  const html = resumoShell({
    badge: "Finalizado",
    badgeBg: "#fff1e6",
    badgeColor: "#e2640b",
    badgeBorder: "#f87010",
    heading: "Relatório finalizado",
    intro: "Um relatório foi finalizado no sistema. O <strong>PDF completo está anexado</strong> a este e-mail. Resumo abaixo.",
    rows: resumoRows(r),
    footer: "Gaiatec Sistemas — Acompanhamento de Obra · Notificação automática de relatório finalizado.",
  });
  return { subject: `RDO finalizado — ${r.contrato || "sem contrato"} · ${r.cliente || "sem cliente"}`, html };
}

/** E-mail (admins + cliente) quando o relatório é totalmente assinado (PDF anexado). */
export function relatorioAssinadoEmail(r: ResumoRelatorio) {
  const html = resumoShell({
    badge: "Assinado",
    badgeBg: "#e8f5ee",
    badgeColor: "#1a7f43",
    badgeBorder: "#34a36a",
    heading: "Relatório assinado",
    intro: "O relatório foi <strong>assinado eletronicamente</strong> por todas as partes. O <strong>PDF assinado está anexado</strong> a este e-mail. Resumo abaixo.",
    rows: resumoRows(r),
    footer: "Gaiatec Sistemas — Acompanhamento de Obra · Assinatura eletrônica registrada (data, hora e identificação).",
  });
  return { subject: `RDO assinado — ${r.contrato || "sem contrato"} · ${r.cliente || "sem cliente"}`, html };
}

/** E-mail ao cliente com o link para assinar o relatório remotamente. */
export function assinarClienteEmail(link: string, r: ResumoRelatorio) {
  return {
    subject: `Assine o Relatório Diário de Obra — ${r.contrato || "Gaiatec Sistemas"}`,
    html: shell({
      heading: "Assine o relatório de obra",
      body: `A <strong>Gaiatec Sistemas</strong> finalizou o Relatório Diário de Obra${r.contrato ? ` <strong>${r.contrato}</strong>` : ""}${r.cliente ? ` referente a <strong>${r.cliente}</strong>` : ""} e solicita a sua assinatura eletrônica. Clique no botão abaixo para revisar e assinar — é rápido e pode ser feito pelo celular.`,
      button: "Revisar e assinar",
      link,
      footer: "Se você não reconhece esta solicitação, pode ignorar este e-mail com segurança.",
    }),
  };
}

/** Envia um e-mail via Resend (1+ destinatários, com anexos opcionais). Lança em caso de falha. */
export async function sendEmail(
  resendKey: string,
  to: string | string[],
  msg: { subject: string; html: string; attachments?: { filename: string; content: string }[] },
): Promise<void> {
  const payload: Record<string, unknown> = {
    from: FROM,
    to: Array.isArray(to) ? to : [to],
    subject: msg.subject,
    html: msg.html,
  };
  if (msg.attachments?.length) payload.attachments = msg.attachments;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Resend ${res.status}: ${t.slice(0, 200)}`);
  }
}
