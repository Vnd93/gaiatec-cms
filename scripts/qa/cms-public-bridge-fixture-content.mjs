import { randomUUID } from "node:crypto";

export function createPublicBridgeContentBlocks(title, createId = randomUUID) {
  if (typeof title !== "string" || title.trim().length === 0 || title.length > 220) {
    throw new Error("QA_CMS_PUBLIC_BRIDGE_TITLE_INVALID");
  }
  return [
    {
      id: createId(),
      type: "hero",
      hidden: false,
      width: "wide",
      tone: "dark",
      data: {
        eyebrow: "HOMOLOGAÇÃO SINTÉTICA",
        title,
        text: "Conteúdo sintético temporário para prova da ponte pública.",
        alignment: "left",
      },
    },
    {
      id: createId(),
      type: "rich_text",
      hidden: false,
      width: "content",
      tone: "light",
      data: { text: "Conteúdo complementar sintético e descartável para homologação." },
    },
  ];
}
