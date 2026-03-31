import { useState } from "react";

export function CookieBanner() {
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 w-full bg-black/95 backdrop-blur-sm z-[200] border-t border-white/10">
      <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <p className="text-white/70 text-[13px] leading-[1.6] flex-1">
          Utilizamos cookies para melhorar a experiência do site. Valorizamos sua privacidade e nunca utilizaremos seus dados para fins além dos descritos em nossa{" "}
          <a href="#" className="text-[#FF6A00] underline">Política de Privacidade</a>.
        </p>
        <div className="flex items-center gap-4 flex-shrink-0">
          <button
            onClick={() => setVisible(false)}
            className="border border-white/30 text-white px-6 py-2 text-[12px] tracking-wider hover:border-[#FF6A00] hover:text-[#FF6A00] transition-all"
            style={{ fontWeight: 600 }}
          >
            Aceitar
          </button>
          <button
            onClick={() => setVisible(false)}
            className="text-white/50 text-[13px] hover:text-white transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}