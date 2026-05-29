import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  pdf,
} from "@react-pdf/renderer";
import type { Relatorio } from "./types";
import { STATUS_LABEL } from "./types";
import { formatDate, slugifyFilename } from "./format";

/* ── Fontes Montserrat (TTF estáticos em /public/fonts) ─────────────── */
let fontsRegistered = false;
export function ensureFonts(base = "") {
  if (fontsRegistered) return;
  Font.register({
    family: "Montserrat",
    fonts: [
      { src: `${base}/fonts/Montserrat-Regular.ttf`, fontWeight: 400 },
      { src: `${base}/fonts/Montserrat-Medium.ttf`, fontWeight: 500 },
      { src: `${base}/fonts/Montserrat-SemiBold.ttf`, fontWeight: 600 },
      { src: `${base}/fonts/Montserrat-Bold.ttf`, fontWeight: 700 },
      { src: `${base}/fonts/Montserrat-ExtraBold.ttf`, fontWeight: 800 },
    ],
  });
  // Não hifenizar (evita quebra estranha de palavras)
  Font.registerHyphenationCallback((word) => [word]);
  fontsRegistered = true;
}

const C = {
  orange: "#f87010",
  orangeStrong: "#e2640b",
  orangeSoft: "#fff1e6",
  ink: "#14161c",
  inkSoft: "#5b616e",
  muted: "#9aa0ac",
  line: "#e6e8ec",
  cardHead: "#f7f8fa",
};

const s = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 56,
    paddingHorizontal: 40,
    fontFamily: "Montserrat",
    fontSize: 9,
    color: C.ink,
  },
  // Header
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  logo: { width: 138 },
  headRight: { alignItems: "flex-end" },
  docTitle: { fontSize: 14, fontWeight: 700, color: C.ink, letterSpacing: 0.3 },
  emitido: { fontSize: 8, color: C.inkSoft, marginTop: 4 },
  badge: {
    marginTop: 7,
    borderWidth: 1,
    borderColor: C.orange,
    color: C.orangeStrong,
    backgroundColor: C.orangeSoft,
    paddingVertical: 3,
    paddingHorizontal: 9,
    borderRadius: 5,
    fontSize: 8,
    fontWeight: 700,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  rule: { height: 2, backgroundColor: C.orange, marginTop: 14, marginBottom: 18 },
  // Cards (cantos levemente arredondados)
  card: { borderWidth: 1, borderColor: C.line, borderRadius: 6, marginBottom: 12 },
  cardHead: {
    backgroundColor: C.cardHead,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  cardTitle: { fontSize: 9, fontWeight: 700, color: C.inkSoft, letterSpacing: 1.6 },
  cardBody: { padding: 14 },
  grid2: { flexDirection: "row" },
  col: { width: "50%", paddingRight: 12 },
  label: { fontSize: 7.5, fontWeight: 600, color: C.muted, letterSpacing: 1, marginBottom: 3 },
  value: { fontSize: 10.5, fontWeight: 500, color: C.ink },
  paragraph: { fontSize: 10, fontWeight: 400, color: C.ink, lineHeight: 1.5 },
  // Fotos
  fotoGrid: { flexDirection: "row", flexWrap: "wrap" },
  fotoWrap: { width: "50%", padding: 4 },
  foto: { width: "100%", height: 150, objectFit: "cover", borderRadius: 4, borderWidth: 1, borderColor: C.line },
  // Assinaturas
  signRow: { flexDirection: "row", marginTop: 26 },
  signCol: { width: "50%", alignItems: "center", paddingHorizontal: 16 },
  signLine: { borderTopWidth: 1, borderTopColor: "#c9ccd3", width: "100%", marginBottom: 6 },
  signName: { fontSize: 10, fontWeight: 700, color: C.ink },
  signRole: { fontSize: 8, color: C.inkSoft, marginTop: 2 },
  // Footer
  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: C.line,
    paddingTop: 8,
  },
  footerText: { fontSize: 7.5, color: C.muted },
});

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <View style={s.col}>
      <Text style={s.label}>{label}</Text>
      <Text style={s.value}>{value && value.trim() ? value : "—"}</Text>
    </View>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.card} wrap={false}>
      <View style={s.cardHead}>
        <Text style={s.cardTitle}>{title}</Text>
      </View>
      <View style={s.cardBody}>{children}</View>
    </View>
  );
}

export function RdoDocument({
  r,
  emitido,
  logoSrc = "/logo-gaiatec.png",
}: {
  r: Relatorio;
  emitido: string;
  logoSrc?: string;
}) {
  const endereco = [r.local_endereco?.trim(), r.local_numero?.trim()].filter(Boolean).join(", ");
  const temCoords = r.local_lat != null && r.local_lng != null;
  const local = endereco || (temCoords ? `${r.local_lat!.toFixed(6)}, ${r.local_lng!.toFixed(6)}` : "");
  const fotos = (r.fotos ?? []).filter((f) => f.url);

  return (
    <Document title={`RDO ${r.cliente || ""}`.trim()} author="Gaiatec Sistemas">
      <Page size="A4" style={s.page}>
        {/* Cabeçalho */}
        <View style={s.headerRow} fixed>
          <Image style={s.logo} src={logoSrc} />
          <View style={s.headRight}>
            <Text style={s.docTitle}>RELATÓRIO DIÁRIO DE OBRA</Text>
            <Text style={s.emitido}>Emitido em: {emitido}</Text>
            <Text style={s.badge}>{STATUS_LABEL[r.status]}</Text>
          </View>
        </View>
        <View style={s.rule} fixed />

        {/* Dados do contrato */}
        <Card title="DADOS DO CONTRATO">
          <View style={s.grid2}>
            <Field label="CLIENTE" value={r.cliente} />
            <Field label="Nº DO CONTRATO" value={r.contrato} />
          </View>
          {(r.cnpj || r.razao_social) && (
            <View style={[s.grid2, { marginTop: 10 }]}>
              <Field label="CNPJ" value={r.cnpj} />
              <Field label="RAZÃO SOCIAL" value={r.razao_social} />
            </View>
          )}
          {(r.nome_fantasia || r.endereco_cliente) && (
            <View style={[s.grid2, { marginTop: 10 }]}>
              <Field label="NOME FANTASIA" value={r.nome_fantasia} />
              <Field label="ENDEREÇO DO CLIENTE" value={r.endereco_cliente} />
            </View>
          )}
        </Card>

        {/* Engenheiros */}
        <Card title="ENGENHEIROS RESPONSÁVEIS">
          <View style={s.grid2}>
            <Field label="ENGENHEIRO GAIATEC SISTEMAS" value={r.eng_gaiatec} />
            <Field label="ENGENHEIRO DO CLIENTE" value={r.eng_cliente} />
          </View>
          {r.crea?.trim() && (
            <View style={[s.grid2, { marginTop: 10 }]}>
              <Field label="CREA (ENG. GAIATEC SISTEMAS)" value={r.crea} />
              <View style={s.col} />
            </View>
          )}
        </Card>

        {/* Período */}
        <Card title="PERÍODO DOS TRABALHOS">
          <View style={s.grid2}>
            <Field label="INÍCIO" value={r.periodo_inicio ? formatDate(r.periodo_inicio) : ""} />
            <Field label="TÉRMINO" value={r.periodo_fim ? formatDate(r.periodo_fim) : ""} />
          </View>
        </Card>

        {/* Localização — só se houver */}
        {local && (
          <Card title="LOCALIZAÇÃO DA OBRA">
            <Text style={s.value}>{local}</Text>
            {temCoords && endereco && (
              <Text style={[s.label, { marginTop: 6 }]}>
                GPS: {r.local_lat!.toFixed(6)}, {r.local_lng!.toFixed(6)}
              </Text>
            )}
          </Card>
        )}

        {/* Comentários — só se houver */}
        {r.comentarios?.trim() && (
          <Card title="COMENTÁRIOS E OBSERVAÇÕES">
            <Text style={s.paragraph}>{r.comentarios}</Text>
          </Card>
        )}

        {/* Registro fotográfico — só se houver */}
        {fotos.length > 0 && (
          <View style={s.card}>
            <View style={s.cardHead}>
              <Text style={s.cardTitle}>REGISTRO FOTOGRÁFICO</Text>
            </View>
            <View style={[s.cardBody, s.fotoGrid]}>
              {fotos.map((f) => (
                <View key={f.id} style={s.fotoWrap} wrap={false}>
                  <Image style={s.foto} src={f.url!} />
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Assinaturas */}
        <View style={s.signRow} wrap={false}>
          <View style={s.signCol}>
            <View style={s.signLine} />
            <Text style={s.signName}>{r.eng_gaiatec?.trim() || "Engenheiro Gaiatec Sistemas"}</Text>
            <Text style={s.signRole}>Responsável Gaiatec Sistemas</Text>
          </View>
          <View style={s.signCol}>
            <View style={s.signLine} />
            <Text style={s.signName}>{r.eng_cliente?.trim() || "Engenheiro do Cliente"}</Text>
            <Text style={s.signRole}>Responsável do Cliente</Text>
          </View>
        </View>

        {/* Rodapé */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>GAIATEC SISTEMAS — Relatório Diário de Obra</Text>
          <Text style={s.footerText}>
            Contrato: {r.contrato || "—"} | {emitido}
          </Text>
        </View>
      </Page>
    </Document>
  );
}

/** Gera o Blob do PDF de um relatório. */
export async function generateRelatorioPdf(r: Relatorio): Promise<Blob> {
  ensureFonts();
  const emitido = formatDate(new Date().toISOString());
  return pdf(<RdoDocument r={r} emitido={emitido} />).toBlob();
}

/** Gera e dispara o download do PDF. */
export async function downloadRelatorioPdf(r: Relatorio): Promise<void> {
  const blob = await generateRelatorioPdf(r);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const dataStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  a.href = url;
  a.download = `RDO_${slugifyFilename(r.cliente)}_${dataStr}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
