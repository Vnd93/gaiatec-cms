import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProductDocumentsEditor } from "@/admin/components/ProductDocumentsEditor";

const mocks = vi.hoisted(() => ({
  command: vi.fn(),
  auth: {
    session: { access_token: "test-token" },
    profile: {
      permissions: [
        "cms:documents.read",
        "cms:documents.upload",
        "cms:documents.manage",
        "cms:documents.security_review",
        "cms:products.edit",
      ],
      mfaVerified: true,
    },
  },
}));

vi.mock("@/admin/api/cms-api", () => ({ documentCommand: mocks.command }));
vi.mock("@/admin/auth/AdminAuthContext", () => ({ useAdminAuth: () => mocks.auth }));

const libraryDocument = {
  id: "57000000-0000-4000-8000-000000000001",
  kind: "manual" as const,
  title: "Manual governado",
  storagePath: "cms-documents/57000000-0000-4000-8000-000000000001/manual.pdf",
  sha256: "a".repeat(64),
  revision: "A",
  language: "pt-br",
  visibility: "public" as const,
  rightsConfirmed: true as const,
};

const archivedDocument = {
  ...libraryDocument,
  id: "57000000-0000-4000-8000-000000000003",
  title: "Manual arquivado",
  storagePath: "cms-documents/57000000-0000-4000-8000-000000000003/manual-arquivado.pdf",
};

describe("product document picker", () => {
  beforeEach(() => {
    mocks.command.mockReset();
    mocks.auth.profile.mfaVerified = true;
    mocks.auth.profile.permissions = [
      "cms:documents.read",
      "cms:documents.upload",
      "cms:documents.manage",
      "cms:documents.security_review",
      "cms:products.edit",
    ];
    mocks.command.mockImplementation((_session, body: Record<string, unknown>) => {
      if (body.action === "list")
        return Promise.resolve({
          items: [
            {
              document: libraryDocument,
              byteSize: 1024,
              createdAt: "2026-09-06T00:00:00Z",
              archived: false,
              lockVersion: 1,
            },
            {
              document: archivedDocument,
              byteSize: 2048,
              createdAt: "2026-09-05T00:00:00Z",
              archived: true,
              lockVersion: 2,
            },
          ],
        });
      if (body.action === "reserve_upload")
        return Promise.resolve({
          documentId: "57000000-0000-4000-8000-000000000002",
          storagePath: "cms-documents/57000000-0000-4000-8000-000000000002/novo.pdf",
          signedUrl: "https://storage.example/signed",
        });
      if (body.action === "finalize_upload")
        return Promise.resolve({
          status: "quarantined",
          document: {
            ...libraryDocument,
            id: "57000000-0000-4000-8000-000000000002",
            title: "Novo PDF",
            storagePath: "cms-documents/57000000-0000-4000-8000-000000000002/novo.pdf",
          },
        });
      if (body.action === "list_security_review")
        return Promise.resolve({
          items: [
            {
              document: libraryDocument,
              byteSize: 1024,
              createdAt: "2026-09-06T00:00:00Z",
              sourceKind: "owner_authored",
              prefilterEngine: "pdf-passive-prefilter-v2",
              prefilteredAt: "2026-09-06T00:01:00Z",
              lockVersion: 1,
              canReview: true,
              qaSyntheticAttestationAllowed: false,
            },
          ],
        });
      if (body.action === "review_security")
        return Promise.resolve({
          status: body.decision === "approve" ? "ready" : "rejected",
          expectedSha256: libraryDocument.sha256,
        });
      if (body.action === "archive_document" || body.action === "restore_document")
        return Promise.resolve({ status: body.action === "archive_document" ? "archived" : "ready" });
      throw new Error(`Ação inesperada: ${String(body.action)}`);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("loads the private library and adds a validated record without JSON editing", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ProductDocumentsEditor value="[]" onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Escolher ou enviar documento" }));
    const activeDocument = (await screen.findByText("Manual governado")).closest("li");
    expect(activeDocument).not.toBeNull();
    await user.click(within(activeDocument!).getByRole("button", { name: "Adicionar ao produto" }));
    expect(onChange).toHaveBeenCalledWith(expect.stringContaining(libraryDocument.id));
    expect(screen.queryByRole("textbox", { name: /JSON/ })).not.toBeInTheDocument();
  });

  it("uploads and quarantines a PDF without linking it before an external attestation", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const upload = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", upload);
    render(<ProductDocumentsEditor value="[]" onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Escolher ou enviar documento" }));
    await screen.findByText("Manual governado");
    await user.click(screen.getByRole("button", { name: "Enviar novo PDF" }));
    const file = new File(["%PDF-1.7\n1 0 obj\n%%EOF"], "novo.pdf", { type: "application/pdf" });
    await user.upload(screen.getByLabelText("Arquivo PDF"), file);
    await user.clear(screen.getByLabelText("Título público/interno"));
    await user.type(screen.getByLabelText("Título público/interno"), "Novo PDF");
    await user.clear(screen.getByLabelText("Referência da origem"));
    await user.type(screen.getByLabelText("Referência da origem"), "QA-CMS-FINAL");
    const rights = screen.getByLabelText(/Confirmo os direitos/);
    await user.click(rights);
    expect(rights).toBeChecked();
    const submit = screen.getByRole("button", { name: "Enviar PDF para quarentena" });
    await user.click(submit);
    await waitFor(() =>
      expect(mocks.command).toHaveBeenCalledWith(
        mocks.auth.session,
        expect.objectContaining({ action: "reserve_upload" }),
      ),
    );
    await waitFor(() => expect(upload).toHaveBeenCalled());
    await waitFor(() =>
      expect(mocks.command).toHaveBeenCalledWith(
        mocks.auth.session,
        expect.objectContaining({ action: "finalize_upload" }),
      ),
    );
    expect(onChange).not.toHaveBeenCalled();
    expect(await screen.findByRole("status")).toHaveTextContent("somente pela pré-verificação estrutural");
    expect(upload).toHaveBeenCalledWith(
      "https://storage.example/signed",
      expect.objectContaining({ method: "PUT", headers: { "Content-Type": "application/pdf" } }),
    );
  });

  it("blocks upload controls when MFA is not confirmed", async () => {
    mocks.auth.profile.mfaVerified = false;
    const user = userEvent.setup();
    render(<ProductDocumentsEditor value="[]" onChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Escolher ou enviar documento" }));
    await screen.findByText("Manual governado");
    await user.click(screen.getByRole("button", { name: "Enviar novo PDF" }));
    expect(screen.getByText(/Uma sessão com MFA confirmado/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enviar PDF para quarentena" })).toBeDisabled();
  });

  it("records approval or rejection only through the explicit second-actor security UI", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<ProductDocumentsEditor value="[]" onChange={vi.fn()} disabled />);
    await user.click(screen.getByRole("button", { name: "Escolher ou enviar documento" }));
    await screen.findByText("Manual governado");
    await user.click(screen.getByRole("button", { name: "Abrir fila de segurança" }));
    const queue = await screen.findByRole("list", { name: "Fila de revisão de segurança" });
    await user.selectOptions(
      within(queue).getByLabelText(`Scanner/atestação para ${libraryDocument.title}`),
      "clamav-corporate-v1",
    );
    await user.type(
      within(queue.parentElement!).getByLabelText("Referência do relatório do scanner"),
      "SECURITY-SCAN-2026-0001",
    );
    await user.type(
      within(queue.parentElement!).getByLabelText("SHA-256 do relatório do scanner"),
      "b".repeat(64),
    );
    await user.click(within(queue).getByRole("button", { name: "Atestar como seguro" }));
    await waitFor(() =>
      expect(mocks.command).toHaveBeenCalledWith(
        mocks.auth.session,
        expect.objectContaining({
          action: "review_security",
          documentId: libraryDocument.id,
          expectedSha256: libraryDocument.sha256,
          decision: "approve",
          scannerVerdict: "clean",
          evidenceSha256: "b".repeat(64),
        }),
      ),
    );
    expect(screen.getByRole("status")).toHaveTextContent("segundo ator");
  });

  it("archives an unreferenced document with optimistic locking and removes its draft link", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<ProductDocumentsEditor value={JSON.stringify([libraryDocument])} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Escolher ou enviar documento" }));
    await screen.findByText("Manual arquivado");
    await user.click(screen.getByRole("button", { name: "Arquivar documento" }));
    await waitFor(() =>
      expect(mocks.command).toHaveBeenCalledWith(
        mocks.auth.session,
        expect.objectContaining({
          action: "archive_document",
          documentId: libraryDocument.id,
          expectedLockVersion: 1,
        }),
      ),
    );
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("[]"));
  });

  it("restores an archived document with its current lock version", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<ProductDocumentsEditor value="[]" onChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Escolher ou enviar documento" }));
    await screen.findByText("Manual arquivado");
    await user.click(screen.getByRole("button", { name: "Restaurar documento" }));
    await waitFor(() =>
      expect(mocks.command).toHaveBeenCalledWith(
        mocks.auth.session,
        expect.objectContaining({
          action: "restore_document",
          documentId: archivedDocument.id,
          expectedLockVersion: 2,
        }),
      ),
    );
  });

  it("reports a published-reference conflict without mutating the draft", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mocks.command.mockImplementation((_session, body: Record<string, unknown>) => {
      if (body.action === "list")
        return Promise.resolve({
          items: [
            {
              document: libraryDocument,
              byteSize: 1024,
              createdAt: "2026-09-06T00:00:00Z",
              archived: false,
              lockVersion: 1,
            },
          ],
        });
      if (body.action === "archive_document")
        return Promise.reject(new Error("Despublique o conteúdo que usa este documento."));
      throw new Error(`Ação inesperada: ${String(body.action)}`);
    });
    render(<ProductDocumentsEditor value="[]" onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Escolher ou enviar documento" }));
    await screen.findByText("Manual governado");
    await user.click(screen.getByRole("button", { name: "Arquivar documento" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Despublique o conteúdo");
    expect(onChange).not.toHaveBeenCalled();
  });
});
