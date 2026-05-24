/**
 * Mídia do produto da linha de Detecção de Gás.
 *
 * PONTO ÚNICO DE TROCA DE IMAGEM: enquanto não há fotos próprias da Gaiatec,
 * renderiza um bloco de marca (gradiente + código do modelo). Quando o produto
 * tiver `imagem`, basta passá-la e este componente exibe a foto real — sem
 * mexer em nenhuma página que o consome.
 */
const KNOCKOUT = "'Knockout HTF68', sans-serif";
const BRAND_GRADIENT = "linear-gradient(135deg, #0057DE 0%, #0a2540 70%, #050b18 100%)";

interface DgProdutoMidiaProps {
  modelo: string;
  /** Foto real do produto (Gaiatec). Ausente → placeholder de marca. */
  imagem?: string;
  alt?: string;
  /** Razão de aspecto via padding-top (ex.: "62%"). */
  aspect?: string;
  /** Tamanho do código do modelo no placeholder. */
  modeloSize?: number;
}

export function DgProdutoMidia({
  modelo,
  imagem,
  alt,
  aspect = "62%",
  modeloSize = 44,
}: DgProdutoMidiaProps) {
  return (
    <div style={{ position: "relative", paddingTop: aspect, overflow: "hidden", background: BRAND_GRADIENT }}>
      {imagem ? (
        <img
          src={imagem}
          alt={alt ?? modelo}
          loading="lazy"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        <>
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 16px" }}>
            <span style={{ fontFamily: KNOCKOUT, fontSize: modeloSize, fontWeight: 500, color: "rgba(255,255,255,0.92)", letterSpacing: "0.02em", textTransform: "uppercase", textAlign: "center", lineHeight: 1 }}>
              {modelo}
            </span>
          </div>
          <span style={{ position: "absolute", top: 16, left: 16, fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.6)" }}>
            Gaiatec
          </span>
        </>
      )}
    </div>
  );
}
