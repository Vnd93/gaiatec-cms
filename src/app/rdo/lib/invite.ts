import { supabase } from "@/lib/supabase";

/** Convida um usuário por e-mail (somente admin — validado na Edge Function). */
export async function inviteUser(email: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke("rdo-invite", {
    body: { email: email.trim().toLowerCase() },
  });

  if (error) {
    let msg = "Não foi possível enviar o convite.";
    // FunctionsHttpError expõe a Response em error.context
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === "function") {
        const j = await ctx.json();
        if (j?.error) msg = j.error;
      }
    } catch {
      /* mantém msg padrão */
    }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data?.email ?? email;
}
