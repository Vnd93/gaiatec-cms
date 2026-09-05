# Contrato e operação da EV2.14

## Invariantes

1. O gateway não recebe nem resolve IDs editoriais; o único alvo aceito corresponde a
   `^g14x-[a-z0-9-]{3,100}$`.
2. O banco fixa `data_class = synthetic`, `site_key = main` e ambiente `local|staging`.
3. `CMS_AI_EXTERNAL_PROVIDER_ENABLED=true` fecha o gateway; não existe chamada de rede para modelo.
4. As tabelas da fase têm RLS, nenhum privilégio para `anon`/`authenticated` e são acessadas somente
   por RPCs `security definer` concedidas ao `service_role` da Edge Function.
5. Toda mutação exige AAL2, autorização por permissão e chave idempotente.
6. A execução e a compensação ocorrem em uma única transação PostgreSQL; qualquer divergência
   aborta o comando inteiro.

## Papéis e segregação

| Capacidade          | Permissão           | Papéis iniciais                                                                 | Regra adicional                        |
| ------------------- | ------------------- | ------------------------------------------------------------------------------- | -------------------------------------- |
| Ler workspace       | `cms:ai.read`       | super_admin, admin, editor, marketing, commercial, technical, reviewer, auditor | flags individuais duplas               |
| Criar/revisar plano | `cms:ai.plan`       | super_admin, admin, editor, marketing, commercial, technical                    | só alvos próprios                      |
| Aprovar/rejeitar    | `cms:ai.approve`    | super_admin, admin, reviewer                                                    | autor do plano não aprova              |
| Executar            | `cms:ai.execute`    | super_admin, admin, editor, marketing, commercial, technical                    | aprovador não executa                  |
| Compensar           | `cms:ai.compensate` | super_admin, admin                                                              | aprovador da compensação não a executa |

As permissões server-side são autoritativas. Ocultar ou desabilitar um botão é apenas uma ajuda de
interface e não constitui controle de segurança.

## Catálogo fechado de ferramentas

| Tool                | Risco    | Pré-estado       | Pós-estado | Permissão           |
| ------------------- | -------- | ---------------- | ---------- | ------------------- |
| `draft.apply_patch` | draft    | draft            | draft      | `cms:ai.execute`    |
| `workflow.submit`   | workflow | draft            | review     | `cms:ai.execute`    |
| `release.schedule`  | critical | review           | scheduled  | `cms:ai.execute`    |
| `release.publish`   | critical | review/scheduled | published  | `cms:ai.execute`    |
| `release.rollback`  | critical | published        | review     | `cms:ai.compensate` |

Todas são sintéticas, reversíveis e cadastradas no banco. Chave desconhecida, argumentos extras,
transição inválida, versão divergente ou agendamento fora de 24 horas falham fechados.

## Plano, dry-run e hash

O dry-run valida no servidor, em ordem:

- uma a vinte etapas e `stepKey` único;
- ferramenta ativa da allowlist;
- propriedade e escopo do alvo;
- versão esperada de cada etapa;
- máquina de estados e contrato exato dos argumentos;
- risco máximo, quantidade de alvos, versões e estados projetados.

O hash SHA-256 cobre ambiente, site, versão do plano, título e etapas em JSONB canônico. Revisar o
plano incrementa `plan_version`, recalcula o hash, volta o estado para `ready` e expira aprovações
ativas. O plano vence em até 30 minutos; a aprovação vence em até dez.

## Comandos

| Ação                   | Efeito permitido                                         | Aplicação real    |
| ---------------------- | -------------------------------------------------------- | ----------------- |
| `capability`           | resolve elegibilidade individual                         | não               |
| `workspace`            | retorna tools, alvos, planos, aprovações e runs visíveis | não               |
| `create_target`        | cria fixture `g14x-*`                                    | não               |
| `create_plan`          | valida dry-run e grava hash                              | não               |
| `revise_plan`          | invalida aprovação e cria nova versão                    | não               |
| `approve_plan`         | aprova/rejeita o hash por outro ator                     | não               |
| `execute_plan`         | aplica todas as etapas na fixture em uma transação       | somente sintética |
| `approve_compensation` | autoriza restauração por outro ator                      | não               |
| `compensate_run`       | restaura snapshots com versão monotônica                 | somente sintética |
| `cancel_plan`          | encerra plano não executado                              | não               |

Cada comando usa `commandId`, `correlationId`, `occurredAt`, contexto de ator e
`X-Idempotency-Key`. Repetir a mesma requisição devolve o mesmo recibo; reutilizar a chave ou o
comando com conteúdo diferente produz conflito.

## Estado e compensação

```text
target: draft -> review -> scheduled -> published -> review
plan:   ready -> approved -> executing -> executed -> compensated
           \-> rejected
           \-> canceled
```

Cada etapa grava snapshots anterior e posterior. A compensação restaura o primeiro snapshot de
cada alvo somente se o estado ainda corresponder ao último snapshot da execução. A versão nunca
retrocede: ela aumenta uma vez na restauração para impedir ABA e sobrescrita silenciosa.

## Falha segura e fallback

Produção, escopo divergente, provider externo, sessão antiga, MFA ausente, rate limit indisponível,
dado sensível, injeção, permissão ausente, hash alterado, aprovação expirada ou conflito de versão
interrompem antes da mutação. A UI informa que o estado foi preservado e mantém links para Conteúdo,
Releases/Tarefas e Produtos manuais.
