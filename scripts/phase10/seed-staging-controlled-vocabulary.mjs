const STAGING_URL = "https://glcqsosxwgmlhzgcsnzv.supabase.co";

const catalog = [
  {
    listKey: "product.category",
    entityType: "product",
    dimensionKey: "product_category",
    label: "Categoria de Produto",
    options: ["Instrumentos de Medição", "Instrumentos de Análise", "Detectores de Vazamento"],
  },
  {
    listKey: "product.application_magnitude",
    entityType: "product",
    dimensionKey: "application_magnitude",
    label: "Aplicação / Grandeza",
    options: ["Medição de Vazão", "Medição de Nível", "Medição de Pressão"],
  },
  {
    listKey: "product.technology",
    entityType: "product",
    dimensionKey: "technology",
    label: "Tecnologia",
    options: ["Ultrassônico", "Eletromagnético", "Turbina", "Vortex"],
  },
  {
    listKey: "product.installation_operation",
    entityType: "product",
    dimensionKey: "installation_operation",
    label: "Instalação / Operação",
    options: ["Flangeado", "Rosqueado", "Clamp-On", "Inserção", "Portátil"],
  },
  {
    listKey: "product.monitored_element",
    entityType: "product",
    dimensionKey: "monitored_element",
    label: "Elemento Monitorado",
    options: ["Líquidos", "Gases", "Chamas"],
  },
  {
    listKey: "service.category",
    entityType: "service",
    dimensionKey: "service_category",
    label: "Categoria do Serviço",
    options: [],
  },
];

function slugify(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const url = String(process.env.VITE_SUPABASE_URL ?? "").replace(/\/$/, "");
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
const accessToken = process.env.CMS_STAGING_ACCESS_TOKEN;

if (url !== STAGING_URL) throw new Error(`Recusado: VITE_SUPABASE_URL deve ser exatamente ${STAGING_URL}.`);
if (!anonKey || !accessToken) {
  throw new Error(
    "Defina VITE_SUPABASE_ANON_KEY e CMS_STAGING_ACCESS_TOKEN de uma sessão MFA válida do staging.",
  );
}

async function command(body) {
  const response = await fetch(`${STAGING_URL}/functions/v1/cms-controlled-vocabularies`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${response.status}: ${data.error ?? "falha no workflow governado"}`);
  return data;
}

for (const [sortOrder, definition] of catalog.entries()) {
  await command({
    action: "upsert_list",
    list: {
      listKey: definition.listKey,
      entityType: definition.entityType,
      dimensionKey: definition.dimensionKey,
      label: definition.label,
      description: "Vocabulário controlado do CMS GAIATEC — Fase 10.",
      publicVisible: true,
      active: true,
      sortOrder,
    },
  });
}

const listed = await command({ action: "list", includeInactive: true });
for (const definition of catalog) {
  const list = listed.items?.find((item) => item.list_key === definition.listKey);
  if (!list) throw new Error(`Lista não retornada pelo servidor: ${definition.listKey}`);
  for (const [sortOrder, label] of definition.options.entries()) {
    await command({
      action: "upsert_option",
      option: {
        listId: list.id,
        slug: slugify(label),
        label,
        description: "",
        publicVisible: true,
        active: true,
        sortOrder,
      },
    });
  }
}

console.log("Catálogo inicial clean-room aplicado pelo workflow auditado no staging.");
console.log(
  "service.category foi criada sem opções: o usuário deve cadastrar os valores autorizados no CMS.",
);
