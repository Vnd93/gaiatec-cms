import { useEffect, useMemo, useState } from "react";
import { documentCommand } from "../api/cms-api";
import { useAdminAuth } from "../auth/AdminAuthContext";
import {
  addProductDocument,
  parseProductDocuments,
  uploadDocumentFile,
  validateDocumentUpload,
  type DocumentUploadDescriptor,
  type ProductDocument,
} from "../document-upload-model";

type LibraryItem = {
  document: ProductDocument;
  byteSize: number;
  createdAt: string;
  archived: boolean;
  lockVersion: number;
};

type SecurityReviewItem = {
  document: ProductDocument;
  byteSize: number;
  createdAt: string;
  sourceKind:
    "synthetic_test" | "owner_authored" | "official_manufacturer" | "official_company" | "legacy_import";
  prefilterEngine: "pdf-passive-prefilter-v2" | "legacy-unverified-import-v1";
  prefilteredAt: string;
  lockVersion: number;
  canReview: boolean;
  qaSyntheticAttestationAllowed: boolean;
};

type UploadForm = {
  kind: ProductDocument["kind"];
  title: string;
  revision: string;
  language: string;
  visibility: ProductDocument["visibility"];
  sourceKind: "synthetic_test" | "owner_authored" | "official_manufacturer" | "official_company";
  sourceReference: string;
  licenseName: string;
  ownerName: string;
  rightsConfirmed: boolean;
};

const initialForm: UploadForm = {
  kind: "datasheet",
  title: "",
  revision: "1",
  language: "pt-BR",
  visibility: "public",
  sourceKind: "owner_authored",
  sourceReference: "",
  licenseName: "Uso autorizado pela GAIATEC",
  ownerName: "GAIATEC SISTEMAS",
  rightsConfirmed: false,
};

const kindLabels: Record<ProductDocument["kind"], string> = {
  datasheet: "Ficha técnica",
  manual: "Manual",
  certificate: "Certificado",
  drawing: "Desenho técnico",
  software: "Documento de software",
  other: "Outro",
};

const sourceKindLabels: Record<SecurityReviewItem["sourceKind"], string> = {
  synthetic_test: "Homologação sintética",
  owner_authored: "Produzido pelo proprietário",
  official_manufacturer: "Fabricante oficial",
  official_company: "Documento oficial da empresa",
  legacy_import: "Importação anterior",
};

const prefilterEngineLabels: Record<SecurityReviewItem["prefilterEngine"], string> = {
  "pdf-passive-prefilter-v2": "Pré-verificação estrutural de PDF",
  "legacy-unverified-import-v1": "Importação anterior ainda não verificada",
};

function formatBytes(value: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value / 1024 / 1024) + " MB";
}

export function ProductDocumentsEditor({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange(value: string): void;
  disabled?: boolean;
}) {
  const { session, profile } = useAdminAuth();
  const parsed = useMemo(() => parseProductDocuments(value), [value]);
  const [open, setOpen] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showSecurityReview, setShowSecurityReview] = useState(false);
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [securityReviewItems, setSecurityReviewItems] = useState<SecurityReviewItem[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState<UploadForm>(initialForm);
  const [scannerEngine, setScannerEngine] = useState<
    "clamav-corporate-v1" | "microsoft-defender-corporate-v1" | "qa-synthetic-attestation-v1"
  >("clamav-corporate-v1");
  const [scannerEvidenceReference, setScannerEvidenceReference] = useState("");
  const [scannerEvidenceSha256, setScannerEvidenceSha256] = useState("");
  const [rejectionVerdict, setRejectionVerdict] = useState<"malicious" | "suspicious" | "scan_failed">(
    "malicious",
  );
  const canRead = profile?.permissions.includes("cms:documents.read") ?? false;
  const canUpload = profile?.permissions.includes("cms:documents.upload") ?? false;
  const canManage = profile?.permissions.includes("cms:documents.manage") ?? false;
  const canSecurityReview = profile?.permissions.includes("cms:documents.security_review") ?? false;
  const hasMfa = profile?.mfaVerified ?? false;

  async function load() {
    if (!session || !canRead) return;
    setLoading(true);
    setError("");
    try {
      const result = await documentCommand<{ items: LibraryItem[] }>(session, {
        action: "list",
        query,
        page: 1,
        pageSize: 50,
        includeArchived: canManage && hasMfa,
      });
      setItems(result.items);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível carregar os documentos.");
    } finally {
      setLoading(false);
    }
  }

  async function loadSecurityReview() {
    if (!session || !canSecurityReview || !hasMfa) return;
    setLoading(true);
    setError("");
    try {
      const result = await documentCommand<{ items: SecurityReviewItem[] }>(session, {
        action: "list_security_review",
        query,
        page: 1,
        pageSize: 50,
      });
      setSecurityReviewItems(result.items);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível carregar a fila de segurança.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open && canRead) void load();
  }, [open, canRead, canManage, hasMfa]); // eslint-disable-line react-hooks/exhaustive-deps

  function updateForm<K extends keyof UploadForm>(key: K, next: UploadForm[K]) {
    setForm((current) => ({ ...current, [key]: next }));
  }

  function commit(documents: ProductDocument[]) {
    onChange(JSON.stringify(documents, null, 2));
  }

  function select(document: ProductDocument) {
    try {
      commit(addProductDocument(parsed.documents, document));
      setSuccess(`Documento “${document.title}” adicionado ao rascunho do produto.`);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível adicionar o documento.");
    }
  }

  async function transition(item: LibraryItem, action: "archive_document" | "restore_document") {
    if (!session || busy || !canManage || !hasMfa) return;
    const archive = action === "archive_document";
    const confirmed = window.confirm(
      archive
        ? `Arquivar “${item.document.title}”? O PDF será preservado e não poderá estar em nenhuma publicação ativa.`
        : `Restaurar “${item.document.title}” para a biblioteca ativa?`,
    );
    if (!confirmed) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await documentCommand(session, {
        action,
        documentId: item.document.id,
        expectedLockVersion: item.lockVersion,
      });
      if (archive && parsed.documents.some((document) => document.id === item.document.id))
        commit(parsed.documents.filter((document) => document.id !== item.document.id));
      setSuccess(
        archive
          ? `Documento “${item.document.title}” arquivado; o arquivo e a auditoria foram preservados.`
          : `Documento “${item.document.title}” restaurado.`,
      );
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível alterar o documento.");
    } finally {
      setBusy(false);
    }
  }

  async function downloadForSecurityReview(item: SecurityReviewItem) {
    if (!session || busy || !canSecurityReview || !hasMfa || !item.canReview) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await documentCommand<{
        signedUrl: string;
        expectedSha256: string;
        disposition: "attachment";
      }>(session, {
        action: "review_download",
        documentId: item.document.id,
      });
      if (result.expectedSha256 !== item.document.sha256 || result.disposition !== "attachment")
        throw new Error("O download de revisão não corresponde ao hash em quarentena.");
      window.open(result.signedUrl, "_blank", "noopener,noreferrer");
      setSuccess(
        `Download isolado de “${item.document.title}” preparado como anexo. Confirme o SHA-256 no scanner corporativo.`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível preparar o download de revisão.");
    } finally {
      setBusy(false);
    }
  }

  async function reviewSecurity(item: SecurityReviewItem, decision: "approve" | "reject") {
    if (!session || busy || !canSecurityReview || !hasMfa || !item.canReview) return;
    const effectiveScannerEngine =
      !item.qaSyntheticAttestationAllowed && scannerEngine === "qa-synthetic-attestation-v1"
        ? "clamav-corporate-v1"
        : scannerEngine;
    const evidenceReference = scannerEvidenceReference.trim();
    const evidenceSha256 = scannerEvidenceSha256.trim().toLowerCase();
    if (!/^[A-Za-z0-9][A-Za-z0-9._:/#-]{2,179}$/.test(evidenceReference)) {
      setError("Informe a referência controlada do relatório do scanner, sem espaços.");
      return;
    }
    if (!/^[0-9a-f]{64}$/.test(evidenceSha256)) {
      setError("Informe o SHA-256 do relatório produzido pelo scanner corporativo.");
      return;
    }
    const confirmed = window.confirm(
      decision === "approve"
        ? `Atestar “${item.document.title}” como seguro para uso após conferir arquivo, hash e relatório externo?`
        : `Rejeitar “${item.document.title}” conforme o relatório externo? O arquivo continuará isolado.`,
    );
    if (!confirmed) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await documentCommand<{ status: "ready" | "rejected"; expectedSha256: string }>(
        session,
        {
          action: "review_security",
          documentId: item.document.id,
          expectedSha256: item.document.sha256,
          decision,
          scannerEngine: effectiveScannerEngine,
          scannerVerdict: decision === "approve" ? "clean" : rejectionVerdict,
          evidenceSha256,
          evidenceReference,
        },
      );
      if (result.expectedSha256 !== item.document.sha256)
        throw new Error("A atestação não corresponde ao SHA-256 em quarentena.");
      setSuccess(
        decision === "approve"
          ? `Documento “${item.document.title}” liberado após atestação externa por segundo ator.`
          : `Documento “${item.document.title}” rejeitado e mantido fora de qualquer publicação.`,
      );
      setScannerEvidenceReference("");
      setScannerEvidenceSha256("");
      await Promise.all([load(), loadSecurityReview()]);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Não foi possível registrar a revisão de segurança.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitUpload(event: React.FormEvent) {
    event.preventDefault();
    if (!session || busy || parsed.error) return;
    const issues = validateDocumentUpload(file);
    if (!form.title.trim()) issues.push("Informe o título do documento.");
    if (!form.revision.trim()) issues.push("Informe a revisão do documento.");
    if (!/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/.test(form.language.trim()))
      issues.push("Informe um idioma válido, como pt-BR ou en.");
    if (form.sourceReference.trim().length < 3) issues.push("Informe a referência da origem.");
    if (form.licenseName.trim().length < 2) issues.push("Informe a licença de uso.");
    if (form.ownerName.trim().length < 2) issues.push("Informe o proprietário dos direitos.");
    if (!form.rightsConfirmed) issues.push("Confirme os direitos de uso e publicação.");
    if (!hasMfa) issues.push("Confirme o MFA da sessão antes de enviar documentos.");
    if (issues.length) {
      setError(issues[0]!);
      return;
    }
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const reservation = await documentCommand<DocumentUploadDescriptor>(session, {
        action: "reserve_upload",
        metadata: {
          originalFilename: file!.name,
          declaredMime: "application/pdf",
          kind: form.kind,
          title: form.title,
          revision: form.revision,
          language: form.language,
          visibility: form.visibility,
          sourceKind: form.sourceKind,
          sourceReference: form.sourceReference,
          licenseName: form.licenseName,
          ownerName: form.ownerName,
          rightsConfirmed: true,
        },
      });
      await uploadDocumentFile(reservation, file!);
      const finalized = await documentCommand<{ document: ProductDocument; status: "quarantined" }>(session, {
        action: "finalize_upload",
        documentId: reservation.documentId,
      });
      if (finalized.status !== "quarantined")
        throw new Error("O backend não confirmou a quarentena obrigatória do documento.");
      setFile(null);
      setForm(initialForm);
      setShowUpload(false);
      setShowSecurityReview(canSecurityReview && hasMfa);
      setSuccess(
        `Documento “${finalized.document.title}” passou somente pela pré-verificação estrutural e está em quarentena. Outro revisor com MFA deve conferir um scanner externo antes do vínculo.`,
      );
      await load();
      if (canSecurityReview && hasMfa) await loadSecurityReview();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível concluir o upload do PDF.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <fieldset className="admin-document-picker">
      <legend>Documentos técnicos</legend>
      <p className="admin-help">
        PDFs ficam na biblioteca privada. A pré-verificação estrutural não é antivírus e sempre deixa o envio
        em quarentena. A liberação exige outro revisor com MFA e conferência em um scanner corporativo; o site
        entrega somente anexos temporários já aprovados.
      </p>
      {parsed.error && (
        <p className="admin-notice admin-notice--error" role="alert">
          {parsed.error}
        </p>
      )}
      {parsed.documents.length ? (
        <ul className="admin-document-picker__selection" aria-label="Documentos vinculados ao produto">
          {parsed.documents.map((document) => (
            <li key={document.id}>
              <span>
                <strong>{document.title}</strong>
                <small>
                  {kindLabels[document.kind]} · revisão {document.revision} · {document.language} ·{" "}
                  {document.visibility === "public" ? "público" : "privado"}
                </small>
              </span>
              <button
                type="button"
                disabled={disabled || busy || Boolean(parsed.error)}
                onClick={() => commit(parsed.documents.filter((current) => current.id !== document.id))}
              >
                Remover vínculo
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="admin-empty-inline">Nenhum documento vinculado.</p>
      )}
      {!canRead ? (
        <p className="admin-notice admin-notice--error">Seu papel não permite consultar documentos.</p>
      ) : (
        <button type="button" disabled={Boolean(parsed.error)} onClick={() => setOpen(!open)}>
          {open ? "Fechar biblioteca de documentos" : "Escolher ou enviar documento"}
        </button>
      )}
      {error && (
        <p className="admin-notice admin-notice--error" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="admin-notice admin-notice--success" role="status">
          {success}
        </p>
      )}
      {open && canRead && (
        <div className="admin-document-picker__panel">
          <div className="admin-document-picker__filters">
            <label>
              Buscar por título
              <input maxLength={120} value={query} onChange={(event) => setQuery(event.target.value)} />
            </label>
            <button type="button" disabled={loading} onClick={() => void load()}>
              {loading ? "Buscando…" : "Buscar"}
            </button>
          </div>
          {canSecurityReview && (
            <section aria-labelledby="document-security-review-title">
              <h3 id="document-security-review-title">Revisão de segurança de documentos</h3>
              <p className="admin-help">
                Esta fila não executa antivírus. Baixe como anexo, verifique o SHA-256 no scanner corporativo
                permitido e registre somente o identificador e o hash do relatório. O autor do upload nunca
                pode aprovar o próprio arquivo.
              </p>
              {!hasMfa ? (
                <p className="admin-notice admin-notice--error" role="alert">
                  Confirme a autenticação em duas etapas para consultar ou decidir a fila de segurança.
                </p>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={loading || busy}
                    onClick={() => {
                      setShowSecurityReview(!showSecurityReview);
                      if (!showSecurityReview) void loadSecurityReview();
                    }}
                  >
                    {showSecurityReview ? "Fechar fila de segurança" : "Abrir fila de segurança"}
                  </button>
                  {showSecurityReview && (
                    <div className="admin-document-picker__upload">
                      <label>
                        Referência do relatório do scanner
                        <input
                          required
                          minLength={3}
                          value={scannerEvidenceReference}
                          maxLength={180}
                          placeholder="SECURITY-SCAN-2026-0001"
                          disabled={busy}
                          onChange={(event) => setScannerEvidenceReference(event.target.value)}
                        />
                      </label>
                      <label>
                        SHA-256 do relatório do scanner
                        <input
                          required
                          value={scannerEvidenceSha256}
                          inputMode="text"
                          maxLength={64}
                          pattern="[0-9a-fA-F]{64}"
                          disabled={busy}
                          onChange={(event) => setScannerEvidenceSha256(event.target.value)}
                        />
                      </label>
                      <label>
                        Veredito para rejeição
                        <select
                          value={rejectionVerdict}
                          disabled={busy}
                          onChange={(event) =>
                            setRejectionVerdict(
                              event.target.value as "malicious" | "suspicious" | "scan_failed",
                            )
                          }
                        >
                          <option value="malicious">Malicioso</option>
                          <option value="suspicious">Suspeito</option>
                          <option value="scan_failed">Scanner falhou</option>
                        </select>
                      </label>
                      {securityReviewItems.length ? (
                        <ul
                          className="admin-document-picker__library"
                          aria-label="Fila de revisão de segurança"
                        >
                          {securityReviewItems.map((item) => (
                            <li key={item.document.id}>
                              <span>
                                <strong>{item.document.title}</strong>
                                <small>
                                  {formatBytes(item.byteSize)} · SHA-256 {item.document.sha256} ·{" "}
                                  {prefilterEngineLabels[item.prefilterEngine]} ·{" "}
                                  {sourceKindLabels[item.sourceKind]}
                                </small>
                                {!item.canReview && (
                                  <small>Segregação ativa: peça a outro revisor com MFA.</small>
                                )}
                              </span>
                              <span className="admin-document-picker__actions">
                                <label>
                                  Scanner/atestação para {item.document.title}
                                  <select
                                    value={
                                      !item.qaSyntheticAttestationAllowed &&
                                      scannerEngine === "qa-synthetic-attestation-v1"
                                        ? "clamav-corporate-v1"
                                        : scannerEngine
                                    }
                                    disabled={busy || !item.canReview}
                                    onChange={(event) =>
                                      setScannerEngine(
                                        event.target.value as
                                          | "clamav-corporate-v1"
                                          | "microsoft-defender-corporate-v1"
                                          | "qa-synthetic-attestation-v1",
                                      )
                                    }
                                  >
                                    <option value="clamav-corporate-v1">
                                      Atestação manual — ClamAV corporativo v1
                                    </option>
                                    <option value="microsoft-defender-corporate-v1">
                                      Atestação manual — Microsoft Defender corporativo v1
                                    </option>
                                    {item.qaSyntheticAttestationAllowed && (
                                      <option value="qa-synthetic-attestation-v1">
                                        Fixture sintética QA (somente lease controlado)
                                      </option>
                                    )}
                                  </select>
                                </label>
                                <button
                                  type="button"
                                  disabled={busy || !item.canReview}
                                  onClick={() => void downloadForSecurityReview(item)}
                                >
                                  Baixar anexo para scanner
                                </button>
                                <button
                                  type="button"
                                  disabled={busy || !item.canReview}
                                  onClick={() => void reviewSecurity(item, "approve")}
                                >
                                  Atestar como seguro
                                </button>
                                <button
                                  type="button"
                                  disabled={busy || !item.canReview}
                                  onClick={() => void reviewSecurity(item, "reject")}
                                >
                                  Rejeitar documento
                                </button>
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="admin-empty-inline">Nenhum documento aguarda revisão de segurança.</p>
                      )}
                    </div>
                  )}
                </>
              )}
            </section>
          )}
          {loading ? (
            <p aria-live="polite">Carregando biblioteca…</p>
          ) : items.length ? (
            <ul className="admin-document-picker__library" aria-label="Biblioteca de documentos">
              {items.map((item) => {
                const { document, byteSize, archived } = item;
                const selected = parsed.documents.some((current) => current.id === document.id);
                return (
                  <li key={document.id}>
                    <span>
                      <strong>{document.title}</strong>
                      <small>
                        {kindLabels[document.kind]} · {document.language} · {formatBytes(byteSize)} ·{" "}
                        {document.visibility === "public" ? "público" : "privado"} ·{" "}
                        {archived ? "arquivado" : "ativo"}
                      </small>
                    </span>
                    <span className="admin-document-picker__actions">
                      <button
                        type="button"
                        disabled={disabled || selected || archived || busy}
                        onClick={() => select(document)}
                      >
                        {selected ? "Já vinculado" : "Adicionar ao produto"}
                      </button>
                      {canManage && hasMfa && (
                        <button
                          type="button"
                          disabled={disabled || busy}
                          onClick={() =>
                            void transition(item, archived ? "restore_document" : "archive_document")
                          }
                        >
                          {archived ? "Restaurar documento" : "Arquivar documento"}
                        </button>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="admin-empty-inline">Nenhum PDF aprovado por atestação externa encontrado.</p>
          )}
          {canUpload && (
            <>
              <button type="button" disabled={disabled} onClick={() => setShowUpload(!showUpload)}>
                {showUpload ? "Cancelar envio" : "Enviar novo PDF"}
              </button>
              {showUpload && (
                <form
                  className="admin-form admin-document-picker__upload"
                  aria-label="Enviar documento governado"
                  noValidate
                  onSubmit={submitUpload}
                >
                  {!hasMfa && (
                    <p className="admin-notice admin-notice--error" role="alert">
                      Uma sessão com MFA confirmado é obrigatória para enviar documentos.
                    </p>
                  )}
                  <label>
                    Arquivo PDF
                    <input
                      type="file"
                      required
                      accept="application/pdf,.pdf"
                      disabled={busy}
                      onChange={(event) => {
                        const next = event.target.files?.[0] ?? null;
                        setFile(next);
                        if (next && !form.title)
                          updateForm("title", next.name.replace(/\.pdf$/i, "").replace(/[-_]+/g, " "));
                      }}
                    />
                  </label>
                  <label>
                    Título público/interno
                    <input
                      required
                      minLength={1}
                      maxLength={180}
                      value={form.title}
                      disabled={busy}
                      onChange={(event) => updateForm("title", event.target.value)}
                    />
                  </label>
                  <label>
                    Tipo
                    <select
                      value={form.kind}
                      disabled={busy}
                      onChange={(event) => updateForm("kind", event.target.value as UploadForm["kind"])}
                    >
                      {Object.entries(kindLabels).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Revisão
                    <input
                      required
                      minLength={1}
                      maxLength={80}
                      value={form.revision}
                      disabled={busy}
                      onChange={(event) => updateForm("revision", event.target.value)}
                    />
                  </label>
                  <label>
                    Idioma
                    <input
                      required
                      maxLength={20}
                      pattern="[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})?"
                      placeholder="pt-BR"
                      value={form.language}
                      disabled={busy}
                      onChange={(event) => updateForm("language", event.target.value)}
                    />
                  </label>
                  <label>
                    Visibilidade
                    <select
                      value={form.visibility}
                      disabled={busy}
                      onChange={(event) =>
                        updateForm("visibility", event.target.value as UploadForm["visibility"])
                      }
                    >
                      <option value="public">Público após publicação</option>
                      <option value="private">Somente CMS e pré-visualização autorizada</option>
                    </select>
                  </label>
                  <label>
                    Origem
                    <select
                      value={form.sourceKind}
                      disabled={busy}
                      onChange={(event) =>
                        updateForm("sourceKind", event.target.value as UploadForm["sourceKind"])
                      }
                    >
                      <option value="owner_authored">Produzido pelo proprietário</option>
                      <option value="official_manufacturer">Fabricante oficial</option>
                      <option value="official_company">Documento oficial da empresa</option>
                      <option value="synthetic_test">Sintético de homologação</option>
                    </select>
                  </label>
                  <label>
                    Referência da origem
                    <input
                      required
                      minLength={3}
                      maxLength={500}
                      value={form.sourceReference}
                      disabled={busy}
                      onChange={(event) => updateForm("sourceReference", event.target.value)}
                    />
                  </label>
                  <label>
                    Licença/autorização
                    <input
                      required
                      minLength={2}
                      maxLength={120}
                      value={form.licenseName}
                      disabled={busy}
                      onChange={(event) => updateForm("licenseName", event.target.value)}
                    />
                  </label>
                  <label>
                    Proprietário dos direitos
                    <input
                      required
                      minLength={2}
                      maxLength={120}
                      value={form.ownerName}
                      disabled={busy}
                      onChange={(event) => updateForm("ownerName", event.target.value)}
                    />
                  </label>
                  <label className="admin-checkbox">
                    <input
                      type="checkbox"
                      required
                      checked={form.rightsConfirmed}
                      disabled={busy}
                      onChange={(event) => updateForm("rightsConfirmed", event.target.checked)}
                    />
                    Confirmo os direitos de armazenamento e publicação deste documento.
                  </label>
                  <button type="submit" disabled={busy || !hasMfa}>
                    {busy ? "Enviando para quarentena…" : "Enviar PDF para quarentena"}
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      )}
    </fieldset>
  );
}
