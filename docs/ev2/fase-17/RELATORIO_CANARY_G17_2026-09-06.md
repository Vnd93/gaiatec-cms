# Relatório do canary G17 — 6 de setembro de 2026

## Resultado

`G17_CANARY_PASS` para `7abe356b0f4503d6b87fd00d50acee20ab794d6d` no alias isolado
`ev2-g17-canary`.

## Escopo executado

1. manifesto e endpoint de saúde vinculados ao SHA exato;
2. usuário sintético `super_admin` com MFA/AAL2;
3. override individual temporário para `ev2.ai_assist`;
4. resolução server-side do manifesto operacional;
5. disponibilidade do OpenRouter e do modelo gratuito Nemotron 3.5 Lightning;
6. criação de sessão e proposta editorial baseada somente em fonte sintética;
7. revisão humana com decisão `edited`, sem aplicação e sem publicação;
8. tentativa com escopo de produção recusada;
9. limpeza do usuário, permissões, override e dados sintéticos.

## Resultado técnico

- validação local completa: aprovada;
- testes Vitest: 168 aprovados em 51 arquivos;
- testes específicos EV2.17: 5 aprovados;
- canary remoto: 7 verificações aprovadas;
- migration de staging: `0055` e `0056` presentes;
- `cms-session` em staging: versão 19, ativa;
- `cms-ai` em staging: versão 9, ativa;
- dados reais usados: não;
- mutações em produção: zero;
- aplicação ou publicação automática pela IA: não;
- alias estável de staging promovido: não.

O endpoint `cms-ai` mantém `verify_jwt=false` na plataforma porque executa validação de JWT,
origem, MFA, autorização e rate limit dentro do gateway versionado. Isso preserva o contrato de
autenticação usado pelas demais funções EV2 e foi exercitado pelo canary.

## Correções confirmadas durante o canary

- o adaptador deixou de enviar `response_format`, parâmetro não suportado pelo modelo selecionado;
- o raciocínio foi desabilitado na chamada para garantir JSON operacional e não expor cadeia de
  pensamento;
- a limpeza passou a abranger avaliações de IA;
- os logs imutáveis agora aceitam somente a desvinculação referencial do usuário excluído, sem
  permitir alteração de qualquer outro campo.

## Conclusão

O candidato está apto para homologação funcional do CMS em staging. Produção permanece bloqueada
por configuração e fora do escopo deste resultado.
