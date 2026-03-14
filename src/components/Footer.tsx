import { footerLinks } from '@/data/content';
import { ArrowRight, Linkedin, Facebook, Instagram, Youtube } from 'lucide-react';

const socialLinks = [
  { icon: Linkedin, href: '#', label: 'LinkedIn' },
  { icon: Facebook, href: '#', label: 'Facebook' },
  { icon: Instagram, href: '#', label: 'Instagram' },
  { icon: Youtube, href: '#', label: 'YouTube' },
];

export default function Footer() {
  return (
    <footer className="bg-secondary">
      {/* Newsletter bar */}
      <div className="border-b border-white/10">
        <div className="max-w-[1400px] mx-auto px-6 py-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h3 className="font-heading text-xl font-bold text-white uppercase tracking-wider">
              Assine Nossa Newsletter
            </h3>
            <p className="text-white/40 text-sm mt-1">
              Receba novidades sobre instrumentacao e automacao industrial.
            </p>
          </div>
          <div className="flex w-full md:w-auto">
            <input
              type="email"
              placeholder="Seu e-mail"
              className="flex-1 md:w-72 bg-white/5 border border-white/15 border-r-0 px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-accent transition-colors"
            />
            <button className="bg-accent hover:bg-accent-hover px-6 py-3 text-primary font-bold text-sm uppercase tracking-wider transition-colors flex items-center gap-2 shrink-0">
              Assinar
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Link columns */}
      <div className="max-w-[1400px] mx-auto px-6 py-12">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-8">
          {/* Col 1 — Produtos */}
          <div>
            <h4 className="font-heading text-sm font-bold text-white uppercase tracking-wider mb-4">
              Produtos
            </h4>
            <ul className="space-y-2.5">
              {footerLinks.produtos.map((link) => (
                <li key={link.label}>
                  <a href={link.href} className="text-white/40 text-sm hover:text-accent transition-colors">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Col 2 — Solucoes */}
          <div>
            <h4 className="font-heading text-sm font-bold text-white uppercase tracking-wider mb-4">
              Solucoes
            </h4>
            <ul className="space-y-2.5">
              {footerLinks.solucoes.map((link) => (
                <li key={link.label}>
                  <a href={link.href} className="text-white/40 text-sm hover:text-accent transition-colors">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Col 3 — Setores */}
          <div>
            <h4 className="font-heading text-sm font-bold text-white uppercase tracking-wider mb-4">
              Setores
            </h4>
            <ul className="space-y-2.5">
              {footerLinks.setores.map((link) => (
                <li key={link.label}>
                  <a href={link.href} className="text-white/40 text-sm hover:text-accent transition-colors">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Col 4 — Empresa */}
          <div>
            <h4 className="font-heading text-sm font-bold text-white uppercase tracking-wider mb-4">
              Empresa
            </h4>
            <ul className="space-y-2.5">
              {footerLinks.empresa.map((link) => (
                <li key={link.label}>
                  <a href={link.href} className="text-white/40 text-sm hover:text-accent transition-colors">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Col 5 — Suporte */}
          <div>
            <h4 className="font-heading text-sm font-bold text-white uppercase tracking-wider mb-4">
              Suporte
            </h4>
            <ul className="space-y-2.5">
              {footerLinks.suporte.map((link) => (
                <li key={link.label}>
                  <a href={link.href} className="text-white/40 text-sm hover:text-accent transition-colors">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Col 6 — Social */}
          <div>
            <h4 className="font-heading text-sm font-bold text-white uppercase tracking-wider mb-4">
              Social
            </h4>
            <div className="flex flex-wrap gap-3">
              {socialLinks.map(({ icon: Icon, href, label }) => (
                <a
                  key={label}
                  href={href}
                  className="w-10 h-10 bg-white/5 flex items-center justify-center text-white/40 hover:bg-accent hover:text-primary transition-all"
                  aria-label={label}
                >
                  <Icon className="w-5 h-5" />
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-white/5">
        <div className="max-w-[1400px] mx-auto px-6 py-6 flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Logo + copyright */}
          <div className="flex items-center gap-4">
            <span className="font-heading text-lg font-bold text-white/30 uppercase tracking-wider">
              GAIATEC SISTEMAS
            </span>
            <span className="text-white/20 text-sm">
              &copy; {new Date().getFullYear()} Todos os direitos reservados.
            </span>
          </div>

          {/* Legal links */}
          <div className="flex gap-6">
            <a href="#" className="text-white/30 text-sm hover:text-white/60 transition-colors">
              Politica de Privacidade
            </a>
            <a href="#" className="text-white/30 text-sm hover:text-white/60 transition-colors">
              Termos de Uso
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
