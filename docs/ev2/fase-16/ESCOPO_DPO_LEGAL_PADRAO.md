# Escopo DPO/legal padrão para o go-live

**Versão:** 1.0<br>
**Data:** 5 de setembro de 2026<br>
**Aprovador operacional declarado:** `@Vnd93`, Administrador da GAIATEC SISTEMAS<br>
**Estado:** conteúdo aprovado em princípio; confirmação cadastral do encarregado público pendente

## Identificação vigente

- Controlador: Gaiatec Comércio e Serviços de Automação e Sistema do Brasil Ltda.;
- CNPJ: 06.176.620/0001-62;
- sede: Rua Heróis da Força Expedicionária Brasileira, 22 — Parque Novo Mundo, São Paulo/SP,
  CEP 02188-040;
- encarregado publicado: Marcelo Diaz;
- canal publicado para titulares: `vendas@gaiatecsistemas.com.br`;
- responsável pela aprovação deste escopo e pela operação do projeto: `@Vnd93`.

A identidade e o canal do encarregado já estão na Política de Privacidade. Antes do go-live, o
responsável precisa apenas confirmar que continuam corretos ou informar a substituição. Não é
necessário registrar CPF nem outro dado pessoal sem finalidade.

## Regras aprovadas

1. coletar somente os dados necessários à solicitação, conta ou operação informada;
2. informar finalidade, base legal, retenção, compartilhamentos e direitos de forma clara;
3. manter contato comercial por 365 dias e newsletter por até 730 dias ou até revogação;
4. permitir acesso, correção, oposição, revogação e eliminação/anonimização quando aplicável;
5. proteger contas administrativas com menor privilégio, MFA, RLS e auditoria;
6. manter logs e backups somente pelo prazo necessário, com acesso restrito e cópia externa cifrada;
7. comunicar e tratar incidentes conforme gravidade e obrigações legais;
8. usar Cloudflare, Supabase, Resend e Google Fonts apenas no limite necessário ao serviço;
9. manter qualquer provedor externo de IA desligado até nova avaliação específica;
10. reavaliar este escopo se finalidade, categoria de dados, retenção, subprocessador ou domínio
    produtivo mudar.

## Fluxos cobertos

- formulários de contato, orçamento e newsletter;
- leads, atribuição, exportação auditada, anonimização e retenção;
- contas CMS, permissões, MFA, sessões e trilha de auditoria;
- RDO e assinaturas dentro das finalidades contratuais documentadas;
- e-mails transacionais via Resend, sem incluir dados além do mínimo necessário;
- hospedagem/CDN no Cloudflare e persistência/autenticação no Supabase;
- backup externo cifrado e restauração de contingência.

## Condições de produção

Este aceite não substitui os controles técnicos. O go-live continua condicionado ao SHA final,
CI, canary, backup/restore, CSP, entrega sintética de e-mail, secrets protegidos e autorização
literal `AUTORIZO-G12-PRODUCAO:<SHA completo>`.

Este registro formaliza uma decisão interna de governança baseada na LGPD e nas orientações da
ANPD. Não declara a emissão de parecer por escritório jurídico externo.
