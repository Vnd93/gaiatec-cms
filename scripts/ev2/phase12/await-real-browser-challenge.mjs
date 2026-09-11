// Espera ativa pelo desafio de navegador real e diz quanto da janela sobrou.
//
// POR QUE ISSO EXISTE. Nao existe notificacao quando o run pai publica a variable do desafio. O
// operador precisaria chamar `fetch-challenge` a mao repetidas vezes, e cada chamada exige um
// caminho de saida novo porque o script grava com flag `wx`. Errar isso na janela de 15 minutos, que
// e unica e nao renovavel, custa a janela inteira.
//
// O QUE ELE NAO FAZ. Nao revalida nada por conta propria. Cada tentativa e o proprio
// `prepare-real-browser-broker-input.mjs fetch-challenge` rodando como processo filho, para que a
// validacao de binding, de identidade e de idade continue tendo uma unica implementacao.

import { execFileSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const FETCHER = new URL("./prepare-real-browser-broker-input.mjs", import.meta.url);
const WINDOW_MS = 15 * 60_000;

function attemptFetch({ environment, runId, runAttempt, output }) {
  try {
    const stdout = execFileSync(
      process.execPath,
      [
        FETCHER.pathname.replace(/^\/([A-Za-z]:)/, "$1"),
        "fetch-challenge",
        "--environment",
        environment,
        "--run-id",
        String(runId),
        "--run-attempt",
        String(runAttempt),
        "--output-challenge",
        output,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    return { ready: true, stdout };
  } catch (error) {
    // Um desafio que ainda nao nasceu e indistinguivel, pela ferramenta, de qualquer outra falha de
    // leitura. Por isso a espera nunca afirma "ainda nao publicado": ela relata a ultima recusa e
    // continua tentando ate o prazo.
    return { ready: false, reason: String(error?.stderr || error?.message || "").trim().split("\n").at(-1) };
  }
}

export async function awaitRealBrowserChallenge(
  { environment, runId, runAttempt, outputDirectory, intervalMs = 5_000, timeoutMs = 20 * 60_000 },
  { fetch = attemptFetch, now = () => Date.now(), sleep = null, log = console.log } = {},
) {
  if (!["staging", "production"].includes(environment)) throw new Error("CHALLENGE_WAIT_ENVIRONMENT_INVALID");
  if (!/^[1-9]\d{5,19}$/.test(String(runId))) throw new Error("CHALLENGE_WAIT_RUN_ID_INVALID");
  if (!Number.isSafeInteger(runAttempt) || runAttempt < 1) throw new Error("CHALLENGE_WAIT_RUN_ATTEMPT_INVALID");
  if (!outputDirectory) throw new Error("CHALLENGE_WAIT_OUTPUT_REQUIRED");
  if (!Number.isFinite(intervalMs) || intervalMs < 1_000) throw new Error("CHALLENGE_WAIT_INTERVAL_INVALID");

  const pause = sleep ?? ((ms) => new Promise((done) => setTimeout(done, ms)));
  const deadline = now() + timeoutMs;
  let attempt = 0;
  let lastReason = "";
  while (now() <= deadline) {
    attempt += 1;
    // Caminho novo por tentativa: o fetch grava com `wx` e recusaria reescrever o anterior.
    const output = resolve(join(outputDirectory, `challenge-${runId}-${runAttempt}-${attempt}.json`));
    const result = fetch({ environment, runId, runAttempt, output });
    if (result.ready) {
      const readyAt = now();
      log(
        JSON.stringify({
          event: "g12.real_browser.challenge.ready",
          environment,
          runId,
          runAttempt,
          attempt,
          challengePath: output,
          // O prazo que vincula nao e o desta espera: e o do desafio. Quem le isto tem de saber, no
          // instante em que le, quanto do orcamento de 15 minutos ja foi gasto so em esperar.
          operatorWindowMs: WINDOW_MS,
          operatorDeadlineHint: new Date(readyAt + WINDOW_MS).toISOString(),
        }),
      );
      return { ready: true, attempt, challengePath: output, stdout: result.stdout };
    }
    lastReason = result.reason ?? "";
    if (attempt === 1 || attempt % 12 === 0)
      log(
        JSON.stringify({
          event: "g12.real_browser.challenge.waiting",
          environment,
          runId,
          runAttempt,
          attempt,
          lastRefusal: lastReason,
        }),
      );
    if (now() + intervalMs > deadline) break;
    await pause(intervalMs);
  }
  throw new Error(`CHALLENGE_WAIT_TIMED_OUT:${lastReason}`);
}

function argument(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? fallback : process.argv[index + 1];
}

async function main() {
  const outputDirectory = argument("output-dir", "outputs/real-browser-challenge");
  await mkdir(outputDirectory, { recursive: true });
  await awaitRealBrowserChallenge({
    environment: argument("environment"),
    runId: argument("run-id"),
    runAttempt: Number(argument("run-attempt", "1")),
    outputDirectory,
    intervalMs: Number(argument("interval-ms", "5000")),
    timeoutMs: Number(argument("timeout-ms", String(20 * 60_000))),
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
