import { Link } from "react-router";
import { PageHero } from "../components/PageHero";
import { SEO } from "../components/SEO";

const KNOCKOUT = "'Knockout HTF68', sans-serif";
const HERO_IMG = "/images/heroes/1.1.webp";

/* ────────────────────────────────────────────────────────
   DADOS LEGAIS DO CONTROLADOR
   Identificação exigida pela LGPD (Lei 13.709/2018).
   ──────────────────────────────────────────────────────── */
const EMPRESA = {
  nomeFantasia: "Gaiatec Sistemas",
  razaoSocial: "Gaiatec Comércio e Serviços de Automação e Sistema do Brasil Ltda.",
  cnpj: "06.176.620/0001-62",
  endereco:
    "Rua Heróis da Força Expedicionária Brasileira, 22 — Parque Novo Mundo, São Paulo/SP, CEP 02188-040",
  email: "vendas@gaiatecsistemas.com.br",
  telefone: "(11) 2207-1986",
};

/** Encarregado pelo Tratamento de Dados (DPO) — Art. 41 da LGPD. */
const ENCARREGADO = {
  nome: "Marcelo Diaz",
  /* Canal para requisições de titular. Usando o e-mail comercial existente,
     que é monitorado. Se for criado um endereço dedicado
     (ex.: privacidade@gaiatecsistemas.com.br), basta trocar aqui. */
  email: "vendas@gaiatecsistemas.com.br",
};

const ATUALIZADO_EM = "4 de agosto de 2026";

/* ────────────────────────────────────────────────────────
   COMPONENTES DE APOIO
   ──────────────────────────────────────────────────────── */
function Secao({ n, titulo, children }: { n: string; titulo: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 48 }}>
      <h2
        style={{
          fontFamily: KNOCKOUT,
          fontSize: "clamp(22px, 2.6vw, 30px)",
          fontWeight: 500,
          lineHeight: 1.1,
          textTransform: "uppercase",
          color: "#111",
          marginBottom: 18,
        }}
      >
        <span style={{ color: "#0057DE", marginRight: 12 }}>{n}</span>
        {titulo}
      </h2>
      <div style={{ fontSize: 16, lineHeight: 1.85, color: "#444" }}>{children}</div>
    </section>
  );
}

function Lista({ itens }: { itens: React.ReactNode[] }) {
  return (
    <ul style={{ margin: "14px 0 0 0", padding: 0, listStyle: "none" }}>
      {itens.map((item, i) => (
        <li
          key={i}
          style={{
            position: "relative",
            paddingLeft: 22,
            marginBottom: 10,
          }}
        >
          <span
            style={{
              position: "absolute",
              left: 0,
              top: 11,
              width: 6,
              height: 6,
              backgroundColor: "#0057DE",
            }}
          />
          {item}
        </li>
      ))}
    </ul>
  );
}

/* ────────────────────────────────────────────────────────
   PÁGINA
   ──────────────────────────────────────────────────────── */
export default function PoliticaPrivacidadePage() {
  return (
    <>
      <SEO
        title="Política de Privacidade"
        description="Como a Gaiatec Sistemas coleta, utiliza, armazena e protege dados pessoais, em conformidade com a Lei Geral de Proteção de Dados (LGPD)."
        path="/politica-de-privacidade"
      />

      <PageHero overline="PRIVACIDADE" title="Política de Privacidade" image={HERO_IMG} />

      <section style={{ backgroundColor: "#fff", padding: "80px 0 100px" }}>
        <div style={{ maxWidth: 860, margin: "0 auto", padding: "0 30px" }}>
          <p style={{ fontSize: 13, color: "#888", marginBottom: 40, letterSpacing: "0.04em" }}>
            Última atualização: {ATUALIZADO_EM}
          </p>

          <p style={{ fontSize: 17, lineHeight: 1.85, color: "#333", marginBottom: 48 }}>
            Esta Política descreve como a {EMPRESA.nomeFantasia} trata os dados pessoais coletados por
            meio do site <strong>gaiatecsistemas.com.br</strong>, em conformidade com a Lei nº
            13.709/2018 — Lei Geral de Proteção de Dados Pessoais (LGPD).
          </p>

          <Secao n="01" titulo="Quem é o controlador">
            <p>
              O controlador dos dados tratados neste site é a {EMPRESA.razaoSocial}, inscrita no CNPJ
              sob o nº {EMPRESA.cnpj}, com sede em {EMPRESA.endereco}.
            </p>
            <p style={{ marginTop: 14 }}>
              Contato: <strong>{EMPRESA.email}</strong> · {EMPRESA.telefone}
            </p>
          </Secao>

          <Secao n="02" titulo="Quais dados coletamos">
            <p><strong>Dados que você nos fornece.</strong> Ao preencher o formulário de contato, coletamos:</p>
            <Lista
              itens={[
                "Nome e sobrenome",
                "E-mail",
                "Telefone ou WhatsApp (opcional)",
                "Empresa (opcional)",
                "Tipo de solicitação",
                "Conteúdo da mensagem enviada",
              ]}
            />
            <p style={{ marginTop: 20 }}>
              <strong>Dados coletados automaticamente.</strong> Como em qualquer site, nosso provedor de
              infraestrutura registra dados técnicos de acesso — endereço IP, tipo de navegador e
              dispositivo, páginas visitadas e data/hora. Esses registros servem à segurança e ao
              funcionamento do serviço.
            </p>
            <p style={{ marginTop: 20 }}>
              Não coletamos dados pessoais sensíveis, não realizamos perfilamento comportamental e não
              utilizamos decisões automatizadas que afetem o titular.
            </p>
          </Secao>

          <Secao n="03" titulo="Para que usamos e com qual base legal">
            <Lista
              itens={[
                <>
                  <strong>Responder a solicitações e elaborar orçamentos</strong> — base legal: procedimentos
                  preliminares a contrato, a pedido do titular (Art. 7º, V).
                </>,
                <>
                  <strong>Manter o site seguro e funcional</strong> — base legal: legítimo interesse
                  (Art. 7º, IX), limitado ao necessário para operação e prevenção de fraudes.
                </>,
                <>
                  <strong>Cumprir obrigações legais e regulatórias</strong> — base legal: Art. 7º, II.
                </>,
              ]}
            />
            <p style={{ marginTop: 20 }}>
              Não vendemos dados pessoais e não os utilizamos para publicidade de terceiros.
            </p>
          </Secao>

          <Secao n="04" titulo="Cookies e armazenamento local">
            <p>
              <strong>Este site não utiliza cookies de publicidade, de rastreamento ou de análise
              comportamental.</strong> Não há Google Analytics, pixel de redes sociais ou ferramentas
              semelhantes.
            </p>
            <p style={{ marginTop: 18 }}>O que efetivamente armazenamos no seu navegador:</p>
            <Lista
              itens={[
                <>
                  <strong>Preferência sobre o aviso de cookies</strong> — registra que você já viu o aviso,
                  para não exibi-lo novamente.
                </>,
                <>
                  <strong>Cache de arquivos do site</strong> — imagens e scripts guardados localmente para
                  acelerar o carregamento em visitas seguintes.
                </>,
                <>
                  <strong>Área restrita</strong> — para usuários autenticados no sistema de Relatório de
                  Obra, armazenamos dados de sessão e preferências de visualização.
                </>,
              ]}
            />
            <p style={{ marginTop: 20 }}>
              Você pode apagar esses dados a qualquer momento pelas configurações do seu navegador. Isso
              não impede o uso do site.
            </p>
          </Secao>

          <Secao n="05" titulo="Com quem compartilhamos">
            <p>
              Não comercializamos dados. Compartilhamos apenas com prestadores que viabilizam a operação
              do site, na medida necessária:
            </p>
            <Lista
              itens={[
                <><strong>Supabase</strong> — armazenamento e processamento das mensagens do formulário.</>,
                <><strong>Cloudflare</strong> — hospedagem, rede de distribuição de conteúdo e segurança.</>,
                <><strong>Google Fonts</strong> — entrega das fontes tipográficas do site.</>,
              ]}
            />
            <p style={{ marginTop: 20 }}>
              Também poderemos compartilhar dados quando houver obrigação legal ou requisição de
              autoridade competente.
            </p>
          </Secao>

          <Secao n="06" titulo="Transferência internacional">
            <p>
              Os prestadores acima podem processar e armazenar dados em servidores fora do Brasil. Nesses
              casos, a transferência ocorre nos termos do Art. 33 da LGPD, mediante fornecedores que
              adotam padrões de proteção adequados.
            </p>
          </Secao>

          <Secao n="07" titulo="Por quanto tempo guardamos">
            <p>
              Mensagens de contato são mantidas pelo tempo necessário ao atendimento da solicitação e ao
              relacionamento comercial dela decorrente. Registros de acesso são mantidos pelo prazo legal
              aplicável. Encerradas as finalidades, os dados são eliminados ou anonimizados, salvo
              hipóteses de guarda obrigatória previstas em lei.
            </p>
          </Secao>

          <Secao n="08" titulo="Segurança">
            <p>
              Adotamos medidas técnicas e administrativas para proteger os dados contra acesso não
              autorizado, perda ou alteração indevida — incluindo tráfego criptografado (HTTPS), controle
              de acesso a sistemas internos e uso de fornecedores reconhecidos de infraestrutura. Nenhum
              sistema é totalmente imune a incidentes; em caso de incidente relevante, comunicaremos os
              titulares e a ANPD conforme exigido pela LGPD.
            </p>
          </Secao>

          <Secao n="09" titulo="Seus direitos">
            <p>Nos termos do Art. 18 da LGPD, você pode solicitar a qualquer momento:</p>
            <Lista
              itens={[
                "Confirmação de que tratamos seus dados e acesso a eles",
                "Correção de dados incompletos, inexatos ou desatualizados",
                "Anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desconformidade",
                "Portabilidade a outro fornecedor, mediante requisição expressa",
                "Eliminação dos dados tratados com base no seu consentimento",
                "Informação sobre com quem compartilhamos seus dados",
                "Revogação do consentimento, quando essa for a base legal aplicada",
                "Oposição a tratamento fundado em legítimo interesse",
              ]}
            />
          </Secao>

          <Secao n="10" titulo="Como exercer seus direitos">
            <p>
              Envie sua solicitação para <strong>{ENCARREGADO.email}</strong>. Responderemos no menor prazo
              possível, observados os limites legais. Podemos solicitar informações adicionais para
              confirmar sua identidade antes de atender ao pedido — medida necessária para proteger seus
              próprios dados.
            </p>
            <p style={{ marginTop: 14 }}>
              Encarregado pelo Tratamento de Dados Pessoais (DPO): <strong>{ENCARREGADO.nome}</strong>.
            </p>
            <p style={{ marginTop: 14 }}>
              Você também pode apresentar reclamação à Autoridade Nacional de Proteção de Dados (ANPD).
            </p>
          </Secao>

          <Secao n="11" titulo="Crianças e adolescentes">
            <p>
              Este site destina-se a um público profissional e não é direcionado a menores de 18 anos. Não
              coletamos intencionalmente dados de crianças ou adolescentes. Caso identifiquemos coleta
              involuntária, os dados serão eliminados.
            </p>
          </Secao>

          <Secao n="12" titulo="Alterações desta política">
            <p>
              Esta Política pode ser atualizada para refletir mudanças em nossos processos ou na
              legislação. A data de última atualização é sempre indicada no topo da página. Alterações
              relevantes serão sinalizadas no site.
            </p>
          </Secao>

          <div
            style={{
              marginTop: 60,
              padding: "28px 30px",
              backgroundColor: "#f8fafc",
              borderLeft: "3px solid #0057DE",
            }}
          >
            <p style={{ fontSize: 15, lineHeight: 1.8, color: "#444", margin: 0 }}>
              Ficou com dúvida sobre o tratamento dos seus dados?{" "}
              <Link to="/contato" style={{ color: "#0057DE", fontWeight: 600, textDecoration: "underline" }}>
                Fale com a gente
              </Link>
              .
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
