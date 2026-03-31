import { useState, useEffect } from "react";
import { ChevronUp } from "lucide-react";

export function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 500);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className="fixed bottom-20 right-6 z-[150] w-11 h-11 bg-[#FF6A00] text-black flex items-center justify-center shadow-lg hover:bg-black hover:text-[#FF6A00] transition-all duration-300"
      aria-label="Back to top"
    >
      <ChevronUp size={20} />
    </button>
  );
}
