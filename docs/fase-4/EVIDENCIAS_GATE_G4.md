# Gate G4 — evidências e decisão

Data: 2026-08-28 (America/Sao_Paulo)

## Resultado técnico

| Critério                       | Evidência                                                                                         | Situação                             |
| ------------------------------ | ------------------------------------------------------------------------------------------------- | ------------------------------------ |
| fonte única nova               | arquitetura usa somente a projeção nova; banco/storage finais vazios                              | técnica aprovada; lote real ausente  |
| zero campo órfão               | 2 produtos sintéticos geraram 2 modelos/variantes, 4 atributos e 2 documentos projetados          | aprovado em fixture                  |
| zero arquivo atual reutilizado | mídia sintética gerada por código e apagada; nenhuma consulta ao acervo antigo/externo            | aprovado                             |
| preview fiel                   | snapshot da revisão v1 igual ao payload e mesmo renderer público; `no-store`                      | aprovado em fixture                  |
| rollback funcional             | revisão v2 publicada e v1 restaurada como content version 3                                       | aprovado em fixture                  |
| segurança                      | RLS/grants, RBAC separado, 403 sem acesso, 404 real, preview privado, mídia assinada, npm audit 0 | funcional aprovado; advisor pendente |
| responsividade e WCAG          | navegador integrado desktop/mobile, Playwright 19/19 executados e Axe sem séria/crítica           | aprovado em fixture                  |
| performance                    | chunks F4 pequenos e navegação prática fluida                                                     | pendente com lote real               |
| homologação do owner           | nenhum documento formal fornecido ou localizado nas evidências autorizadas                        | ausente                              |

## Evidência remota

- alvo recusaria qualquer projeto diferente de `glcqsosxwgmlhzgcsnzv`, `GAIATEC CMS Staging`, `us-east-2`;
- PAT carregado em memória somente pela linha `SUPABASE_ACCESS_TOKEN` do arquivo externo documentado, sem imprimir o valor nem carregar outras credenciais;
- migrations 0019–0020 aplicadas após dry-run;
- `cms-public` implantada com JWT público desativado conforme endpoint público e leitura restrita à projeção;
- teste remoto: 36/36 checks;
- `npm run validate:local`: APROVADO integralmente em 71 s, com formatação, lint sem erros (48 warnings preexistentes), TypeScript, 12 testes unitários, 3 integrações, 4 contenções F1, 19 testes F3, 4 testes F4, audit sem vulnerabilidades, build, manifesto e Playwright;
- manifesto local: 1.440 arquivos, SHA-256 `ab0cafb27da998232b1a18fcf26482126b9964343022f442434d9d59e774b612`;
- limpeza final: 0 usuários Auth, 0 itens editoriais, 0 produtos publicados, 0 mídias, 0 objetos no bucket e 0 redirects;
- deployments Cloudflare: `6b95f91f` (base funcional) e `2457a4b9` (redirect editorial no edge), ambos apenas no projeto `gaiatec-cms-staging`/branch `Remodelagem`;
- produção e branch `main` não foram tocadas.

## Pendências impeditivas

1. Não existe fonte oficial nova de um produto real selecionada, versionada e aceita pela política.
2. Não existe homologação formal documentada do owner do portfólio.
3. Por consequência, não existe lote piloto real apto a comprovar fonte única nova, fidelidade editorial e performance com conteúdo homologado.
4. O Security Advisor atual reporta 5 WARN em funções `SECURITY DEFINER` preexistentes e necessárias às policies (`cms_can_read_*`, `cms_current_session_valid`, `cms_has_permission`, `cms_user_is_active`, `cms_user_mfa_required`). Não foram alteradas fora do escopo da Fase 4; exigem decisão arquitetural/aceite formal antes de chamar segurança integralmente aprovada.
5. A contingência G2 permanece: a validação local é autoridade, e CI remoto não é declarado verde sem evidência.
6. O pgTAP local continua condicionado a Docker/Supabase local, indisponível neste host; a matriz comportamental equivalente foi executada remotamente no staging autorizado, sem alegar que o job local de banco rodou.

## Decisão

**GATE G4: BLOQUEADO.**

A implementação técnica F4-01 a F4-06 está entregue e validada com fixtures descartáveis, mas o gate não pode ser aprovado sem fonte oficial real aceita e homologação formal do owner. Nenhuma aprovação foi fabricada e nenhum conteúdo do site/banco/painel anterior foi reutilizado. A Fase 5 não foi iniciada.
