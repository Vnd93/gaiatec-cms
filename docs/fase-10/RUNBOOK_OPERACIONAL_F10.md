# Runbook operacional — F10

## Antes de operar

1. confirmar ambiente staging `glcqsosxwgmlhzgcsnzv` e branch `Remodelagem` com `npx supabase projects list`;
2. revisar `npx supabase db push --dry-run` e aplicar a migration `0035_fase10_controlled_vocabularies.sql` somente no staging;
3. publicar `cms-controlled-vocabularies` e as versões compatíveis de `cms-content` e `cms-public` no staging com `npx supabase functions deploy`;
4. entrar no CMS com usuário autorizado e MFA/AAL2;
5. cadastrar as cinco dimensões e suas opções pela tela **Listas mestras**, confirmando o código de auditoria de cada gravação; usar o script `npm run seed:staging:vocabularies` somente se houver autorização específica para substituir a homologação pela interface;
6. cadastrar manualmente as categorias de serviço autorizadas — o programa não inventa valores.

## Rotina editorial

- Em **Listas mestras**, criar/editar/ordenar e ativar/inativar opções. Nunca reutilizar um UUID para outro significado.
- Em produto/serviço, escolher somente opções ativas. O rótulo salvo é normalizado pelo servidor.
- Se aparecer uma cópia recuperável, conferir horário e restaurar ou descartar conscientemente.
- Salvar remove a cópia local; publicar continua sujeito ao workflow e permissões existentes.
- Para massa, baixar sempre o template gerado no CMS, usar UUIDs exibidos nas listas e executar dry-run. Não corrigir desconhecidos por criação implícita.

## Teste de troca de aba

1. abrir um editor staging autenticado, alterar título e mudar de tab interna;
2. alternar para outra aba do navegador, aguardar ao menos um ciclo de renovação configurado e retornar;
3. confirmar mesma rota, tab e valor, sem “Validando acesso”;
4. expirar/encerrar a sessão em teste separado e confirmar redirecionamento/bloqueio;
5. registrar horário, usuário de teste e console sem dados sensíveis.

## Incidente e rollback

- bloquear novas alterações na lista afetada;
- registrar correlation ID e opção/lista;
- restaurar função/site staging anterior; não apagar linhas ou opções usadas;
- recuperar conteúdo por revisões existentes;
- se o backup local falhar, salvar manualmente quando seguro ou copiar o texto para local aprovado; nunca enviar a terceiro;
- escalar segurança se um ID/campo interno surgir em resposta pública.

## Segredos e contas

Tokens não entram em arquivo, log, screenshot ou documentação. MFA não deve ser contornada. Na ausência de sessão staging válida, o único passo humano é autenticar no CMS staging com MFA e fornecer a sessão pelo próprio navegador/ambiente seguro.

Neste host a Supabase CLI está disponível por `npx supabase` na versão 2.116.0. O executável global pode não estar no `PATH`; isso não caracteriza ausência da CLI. O teste pgTAP/RLS local depende do Docker, que não está instalado/disponível neste host.
