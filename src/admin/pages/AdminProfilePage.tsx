import { useAdminAuth } from "../auth/AdminAuthContext";

const roleLabels: Record<string, string> = {
  super_admin: "Superadministrador",
  admin: "Administrador",
  editor: "Editor",
  reviewer: "Revisor",
  technical: "Especialista técnico",
  commercial: "Comercial",
  marketing: "Marketing",
};

const profileStatusLabels: Record<string, string> = {
  invited: "Convite pendente",
  active: "Ativo",
  suspended: "Suspenso",
};

const permissionAreaLabels: Record<string, string> = {
  users: "Usuários",
  sessions: "Sessões",
  scopes: "Acessos",
  products: "Produtos",
  content: "Conteúdo",
  pages: "Páginas",
  homepage: "Página inicial",
  posts: "Artigos",
  media: "Mídia",
  forms: "Formulários",
  leads: "Leads",
  campaigns: "Campanhas",
  releases: "Releases",
  diagnostics: "Diagnósticos",
  audit: "Auditoria",
  search: "Busca",
  quality: "Qualidade",
  settings: "Dados globais",
  navigation: "Navegação",
  placements: "Posicionamentos",
  ai: "Assistência por inteligência artificial",
  appearance: "Aparência",
  applications: "Aplicações",
  attributes: "Atributos de produtos",
  bulk: "Operações em massa",
  bulk_import: "Importação em massa",
  capabilities: "Recursos do sistema",
  collaboration: "Colaboração",
  documents: "Documentos",
  flags: "Recursos do sistema",
  form: "Formulários",
  industries: "Indústrias",
  masterdata: "Dados mestres",
  pim: "Dados de produtos",
  policy_decisions: "Decisões de segurança",
  preview: "Visualizações",
  production_operator: "Operação de produção",
  qa: "Homologação",
  roles: "Papéis",
  seo: "Apresentação nos mecanismos de busca",
  services: "Serviços",
  sites: "Sites",
  solutions: "Soluções",
  taxonomy: "Classificação de conteúdo",
  visual: "Estúdio Visual",
  vocabularies: "Listas controladas",
};

const permissionActionLabels: Record<string, string> = {
  read: "consultar",
  edit: "editar",
  manage: "administrar",
  invite: "convidar",
  suspend: "suspender",
  revoke: "revogar",
  publish: "publicar",
  approve: "aprovar",
  upload: "enviar arquivos",
  export: "exportar",
  run: "executar",
  rollback: "reverter",
  assign: "atribuir",
  privacy: "proteger dados pessoais",
  anonymize: "anonimizar",
  retry_delivery: "tentar um envio novamente",
  create: "criar",
  validate: "validar",
  cancel: "cancelar",
  execute: "executar",
  review: "revisar",
  compensate: "desfazer com segurança",
  plan: "planejar",
  archive: "arquivar",
  restore: "restaurar",
  merge: "unificar",
  technical: "editar informações técnicas",
};

function permissionLabel(permission: string) {
  const [area = "", ...actionParts] = permission.replace(/^cms:/, "").split(".");
  const action = actionParts.join(".");
  const areaLabel = permissionAreaLabels[area] ?? "Outra área administrativa";
  const actionLabel = permissionActionLabels[action] ?? "ação autorizada";
  return `${areaLabel}: ${actionLabel}`;
}

export default function AdminProfilePage() {
  const { session, user, profile, signOut } = useAdminAuth();
  const expiresAt = session?.expires_at ? new Date(session.expires_at * 1000) : null;
  return (
    <section>
      <p className="admin-eyebrow">CONTA ATIVA</p>
      <h1>Perfil e acesso</h1>
      <div className="admin-profile-grid">
        <article>
          <h2>Perfil</h2>
          <dl>
            <dt>E-mail</dt>
            <dd>{user?.email ?? "Indisponível"}</dd>
            <dt>Situação</dt>
            <dd>
              {profile?.status
                ? (profileStatusLabels[profile.status] ?? "Situação indisponível")
                : "Indisponível"}
            </dd>
            <dt>Papéis</dt>
            <dd>
              {profile?.roles.map((role) => roleLabels[role] ?? "Papel não reconhecido").join(", ") ||
                "Nenhum"}
            </dd>
            <dt>Verificação em duas etapas</dt>
            <dd>
              {profile?.mfaVerified ? "Verificado" : profile?.mfaRequired ? "Obrigatório" : "Não exigido"}
            </dd>
          </dl>
        </article>
        <article>
          <h2>Sessão atual</h2>
          <dl>
            <dt>Expiração</dt>
            <dd>{expiresAt ? expiresAt.toLocaleString("pt-BR") : "Indisponível"}</dd>
            <dt>Acesso administrativo</dt>
            <dd>{profile?.accessGranted ? "Concedido" : "Negado"}</dd>
          </dl>
          <button className="admin-button admin-button--secondary" onClick={() => void signOut()}>
            Encerrar esta sessão
          </button>
        </article>
      </div>
      <div className="admin-actions">
        <h2>Permissões desta conta</h2>
        {profile?.permissions.length ? (
          <ul>
            {profile.permissions.map((permission) => (
              <li key={permission}>{permissionLabel(permission)}</li>
            ))}
          </ul>
        ) : (
          <p>Nenhuma permissão administrativa.</p>
        )}
      </div>
    </section>
  );
}
