import { useState } from "react";

export function CookieBanner() {
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 w-full bg-white/95 backdrop-blur-sm z-[200] border-t border-gray-200 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
      <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <p className="text-gray-700 text-[13px] leading-[1.6] flex-1">
          Utilizamos cookies para melhorar a experiência do site. Valorizamos sua privacidade e nunca utilizaremos seus dados para fins além dos descritos em nossa{" "}
          <a href="#" className="text-[#0057DE] underline hover:text-[#0046b3] transition-colors">Política de Privacidade</a>.
        </p>
        <div className="flex items-center gap-4 flex-shrink-0">
          <button
            onClick={() => setVisible(false)}
            className="bg-[#0057DE] text-white px-6 py-2 text-[12px] tracking-wider hover:bg-[#0046b3] transition-all"
            style={{ fontWeight: 600 }}
          >
            Aceitar
          </button>
          <button
            onClick={() => setVisible(false)}
            className="text-gray-500 text-[13px] hover:text-gray-900 transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
