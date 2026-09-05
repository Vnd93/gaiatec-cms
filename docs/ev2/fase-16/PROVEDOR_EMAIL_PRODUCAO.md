# Provedor real de e-mail transacional

## Decisão

O provedor real definido é **Resend**, coerente com as Edge Functions existentes e com o canary já
validado em staging.

| Parâmetro            | Valor produtivo                              |
| -------------------- | -------------------------------------------- |
| provider             | `resend`                                     |
| domínio de envio     | `gaiatecsistemas.com`                        |
| remetente            | `GAIATEC SISTEMAS <cms@gaiatecsistemas.com>` |
| notificação de leads | `comercial@gaiatecsistemas.com.br`           |
| origem pública       | `https://gaiatecsistemas.com.br`             |

A chave produtiva deve ser exclusiva, do tipo `sending_access`, restrita ao domínio
`gaiatecsistemas.com`, não reutilizada de staging, e armazenada como
`RESEND_API_KEY` nos secrets do projeto Supabase de produção. Para o preflight verificável, a mesma
credencial deve existir temporariamente no ambiente GitHub `production`; nunca em arquivo, chat,
log, secret de repositório ou variável pública.

## Verificação vinculante

O workflow `.github/workflows/verify-production-email.yml`:

1. só executa em `main`, sob o ambiente `production`;
2. exige `VERIFY-RESEND-PRODUCTION:<SHA completo>`;
3. prova o domínio ao enviar exatamente por `cms@gaiatecsistemas.com`; o Resend recusa domínio não
   verificado;
4. envia mensagem sem dados pessoais somente a `EMAIL_SYNTHETIC_TO`, obrigatoriamente corporativo;
5. consulta o ID até o evento `delivered`, `opened` ou `clicked`;
6. publica evidência sem API key e vinculada ao SHA.

O Resend documenta a integração com Supabase e a consulta do último evento de uma mensagem:
<https://resend.com/docs/knowledge-base/getting-started-with-resend-and-supabase> e
<https://resend.com/docs/api-reference/emails/retrieve-email>.

## Pendências externas

- criar a chave produtiva com menor privilégio aplicável;
- definir a caixa corporativa sintética (`EMAIL_SYNTHETIC_TO`);
- validar DPA, retenção, conteúdo e bases legais com DPO/legal;
- executar o workflow e anexar o run/artefato ao registro G12.

Até isso ocorrer, as funções devem falhar fechado e nenhum fluxo real de e-mail é liberado.
