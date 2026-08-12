import { Link } from "react-router";
import { PageHero } from "../components/PageHero";
import { SEO } from "../components/SEO";

const KNOCKOUT = "'Knockout HTF68', sans-serif";
const HERO_IMG = "/images/heroes/1.1.webp";

/* ────────────────────────────────────────────────────────
   DADOS LEGAIS DO TITULAR DO SITE
   Mesmos dados usados na Política de Privacidade.
   ──────────────────────────────────────────────────────── */
const EMPRESA = {
  nomeFantasia: "Gaiatec Sistemas",
  razaoSocial: "Gaiatec Comércio e Serviços de Automação e Sistema do Brasil Ltda.",
  cnpj: "06.176.620/0001-62",
  endereco:
    "Rua Heróis da Força Expedicionária Brasileira, 22 — Parque Novo Mundo, São Paulo/SP, CEP 02188-040",
  email: "vendas@gaiatecsistemas.com.br",
  telefone: "(11) 2207-1986",
  foro: "São Paulo, Estado de São Paulo",
};

const ATUALIZADO_EM = "7 de agosto de 2026";

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
        <li key={i} style={{ position: "relative", paddingLeft: 22, marginBottom: 10 }}>
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
export default function TermosDeUsoPage() {
  return (
    <>
      <SEO
        title="Termos de Uso"
        description="Condições de uso do site da Gaiatec Sistemas: propriedade intelectual, caráter das informações técnicas publicadas, área restrita e limitações de responsabilidade."
        path="/termos-de-uso"
      />

      <PageHero overline="LEGAL" title="Termos de Uso" image={HERO_IMG} />

      <section style={{ backgroundColor: "#fff", padding: "80px 0 100px" }}>
        <div style={{ maxWidth: 860, margin: "0 auto", padding: "0 30px" }}>
          <p style={{ fontSize: 13, color: "#666", marginBottom: 40, letterSpacing: "0.04em" }}>
            Última atualização: {ATUALIZADO_EM}
          </p>

          <p style={{ fontSize: 17, lineHeight: 1.85, color: "#333", marginBottom: 48 }}>
            Estes Termos regulam o acesso e a utilização do site{" "}
            <strong>gaiatecsistemas.com.br</strong>. Ao navegar por ele, você concorda com as
            condições abaixo. Caso não concorde, pedimos que não utilize o site.
          </p>

          <Secao n="01" titulo="Quem mantém este site">
            <p>
              Este site é mantido pela {EMPRESA.razaoSocial}, inscrita no CNPJ sob o nº{" "}
              {EMPRESA.cnpj}, com sede em {EMPRESA.endereco}.
            </p>
            <p style={{ marginTop: 14 }}>
              Contato: <strong>{EMPRESA.email}</strong> · {EMPRESA.telefone}
            </p>
          </Secao>

          <Secao n="02" titulo="Finalidade do site">
            <p>
              O site tem finalidade <strong>informativa e comercial</strong>: apresentar a empresa,
              seu portfólio de soluções em instrumentação, automação, biodigestores e detecção de
              gás, e viabilizar contato com nossa equipe técnica e comercial.
            </p>
            <p style={{ marginTop: 18 }}>
              Ele <strong>não é uma loja virtual</strong>. Nenhuma proposta apresentada aqui
              constitui oferta vinculante, e não há venda, pagamento ou contratação concluída pelo
              site. Fornecimentos são formalizados por proposta comercial específica.
            </p>
          </Secao>

          <Secao n="03" titulo="Informações técnicas e imagens">
            <p>
              Esta seção merece atenção, porque o site publica dados de engenharia.
            </p>
            <p style={{ marginTop: 18 }}>
              <strong>Especificações são valores de referência.</strong> Capacidades, volumes,
              geração estimada de biogás, produção de biofertilizante e demais números publicados
              descrevem condições nominais de projeto. O desempenho real depende do tipo e volume
              de resíduo, temperatura, regime de alimentação, manutenção e outras variáveis do
              local. O dimensionamento correto exige análise técnica de cada caso.
            </p>
            <p style={{ marginTop: 18 }}>
              <strong>Imagens são ilustrativas.</strong> Fotografias, renderizações e ilustrações
              de produtos servem para representar a solução e podem não corresponder exatamente ao
              equipamento fornecido, que varia conforme configuração, acessórios e revisão do
              projeto.
            </p>
            <p style={{ marginTop: 18 }}>
              <strong>Nada aqui substitui projeto de engenharia.</strong> O conteúdo do site é
              informativo e não constitui laudo, memorial, parecer técnico ou recomendação de
              instalação. Decisões de projeto, operação e segurança devem se basear em documentação
              específica emitida para o seu caso.
            </p>
          </Secao>

          <Secao n="04" titulo="Propriedade intelectual">
            <p>
              Todo o conteúdo do site — textos, marcas, logotipos, imagens, ilustrações, layout,
              identidade visual e código-fonte — pertence à {EMPRESA.nomeFantasia} ou a seus
              licenciantes, protegido pela legislação de direito autoral e propriedade industrial.
            </p>
            <p style={{ marginTop: 18 }}>
              É permitido visualizar, imprimir e compartilhar links para o conteúdo, para uso
              pessoal ou avaliação profissional. Depende de autorização prévia e por escrito:
            </p>
            <Lista
              itens={[
                "Reproduzir, distribuir ou publicar o conteúdo em outros meios",
                "Utilizar nossas marcas e logotipos, inclusive em material de terceiros",
                "Criar obra derivada a partir de textos, imagens ou identidade visual",
                "Empregar o conteúdo para fins comerciais alheios ao relacionamento com a empresa",
              ]}
            />
          </Secao>

          <Secao n="05" titulo="Uso adequado">
            <p>Ao utilizar o site, você se compromete a não:</p>
            <Lista
              itens={[
                "Praticar atos que comprometam a disponibilidade, a segurança ou a integridade do site",
                "Tentar obter acesso não autorizado a sistemas, contas ou áreas restritas",
                "Empregar mecanismos automatizados de coleta que sobrecarreguem a infraestrutura",
                "Enviar, por meio dos formulários, conteúdo ilícito, ofensivo ou de terceiros sem autorização",
                "Utilizar o site para finalidade diversa da informada nestes Termos",
              ]}
            />
          </Secao>

          <Secao n="06" titulo="Formulários e dados pessoais">
            <p>
              Ao enviar uma mensagem pelo formulário de contato, você declara que as informações
              fornecidas são verdadeiras e que possui autorização para compartilhá-las.
            </p>
            <p style={{ marginTop: 14 }}>
              O tratamento desses dados está descrito na{" "}
              <Link
                to="/politica-de-privacidade"
                style={{ color: "#0057DE", fontWeight: 600, textDecoration: "underline" }}
              >
                Política de Privacidade
              </Link>
              , que integra estes Termos.
            </p>
          </Secao>

          <Secao n="07" titulo="Área restrita">
            <p>
              O site hospeda um sistema interno de Relatório de Obra, acessível apenas mediante
              autenticação. O acesso é pessoal e intransferível, destinado a colaboradores e
              parceiros autorizados.
            </p>
            <p style={{ marginTop: 18 }}>
              O usuário é responsável por manter a confidencialidade de suas credenciais e por toda
              atividade realizada com elas. Suspeita de uso indevido deve ser comunicada
              imediatamente pelos canais desta página.
            </p>
          </Secao>

          <Secao n="08" titulo="Links para sites de terceiros">
            <p>
              O site pode conter links para páginas externas, como redes sociais e canais de
              atendimento. Esses ambientes possuem termos e políticas próprios, e não temos
              controle sobre seu conteúdo ou disponibilidade. O acesso a eles é de sua
              responsabilidade.
            </p>
          </Secao>

          <Secao n="09" titulo="Disponibilidade">
            <p>
              Empregamos esforços razoáveis para manter o site disponível e atualizado, mas não
              garantimos funcionamento ininterrupto ou livre de falhas. O serviço pode ser
              suspenso para manutenção, atualização ou por causas alheias ao nosso controle.
            </p>
            <p style={{ marginTop: 18 }}>
              Podemos alterar, suspender ou descontinuar seções e funcionalidades a qualquer
              momento, sem aviso prévio.
            </p>
          </Secao>

          <Secao n="10" titulo="Limitação de responsabilidade">
            <p>
              Na máxima extensão permitida pela legislação brasileira, a {EMPRESA.nomeFantasia} não
              responde por danos decorrentes de:
            </p>
            <Lista
              itens={[
                "Uso das informações do site sem a devida validação técnica para o caso concreto",
                "Indisponibilidade temporária do site ou de seus recursos",
                "Conteúdo, práticas ou disponibilidade de sites de terceiros acessados por links",
                "Uso indevido de credenciais de acesso à área restrita por parte do usuário",
              ]}
            />
            <p style={{ marginTop: 20 }}>
              Esta limitação não afasta responsabilidades que a lei considere inafastáveis,
              inclusive as decorrentes do Código de Defesa do Consumidor quando aplicável, nem as
              obrigações assumidas em contratos e propostas comerciais firmados com a empresa.
            </p>
          </Secao>

          <Secao n="11" titulo="Alterações destes Termos">
            <p>
              Estes Termos podem ser atualizados para refletir mudanças em nossos serviços ou na
              legislação. A data de última atualização é sempre indicada no topo da página, e a
              continuidade do uso do site após alterações implica concordância com a versão
              vigente.
            </p>
          </Secao>

          <Secao n="12" titulo="Legislação aplicável e foro">
            <p>
              Estes Termos são regidos pela legislação brasileira. Fica eleito o foro da comarca de{" "}
              {EMPRESA.foro}, para dirimir controvérsias decorrentes deles, com renúncia a qualquer
              outro, por mais privilegiado que seja — ressalvado, ao consumidor, o direito de
              acionar o foro de seu domicílio.
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
              Dúvidas sobre estes Termos ou sobre o dimensionamento de uma solução?{" "}
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
