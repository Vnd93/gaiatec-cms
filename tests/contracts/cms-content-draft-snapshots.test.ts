import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * O salvamento de rascunho destruía os bytes anteriores.
 *
 * O ramo `save` do comando editorial troca o payload e incrementa `lock_version`; revisão só nasce
 * no `submit`. Entre dois submits, cada salvamento apagava o que havia antes — e a cópia local do
 * navegador é limpa justamente no salvamento bem-sucedido. Não havia desfazer em lugar nenhum.
 *
 * A 0094 captura o payload anterior por gatilho. Este arquivo prende as decisões de desenho que
 * tornam isso seguro; o comportamento contra o banco é do arquivo em `supabase/tests`.
 */

const MIGRACAO = readFileSync(
  path.resolve(__dirname, "../../supabase/migrations/0094_cms_content_draft_snapshots.sql"),
  "utf8",
);

const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");

const BUILDER = readFileSync(
  path.resolve(__dirname, "../../src/admin/pages/AdminPageBuilderPage.tsx"),
  "utf8",
);

describe("instantâneo de rascunho", () => {
  it("captura por gatilho, não por remendo numa função de comando", () => {
    // Gatilho pega todo caminho que escreve no rascunho. Remendo pegaria um caminho só — e esta
    // base já mostrou que funções são reescritas por baixo (o bloco DO da 0055).
    expect(MIGRACAO).toContain("after update of payload on public.cms_content_drafts");
    expect(MIGRACAO).toContain("when (old.payload is distinct from new.payload)");
  });

  it("guarda o payload ANTERIOR, não o novo", () => {
    // Guardar `new` seria duplicar o que já está no rascunho e não desfazer nada.
    const insercao = MIGRACAO.slice(
      MIGRACAO.indexOf("insert into public.cms_content_draft_snapshots"),
      MIGRACAO.indexOf("delete from public.cms_content_draft_snapshots"),
    );
    expect(insercao).toContain("old.payload");
    expect(insercao).not.toContain("new.payload");
  });

  it("nunca deixa uma falha de instantâneo derrubar um salvamento", () => {
    // O gatilho roda no caminho quente de todo salvamento de todo tipo de conteúdo. Sem este
    // bloco, um erro de instantâneo impede o operador de salvar — pior do que perder o instantâneo.
    const corpo = MIGRACAO.slice(
      MIGRACAO.indexOf("function private.cms_capture_draft_snapshot"),
      MIGRACAO.indexOf("create trigger cms_capture_draft_snapshot"),
    );
    expect(corpo).toContain("exception");
    expect(corpo).toContain("when others then");
    // Engolir não pode virar silêncio.
    expect(corpo).toContain("CMS_DRAFT_SNAPSHOT_CAPTURE_FAILED");
  });

  it("espelha as duas condições da política de leitura do rascunho", () => {
    // Se a política do instantâneo for mais permissiva que a do rascunho, ela vaza por um caminho
    // novo o conteúdo que o rascunho protege.
    const politica = MIGRACAO.slice(
      MIGRACAO.indexOf("create policy cms_content_draft_snapshots_authorized_read"),
      MIGRACAO.indexOf("revoke insert, update, delete"),
    );
    expect(politica).toContain("cms_content_item_session_read_allowed");
    expect(politica).toContain("cms_can_read_content");
  });

  it("não abre caminho de escrita paralelo ao comando editorial", () => {
    // Restaurar reusa o `save` que já existe, herdando validação, permissão, trava de concorrência
    // e auditoria. Uma RPC de restauração própria seria superfície nova sem nenhuma dessas.
    expect(MIGRACAO).not.toMatch(/function public\.cms_restore_draft_snapshot/);
    expect(MIGRACAO).toContain("revoke insert, update, delete on public.cms_content_draft_snapshots");
  });

  it("a tela restaura para o editor, sem escrever no servidor", () => {
    // Carregar no editor e deixar o operador salvar é o que herda validação, permissão, trava de
    // concorrência e auditoria — e é o próprio salvamento que captura a versão atual antes de
    // substituí-la. Uma escrita direta daqui pularia tudo isso.
    const bloco = BUILDER.slice(
      BUILDER.indexOf("const restoreSnapshot ="),
      BUILDER.indexOf("const goToIssue ="),
    );
    expect(bloco).not.toBe("");
    expect(bloco).toContain("setPayload(");
    expect(bloco, "restaurar não pode chamar o comando editorial direto").not.toContain("run(");
    expect(bloco, "restaurar não pode escrever pelo cliente").not.toContain("supabase.from");
    // Versão anterior que não valida não entra no editor às cegas.
    expect(bloco).toContain("pageSchemaForContentType");
  });

  it("busca os instantâneos numa consulta separada e tolerante", () => {
    // Ordem de publicação é o modo de falha recorrente aqui. Se o painel subir antes da migration,
    // a tabela não existe; numa consulta separada isso vira "sem versões", e não um editor quebrado.
    // Ancorado no select do item, que é único no arquivo — não na primeira ocorrência da tabela,
    // que aparece antes, noutro efeito.
    const inicioDoSelect = BUILDER.indexOf(
      '"id,slug,content_type,workflow_status,scheduled_for,cms_content_drafts(payload,lock_version)',
    );
    expect(inicioDoSelect).toBeGreaterThan(0);
    const carga = BUILDER.slice(inicioDoSelect, BUILDER.indexOf("}, [id, refreshToken]);"));
    expect(carga).toContain('.from("cms_content_draft_snapshots")');
    // A consulta do item NÃO pode embutir a tabela nova no select dela: se a tabela faltar, o
    // editor inteiro deixaria de carregar em vez de apenas ficar sem versões anteriores.
    const selectDoItem = carga.slice(0, carga.indexOf('.from("cms_content_draft_snapshots")'));
    expect(selectDoItem).not.toContain("cms_content_draft_snapshots(");
  });

  it("retém uma janela curta, porque histórico editorial é revisão", () => {
    expect(MIGRACAO).toContain("cms_draft_snapshot_retention");
    expect(MIGRACAO).toContain("delete from public.cms_content_draft_snapshots");
  });

  it("mantém os comentários fora do corpo do create table", () => {
    // O modelo de schema do contrato fixture x schema lê o corpo por balanceamento de parênteses.
    // Prosa com pontuação lá dentro já fez uma tabela ser lida sem coluna nenhuma.
    const corpoDaTabela = MIGRACAO.slice(
      MIGRACAO.indexOf("create table public.cms_content_draft_snapshots ("),
      MIGRACAO.indexOf("create index cms_content_draft_snapshots_item_idx"),
    );
    expect(corpoDaTabela).not.toContain("--");
  });

  it("está registrada nos dois controles de release", () => {
    // Migration nova exige ato deliberado em dois lugares. Sem isto o CI reprova a branch, e o
    // motivo chega como nome de política, não como causa.
    const politica = readFileSync(
      path.resolve(__dirname, "../../scripts/ev2/phase12/verify-backend-forward-compatibility.mjs"),
      "utf8",
    );
    expect(politica).toContain('"0094"');
    expect(politica).toContain("supabase/tests/rls_cms_content_draft_snapshots.test.sql");

    const manifesto = readFileSync(
      path.resolve(__dirname, "../../scripts/ev2/phase12/migration-manifest-lib.mjs"),
      "utf8",
    );
    expect(manifesto).toContain("0094_cms_content_draft_snapshots.sql");
  });

  it("é a última migration, e o selo confere com os bytes do arquivo", async () => {
    const { createHash } = await import("node:crypto");
    const { readdirSync } = await import("node:fs");
    const arquivos = readdirSync(MIGRATIONS_DIR)
      .filter((nome) => nome.endsWith(".sql"))
      .sort();
    expect(arquivos.at(-1)).toBe("0094_cms_content_draft_snapshots.sql");

    const digest = createHash("sha256")
      .update(readFileSync(path.join(MIGRATIONS_DIR, "0094_cms_content_draft_snapshots.sql")))
      .digest("hex");
    const manifesto = readFileSync(
      path.resolve(__dirname, "../../scripts/ev2/phase12/migration-manifest-lib.mjs"),
      "utf8",
    );
    expect(manifesto, "o selo da cauda fixada não confere com os bytes de 0094").toContain(digest);
  });
});
