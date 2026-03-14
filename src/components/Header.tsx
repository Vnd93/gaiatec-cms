import { useState, useEffect, useCallback } from 'react';
import { navLinks } from '@/data/content';
import { Search, Menu, X, ChevronDown, Phone, MapPin } from 'lucide-react';

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const closeMobile = useCallback(() => setMobileOpen(false), []);

  return (
    <header className="fixed top-0 left-0 right-0 z-50">
      {/* TOP BAR — always dark */}
      <div className="bg-primary border-b border-white/10">
        <div className="max-w-[1400px] mx-auto px-6 flex items-center justify-end gap-6 h-10 text-sm">
          <a href="#" className="text-gray-muted hover:text-accent flex items-center gap-1.5 transition-colors">
            <Search className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Buscar</span>
          </a>
          <a href="tel:+551141912706" className="text-gray-muted hover:text-accent flex items-center gap-1.5 transition-colors">
            <Phone className="w-3.5 h-3.5" />
            <span>(11) 4191-2706</span>
          </a>
          <a href="#contato" className="text-gray-muted hover:text-accent flex items-center gap-1.5 transition-colors hidden md:flex">
            <MapPin className="w-3.5 h-3.5" />
            <span>Localização</span>
          </a>
          <a href="#" className="text-gray-muted hover:text-accent transition-colors hidden md:block">
            Carreiras
          </a>
        </div>
      </div>

      {/* MAIN HEADER */}
      <div className={`transition-all duration-300 ${scrolled ? 'bg-primary shadow-[0_2px_20px_rgba(0,0,0,0.5)]' : 'bg-secondary'}`}>
        <div className="max-w-[1400px] mx-auto px-6 flex items-center justify-between h-[72px]">
          {/* Logo */}
          <a href="#" className="flex items-center gap-1.5 shrink-0">
            <span className="font-heading text-[28px] font-bold text-white tracking-wide uppercase">
              GAIATEC
            </span>
            <span className="font-heading text-[28px] font-light text-white/50 tracking-wide uppercase">
              SISTEMAS
            </span>
          </a>

          {/* Desktop Nav */}
          <nav className="hidden lg:flex items-center gap-0">
            {navLinks.map((link) => (
              <div
                key={link.label}
                className="relative"
                onMouseEnter={() => setActiveDropdown(link.label)}
                onMouseLeave={() => setActiveDropdown(null)}
              >
                <a
                  href={link.href}
                  className="flex items-center gap-1 px-5 py-6 text-sm font-medium text-white/80 hover:text-accent uppercase tracking-wider transition-colors"
                >
                  {link.label}
                  {link.children && <ChevronDown className="w-3.5 h-3.5 ml-0.5" />}
                </a>

                {/* Yellow underline on hover */}
                <div className="absolute bottom-0 left-5 right-5 h-[3px] bg-accent scale-x-0 group-hover:scale-x-100 transition-transform origin-left" />

                {/* Mega Menu Dropdown */}
                {link.children && activeDropdown === link.label && (
                  <div className="absolute top-full left-0 pt-0">
                    <div className="bg-secondary border border-white/10 py-3 min-w-[260px] shadow-2xl">
                      {link.children.map((child) => (
                        <a
                          key={child.label}
                          href={child.href}
                          className="block px-6 py-2.5 text-sm text-white/70 hover:text-accent hover:bg-white/5 transition-colors"
                        >
                          {child.label}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </nav>

          {/* Right actions */}
          <div className="hidden lg:flex items-center gap-4">
            <a
              href="#contato"
              className="bg-accent hover:bg-accent-hover text-primary font-bold text-sm px-6 py-2.5 uppercase tracking-wider transition-colors"
            >
              Fale Conosco
            </a>
          </div>

          {/* Mobile toggle */}
          <button
            className="lg:hidden p-2 text-white"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label={mobileOpen ? 'Fechar menu' : 'Abrir menu'}
          >
            {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu — full screen dark overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 top-[122px] bg-primary z-40 overflow-y-auto">
          <nav className="p-6 space-y-0">
            {navLinks.map((link) => (
              <div key={link.label} className="border-b border-white/10">
                <a
                  href={link.href}
                  className="block px-4 py-4 text-lg font-heading font-bold text-white uppercase tracking-wider hover:text-accent transition-colors"
                  onClick={closeMobile}
                >
                  {link.label}
                </a>
                {link.children && (
                  <div className="pb-3 pl-4">
                    {link.children.map((child) => (
                      <a
                        key={child.label}
                        href={child.href}
                        className="block px-4 py-2 text-sm text-white/50 hover:text-accent transition-colors"
                        onClick={closeMobile}
                      >
                        {child.label}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <div className="pt-6">
              <a
                href="#contato"
                className="block text-center bg-accent text-primary font-bold py-4 uppercase tracking-wider text-lg"
                onClick={closeMobile}
              >
                Fale Conosco
              </a>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
