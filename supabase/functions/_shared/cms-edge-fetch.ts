// Toda chamada de saida das funcoes de borda passa por aqui: PostgREST, Auth e Storage. Sem prazo,
// uma conexao presa nao falha, ela simplesmente nunca responde, e a invocacao fica pendurada ate o
// cliente desistir. O banco tem statement_timeout proprio, entao um SQL lento sempre volta com erro;
// o que nao volta e uma conexao que travou fora do banco, e era esse o caso do Storage.
export const CMS_EDGE_FETCH_TIMEOUT_MS = 30_000;

const SAFE_METHOD = /^[A-Z]{3,7}$/;
const SAFE_PATH = /^[A-Za-z0-9/._-]{1,120}$/;

// A identidade do alvo entra na mensagem de erro, entao so pode conter o verbo e o caminho. A query
// string carrega apikey e filtros com dados de usuario e nunca e lida.
export function edgeRequestIdentity(input: RequestInfo | URL, init?: RequestInit): string {
  const rawMethod = String(
    init?.method ?? (input instanceof Request ? input.method : "GET"),
  ).toUpperCase();
  const method = SAFE_METHOD.test(rawMethod) ? rawMethod : "UNKNOWN";
  let path = "";
  try {
    path = new URL(input instanceof Request ? input.url : String(input)).pathname;
  } catch {
    path = "";
  }
  return `${method}:${SAFE_PATH.test(path) ? path : "unknown"}`;
}

// O erro raramente chega puro: o postgrest-js embrulha uma rejeicao de fetch como
// "<name>: <message>" antes de devolve-la em `error`, entao um prefixo exato nunca casaria com o
// caminho que mais importa. O codigo so e produzido aqui, portanto conte-lo ja o identifica.
export function isEdgeFetchTimeout(error: unknown): boolean {
  return String((error as { message?: string })?.message ?? "").includes("CMS_EDGE_FETCH_TIMEOUT:");
}

export function boundedFetch(
  timeoutMs: number = CMS_EDGE_FETCH_TIMEOUT_MS,
  transport: typeof fetch = fetch,
): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const controller = new AbortController();
    let expire: (reason: unknown) => void = () => {};
    // O prazo nao pode depender de o transporte honrar o abort. Abortar libera o socket, mas quem
    // garante que a invocacao termina e a corrida: se o transporte ignorar o sinal, o prazo vence
    // mesmo assim.
    const deadline = new Promise<never>((_resolve, reject) => {
      expire = reject;
    });
    const timeout = () =>
      new Error(`CMS_EDGE_FETCH_TIMEOUT:${edgeRequestIdentity(input, init)}:${timeoutMs}`);
    const expired = setTimeout(() => {
      controller.abort(new DOMException("timeout", "TimeoutError"));
      expire(timeout());
    }, timeoutMs);
    // Um cancelamento vindo de quem chamou continua valendo: o prazo e um teto, nao um substituto.
    const caller = init?.signal ?? (input instanceof Request ? input.signal : null);
    const forward = () => controller.abort(caller?.reason);
    if (caller?.aborted) forward();
    else caller?.addEventListener("abort", forward, { once: true });
    const attempt = transport(input, { ...init, signal: controller.signal });
    // O abort tardio do transporte perdedor nao pode virar rejeicao sem dono.
    attempt.catch(() => {});
    try {
      return await Promise.race([attempt, deadline]);
    } catch (error) {
      if (isEdgeFetchTimeout(error)) throw error;
      if ((controller.signal.reason as DOMException | undefined)?.name === "TimeoutError")
        throw new Error(timeout().message, { cause: error });
      throw error;
    } finally {
      clearTimeout(expired);
      caller?.removeEventListener("abort", forward);
    }
  };
}
