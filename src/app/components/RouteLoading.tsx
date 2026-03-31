import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import UniqueLoading from './ui/grid-loading';

export function RouteLoading() {
  const [loading, setLoading] = useState(false);
  const location = useLocation();

  useEffect(() => {
    // Mostra o loading quando a rota muda
    setLoading(true);

    // Esconde o loading após um pequeno delay para dar tempo da página renderizar
    const timer = setTimeout(() => {
      setLoading(false);
    }, 500);

    return () => clearTimeout(timer);
  }, [location.pathname]);

  return (
    <AnimatePresence>
      {loading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm"
        >
          <div className="flex flex-col items-center gap-4">
            <UniqueLoading variant="squares" size="lg" />
            <p className="text-sm text-gray-600 font-medium">Carregando...</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
