# Guia de conteúdo operacional do CMS

## Voz

- direta, respeitosa e orientada à tarefa;
- frases curtas, verbo no início e português simples;
- explicar consequência antes de ação crítica;
- não usar “erro inesperado”, “payload”, “mutation” ou “endpoint” para o operador;
- código técnico aparece como **código de acompanhamento**.

## Termos preferidos

| Usar                     | Evitar                      | Motivo                     |
| ------------------------ | --------------------------- | -------------------------- |
| Endereço da página       | slug isolado                | relaciona o campo ao site  |
| Salvar rascunho          | submit/update               | descreve a ação            |
| Enviar para revisão      | mudar status                | informa o próximo passo    |
| Uso interno              | hidden/private sem contexto | deixa a visibilidade clara |
| Visível no site          | public true                 | linguagem operacional      |
| Arquivar                 | deletar                     | preserva histórico         |
| Retirar do site          | unpublish                   | explica o impacto          |
| Código de acompanhamento | correlation ID              | ajuda suporte sem jargão   |

## Labels e ajuda

Todo campo tem label persistente. Placeholder é somente exemplo seguro. Campos complexos informam:

1. o que deve ser preenchido;
2. exemplo sem dados legados;
3. se é obrigatório;
4. se é público ou interno;
5. como corrigir um erro.

Exemplo: **Endereço da página** — “Use palavras curtas separadas por hífen. Será visível no site. Ex.: `medicao-de-vazao`.”

## Estados

- loading: “Carregando produtos…” e skeleton que preserva o layout;
- vazio: explicar por que está vazio e oferecer próximo passo permitido;
- erro: “Não foi possível carregar os produtos. Tente novamente. Se persistir, informe o código…”;
- sucesso: dizer o que foi salvo e o que ainda não foi publicado;
- indisponível: explicar dependência e manter dados já preenchidos;
- sem permissão: não revelar o registro; indicar o domínio necessário;
- sessão expirada: informar que o acesso terminou e preservar apenas a cópia local protegida quando aplicável.

## Confirmações

Confirmação deve nomear item, impacto e reversibilidade. Exemplos:

- “Retirar ‘Página X’ do site? A rota deixará de ser pública. O histórico será preservado.”
- “Arquivar esta campanha? Ela sai das listagens ativas e pode ser restaurada.”
- “Descartar a cópia local? As alterações ainda não salvas nesta aba serão perdidas.”

Nunca usar somente “Tem certeza?”. A ação perigosa usa verbo específico e cor de perigo; cancelar recebe foco inicial.

## Orientação fixa por tela

Cada rota apresenta quatro respostas breves: **Nesta tela**, **Impacto público**, **Uso interno** e **Próximo passo**. O texto vem de `admin-route-guidance.ts` e não substitui validações contratuais do editor.
