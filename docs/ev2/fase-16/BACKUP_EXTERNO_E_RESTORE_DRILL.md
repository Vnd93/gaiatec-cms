# Backup externo e restore drill — Supabase Free

## Política aplicada

O projeto produtivo alvo é fixado em `chfuhctnhqgyjowkvllv`. O workflow
`.github/workflows/backup-supabase-production.yml` recusa staging, URL de outro projeto, conexão sem
TLS, execução fora de `main`, senha curta ou chave de criptografia fraca.

Rotina:

- backup lógico diário às 03:17 UTC;
- backup com restore drill aos domingos às 03:47 UTC, além de acionamento manual;
- `roles.sql`, `schema.sql` e `data.sql` gerados pelo Supabase CLI 2.116.0;
- pacote cifrado localmente com OpenPGP/AES-256 antes de sair do runner;
- somente o arquivo `.gpg` e um manifesto sem segredos são enviados ao GitHub Actions;
- retenção de 90 dias, fora do Supabase;
- todo material em texto claro é apagado mesmo quando a execução falha.

O drill decripta o mesmo arquivo que será retido, inicia um Supabase local efêmero, restaura roles,
schema e dados com `ON_ERROR_STOP` e compara o inventário e a contagem exata de linhas de cada tabela
pública entre origem e destino. As contagens ficam dentro do pacote cifrado. Qualquer divergência
interrompe a execução.

## SLO inicial compatível com Free

- RPO máximo: 24 horas;
- RTO de restauração medido: máximo de 60 minutos;
- primeiro backup e primeiro drill bem-sucedidos são obrigatórios antes do G12;
- um novo drill é obrigatório após mudança material de schema ou procedimento.

O plano Free não oferece backup automático/PITR nem download de backup da plataforma. A própria
documentação do Supabase recomenda dumps regulares e cópia fora da plataforma:
<https://supabase.com/docs/guides/platform/backups> e
<https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore>.

## Secrets do ambiente `production-backup`

- `PRODUCTION_SUPABASE_DB_URL`: conexão somente ao projeto produtivo, com `sslmode=require`;
- `BACKUP_ENCRYPTION_PASSPHRASE`: frase aleatória exclusiva, com no mínimo 32 caracteres.

Variable:

- `PRODUCTION_SUPABASE_PROJECT_REF=chfuhctnhqgyjowkvllv`.

Em 5 de setembro de 2026, o GitHub Pro foi confirmado, o ambiente `production-backup` foi criado e
limitado a branches protegidas. A senha produtiva foi redefinida por canal oficial, e a URL do
pooler TLS/IPv4 e a frase aleatória de criptografia foram cadastradas somente como environment
secrets. A conexão autenticada pelo mesmo pooler foi comprovada sem expor valores. A primeira
execução real e o primeiro drill continuam pendentes até o workflow entrar em `main`; nenhum secret
foi movido para escopo de repositório.

## Risco residual

O artefato expira em 90 dias e não substitui PITR. Depois do go-live, recomenda-se uma segunda cópia
cifrada em object storage com retenção imutável ou a migração para Supabase Pro. Isso é uma melhoria
posterior; não reduz a exigência de executar e comprovar o controle inicial acima.
