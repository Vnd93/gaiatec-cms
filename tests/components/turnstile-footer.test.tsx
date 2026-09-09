import { StrictMode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Footer } from "../../src/app/components/Footer";
import { TurnstileChallenge } from "../../src/app/components/TurnstileChallenge";
import { CmsLeadForm } from "../../src/public/components/CmsLeadForm";

const mocks = vi.hoisted(() => ({
  getPublishedForm: vi.fn(),
  submitGovernedLead: vi.fn(),
  usePublishedSiteShell: vi.fn(),
}));

vi.mock("../../src/public/site-shell-context", () => ({
  usePublishedSiteShell: mocks.usePublishedSiteShell,
}));

vi.mock("../../src/public/catalog-api", () => ({
  getPublishedForm: mocks.getPublishedForm,
}));

vi.mock("../../src/public/lead-api", () => ({
  submitGovernedLead: mocks.submitGovernedLead,
}));

type TurnstileOptions = {
  sitekey: string;
  action: string;
  cData: string;
  language: string;
  theme: "light" | "dark";
  "response-field": false;
  retry: "never";
  "refresh-expired": "manual";
  "refresh-timeout": "manual";
  callback: (token: string) => void;
  "expired-callback": () => void;
  "timeout-callback": () => void;
  "error-callback": (code?: string) => boolean;
  "unsupported-callback": () => void;
};

const COMMERCIAL_IDEMPOTENCY_KEY = "65ce5231-ee71-41ba-aaf8-b8c77f4cd42d";
const NEXT_COMMERCIAL_IDEMPOTENCY_KEY = "9cc939db-d4a1-4e56-b69b-b897d30f1e9c";

function installTurnstile({
  withReset = true,
  removeThrows = false,
}: { withReset?: boolean; removeThrows?: boolean } = {}) {
  const options: TurnstileOptions[] = [];
  const containers = new Map<string, HTMLElement>();
  const renderWidget = vi.fn((container: HTMLElement, rawOptions: Record<string, unknown>) => {
    options.push(rawOptions as TurnstileOptions);
    const widgetId = `widget-${options.length}`;
    containers.set(widgetId, container);
    const widget = document.createElement("div");
    widget.dataset.turnstileWidget = widgetId;
    container.appendChild(widget);
    if (rawOptions["response-field"] !== false) {
      const response = document.createElement("input");
      response.name = "cf-turnstile-response";
      container.appendChild(response);
    }
    return widgetId;
  });
  const remove = vi.fn((widgetId: string) => {
    if (removeThrows) throw new Error("Falha sintética ao remover widget.");
    containers.get(widgetId)?.replaceChildren();
    containers.delete(widgetId);
  });
  const reset = vi.fn();
  window.turnstile = {
    render: renderWidget,
    remove,
    ...(withReset ? { reset } : {}),
  };
  return { options, renderWidget, remove, reset };
}

const newsletterForm = {
  key: "newsletter",
  version: 1,
  title: "Newsletter",
  purpose: "Receber novidades.",
  fields: [
    {
      key: "email",
      label: "E-mail",
      type: "email" as const,
      required: true,
      maxLength: 254,
      options: [],
      order: 0,
    },
  ],
  consent: {
    required: true as const,
    text: "Aceito receber novidades.",
    version: "v1",
    privacyPath: "/politica-de-privacidade",
  },
  successMessage: "Inscrição recebida.",
  submitLabel: "Inscrever",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("TurnstileChallenge", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "site-key-de-teste");
  });

  afterEach(() => {
    delete window.turnstile;
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("expõe configuração ausente sem tentar carregar ou permitir retry inócuo", () => {
    vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "");
    const onToken = vi.fn();

    render(<TurnstileChallenge onToken={onToken} cData={COMMERCIAL_IDEMPOTENCY_KEY} />);

    expect(screen.getByRole("group", { name: "Verificação de segurança" })).toHaveAttribute(
      "data-turnstile-state",
      "unsupported",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/antiabuso não está configurada/i);
    expect(screen.queryByRole("button", { name: "Tentar novamente" })).not.toBeInTheDocument();
    expect(document.querySelector("script[data-gaiatec-turnstile]")).not.toBeInTheDocument();
  });

  it("falha fechado para cData que não seja uma UUID comercial canônica", () => {
    const onToken = vi.fn();

    render(<TurnstileChallenge onToken={onToken} cData="identificador-invalido" />);

    expect(screen.getByRole("group", { name: "Verificação de segurança" })).toHaveAttribute(
      "data-turnstile-state",
      "invalid",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/identificação.*inválida/i);
    expect(screen.queryByRole("button", { name: "Tentar novamente" })).not.toBeInTheDocument();
    expect(document.querySelector("script[data-gaiatec-turnstile]")).not.toBeInTheDocument();
    expect(onToken).toHaveBeenLastCalledWith("");
  });

  it("informa carregamento e prontidão, entrega o token somente ao callback e limpa handlers antigos", async () => {
    const onToken = vi.fn();
    const { unmount } = render(<TurnstileChallenge onToken={onToken} cData={COMMERCIAL_IDEMPOTENCY_KEY} />);

    expect(screen.getByRole("status")).toHaveTextContent("Carregando a verificação de segurança…");
    const script = document.querySelector<HTMLScriptElement>('script[data-gaiatec-turnstile="true"]');
    expect(script).toHaveAttribute(
      "src",
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit",
    );

    const turnstile = installTurnstile();
    act(() => script?.dispatchEvent(new Event("load")));

    await waitFor(() => expect(turnstile.renderWidget).toHaveBeenCalledOnce());
    expect(screen.getByRole("status")).toHaveTextContent(
      "Verificação de segurança pronta. Conclua o desafio para continuar.",
    );
    expect(turnstile.options[0]).toMatchObject({
      sitekey: "site-key-de-teste",
      action: "lead_capture",
      cData: COMMERCIAL_IDEMPOTENCY_KEY,
      language: "pt-br",
      theme: "light",
      "response-field": false,
      retry: "never",
      "refresh-expired": "manual",
      "refresh-timeout": "manual",
    });
    expect(document.querySelector('input[name="cf-turnstile-response"]')).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(COMMERCIAL_IDEMPOTENCY_KEY);

    const confidentialToken = "token-turnstile-sintetico-confidencial";
    act(() => turnstile.options[0].callback(confidentialToken));
    expect(onToken).toHaveBeenLastCalledWith(confidentialToken);
    expect(screen.getByRole("status")).toHaveTextContent("Verificação de segurança concluída.");
    expect(document.body).not.toHaveTextContent(confidentialToken);

    const callsBeforeUnmount = onToken.mock.calls.length;
    unmount();
    act(() => turnstile.options[0].callback("token-obsoleto"));
    expect(onToken).toHaveBeenCalledTimes(callsBeforeUnmount);
    expect(turnstile.remove).toHaveBeenCalledWith("widget-1");
    expect(document.body).not.toHaveTextContent("token-obsoleto");
  });

  it("recusa token acima do limite público sem expor seu conteúdo", async () => {
    const turnstile = installTurnstile();
    const onToken = vi.fn();
    render(<TurnstileChallenge onToken={onToken} cData={COMMERCIAL_IDEMPOTENCY_KEY} />);
    await waitFor(() => expect(turnstile.options).toHaveLength(1));

    const oversizedToken = `marcador-confidencial-${"x".repeat(2049)}`;
    act(() => turnstile.options[0].callback(oversizedToken));

    expect(screen.getByRole("alert")).toHaveTextContent(/não foi possível carregar/i);
    expect(onToken).not.toHaveBeenCalledWith(oversizedToken);
    expect(onToken).toHaveBeenLastCalledWith("");
    expect(document.body).not.toHaveTextContent("marcador-confidencial");
  });

  it("substitui o nó no refresh declarativo e ignora callback do widget removido", async () => {
    const turnstile = installTurnstile();
    const onToken = vi.fn();
    const { rerender } = render(
      <TurnstileChallenge onToken={onToken} cData={COMMERCIAL_IDEMPOTENCY_KEY} refreshKey={0} />,
    );
    await waitFor(() => expect(turnstile.options).toHaveLength(1));
    act(() => turnstile.options[0].callback("token-primeiro-widget"));

    rerender(<TurnstileChallenge onToken={onToken} cData={NEXT_COMMERCIAL_IDEMPOTENCY_KEY} refreshKey={1} />);
    await waitFor(() => expect(turnstile.options).toHaveLength(2));
    expect(turnstile.options[0].cData).toBe(COMMERCIAL_IDEMPOTENCY_KEY);
    expect(turnstile.options[1].cData).toBe(NEXT_COMMERCIAL_IDEMPOTENCY_KEY);
    expect(turnstile.remove).toHaveBeenCalledWith("widget-1");
    expect(document.querySelector('[data-turnstile-widget="widget-1"]')).not.toBeInTheDocument();
    expect(document.querySelector('[data-turnstile-widget="widget-2"]')).toBeInTheDocument();

    const callsAfterRefresh = onToken.mock.calls.length;
    act(() => turnstile.options[0].callback("token-obsoleto-após-refresh"));
    expect(onToken).toHaveBeenCalledTimes(callsAfterRefresh);
    expect(document.body).not.toHaveTextContent("token-obsoleto-após-refresh");

    act(() => turnstile.options[1].callback("token-widget-atual"));
    expect(onToken).toHaveBeenLastCalledWith("token-widget-atual");
  });

  it("limpa o token expirado ou em timeout e recupera o widget com reset", async () => {
    const user = userEvent.setup();
    const turnstile = installTurnstile();
    const onToken = vi.fn();
    render(<TurnstileChallenge onToken={onToken} cData={COMMERCIAL_IDEMPOTENCY_KEY} />);
    await waitFor(() => expect(turnstile.options).toHaveLength(1));

    act(() => turnstile.options[0]["expired-callback"]());
    expect(screen.getByRole("alert")).toHaveTextContent(/verificação de segurança expirou/i);
    expect(onToken).toHaveBeenLastCalledWith("");

    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(turnstile.reset).toHaveBeenCalledWith("widget-1");
    expect(screen.getByRole("status")).toHaveTextContent(/conclua o desafio/i);

    act(() => turnstile.options[0]["timeout-callback"]());
    expect(screen.getByRole("alert")).toHaveTextContent(/tempo da verificação.*terminou/i);
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeVisible();
  });

  it("sanitiza erros e recupera por novo render quando reset não está disponível", async () => {
    const user = userEvent.setup();
    const turnstile = installTurnstile({ withReset: false });
    const onToken = vi.fn();
    render(<TurnstileChallenge onToken={onToken} cData={COMMERCIAL_IDEMPOTENCY_KEY} />);
    await waitFor(() => expect(turnstile.options).toHaveLength(1));

    let handled = false;
    act(() => {
      handled = turnstile.options[0]["error-callback"]("300030<script>segredo</script>");
    });
    expect(handled).toBe(true);
    expect(screen.getByRole("alert")).toHaveTextContent(/não foi possível carregar/i);
    expect(document.body).not.toHaveTextContent(/300030|segredo/i);

    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await waitFor(() => expect(turnstile.renderWidget).toHaveBeenCalledTimes(2));
    expect(turnstile.remove).toHaveBeenCalledWith("widget-1");

    act(() => turnstile.options[1]["unsupported-callback"]());
    expect(screen.getByRole("alert")).toHaveTextContent(/navegador não oferece suporte/i);
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeVisible();
    expect(onToken).toHaveBeenLastCalledWith("");
  });

  it("recupera em nó novo mesmo quando a remoção do widget lança erro", async () => {
    const user = userEvent.setup();
    const turnstile = installTurnstile({ withReset: false, removeThrows: true });
    render(<TurnstileChallenge onToken={vi.fn()} cData={COMMERCIAL_IDEMPOTENCY_KEY} />);
    await waitFor(() => expect(turnstile.options).toHaveLength(1));

    act(() => {
      turnstile.options[0]["error-callback"]("300030");
    });
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));

    await waitFor(() => expect(turnstile.options).toHaveLength(2));
    expect(turnstile.remove).toHaveBeenCalledWith("widget-1");
    expect(document.querySelector('[data-turnstile-widget="widget-1"]')).not.toBeInTheDocument();
    expect(document.querySelector('[data-turnstile-widget="widget-2"]')).toBeInTheDocument();
  });

  it("encerra o carregamento quando a rede ou a CSP não emite load nem error", () => {
    vi.useFakeTimers();
    const onToken = vi.fn();
    const { unmount } = render(<TurnstileChallenge onToken={onToken} cData={COMMERCIAL_IDEMPOTENCY_KEY} />);

    expect(screen.getByRole("status")).toHaveTextContent(/carregando/i);
    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.getByRole("alert")).toHaveTextContent(/tempo da verificação.*terminou/i);
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeVisible();
    expect(onToken).toHaveBeenLastCalledWith("");

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("compartilha um único script e recupera duas instâncias em StrictMode após erro de rede", async () => {
    const user = userEvent.setup();
    render(
      <StrictMode>
        <TurnstileChallenge onToken={vi.fn()} cData={COMMERCIAL_IDEMPOTENCY_KEY} />
        <TurnstileChallenge onToken={vi.fn()} cData={NEXT_COMMERCIAL_IDEMPOTENCY_KEY} tone="dark" />
      </StrictMode>,
    );

    expect(document.querySelectorAll('script[data-gaiatec-turnstile="true"]')).toHaveLength(1);
    const failedScript = document.querySelector<HTMLScriptElement>('script[data-gaiatec-turnstile="true"]');
    act(() => failedScript?.dispatchEvent(new Event("error")));
    expect(screen.getAllByRole("alert")).toHaveLength(2);

    await user.click(screen.getAllByRole("button", { name: "Tentar novamente" })[0]);
    const replacementScript = document.querySelector<HTMLScriptElement>(
      'script[data-gaiatec-turnstile="true"]',
    );
    expect(replacementScript).not.toBe(failedScript);
    expect(document.querySelectorAll('script[data-gaiatec-turnstile="true"]')).toHaveLength(1);

    const turnstile = installTurnstile();
    act(() => replacementScript?.dispatchEvent(new Event("load")));
    await waitFor(() => expect(turnstile.renderWidget).toHaveBeenCalledOnce());

    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await waitFor(() => expect(turnstile.renderWidget).toHaveBeenCalledTimes(2));
    expect(turnstile.options.map((entry) => entry.theme).sort()).toEqual(["dark", "light"]);
  });

  it("mantém IDs próprios durante o replay de efeitos do StrictMode com a API pronta", async () => {
    const turnstile = installTurnstile();
    const { unmount } = render(
      <StrictMode>
        <TurnstileChallenge onToken={vi.fn()} cData={COMMERCIAL_IDEMPOTENCY_KEY} />
        <TurnstileChallenge onToken={vi.fn()} cData={NEXT_COMMERCIAL_IDEMPOTENCY_KEY} tone="dark" />
      </StrictMode>,
    );

    await waitFor(() => expect(turnstile.renderWidget).toHaveBeenCalledTimes(4));
    expect(turnstile.remove).toHaveBeenCalledWith("widget-1");
    expect(turnstile.remove).toHaveBeenCalledWith("widget-2");
    expect(document.querySelector('[data-turnstile-widget="widget-3"]')).toBeInTheDocument();
    expect(document.querySelector('[data-turnstile-widget="widget-4"]')).toBeInTheDocument();

    unmount();
    expect(turnstile.remove).toHaveBeenCalledWith("widget-3");
    expect(turnstile.remove).toHaveBeenCalledWith("widget-4");
  });
});

describe("Footer newsletter CAPTCHA", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_CONTACT_CAPTCHA_ALWAYS", "true");
    vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "site-key-de-teste");
    mocks.usePublishedSiteShell.mockReturnValue({
      navigation: {
        title: "Navegação",
        items: [
          {
            location: "footer",
            label: "Empresa",
            href: "/empresa",
            newTab: false,
            children: [],
          },
        ],
      },
      settings: {
        title: "GAIATEC",
        company: {
          name: "GAIATEC",
          phone: "",
          whatsapp: "",
          email: "",
          address: "",
        },
        socialLinks: [{ network: "LinkedIn", url: "https://www.linkedin.com/company/gaiatec" }],
        defaultCta: { label: "Contato", href: "/contato" },
      },
      placements: null,
      loading: false,
    });
    mocks.getPublishedForm.mockResolvedValue(newsletterForm);
    mocks.submitGovernedLead.mockResolvedValue({ reference: "LD-QA-TURNSTILE" });
  });

  afterEach(() => {
    delete window.turnstile;
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("mantém o envio bloqueado sem token e volta a bloqueá-lo após expiração", async () => {
    const user = userEvent.setup();
    const turnstile = installTurnstile();
    render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>,
    );

    const submit = screen.getByRole("button", { name: /inscrever/i });
    await waitFor(() => expect(turnstile.options).toHaveLength(1));
    expect(turnstile.options[0]).toMatchObject({
      theme: "dark",
      "response-field": false,
      retry: "never",
      "refresh-expired": "manual",
      "refresh-timeout": "manual",
    });
    await waitFor(() => expect(mocks.getPublishedForm).toHaveBeenCalledWith("newsletter"));
    expect(submit).toBeDisabled();
    expect(screen.getByRole("status")).toHaveClass("text-slate-300");
    expect(screen.getByRole("link", { name: "LinkedIn" })).toHaveAttribute(
      "href",
      "https://www.linkedin.com/company/gaiatec",
    );

    await user.type(screen.getByRole("textbox", { name: "E-mail para newsletter" }), "qa@example.com");
    await user.click(screen.getByRole("checkbox", { name: /aceito receber novidades/i }));
    await user.click(submit);
    expect(mocks.submitGovernedLead).not.toHaveBeenCalled();

    act(() => turnstile.options[0].callback("token-footer-sintetico"));
    expect(submit).toBeEnabled();
    expect(document.body).not.toHaveTextContent("token-footer-sintetico");

    act(() => turnstile.options[0]["expired-callback"]());
    expect(submit).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(/expirou/i);
  });

  it("consome um token por tentativa e exige token novo após challengeRequired", async () => {
    const user = userEvent.setup();
    const challengeRequired = Object.assign(new Error("Desafio obrigatório."), {
      challengeRequired: true,
    });
    mocks.submitGovernedLead
      .mockRejectedValueOnce(challengeRequired)
      .mockResolvedValueOnce({ reference: "LD-QA-RECUPERADO" });
    const turnstile = installTurnstile();
    render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>,
    );

    await waitFor(() => expect(turnstile.options).toHaveLength(1));
    await user.type(screen.getByRole("textbox", { name: "E-mail para newsletter" }), "qa@example.com");
    await user.click(screen.getByRole("checkbox", { name: /aceito receber novidades/i }));
    act(() => turnstile.options[0].callback("token-footer-primeira-tentativa"));

    const submit = screen.getByRole("button", { name: /inscrever/i });
    await user.click(submit);
    await waitFor(() => expect(mocks.submitGovernedLead).toHaveBeenCalledOnce());
    await waitFor(() => expect(turnstile.options).toHaveLength(2));
    expect(submit).toBeDisabled();
    const firstAttempt = mocks.submitGovernedLead.mock.calls[0][0];
    expect(firstAttempt.captchaToken).toBe("token-footer-primeira-tentativa");
    expect(firstAttempt.idempotencyKey).toBe(turnstile.options[0].cData);

    act(() => turnstile.options[1].callback("token-footer-segunda-tentativa"));
    await user.click(submit);
    await waitFor(() => expect(mocks.submitGovernedLead).toHaveBeenCalledTimes(2));
    const secondAttempt = mocks.submitGovernedLead.mock.calls[1][0];
    expect(secondAttempt.captchaToken).toBe("token-footer-segunda-tentativa");
    expect(secondAttempt.idempotencyKey).not.toBe(firstAttempt.idempotencyKey);
    expect(secondAttempt.idempotencyKey).toBe(turnstile.options[1].cData);
  });

  it("preserva juntos token e idempotência em erro incerto", async () => {
    const user = userEvent.setup();
    mocks.submitGovernedLead
      .mockRejectedValueOnce(new Error("Resposta temporariamente indisponível."))
      .mockResolvedValueOnce({ reference: "LD-QA-REPETIDO" });
    const turnstile = installTurnstile();
    render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>,
    );

    await waitFor(() => expect(turnstile.options).toHaveLength(1));
    await user.type(screen.getByRole("textbox", { name: "E-mail para newsletter" }), "qa@example.com");
    await user.click(screen.getByRole("checkbox", { name: /aceito receber novidades/i }));
    act(() => turnstile.options[0].callback("token-footer-erro-incerto"));

    const submit = screen.getByRole("button", { name: /inscrever/i });
    await user.click(submit);
    await waitFor(() => expect(screen.getByText(/não foi possível concluir/i)).toBeVisible());
    expect(turnstile.options).toHaveLength(1);
    expect(submit).toBeEnabled();
    const firstAttempt = mocks.submitGovernedLead.mock.calls[0][0];
    expect(firstAttempt.idempotencyKey).toBe(turnstile.options[0].cData);

    await user.click(submit);
    await waitFor(() => expect(mocks.submitGovernedLead).toHaveBeenCalledTimes(2));
    const secondAttempt = mocks.submitGovernedLead.mock.calls[1][0];
    expect(secondAttempt.captchaToken).toBe("token-footer-erro-incerto");
    expect(secondAttempt.idempotencyKey).toBe(firstAttempt.idempotencyKey);
    expect(secondAttempt.idempotencyKey).toBe(turnstile.options[0].cData);
  });

  it("bloqueia duas submissões no mesmo tick mesmo sem CAPTCHA", async () => {
    vi.stubEnv("VITE_CONTACT_CAPTCHA_ALWAYS", "false");
    const pending = deferred<{ reference: string }>();
    mocks.submitGovernedLead.mockReturnValueOnce(pending.promise);
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>,
    );

    const submit = screen.getByRole("button", { name: /inscrever/i });
    await waitFor(() => expect(submit).toBeEnabled());
    await user.type(screen.getByRole("textbox", { name: "E-mail para newsletter" }), "qa@example.com");
    await user.click(screen.getByRole("checkbox", { name: /aceito receber novidades/i }));
    const form = submit.closest("form");
    expect(form).not.toBeNull();

    fireEvent.submit(form!);
    fireEvent.submit(form!);
    expect(mocks.submitGovernedLead).toHaveBeenCalledOnce();

    await act(async () => {
      pending.resolve({ reference: "LD-QA-ÚNICO" });
      await pending.promise;
    });
    expect(screen.getByText(/inscrição recebida/i)).toBeVisible();
  });
});

describe("CmsLeadForm CAPTCHA", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_CONTACT_CAPTCHA_ALWAYS", "true");
    vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "site-key-de-teste");
  });

  afterEach(() => {
    delete window.turnstile;
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("preserva token e idempotência em erro incerto e renova ambos após sucesso", async () => {
    const user = userEvent.setup();
    mocks.submitGovernedLead
      .mockRejectedValueOnce(new Error("Resposta temporariamente indisponível."))
      .mockResolvedValueOnce({ reference: "LD-QA-CMS" })
      .mockResolvedValueOnce({ reference: "LD-QA-CMS-NOVO" });
    const turnstile = installTurnstile();
    render(
      <MemoryRouter>
        <CmsLeadForm form={newsletterForm} tone="brand" />
      </MemoryRouter>,
    );

    await waitFor(() => expect(turnstile.options).toHaveLength(1));
    expect(turnstile.options[0].theme).toBe("dark");
    await user.type(screen.getByRole("textbox", { name: /^e-mail/i }), "qa@example.com");
    await user.click(screen.getByRole("checkbox", { name: /aceito receber novidades/i }));
    act(() => turnstile.options[0].callback("token-cms-primeira-tentativa"));

    const submit = screen.getByRole("button", { name: "Inscrever" });
    await user.click(submit);
    await waitFor(() => expect(mocks.submitGovernedLead).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/temporariamente indisponível/i));
    expect(turnstile.options).toHaveLength(1);
    expect(submit).toBeEnabled();
    const firstAttempt = mocks.submitGovernedLead.mock.calls[0][0];
    expect(firstAttempt.captchaToken).toBe("token-cms-primeira-tentativa");
    expect(firstAttempt.idempotencyKey).toBe(turnstile.options[0].cData);

    await user.click(submit);
    await waitFor(() => expect(mocks.submitGovernedLead).toHaveBeenCalledTimes(2));
    const secondAttempt = mocks.submitGovernedLead.mock.calls[1][0];
    expect(secondAttempt.captchaToken).toBe("token-cms-primeira-tentativa");
    expect(secondAttempt.idempotencyKey).toBe(firstAttempt.idempotencyKey);
    expect(secondAttempt.idempotencyKey).toBe(turnstile.options[0].cData);

    await waitFor(() => expect(turnstile.options).toHaveLength(2));
    expect(submit).toBeDisabled();
    act(() => turnstile.options[1].callback("token-cms-novo-após-sucesso"));
    expect(screen.getByText("Verificação de segurança concluída.")).toBeVisible();
    expect(submit).toBeEnabled();

    await user.type(screen.getByRole("textbox", { name: /^e-mail/i }), "qa-novo@example.com");
    await user.click(screen.getByRole("checkbox", { name: /aceito receber novidades/i }));
    await user.click(submit);
    await waitFor(() => expect(mocks.submitGovernedLead).toHaveBeenCalledTimes(3));
    const thirdAttempt = mocks.submitGovernedLead.mock.calls[2][0];
    expect(thirdAttempt.captchaToken).toBe("token-cms-novo-após-sucesso");
    expect(thirdAttempt.idempotencyKey).not.toBe(secondAttempt.idempotencyKey);
    expect(thirdAttempt.idempotencyKey).toBe(turnstile.options[1].cData);
  });

  it("rotaciona a idempotência depois de challengeRequired e exige outro token", async () => {
    const user = userEvent.setup();
    mocks.submitGovernedLead
      .mockRejectedValueOnce(Object.assign(new Error("Desafio obrigatório."), { challengeRequired: true }))
      .mockResolvedValueOnce({ reference: "LD-QA-CMS-RECUPERADO" });
    const turnstile = installTurnstile();
    render(
      <MemoryRouter>
        <CmsLeadForm form={newsletterForm} />
      </MemoryRouter>,
    );

    await waitFor(() => expect(turnstile.options).toHaveLength(1));
    await user.type(screen.getByRole("textbox", { name: /^e-mail/i }), "qa@example.com");
    await user.click(screen.getByRole("checkbox", { name: /aceito receber novidades/i }));
    act(() => turnstile.options[0].callback("token-cms-desafio-um"));

    const submit = screen.getByRole("button", { name: "Inscrever" });
    await user.click(submit);
    await waitFor(() => expect(turnstile.options).toHaveLength(2));
    expect(submit).toBeDisabled();
    const firstAttempt = mocks.submitGovernedLead.mock.calls[0][0];
    expect(firstAttempt.idempotencyKey).toBe(turnstile.options[0].cData);

    act(() => turnstile.options[1].callback("token-cms-desafio-dois"));
    await user.click(submit);
    await waitFor(() => expect(mocks.submitGovernedLead).toHaveBeenCalledTimes(2));
    const secondAttempt = mocks.submitGovernedLead.mock.calls[1][0];
    expect(secondAttempt.captchaToken).toBe("token-cms-desafio-dois");
    expect(secondAttempt.idempotencyKey).not.toBe(firstAttempt.idempotencyKey);
    expect(secondAttempt.idempotencyKey).toBe(turnstile.options[1].cData);
  });

  it("bloqueia duas submissões no mesmo tick mesmo sem CAPTCHA", async () => {
    vi.stubEnv("VITE_CONTACT_CAPTCHA_ALWAYS", "false");
    const pending = deferred<{ reference: string }>();
    mocks.submitGovernedLead.mockReturnValueOnce(pending.promise);
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <CmsLeadForm form={newsletterForm} />
      </MemoryRouter>,
    );

    await user.type(screen.getByRole("textbox", { name: /^e-mail/i }), "qa@example.com");
    await user.click(screen.getByRole("checkbox", { name: /aceito receber novidades/i }));
    const submit = screen.getByRole("button", { name: "Inscrever" });
    const form = submit.closest("form");
    expect(form).not.toBeNull();

    fireEvent.submit(form!);
    fireEvent.submit(form!);
    expect(mocks.submitGovernedLead).toHaveBeenCalledOnce();

    await act(async () => {
      pending.resolve({ reference: "LD-QA-CMS-ÚNICO" });
      await pending.promise;
    });
    expect(screen.getByText(/inscrição recebida.*protocolo/i)).toBeVisible();
  });
});
