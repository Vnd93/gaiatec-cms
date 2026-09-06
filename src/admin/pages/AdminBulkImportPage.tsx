import { useRef, useState } from "react";
import { Link } from "react-router";
import { ProductModuleTabs } from "../components/AdminModuleTabs";
import { useAdminAuth } from "../auth/AdminAuthContext";
import { bulkImportCommand } from "../api/cms-api";
import {
  BULK_IMPORT_MAX_BYTES,
  buildBulkProductRows,
  bulkRequiredHeaders,
  type BulkImportError,
  type BulkProductCommandRow,
  type BulkTableRow,
  type BulkWorkbookTables,
} from "../bulk-import-model";

type BulkResponse = {
  status: "valid" | "created";
  total: number;
  rows: Array<{ sourceRow: number; slug: string; itemId?: string; status?: string }>;
  errors?: BulkImportError[];
  correlationId: string;
};

const optionalProductHeaders = [
  "resumo",
  "fabricante_url",
  "subcategoria",
  "descricao_completa",
  "diferenciais",
  "sinonimos",
  "palavras_chave",
  "seo_titulo",
  "seo_descricao",
  "fonte_tipo",
  "fonte_url",
  "fonte_sha256",
  "autorizacao_referencia",
  "autorizacao_data",
  "escopo_direitos",
  "visibilidade_marca",
  "visibilidade_fabricante",
  "visibilidade_linha",
  "visibilidade_modelo_comercial",
  "visibilidade_referencia_fabricante",
  "visibilidade_sku",
  "visibilidade_classificacao",
  "visibilidade_funcao",
  "visibilidade_tecnologia",
  "visibilidade_especificacoes",
  "visibilidade_relacoes",
  "visibilidade_documentos",
];

export async function downloadBulkImportTemplate() {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "CMS GAIATEC";
  workbook.title = "Cadastro em massa governado — Fase 10";
  const instructions = workbook.addWorksheet("Instrucoes", { views: [{ showGridLines: false }] });
  instructions.addRows([
    ["CADASTRO EM MASSA GOVERNADO — CMS GAIATEC"],
    ["Use somente conteúdo novo e clean-room. Exportações do painel/site antigo são proibidas."],
    [
      "Preencha os UUIDs das opções ativas exibidas em CMS > Listas mestras. Termos desconhecidos nunca são criados implicitamente.",
    ],
    ["O dry-run valida linha e coluna no servidor. Qualquer erro cancela o lote inteiro."],
    ["Imagens e documentos seguem a biblioteca privada e não entram nesta planilha."],
  ]);
  instructions.mergeCells("A1:H1");
  instructions.mergeCells("A2:H2");
  instructions.mergeCells("A3:H3");
  instructions.mergeCells("A4:H4");
  instructions.mergeCells("A5:H5");
  instructions.getColumn(1).width = 120;
  instructions.getRow(1).height = 28;
  instructions.getCell("A1").font = { bold: true, color: { argb: "FFFFFFFF" }, size: 15 };
  instructions.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0057DE" } };
  for (let row = 2; row <= 5; row++) {
    instructions.getCell(row, 1).alignment = { wrapText: true, vertical: "middle" };
    instructions.getRow(row).height = 34;
  }
  const definitions = [
    ["Produtos", [...bulkRequiredHeaders.products, ...optionalProductHeaders]],
    ["Modelos", [...bulkRequiredHeaders.models, "status"]],
    [
      "Especificacoes",
      [
        ...bulkRequiredHeaders.specifications,
        "unidade",
        "obrigatorio",
        "filtravel",
        "comparavel",
        "pesquisavel",
      ],
    ],
  ] as const;
  for (const [name, headers] of definitions) {
    const sheet = workbook.addWorksheet(name, {
      views: [{ state: "frozen", ySplit: 1, showGridLines: false }],
    });
    sheet.addRow(headers);
    const header = sheet.getRow(1);
    header.height = 32;
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0057DE" } };
    header.alignment = { vertical: "middle", wrapText: true };
    headers.forEach((_, index) => {
      sheet.getColumn(index + 1).width = 24;
    });
    if (name === "Produtos") sheet.getColumn("A").width = 30;
    for (let row = 2; row <= 501; row++) {
      sheet.getCell(row, 1).value = name === "Produtos" ? "GAIATEC-CMS-PRODUTOS-v1" : null;
    }
    for (const key of ["status", "obrigatorio", "filtravel", "comparavel", "pesquisavel"]) {
      const index = headers.indexOf(key as never) + 1;
      if (index > 0)
        sheet.getColumn(index).eachCell({ includeEmpty: true }, (cell, row) => {
          if (row > 1)
            cell.dataValidation = {
              type: "list",
              allowBlank: true,
              formulae: [key === "status" ? '"ativo,descontinuado"' : '"Sim,Não"'],
            };
        });
    }
  }
  const data = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(
    new Blob([data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "GAIATEC-CMS-Cadastro-em-Massa-v1.xlsx";
  link.click();
  URL.revokeObjectURL(url);
}

function textValue(value: unknown) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if ("formula" in record) throw new Error("Fórmulas não são permitidas na planilha de importação.");
    if (Array.isArray(record.richText))
      return record.richText.map((part) => String((part as Record<string, unknown>).text ?? "")).join("");
    if ("text" in record) return String(record.text ?? "");
    if ("result" in record) return String(record.result ?? "");
  }
  return String(value).trim();
}

function readTable(sheet: any, key: keyof typeof bulkRequiredHeaders): BulkTableRow[] {
  if (!sheet) throw new Error(`A aba obrigatória “${key}” não foi encontrada.`);
  const headers: string[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell: any, column: number) => {
    headers[column - 1] = textValue(cell.value).toLowerCase();
  });
  const missing = bulkRequiredHeaders[key].filter((header) => !headers.includes(header));
  if (missing.length) throw new Error(`A aba ${key} não contém: ${missing.join(", ")}.`);
  const rows: BulkTableRow[] = [];
  for (let rowNumber = 2; rowNumber <= sheet.actualRowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const values: BulkTableRow = {};
    headers.forEach((header, column) => {
      if (header) values[header] = textValue(row.getCell(column + 1).value);
    });
    const identityField = key === "products" ? "slug" : "produto_slug";
    if (values[identityField]?.trim()) rows.push(values);
  }
  return rows;
}

export default function AdminBulkImportPage() {
  const { session, profile } = useAdminAuth();
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<BulkProductCommandRow[]>([]);
  const [errors, setErrors] = useState<BulkImportError[]>([]);
  const [serverValidated, setServerValidated] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [correlationId, setCorrelationId] = useState("");
  const commitKey = useRef(crypto.randomUUID());
  const canEdit = profile?.permissions.includes("cms:products.edit") ?? false;

  async function loadFile(file?: File) {
    setMessage("");
    setServerValidated(false);
    setConfirmed(false);
    setRows([]);
    setErrors([]);
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setMessage(
        "Use somente o arquivo .xlsx padronizado. Arquivos .xls, .xlsm e planilhas antigas são recusados.",
      );
      return;
    }
    if (file.size > BULK_IMPORT_MAX_BYTES) {
      setMessage("O arquivo excede o limite de 5 MB.");
      return;
    }
    setBusy(true);
    try {
      const ExcelJS = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await file.arrayBuffer());
      const tables: BulkWorkbookTables = {
        products: readTable(workbook.getWorksheet("Produtos"), "products"),
        models: readTable(workbook.getWorksheet("Modelos"), "models"),
        specifications: readTable(workbook.getWorksheet("Especificacoes"), "specifications"),
      };
      const result = buildBulkProductRows(tables);
      setFileName(file.name);
      setRows(result.rows);
      setErrors(result.errors);
      commitKey.current = crypto.randomUUID();
      setMessage(
        result.errors.length
          ? "A planilha foi lida, mas precisa de correções antes do envio."
          : `${result.rows.length} produto(s) válido(s) no navegador. Faça a validação segura no servidor.`,
      );
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Não foi possível ler a planilha.");
    } finally {
      setBusy(false);
    }
  }

  async function run(action: "bulk_validate" | "bulk_create") {
    if (!session || !rows.length || errors.length) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await bulkImportCommand<BulkResponse>(
        session,
        {
          action,
          contentType: "product",
          reason: "Cadastro em massa por planilha padronizada GAIATEC",
          rows,
        },
        action === "bulk_create" ? commitKey.current : crypto.randomUUID(),
      );
      setCorrelationId(result.correlationId);
      setErrors(result.errors ?? []);
      if (action === "bulk_validate") {
        setServerValidated(!(result.errors?.length ?? 0));
        setMessage(
          result.errors?.length
            ? "O servidor encontrou pendências. Nenhum cadastro foi criado."
            : `Validação concluída: ${result.total} rascunho(s) pronto(s) para criação.`,
        );
      } else {
        setServerValidated(false);
        setConfirmed(false);
        setMessage(`Lote concluído: ${result.total} rascunho(s) criado(s), sem publicação automática.`);
      }
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "A operação em massa não foi concluída.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-bulk-import">
      <p className="admin-eyebrow">CADASTRO GOVERNADO</p>
      <h1>Cadastro em massa por planilha</h1>
      <p>
        Importe apenas cadastros novos preparados para este CMS. O fluxo valida todas as linhas antes de criar
        qualquer registro e sempre gera rascunhos — nunca publica automaticamente.
      </p>
      <ProductModuleTabs />
      <div className="admin-workflow-actions">
        <button
          className="admin-button admin-button--secondary"
          type="button"
          onClick={() => void downloadBulkImportTemplate()}
        >
          Baixar planilha-modelo vazia
        </button>
        <Link to="/admin/produtos">Voltar aos produtos</Link>
      </div>
      <div className="admin-notice">
        Não use exportações do painel antigo. Imagens e documentos continuam sendo carregados separadamente na
        biblioteca do CMS, com origem, direitos e revisão.
      </div>
      <fieldset>
        <legend>1. Selecionar planilha</legend>
        <label>
          Arquivo `.xlsx` padronizado, até 5 MB e 500 produtos
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            disabled={busy || !canEdit}
            onChange={(event) => void loadFile(event.target.files?.[0])}
          />
        </label>
        {fileName && <p className="admin-help">Arquivo selecionado: {fileName}</p>}
      </fieldset>
      <fieldset>
        <legend>2. Pré-validação</legend>
        <p>
          Produtos prontos: <strong>{rows.length}</strong> · Pendências: <strong>{errors.length}</strong>
        </p>
        <button
          type="button"
          className="admin-button"
          disabled={busy || !canEdit || !rows.length || errors.length > 0}
          onClick={() => void run("bulk_validate")}
        >
          Validar no servidor sem cadastrar
        </button>
        {errors.length > 0 && (
          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Aba</th>
                  <th>Linha</th>
                  <th>Campo</th>
                  <th>Correção necessária</th>
                </tr>
              </thead>
              <tbody>
                {errors.slice(0, 100).map((error, index) => (
                  <tr key={`${error.sheet}-${error.row}-${error.field}-${index}`}>
                    <td>{error.sheet}</td>
                    <td>{error.row}</td>
                    <td>{error.field}</td>
                    <td>{error.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </fieldset>
      <fieldset>
        <legend>3. Criar rascunhos</legend>
        <label className="admin-checkbox">
          <input
            type="checkbox"
            checked={confirmed}
            disabled={!serverValidated || busy}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          Confirmo que estes são cadastros novos, que não vieram do painel/site antigo e que as fontes e
          direitos declarados estão corretos.
        </label>
        <button
          type="button"
          className="admin-button"
          disabled={!serverValidated || !confirmed || busy}
          onClick={() => void run("bulk_create")}
        >
          Criar todo o lote como rascunho
        </button>
      </fieldset>
      {message && (
        <p className="admin-notice" role="status">
          {message}
        </p>
      )}
      {correlationId && <p className="admin-help">Código de auditoria: {correlationId}</p>}
    </section>
  );
}
