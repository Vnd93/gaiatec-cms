import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { ProductModuleTabs } from "../components/AdminModuleTabs";
import { StepTabs } from "../components/AdminUI";
import { useAdminAuth } from "../auth/AdminAuthContext";
import {
  bulkImportCommand,
  controlledVocabularyCommand,
  type ControlledVocabularyList,
} from "../api/cms-api";
import {
  BULK_IMPORT_MAX_BYTES,
  BULK_TEMPLATE_VERSION,
  buildBulkProductRows,
  bulkControlledDimensions,
  bulkRequiredHeaders,
  bulkVocabularyOptionDisplay,
  missingBulkVocabularyLabels,
  type BulkImportError,
  type BulkProductCommandRow,
  type BulkTableRow,
  type BulkVocabularyList,
  type BulkWorkbookTables,
} from "../bulk-import-model";
import { operatorErrorMessage } from "../operator-error-message";

type BulkResponse = {
  status: "valid" | "created";
  total: number;
  rows: Array<{ sourceRow: number; slug: string; itemId?: string; status?: string }>;
  errors?: BulkImportError[];
  correlationId: string;
};

const bulkErrorMessages: Record<string, string> = {
  "Há slugs duplicados no lote.": "Há endereços públicos duplicados no arquivo.",
  "O slug já existe no CMS.": "Um endereço público do arquivo já está em uso.",
  "Visibilidade deve ser público ou interno.": "Revise as opções de visibilidade desta linha.",
  "O conteúdo não atende ao contrato de produto.": "Revise os dados obrigatórios do produto.",
  "O registro não atende ao contrato integral de produto.": "Revise os dados obrigatórios do produto.",
  "Identificador de lista mestra desconhecido, inativo ou pertencente a outra dimensão.":
    "Revise a opção escolhida na classificação padronizada.",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function bulkErrorFieldLabel(value: unknown): string {
  if (value === "slug") return "Endereço público";
  if (value === "payload") return "Dados do produto";
  if (typeof value === "string" && value.startsWith("product.")) return "Classificação padronizada";
  return "Dados da linha";
}

export function normalizeBulkImportErrors(value: unknown): BulkImportError[] {
  if (value === undefined) return [];
  if (!Array.isArray(value))
    return [
      {
        sheet: "Produtos",
        row: 1,
        field: "Dados do lote",
        message: "O servidor não confirmou a validação do arquivo. Revise-o e tente novamente.",
      },
    ];

  return value.slice(0, 500).map((entry) => {
    if (!isRecord(entry))
      return {
        sheet: "Produtos",
        row: 1,
        field: "Dados do lote",
        message: "Uma pendência do arquivo não pôde ser detalhada. Revise-o e tente novamente.",
      };
    const message = typeof entry.message === "string" ? bulkErrorMessages[entry.message] : undefined;
    return {
      sheet: ["Produtos", "Modelos", "Especificacoes"].includes(String(entry.sheet))
        ? String(entry.sheet).replace("Especificacoes", "Especificações")
        : "Produtos",
      row: typeof entry.row === "number" && Number.isSafeInteger(entry.row) && entry.row > 0 ? entry.row : 1,
      field: bulkErrorFieldLabel(entry.field),
      message: message ?? "Revise os dados desta linha antes de continuar.",
    };
  });
}

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

export async function downloadBulkImportTemplate(vocabularies: BulkVocabularyList[]) {
  const missing = missingBulkVocabularyLabels(vocabularies);
  if (missing.length)
    throw new Error(`Listas mestras indisponíveis: ${missing.join(", ")}. Atualize e tente novamente.`);
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "CMS GAIATEC";
  workbook.title = "Cadastro em massa governado de produtos";
  const instructions = workbook.addWorksheet("Instrucoes", { views: [{ showGridLines: false }] });
  instructions.addRows([
    ["CADASTRO EM MASSA GOVERNADO — CMS GAIATEC"],
    ["Use somente conteúdo novo e clean-room. Exportações do painel/site antigo são proibidas."],
    [
      "Use uma referência comercial única para conectar o produto às abas Modelos e Especificacoes. O endereço público é gerado pelo CMS.",
    ],
    [
      "Escolha os nomes das listas mestras nos menus da planilha. Quando necessário, use o código estável mostrado entre colchetes.",
    ],
    [
      "O navegador resolve as escolhas e o dry-run confirma tudo no servidor. Qualquer erro cancela o lote inteiro.",
    ],
    ["Imagens e documentos seguem a biblioteca privada e não entram nesta planilha."],
  ]);
  instructions.mergeCells("A1:H1");
  instructions.mergeCells("A2:H2");
  instructions.mergeCells("A3:H3");
  instructions.mergeCells("A4:H4");
  instructions.mergeCells("A5:H5");
  instructions.mergeCells("A6:H6");
  instructions.getColumn(1).width = 120;
  instructions.getRow(1).height = 28;
  instructions.getCell("A1").font = { bold: true, color: { argb: "FFFFFFFF" }, size: 15 };
  instructions.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0057DE" } };
  for (let row = 2; row <= 6; row++) {
    instructions.getCell(row, 1).alignment = { wrapText: true, vertical: "middle" };
    instructions.getRow(row).height = 34;
  }
  const controlledOptions = workbook.addWorksheet("Listas mestras", {
    views: [{ state: "frozen", ySplit: 1, showGridLines: false }],
  });
  const validationRangeNames = new Map<string, string>();
  bulkControlledDimensions.forEach((dimension, index) => {
    const column = controlledOptions.getColumn(index + 1);
    column.width = 42;
    const header = controlledOptions.getCell(1, index + 1);
    header.value = dimension.label;
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0057DE" } };
    const list = vocabularies.find(
      (candidate) => candidate.list_key === dimension.listKey && candidate.active,
    );
    const options = (list?.options ?? [])
      .filter((option) => option.active)
      .sort((left, right) =>
        (left.sort_order ?? 0) === (right.sort_order ?? 0)
          ? left.label.localeCompare(right.label, "pt-BR")
          : (left.sort_order ?? 0) - (right.sort_order ?? 0),
      );
    options.forEach((option, optionIndex) => {
      controlledOptions.getCell(optionIndex + 2, index + 1).value = bulkVocabularyOptionDisplay(option);
    });
    const rangeName = `CMS_${dimension.payloadKey}`;
    validationRangeNames.set(dimension.listKey, rangeName);
    workbook.definedNames.add(
      `'Listas mestras'!$${column.letter}$2:$${column.letter}$${options.length + 1}`,
      rangeName,
    );
  });
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
    if (name === "Produtos") {
      sheet.getColumn("A").hidden = true;
      const productHeaders = headers as readonly string[];
      bulkControlledDimensions.forEach((dimension) => {
        const targetColumn = productHeaders.indexOf(dimension.column) + 1;
        const optionCount = vocabularies
          .find((candidate) => candidate.list_key === dimension.listKey && candidate.active)
          ?.options.filter((option) => option.active).length;
        const rangeName = validationRangeNames.get(dimension.listKey);
        if (!targetColumn || !optionCount || !rangeName) return;
        for (let row = 2; row <= 501; row += 1) {
          sheet.getCell(row, targetColumn).dataValidation = {
            type: "list",
            allowBlank: false,
            formulae: [rangeName],
            showErrorMessage: true,
            errorTitle: "Escolha inválida",
            error: `Selecione uma opção de ${dimension.label}.`,
            showInputMessage: true,
            promptTitle: dimension.label,
            prompt: "Escolha pelo nome ou pelo código estável entre colchetes.",
          };
        }
      });
    }
    for (let row = 2; row <= 501; row++) {
      sheet.getCell(row, 1).value = name === "Produtos" ? BULK_TEMPLATE_VERSION : null;
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
  link.download = "GAIATEC-CMS-Cadastro-em-Massa-v2.xlsx";
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
  const sheetLabel = key === "products" ? "Produtos" : key === "models" ? "Modelos" : "Especificações";
  if (!sheet) throw new Error(`A aba obrigatória “${sheetLabel}” não foi encontrada.`);
  const headers: string[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell: any, column: number) => {
    headers[column - 1] = textValue(cell.value).toLowerCase();
  });
  const missing = bulkRequiredHeaders[key].filter((header) => !headers.includes(header));
  if (missing.length) throw new Error(`A aba “${sheetLabel}” não contém todas as colunas obrigatórias.`);
  const rows: BulkTableRow[] = [];
  for (let rowNumber = 2; rowNumber <= sheet.actualRowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const values: BulkTableRow = {};
    headers.forEach((header, column) => {
      if (header) values[header] = textValue(row.getCell(column + 1).value);
    });
    const identityField = key === "products" ? "referencia_produto" : "produto_referencia";
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
  const [sourceDeclared, setSourceDeclared] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [activeStep, setActiveStep] = useState("file");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [vocabularies, setVocabularies] = useState<ControlledVocabularyList[]>([]);
  const [vocabularyBusy, setVocabularyBusy] = useState(false);
  const [vocabularyError, setVocabularyError] = useState("");
  const commitKey = useRef(crypto.randomUUID());
  const canEdit = profile?.permissions.includes("cms:products.edit") ?? false;
  const missingVocabularies = missingBulkVocabularyLabels(vocabularies);
  const vocabulariesReady = missingVocabularies.length === 0;

  const loadVocabularies = useCallback(async () => {
    if (!session) return;
    setVocabularyBusy(true);
    setVocabularyError("");
    try {
      const result = await controlledVocabularyCommand<{ items: ControlledVocabularyList[] }>(session, {
        action: "list",
        entityType: "product",
        includeInactive: false,
      });
      const missing = missingBulkVocabularyLabels(result.items);
      setVocabularies(result.items);
      if (missing.length) setVocabularyError(`Listas mestras sem opções ativas: ${missing.join(", ")}.`);
    } catch (caught) {
      setVocabularies([]);
      setVocabularyError(
        operatorErrorMessage(caught, {
          fallback: "Não foi possível carregar as listas mestras de produtos.",
        }),
      );
    } finally {
      setVocabularyBusy(false);
    }
  }, [session]);

  useEffect(() => {
    void loadVocabularies();
  }, [loadVocabularies]);

  async function downloadTemplate() {
    setMessage("");
    try {
      await downloadBulkImportTemplate(vocabularies);
    } catch (caught) {
      setMessage(operatorErrorMessage(caught, { fallback: "Não foi possível gerar a planilha-modelo." }));
    }
  }

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
      const result = buildBulkProductRows(tables, vocabularies);
      setFileName(file.name);
      setRows(result.rows);
      setErrors(result.errors);
      setActiveStep("validation");
      commitKey.current = crypto.randomUUID();
      setMessage(
        result.errors.length
          ? "A planilha foi lida, mas precisa de correções antes do envio."
          : `${result.rows.length} produto(s) válido(s) no navegador. Faça a validação segura no servidor.`,
      );
    } catch (caught) {
      setMessage(operatorErrorMessage(caught, { fallback: "Não foi possível ler a planilha." }));
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
      const normalizedErrors = normalizeBulkImportErrors(result.errors);
      setErrors(normalizedErrors);
      if (action === "bulk_validate") {
        setServerValidated(normalizedErrors.length === 0);
        if (normalizedErrors.length === 0) setActiveStep("confirmation");
        setMessage(
          normalizedErrors.length
            ? "O servidor encontrou pendências. Nenhum cadastro foi criado."
            : `Validação concluída: ${result.total} rascunho(s) pronto(s) para criação.`,
        );
      } else {
        setServerValidated(false);
        setConfirmed(false);
        setMessage(`Lote concluído: ${result.total} rascunho(s) criado(s), sem publicação automática.`);
      }
    } catch (caught) {
      setMessage(operatorErrorMessage(caught, { fallback: "A operação em massa não foi concluída." }));
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
      <StepTabs
        idPrefix="bulk-import"
        label="Etapas do cadastro em massa"
        active={activeStep}
        onChange={(step) => {
          const allowed =
            step === "file" ||
            (step === "validation" && Boolean(fileName)) ||
            (step === "dry-run" && rows.length > 0 && errors.length === 0) ||
            (step === "confirmation" && serverValidated);
          if (allowed) setActiveStep(step);
        }}
        steps={[
          { id: "file", label: "Arquivo" },
          {
            id: "validation",
            label: "Validação",
            description: errors.length > 0 ? `${errors.length} erro(s)` : undefined,
          },
          { id: "dry-run", label: "Dry-run" },
          { id: "confirmation", label: "Confirmação" },
        ]}
      />
      <div className="admin-workflow-actions">
        <button
          className="admin-button admin-button--secondary"
          type="button"
          disabled={vocabularyBusy || !vocabulariesReady}
          onClick={() => void downloadTemplate()}
        >
          {vocabularyBusy ? "Carregando listas mestras…" : "Baixar planilha-modelo"}
        </button>
        <Link to="/admin/produtos">Voltar aos produtos</Link>
      </div>
      <div className="admin-notice">
        Na planilha, informe referências comerciais e escolha os nomes das listas mestras. Códigos internos e
        endereços públicos são resolvidos com segurança pelo CMS antes do dry-run. Imagens e documentos
        continuam sendo carregados separadamente na biblioteca, com origem, direitos e revisão.
      </div>
      {vocabularyError && (
        <div className="admin-notice admin-notice--error" role="alert">
          <p>{vocabularyError}</p>
          <button
            type="button"
            className="admin-button admin-button--secondary"
            disabled={vocabularyBusy}
            onClick={() => void loadVocabularies()}
          >
            Tentar carregar novamente
          </button>
        </div>
      )}
      {activeStep === "file" && (
        <fieldset id="bulk-import-panel-file" role="tabpanel" aria-labelledby="bulk-import-tab-file">
          <legend>1. Arquivo e origem</legend>
          <label className="admin-checkbox">
            <input
              type="checkbox"
              checked={sourceDeclared}
              onChange={(event) => setSourceDeclared(event.target.checked)}
            />
            Declaro que o arquivo contém somente cadastros novos, com origem e direitos verificados.
          </label>
          <label>
            Arquivo `.xlsx` padronizado, até 5 MB e 500 produtos
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={busy || vocabularyBusy || !vocabulariesReady || !canEdit || !sourceDeclared}
              onChange={(event) => void loadFile(event.target.files?.[0])}
            />
          </label>
          {fileName && <p className="admin-help">Arquivo selecionado: {fileName}</p>}
        </fieldset>
      )}
      {activeStep === "validation" && (
        <fieldset
          id="bulk-import-panel-validation"
          role="tabpanel"
          aria-labelledby="bulk-import-tab-validation"
        >
          <legend>2. Validação por linha e campo</legend>
          <p>
            Produtos prontos: <strong>{rows.length}</strong> · Pendências: <strong>{errors.length}</strong>
          </p>
          {rows.length > 0 && (
            <div className="admin-table-wrap">
              <table aria-label="Mapeamentos de listas mestras resolvidos">
                <thead>
                  <tr>
                    <th>Linha</th>
                    <th>Produto</th>
                    <th>Categoria</th>
                    <th>Aplicação ou grandeza</th>
                    <th>Tecnologia</th>
                    <th>Instalação ou operação</th>
                    <th>Elemento monitorado</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 100).map((row) => (
                    <tr key={`${row.sourceRow}-${row.slug}`}>
                      <td>{row.sourceRow}</td>
                      <td>{row.payload.title}</td>
                      <td>{row.payload.controlledClassification?.productCategory.label ?? "—"}</td>
                      <td>{row.payload.controlledClassification?.applicationMagnitude.label ?? "—"}</td>
                      <td>{row.payload.controlledClassification?.technology.label ?? "—"}</td>
                      <td>{row.payload.controlledClassification?.installationOperation.label ?? "—"}</td>
                      <td>{row.payload.controlledClassification?.monitoredElement.label ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 100 && (
                <p className="admin-help">
                  Exibindo os primeiros 100 produtos. O lote completo será validado.
                </p>
              )}
            </div>
          )}
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
          {errors.length === 0 && rows.length > 0 && (
            <button type="button" className="admin-button" onClick={() => setActiveStep("dry-run")}>
              Continuar para o dry-run
            </button>
          )}
        </fieldset>
      )}
      {activeStep === "dry-run" && (
        <fieldset id="bulk-import-panel-dry-run" role="tabpanel" aria-labelledby="bulk-import-tab-dry-run">
          <legend>3. Dry-run</legend>
          <p>O servidor validará contratos, duplicidades e permissões sem criar ou publicar registros.</p>
          <button
            type="button"
            className="admin-button"
            disabled={busy || !canEdit || !rows.length || errors.length > 0}
            onClick={() => void run("bulk_validate")}
          >
            {busy ? "Simulando…" : "Executar dry-run"}
          </button>
        </fieldset>
      )}
      {activeStep === "confirmation" && (
        <fieldset
          id="bulk-import-panel-confirmation"
          role="tabpanel"
          aria-labelledby="bulk-import-tab-confirmation"
        >
          <legend>4. Confirmação</legend>
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
      )}
      {message && (
        <p className="admin-notice" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
