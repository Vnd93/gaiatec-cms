/** Consulta de CNPJ via BrasilAPI (gratuita, sem chave, CORS liberado). */

export interface CnpjInfo {
  cnpj: string; // formatado 00.000.000/0000-00
  razaoSocial: string;
  nomeFantasia: string;
  endereco: string; // endereço cadastral montado
  situacao: string; // ex.: "ATIVA", "BAIXADA", "INAPTA"
  ativa: boolean;
}

export const onlyDigits = (s: string): string => (s || "").replace(/\D/g, "");

/** Aplica a máscara 00.000.000/0000-00 enquanto digita. */
export function maskCnpj(value: string): string {
  const d = onlyDigits(value).slice(0, 14);
  let out = d.slice(0, 2);
  if (d.length > 2) out += "." + d.slice(2, 5);
  if (d.length > 5) out += "." + d.slice(5, 8);
  if (d.length > 8) out += "/" + d.slice(8, 12);
  if (d.length > 12) out += "-" + d.slice(12, 14);
  return out;
}

/** Valida os dígitos verificadores do CNPJ. */
export function isValidCnpj(value: string): boolean {
  const c = onlyDigits(value);
  if (c.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(c)) return false; // todos iguais
  const dv = (len: number): number => {
    let sum = 0;
    let pos = len - 7;
    for (let i = len; i >= 1; i--) {
      sum += Number(c[len - i]) * pos--;
      if (pos < 2) pos = 9;
    }
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === Number(c[12]) && dv(13) === Number(c[13]);
}

function montaEndereco(j: Record<string, unknown>): string {
  const str = (k: string) => String(j[k] ?? "").trim();
  const tipo = str("descricao_tipo_de_logradouro");
  const logr = str("logradouro");
  const num = str("numero");
  const bairro = str("bairro");
  const municipio = str("municipio");
  const uf = str("uf");
  const cepDigits = onlyDigits(str("cep"));
  const cep = cepDigits.length === 8 ? `${cepDigits.slice(0, 5)}-${cepDigits.slice(5)}` : "";

  const rua = [tipo, logr].filter(Boolean).join(" ");
  const ruaNum = [rua, num && num.toUpperCase() !== "SN" ? num : ""].filter(Boolean).join(", ");
  const cidadeUf = [municipio, uf].filter(Boolean).join("/");
  return [ruaNum, bairro, cidadeUf, cep].filter(Boolean).join(" - ");
}

/** Consulta o CNPJ na BrasilAPI e devolve dados normalizados. */
export async function fetchCnpj(value: string): Promise<CnpjInfo> {
  const c = onlyDigits(value);
  if (c.length !== 14) throw new Error("Informe os 14 dígitos do CNPJ.");
  if (!isValidCnpj(c)) throw new Error("CNPJ inválido. Confira os números.");

  let res: Response;
  try {
    res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${c}`, {
      headers: { Accept: "application/json" },
    });
  } catch {
    throw new Error("Sem conexão para consultar o CNPJ.");
  }
  if (res.status === 404) throw new Error("CNPJ não encontrado na Receita Federal.");
  if (res.status === 429) throw new Error("Muitas consultas seguidas. Tente em instantes.");
  if (!res.ok) throw new Error("Não foi possível consultar o CNPJ agora.");

  const j = (await res.json()) as Record<string, unknown>;
  const situacao = String(j.descricao_situacao_cadastral ?? "").trim();
  return {
    cnpj: maskCnpj(c),
    razaoSocial: String(j.razao_social ?? "").trim(),
    nomeFantasia: String(j.nome_fantasia ?? "").trim(),
    endereco: montaEndereco(j),
    situacao,
    ativa: situacao.toUpperCase() === "ATIVA",
  };
}
