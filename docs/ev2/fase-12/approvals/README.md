# Registros imutáveis de aprovação G12

Esta pasta aceita somente arquivos `G12_<sha-completo>.json`, derivados do modelo da pasta anterior.
O registro deve ser criado em `main` por um commit de governança posterior ao candidato que ele
aprova; assim, o SHA do artefato não depende do próprio arquivo de aprovação.

O workflow compara o nome, o `candidateSha`, o digest do relatório G12, os três IDs de janelas
saudáveis, a change reference, a janela vigente, os owners, o alvo de produção e a baseline de
rollback. Arquivo pendente, fora da janela ou divergente falha fechado.

Não armazenar tokens, chaves, e-mails, nomes completos desnecessários ou dados pessoais. Identidades
corporativas/pseudônimos rastreáveis e timestamps são suficientes.
