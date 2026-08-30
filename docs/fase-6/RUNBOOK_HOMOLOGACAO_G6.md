# Runbook simples para homologar o Gate G6

## Estado

Executado integralmente em 2026-08-29 no staging `glcqsosxwgmlhzgcsnzv`. O histórico abaixo permanece como procedimento reproduzível; as evidências e a decisão estão em `EVIDENCIAS_GATE_G6.md`.

## Acesso necessário

1. autenticar o Supabase CLI nesta máquina com uma conta que possa alterar somente o projeto staging `glcqsosxwgmlhzgcsnzv`; ou
2. disponibilizar o caminho de um arquivo externo, fora do repositório, contendo exatamente uma linha `SUPABASE_ACCESS_TOKEN=...`.

Não enviar a senha do painel nem colar token no chat. O administrador deve fazer login diretamente no navegador.

## Execução técnica

1. confirmar por API o nome, ref e região do projeto permitido;
2. executar dry-run da migration 0026;
3. aplicar a migration somente no staging;
4. implantar `cms-content`, `cms-public` e `cms-preview`;
5. fazer build de staging e implantar a branch `Remodelagem` no Cloudflare Pages;
6. verificar `noindex`, cache privado do admin e headers públicos;
7. executar smoke de assets, página dinâmica e status HTTP.

## Roteiro do administrador

Usar apenas uma página sintética claramente marcada como teste, sem dados de produto/serviço/imagem real:

1. abrir `/admin/paginas`;
2. criar “Página de homologação G6”;
3. adicionar, duplicar, mover e ocultar blocos;
4. preencher URL, SEO, proveniência e decisão de retirada;
5. salvar e confirmar que o rascunho não aparece no site;
6. abrir preview desktop e mobile;
7. enviar para revisão;
8. aprovar com perfil autorizado;
9. publicar;
10. confirmar frontend, HTML inicial, sitemap, menu e destaque quando aplicável;
11. abrir nova versão e restaurar uma revisão anterior;
12. retirar primeiro com redirect válido e verificar `301`;
13. repetir com uma página descartável para `404` ou `410`;
14. excluir definitivamente apenas um rascunho nunca publicado com `super_admin` e MFA.

## Evidências a guardar

- commit e URL do deployment;
- migration remota listada;
- correlation IDs dos comandos;
- screenshots do builder e preview;
- respostas HTTP `200`, `301`, `404` e `410`;
- resultado do crawl sem links órfãos;
- teste negativo de usuário sem permissão;
- auditoria e outbox correspondentes;
- aprovação do administrador.

## Encerramento

O roteiro foi concluído, a outbox terminou sem pendências e o Gate G6 foi aprovado em staging. Produção continua proibida até o Gate G8.
