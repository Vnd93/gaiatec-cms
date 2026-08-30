# Guia operacional — CMS, pendências e testes

**Ambiente deste guia:** staging

**CMS:** `https://gaiatec-cms-staging.pages.dev/admin/login`

**Site:** `https://gaiatec-cms-staging.pages.dev`

Produção não deve ser usada enquanto o Gate G8 estiver bloqueado.

## 1. O que já foi resolvido

- Super Admin `comercial@gaiatecsistemas.com.br` criado anteriormente;
- destino de notificações configurado para `comercial@gaiatecsistemas.com.br`;
- formulário `contato-principal` criado, versionado, publicado e exibido em `/contato`;
- formulário `newsletter` criado, versionado, publicado e exibido no footer;
- envio público de contato testado com fixture sintética e protocolo confirmado;
- fixture de teste anonimizada após a validação;
- remetente de e-mail corrigido para `.com.br` e tornado configurável por `EMAIL_FROM`;
- visibilidade público/interno e cadastro em massa homologados com dados sintéticos;
- produção e conteúdo do painel antigo não foram utilizados.

## 2. Configurar o envio de e-mail pelo Resend

Esta etapa exige uma conta Resend e acesso ao DNS do domínio. A chave nunca deve ser enviada por chat, salva em documento ou commitada no Git.

### 2.1 Criar e verificar o domínio

1. Acesse `https://resend.com` e crie ou entre na conta corporativa.
2. Abra **Domains** e escolha **Add Domain**.
3. Para manter o remetente já configurado, informe `gaiatecsistemas.com.br`.
4. Habilite somente envio. Não habilite recebimento: o recebimento corporativo atual não deve ser alterado.
5. Se o DNS estiver no Cloudflare, prefira **Sign in to Cloudflare** para o Domain Connect automático.
6. Se fizer manualmente, copie exatamente os registros apresentados pelo Resend:
   - DKIM em TXT;
   - SPF/Return-Path nos nomes indicados pelo Resend;
   - MX de envio no subdomínio indicado, normalmente `send`.
7. Não apague nem substitua os registros MX corporativos já existentes no domínio raiz.
8. Volte ao Resend, clique em **Verify DNS Records** e aguarde o estado **Verified**.

Referências oficiais: [domínios no Resend](https://resend.com/docs/dashboard/domains/introduction) e [configuração com Cloudflare](https://resend.com/docs/knowledge-base/cloudflare).

### 2.2 Criar a chave restrita

1. No Resend, abra **API Keys**.
2. Crie uma chave chamada `GAIATEC CMS Staging`.
3. Selecione **Sending access**; não use `Full access`.
4. Se a interface permitir, restrinja a chave ao domínio verificado.
5. Copie a chave no momento da criação. O Resend a mostra apenas uma vez.

### 2.3 Salvar no Supabase sem expor a chave

Opção pela interface:

1. Acesse o projeto staging `glcqsosxwgmlhzgcsnzv` no Supabase.
2. Abra **Edge Functions → Secrets Management**.
3. Adicione:
   - nome `RESEND_API_KEY`; valor: a chave iniciada por `re_`;
   - nome `EMAIL_FROM`; valor `GAIATEC SISTEMAS <nao-responda@gaiatecsistemas.com.br>`.
4. Salve. Não é necessário republicar as funções após alterar secrets.

Opção pelo terminal, sem gravar a chave em arquivo:

```powershell
npx supabase secrets set "RESEND_API_KEY=re_COLE_A_CHAVE_AQUI" "EMAIL_FROM=GAIATEC SISTEMAS <nao-responda@gaiatecsistemas.com.br>" --project-ref glcqsosxwgmlhzgcsnzv
```

Referência oficial: [secrets de Edge Functions no Supabase](https://supabase.com/docs/guides/functions/secrets).

### 2.4 Ativar o processamento periódico

O worker `cms-outbox-worker` deve rodar a cada cinco minutos. A configuração recomendada usa Supabase Cron, `pg_cron`, `pg_net` e Vault, mantendo `OUTBOX_WORKER_SECRET` fora do SQL e dos logs.

Depois que a chave Resend estiver configurada, solicitar a configuração/validação do cron. Não criar um cron contendo secrets em texto aberto. A execução deve aparecer em **Integrations → Cron → Jobs**, e o histórico deve mostrar HTTP 200.

Referência oficial: [agendar Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions).

## 3. Aprovar LGPD/DPO

O responsável deve revisar e registrar aceite dos seguintes valores de staging:

| Formulário        | Finalidade                                               |       SLA | Retenção | Consentimento                              |
| ----------------- | -------------------------------------------------------- | --------: | -------: | ------------------------------------------ |
| Contato principal | responder solicitações comerciais, técnicas e de suporte |   240 min | 365 dias | uso dos dados para responder à solicitação |
| Newsletter        | comunicações e conteúdos técnicos voluntários            | 1.440 min | 730 dias | envio de novidades e comunicações          |

O responsável deve confirmar:

1. se os textos são adequados à Política de Privacidade;
2. se os prazos de retenção são necessários e proporcionais;
3. quem pode acessar, exportar, atribuir e anonimizar leads;
4. qual processo atende exclusão, correção ou acesso do titular;
5. se a newsletter precisa de confirmação dupla (`double opt-in`) antes de produção.

Qualquer alteração deve gerar uma nova versão do formulário. Nunca editar ou apagar silenciosamente o histórico anterior.

## 4. Cadastrar dados permanentes do site

### Contato, WhatsApp, endereço e redes sociais

1. Entre em `/admin/login`.
2. Abra **Estrutura do site**.
3. Selecione **Dados globais**.
4. Preencha nome, razão social, telefone, WhatsApp, e-mail, endereço, CTA e redes sociais.
5. Informe o motivo da alteração.
6. Clique **Criar documento** ou **Salvar rascunho**.
7. Use **Preview técnico**.
8. Execute **Enviar para revisão → Aprovar → Publicar agora**.
9. Confirme os dados em `/contato`, no header e no footer.

### Produtos e demais conteúdos

- criar manualmente ou usar a planilha oficial vazia em **Produtos → Cadastro em massa**;
- cadastrar apenas conteúdo novo e autorizado;
- imagens e documentos devem ser enviados separadamente em **Mídia**, com origem e direitos;
- nunca usar exportação do painel antigo;
- todo conteúdo precisa passar por rascunho, revisão, aprovação e publicação.

## 5. Como comprovar que o CMS altera o site

### Teste A — alterar um rótulo do formulário

1. Abra **Campanhas e formulários → Formulários versionados**.
2. Clique em **Contato principal** na coluna esquerda.
3. Troque o rótulo `Empresa` por `Empresa / Organização`.
4. Preencha o motivo: `Teste de conexão CMS com frontend`.
5. Clique **Salvar nova versão**.
6. Selecione novamente **Contato principal**.
7. Em **Publicação**, publique a versão mais recente.
8. Confirme o MFA quando solicitado.
9. Aguarde até 60 segundos e atualize `/contato` com `Ctrl+F5`.
10. O novo rótulo deve aparecer sem rebuild ou alteração de código.

Para desfazer, publique novamente a versão anterior ou crie outra versão restaurando `Empresa`.

### Teste B — enviar um contato

1. Abra `/contato`.
2. Preencha os campos com dados de teste claramente identificados.
3. Aceite o consentimento e envie.
4. Guarde o protocolo `LD-...` mostrado na tela.
5. No CMS, abra **Leads** e procure o protocolo.
6. Confirme origem `/contato`, consentimento, SLA e status `new`.
7. Atribua, altere o status e verifique o histórico.
8. Depois do teste, use **Anonimizar** para retirar os dados pessoais.

Sem `RESEND_API_KEY`, o lead aparece no CMS, mas o e-mail fica em retry. Depois da configuração do Resend e do cron, o mesmo teste deve também chegar a `comercial@gaiatecsistemas.com.br`.

### Teste C — campo público ou interno de produto

1. Use somente um produto sintético de staging.
2. Abra **Produtos → editar → Público ou interno**.
3. Marque fabricante como **Somente interno**.
4. Salve, envie para revisão, aprove e publique.
5. Confirme que fabricante não aparece na página, busca, filtros ou código estruturado.
6. Abra uma nova versão, marque **Público no site**, repita o workflow e confirme que o valor passa a aparecer.
7. Arquive a fixture depois do teste.

### Teste D — cadastro em massa

1. Abra **Produtos → Cadastro em massa**.
2. Baixe a planilha-modelo vazia.
3. Preencha dois produtos inteiramente sintéticos.
4. Primeiro deixe um erro intencional e valide: devem ser criados zero produtos.
5. Corrija e execute a pré-validação: ainda devem ser criados zero produtos.
6. Confirme a declaração de conteúdo novo e crie o lote.
7. Verifique que surgiram exatamente dois rascunhos e nenhum item foi publicado.
8. Remova/arquive as fixtures após o teste.

## 6. Regra para saber quando a mudança aparece

- **Salvar rascunho:** não altera o site público.
- **Enviar para revisão/aprovar:** não altera o site público.
- **Publicar:** atualiza a projeção pública.
- **Cache:** a alteração pode levar até 60 segundos; use `Ctrl+F5` para conferir.
- **Campo interno:** nunca é enviado à API pública, busca, HTML ou JSON-LD.
- **Arquivar:** remove imediatamente a publicação e aplica a regra 404/410/redirect quando houver rota.

## 7. Aprovação de go-live

Somente aprovar depois de:

1. e-mail Resend e cron comprovados;
2. LGPD/DPO aprovado;
3. conteúdo real novo revisado;
4. teste desktop/mobile concluído;
5. backup/rollback e owners confirmados;
6. autorização explícita do administrador para canary e produção.
