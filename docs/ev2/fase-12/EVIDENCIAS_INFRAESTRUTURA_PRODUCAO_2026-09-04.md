# Evidências de infraestrutura produtiva — 4 de setembro de 2026

## Escopo autorizado e preservado

Foi autorizada a pausa do projeto Supabase `DZ System Project`
(`pbmyttjnqijdbscrjayk`) para liberar uma das duas vagas Free, com a restrição explícita de não
pausar nem alterar o `GAIATEC CMS Staging`. Também estava autorizada a criação isolada do projeto
`GAIATEC CMS Production`, sem deploy, migrations, funções, dados reais, domínio real, ativação de
flags ou promoção do staging estável.

## Resultado observado

| Projeto                | Ref.                   | Organização            | Região      | Estado final     |
| ---------------------- | ---------------------- | ---------------------- | ----------- | ---------------- |
| GAIATEC CMS Staging    | `glcqsosxwgmlhzgcsnzv` | `zfznxacuguxlydpatcpo` | `us-east-2` | `ACTIVE_HEALTHY` |
| DZ System Project      | `pbmyttjnqijdbscrjayk` | `zfznxacuguxlydpatcpo` | `us-east-2` | `INACTIVE`       |
| GAIATEC CMS Production | `chfuhctnhqgyjowkvllv` | `doveeoohvxkygssakxnk` | `us-east-2` | `ACTIVE_HEALTHY` |

O projeto `DZ System Project` foi **pausado, não excluído**. A interface do Supabase informa que um
projeto Free pausado pode ser retomado durante a janela de restauração da plataforma. O staging
permaneceu saudável durante toda a operação.

O projeto produtivo foi criado em `2026-09-04T15:10:21.391835Z` com:

- plano Free e compute `nano`;
- Data API habilitada;
- exposição automática de novas tabelas desabilitada;
- RLS automático habilitado para novas tabelas;
- senha de banco aleatória de 52 caracteres gerada por CSPRNG e inserida sem impressão ou gravação
  em arquivo;
- nenhuma migration, função, integração GitHub ou dado aplicado.

## Exceção operacional do plano Free

A escolha do plano Free preserva o isolamento, mas **não satisfaz o requisito de produção** do G12.
Segundo a documentação oficial, o plano não inclui backups automáticos nem PITR e projetos com pouca
atividade podem ser pausados após sete dias. Antes de dados reais ou go-live, é obrigatório:

1. definir exportação lógica regular, armazenamento externo protegido e retenção;
2. executar e registrar um restore drill compatível com o RPO/RTO aprovado; e
3. aceitar formalmente o risco residual ou migrar a organização para um plano com garantias
   produtivas.

Referências: [preços e limites do Supabase](https://supabase.com/pricing),
[pausa de projetos Free](https://supabase.com/docs/guides/platform/free-project-pausing) e
[backups de banco](https://supabase.com/docs/guides/platform/backups).

## Bloqueio GitHub confirmado

A configuração segura dos secrets não foi contornada:

- `Vnd93` possui somente permissão `write` no repositório `pedronishida/website_gaiatecsistemas`;
- `dzsystemsproductions`, disponível no seletor de contas do Chrome, não possui acesso ao
  repositório;
- as páginas de acesso/ambientes retornam indisponibilidade para essas sessões.

Consequentemente, o ambiente protegido `production`, seus revisores, a proteção de `main` e seus
secrets/variables continuam pendentes. A senha de banco não foi armazenada em secret de repositório
nem em qualquer local não autorizado. A próxima sessão deve usar `pedronishida` ou uma conta que
tenha permissão administrativa efetiva; só então as credenciais devem ser inseridas diretamente no
ambiente protegido `production`.

## Decisão

Infraestrutura Supabase isolada: **provisionada**. Backend produtivo aprovado para uso real:
**não**. Gate G12 e qualquer mudança em produção permanecem bloqueados.
