import { ArrowDown, ArrowUp, Copy, Eye, EyeOff, GripVertical, Plus, Trash2 } from "lucide-react";
import type { CmsPageBlock } from "@/shared/contracts/cms-content";

export type BuilderMedia = { id: string; original_filename: string; alt_text: string };
export type BuilderRelation = { id: string; content_type: string; label: string; slug: string };

const uid = () => crypto.randomUUID();

export function PageBlockEditor({
  block,
  index,
  total,
  media,
  relations,
  onChange,
  onRemove,
  onDuplicate,
  onMove,
}: {
  block: CmsPageBlock;
  index: number;
  total: number;
  media: BuilderMedia[];
  relations: BuilderRelation[];
  onChange: (block: CmsPageBlock) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onMove: (offset: -1 | 1) => void;
}) {
  const data = block.data as any;
  const patchData = (patch: Record<string, unknown>) =>
    onChange({ ...block, data: { ...data, ...patch } } as CmsPageBlock);
  const field = (
    label: string,
    key: string,
    options: { textarea?: boolean; type?: string; placeholder?: string } = {},
  ) => (
    <label>
      {label}
      {options.textarea ? (
        <textarea
          rows={4}
          value={data[key] ?? ""}
          placeholder={options.placeholder}
          onChange={(event) => patchData({ [key]: event.target.value })}
        />
      ) : (
        <input
          type={options.type ?? "text"}
          value={data[key] ?? ""}
          placeholder={options.placeholder}
          onChange={(event) => patchData({ [key]: event.target.value })}
        />
      )}
    </label>
  );
  const setItems = (items: any[]) => patchData({ items });
  const updateItem = (itemIndex: number, patch: Record<string, unknown>) =>
    setItems(
      data.items.map((item: any, current: number) => (current === itemIndex ? { ...item, ...patch } : item)),
    );
  const removeItem = (itemIndex: number) =>
    setItems(data.items.filter((_: unknown, current: number) => current !== itemIndex));

  return (
    <details className={block.hidden ? "admin-page-block is-hidden" : "admin-page-block"} open={index === 0}>
      <summary>
        <span className="admin-page-block__drag">
          <GripVertical size={17} aria-hidden="true" />
        </span>
        <strong>
          {index + 1}. {block.type.replaceAll("_", " ")}
        </strong>
        <span>{block.hidden ? "Oculto" : "Visível"}</span>
      </summary>
      <div className="admin-page-block__toolbar" aria-label={`Ações do bloco ${index + 1}`}>
        <button
          type="button"
          onClick={() => onMove(-1)}
          disabled={index === 0}
          aria-label="Mover bloco para cima"
        >
          <ArrowUp size={16} />
        </button>
        <button
          type="button"
          onClick={() => onMove(1)}
          disabled={index === total - 1}
          aria-label="Mover bloco para baixo"
        >
          <ArrowDown size={16} />
        </button>
        <button type="button" onClick={() => onChange({ ...block, hidden: !block.hidden })}>
          {block.hidden ? <Eye size={16} /> : <EyeOff size={16} />} {block.hidden ? "Exibir" : "Ocultar"}
        </button>
        <button type="button" onClick={onDuplicate}>
          <Copy size={16} /> Duplicar
        </button>
        <button type="button" className="admin-danger-link" onClick={onRemove}>
          <Trash2 size={16} /> Remover
        </button>
      </div>

      <div className="admin-page-block__settings">
        <label>
          Âncora opcional
          <input
            value={block.anchor ?? ""}
            onChange={(event) => onChange({ ...block, anchor: event.target.value || undefined })}
            placeholder="nome-da-secao"
          />
        </label>
        <label>
          Largura
          <select
            value={block.width}
            onChange={(event) => onChange({ ...block, width: event.target.value as CmsPageBlock["width"] })}
          >
            <option value="content">Conteúdo</option>
            <option value="wide">Ampla</option>
            <option value="full">Tela inteira</option>
          </select>
        </label>
        <label>
          Tom
          <select
            value={block.tone}
            onChange={(event) => onChange({ ...block, tone: event.target.value as CmsPageBlock["tone"] })}
          >
            <option value="light">Claro</option>
            <option value="muted">Cinza</option>
            <option value="dark">Escuro</option>
            <option value="brand">Azul GAIATEC</option>
          </select>
        </label>
      </div>

      <div className="admin-page-block__content">
        {block.type === "hero" && (
          <>
            {field("Sobretítulo", "eyebrow")}
            {field("Título", "title")}
            {field("Texto", "text", { textarea: true })}
            <label>
              Imagem de fundo
              <select
                value={data.assetId ?? ""}
                onChange={(event) => patchData({ assetId: event.target.value || undefined })}
              >
                <option value="">Sem imagem</option>
                {media.map((asset) => (
                  <option value={asset.id} key={asset.id}>
                    {asset.original_filename}
                  </option>
                ))}
              </select>
            </label>
            {field("Texto alternativo", "alt")}
            <label>
              Alinhamento
              <select
                value={data.alignment}
                onChange={(event) => patchData({ alignment: event.target.value })}
              >
                <option value="left">Esquerda</option>
                <option value="center">Centro</option>
              </select>
            </label>
            <fieldset>
              <legend>Botão principal</legend>
              <label>
                Rótulo
                <input
                  value={data.primaryCta?.label ?? ""}
                  onChange={(event) =>
                    patchData({
                      primaryCta: { ...(data.primaryCta ?? { href: "/contato" }), label: event.target.value },
                    })
                  }
                />
              </label>
              <label>
                Destino
                <input
                  value={data.primaryCta?.href ?? ""}
                  onChange={(event) =>
                    patchData({
                      primaryCta: {
                        ...(data.primaryCta ?? { label: "Continuar" }),
                        href: event.target.value,
                      },
                    })
                  }
                />
              </label>
            </fieldset>
            <fieldset>
              <legend>Botão secundário opcional</legend>
              <label>
                Rótulo
                <input
                  value={data.secondaryCta?.label ?? ""}
                  onChange={(event) =>
                    patchData({
                      secondaryCta: event.target.value
                        ? { ...(data.secondaryCta ?? { href: "/contato" }), label: event.target.value }
                        : undefined,
                    })
                  }
                />
              </label>
              <label>
                Destino
                <input
                  value={data.secondaryCta?.href ?? ""}
                  onChange={(event) =>
                    patchData({
                      secondaryCta: {
                        ...(data.secondaryCta ?? { label: "Saiba mais" }),
                        href: event.target.value,
                      },
                    })
                  }
                />
              </label>
            </fieldset>
          </>
        )}

        {block.type === "rich_text" && (
          <>
            {field("Sobretítulo", "eyebrow")}
            {field("Título da seção", "heading")}
            {field("Texto", "text", { textarea: true })}
          </>
        )}

        {block.type === "image" && (
          <>
            <label>
              Imagem
              <select
                value={data.assetId ?? ""}
                onChange={(event) => patchData({ assetId: event.target.value })}
              >
                <option value="">Selecione uma imagem</option>
                {media.map((asset) => (
                  <option value={asset.id} key={asset.id}>
                    {asset.original_filename}
                  </option>
                ))}
              </select>
            </label>
            {field("Texto alternativo", "alt")}
            {field("Legenda", "caption")}
            <label>
              Ajuste
              <select value={data.fit} onChange={(event) => patchData({ fit: event.target.value })}>
                <option value="cover">Preencher</option>
                <option value="contain">Conter</option>
              </select>
            </label>
          </>
        )}

        {block.type === "gallery" && (
          <>
            {field("Título da galeria", "heading")}
            <label>
              Colunas
              <select
                value={data.columns}
                onChange={(event) => patchData({ columns: Number(event.target.value) })}
              >
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4</option>
              </select>
            </label>
            <fieldset className="admin-check-grid">
              <legend>Imagens</legend>
              {media.map((asset) => (
                <label className="admin-checkbox" key={asset.id}>
                  <input
                    type="checkbox"
                    checked={data.assetIds.includes(asset.id)}
                    onChange={(event) =>
                      patchData({
                        assetIds: event.target.checked
                          ? [...data.assetIds, asset.id]
                          : data.assetIds.filter((value: string) => value !== asset.id),
                      })
                    }
                  />{" "}
                  {asset.original_filename}
                </label>
              ))}
            </fieldset>
          </>
        )}

        {(block.type === "benefit_grid" || block.type === "steps") && (
          <>
            {block.type === "benefit_grid" && field("Sobretítulo", "eyebrow")}
            {field("Título", "heading")}
            <div className="admin-repeaters">
              {data.items.map((item: any, itemIndex: number) => (
                <fieldset key={item.id}>
                  <legend>Item {itemIndex + 1}</legend>
                  <label>
                    Título
                    <input
                      value={item.title}
                      onChange={(event) => updateItem(itemIndex, { title: event.target.value })}
                    />
                  </label>
                  <label>
                    Texto
                    <textarea
                      rows={3}
                      value={item.text}
                      onChange={(event) => updateItem(itemIndex, { text: event.target.value })}
                    />
                  </label>
                  <button type="button" className="admin-danger-link" onClick={() => removeItem(itemIndex)}>
                    Remover item
                  </button>
                </fieldset>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setItems([...data.items, { id: uid(), title: "Novo item", text: "Descrição" }])}
            >
              <Plus size={16} /> Adicionar item
            </button>
          </>
        )}

        {block.type === "content_grid" && (
          <>
            {field("Sobretítulo", "eyebrow")}
            {field("Título", "heading")}
            <label>
              Colunas
              <select
                value={data.columns}
                onChange={(event) => patchData({ columns: Number(event.target.value) })}
              >
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4</option>
              </select>
            </label>
            <div className="admin-repeaters">
              {data.items.map((item: any, itemIndex: number) => (
                <fieldset key={item.id}>
                  <legend>Card {itemIndex + 1}</legend>
                  <label>
                    Título
                    <input
                      value={item.title}
                      onChange={(event) => updateItem(itemIndex, { title: event.target.value })}
                    />
                  </label>
                  <label>
                    Texto
                    <textarea
                      rows={3}
                      value={item.text ?? ""}
                      onChange={(event) => updateItem(itemIndex, { text: event.target.value || undefined })}
                    />
                  </label>
                  <label>
                    Link interno opcional
                    <input
                      value={item.href ?? ""}
                      onChange={(event) => updateItem(itemIndex, { href: event.target.value || undefined })}
                    />
                  </label>
                  <label>
                    Imagem opcional
                    <select
                      value={item.assetId ?? ""}
                      onChange={(event) =>
                        updateItem(itemIndex, { assetId: event.target.value || undefined })
                      }
                    >
                      <option value="">Sem imagem</option>
                      {media.map((asset) => (
                        <option value={asset.id} key={asset.id}>
                          {asset.original_filename}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="button" className="admin-danger-link" onClick={() => removeItem(itemIndex)}>
                    Remover card
                  </button>
                </fieldset>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setItems([...data.items, { id: uid(), title: "Novo card", text: "Descrição" }])}
            >
              <Plus size={16} /> Adicionar card
            </button>
          </>
        )}

        {block.type === "metrics" && (
          <>
            {field("Título", "heading")}
            <div className="admin-repeaters">
              {data.items.map((item: any, itemIndex: number) => (
                <fieldset key={item.id}>
                  <legend>Métrica {itemIndex + 1}</legend>
                  <label>
                    Valor
                    <input
                      value={item.value}
                      onChange={(event) => updateItem(itemIndex, { value: event.target.value })}
                    />
                  </label>
                  <label>
                    Rótulo
                    <input
                      value={item.label}
                      onChange={(event) => updateItem(itemIndex, { label: event.target.value })}
                    />
                  </label>
                  <button type="button" className="admin-danger-link" onClick={() => removeItem(itemIndex)}>
                    Remover métrica
                  </button>
                </fieldset>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setItems([...data.items, { id: uid(), value: "0", label: "Nova métrica" }])}
            >
              <Plus size={16} /> Adicionar métrica
            </button>
          </>
        )}

        {block.type === "testimonial" && (
          <>
            {field("Depoimento", "quote", { textarea: true })}
            {field("Autor", "author")}
            {field("Cargo/empresa", "role")}
          </>
        )}

        {block.type === "faq" && (
          <>
            {field("Título", "heading")}
            <div className="admin-repeaters">
              {data.items.map((item: any, itemIndex: number) => (
                <fieldset key={item.id}>
                  <legend>Pergunta {itemIndex + 1}</legend>
                  <label>
                    Pergunta
                    <input
                      value={item.question}
                      onChange={(event) => updateItem(itemIndex, { question: event.target.value })}
                    />
                  </label>
                  <label>
                    Resposta
                    <textarea
                      rows={4}
                      value={item.answer}
                      onChange={(event) => updateItem(itemIndex, { answer: event.target.value })}
                    />
                  </label>
                  <button type="button" className="admin-danger-link" onClick={() => removeItem(itemIndex)}>
                    Remover pergunta
                  </button>
                </fieldset>
              ))}
            </div>
            <button
              type="button"
              onClick={() =>
                setItems([...data.items, { id: uid(), question: "Nova pergunta", answer: "Resposta" }])
              }
            >
              <Plus size={16} /> Adicionar pergunta
            </button>
          </>
        )}

        {block.type === "form" && (
          <>
            {field("Título", "heading")}
            {field("Texto", "text", { textarea: true })}
            <label>
              Formulário
              <select value={data.formKey} onChange={(event) => patchData({ formKey: event.target.value })}>
                <option value="contact">Contato</option>
                <option value="newsletter">Newsletter</option>
                <option value="lead">Lead comercial</option>
              </select>
            </label>
            {field("Texto do botão", "buttonLabel")}
          </>
        )}

        {block.type === "cta" && (
          <>
            {field("Título", "heading")}
            {field("Texto", "text", { textarea: true })}
            <fieldset>
              <legend>Botão</legend>
              <label>
                Rótulo
                <input
                  value={data.link.label}
                  onChange={(event) => patchData({ link: { ...data.link, label: event.target.value } })}
                />
              </label>
              <label>
                Destino
                <input
                  value={data.link.href}
                  onChange={(event) => patchData({ link: { ...data.link, href: event.target.value } })}
                />
              </label>
            </fieldset>
          </>
        )}

        {block.type === "related_content" && (
          <>
            {field("Título", "heading")}
            <label>
              Apresentação
              <select
                value={data.presentation}
                onChange={(event) => patchData({ presentation: event.target.value })}
              >
                <option value="cards">Cards</option>
                <option value="list">Lista</option>
              </select>
            </label>
            <fieldset className="admin-check-grid">
              <legend>Conteúdos relacionados</legend>
              {relations.map((item) => (
                <label className="admin-checkbox" key={item.id}>
                  <input
                    type="checkbox"
                    checked={data.itemIds.includes(item.id)}
                    onChange={(event) =>
                      patchData({
                        itemIds: event.target.checked
                          ? [...data.itemIds, item.id]
                          : data.itemIds.filter((value: string) => value !== item.id),
                      })
                    }
                  />{" "}
                  {item.label} <small>({item.content_type})</small>
                </label>
              ))}
            </fieldset>
          </>
        )}
      </div>
    </details>
  );
}
