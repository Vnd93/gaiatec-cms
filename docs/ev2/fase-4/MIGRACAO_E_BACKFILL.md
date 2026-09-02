# Migração, piloto e rollback — EV2.4

## Sequência autorizável

1. Validar que o alvo é exclusivamente staging e que somente a migration `0041` está pendente.
2. Aplicar o schema shadow aditivo, publicar `cms-pim` e `cms-attributes` e manter `ev2.pim_v2` desligada.
3. Publicar build candidato em alias isolado, sem substituir o staging estável.
4. Criar usuário sintético e override individual com expiração curta; executar testes de identidade, unidade, SKU, concorrência, RLS e limpeza.
5. Após decisão EV2-D02 e autorização de dados, mapear 20–50 produtos piloto sem inferir valores ausentes.
6. Gerar a projeção v1, comparar campos críticos e devolver conflitos ao data steward.
7. Só habilitar dual-write para o lote aprovado depois de zero divergência crítica e ao menos 95% de completude.

## Backfill

O importador deve operar em dry-run, identificar fonte por campo, separar MPN/GTIN/NCM/SKU e nunca criar compatibilidade mestre por inferência. Registros incompletos entram como rascunho e valores personalizados ficam não filtráveis até homologação.

## Reconciliação

Cada produto piloto deve apresentar: identidade v1 de origem, grafo v2, versão do attribute set, resultado do adapter, divergências por caminho, completude e responsável pela decisão. SKU duplicado, unidade incompatível, referência mestre inativa e perda de conteúdo são divergências críticas.

## Rollback operacional

1. Desligar `ev2.pim_v2` ou acionar o kill switch.
2. Retirar o build candidato sem alterar o staging estável.
3. Parar backfill e dual-write; manter leitura e publicação v1.
4. Preservar tabelas, eventos, recibos, SKUs e proveniência para investigação.
5. Remover somente fixtures sintéticas identificadas e comprovar zero resíduos.

Rollback não apaga identidade nem reutiliza SKU. A reconstrução v1 parte de revisões aprovadas; o schema shadow permanece inerte até correção e nova autorização.
