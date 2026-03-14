import { useFadeIn } from '@/hooks/useScrollAnimation';
import { Send, Phone, Mail, MapPin } from 'lucide-react';
import { useState, type FormEvent } from 'react';

const contactCards = [
  {
    icon: Phone,
    title: 'Telefone',
    line1: '(11) 4191-2706',
    line2: 'Seg a Sex, 8h as 18h',
    href: 'tel:+551141912706',
  },
  {
    icon: Mail,
    title: 'E-mail',
    line1: 'contato@gaiatec.com.br',
    line2: 'Resposta em ate 24h',
    href: 'mailto:contato@gaiatec.com.br',
  },
  {
    icon: MapPin,
    title: 'Localizacao',
    line1: 'Sao Paulo, SP',
    line2: 'Brasil',
    href: '#',
  },
];

export default function ContactCTA() {
  const leftRef = useFadeIn<HTMLDivElement>('left');
  const rightRef = useFadeIn<HTMLDivElement>('right', 0.2);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  const inputClasses =
    'w-full bg-white/5 border border-white/15 px-4 py-3.5 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-accent transition-colors';

  return (
    <section id="contato" className="py-16 md:py-24 bg-secondary">
      <div className="max-w-[1400px] mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20">
          {/* LEFT — Form */}
          <div ref={leftRef}>
            {submitted ? (
              <div className="bg-white/5 border border-white/10 p-12 text-center">
                <div className="w-16 h-16 bg-accent/20 flex items-center justify-center mx-auto mb-4">
                  <Send className="w-8 h-8 text-accent" />
                </div>
                <h3 className="font-heading text-2xl font-bold text-white uppercase mb-2">
                  Mensagem Enviada
                </h3>
                <p className="text-white/50">Retornaremos em breve.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <input type="text" placeholder="Nome *" required className={inputClasses} />
                  <input type="text" placeholder="Sobrenome" className={inputClasses} />
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <input type="email" placeholder="E-mail *" required className={inputClasses} />
                  <input type="tel" placeholder="Telefone" className={inputClasses} />
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <input type="text" placeholder="Empresa" className={inputClasses} />
                  <select className={`${inputClasses} text-white/30`}>
                    <option value="">Tipo de Consulta</option>
                    <option value="orcamento">Orcamento</option>
                    <option value="suporte">Suporte Tecnico</option>
                    <option value="calibracao">Calibracao</option>
                    <option value="projeto">Projeto de Automacao</option>
                    <option value="outro">Outro</option>
                  </select>
                </div>
                <textarea
                  placeholder="Sua mensagem *"
                  rows={5}
                  required
                  className={`${inputClasses} resize-none`}
                />
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-1 w-4 h-4 accent-accent"
                  />
                  <span className="text-white/40 text-xs leading-relaxed">
                    Concordo com a politica de privacidade e autorizo o uso dos meus dados para contato comercial.
                  </span>
                </label>
                <button
                  type="submit"
                  className="w-full bg-accent hover:bg-accent-hover text-primary font-bold py-4 uppercase tracking-wider text-sm transition-colors flex items-center justify-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  Enviar Mensagem
                </button>
              </form>
            )}
          </div>

          {/* RIGHT — "We're here to help" + 3 contact cards */}
          <div ref={rightRef}>
            <span className="text-accent font-heading text-sm font-bold uppercase tracking-widest block mb-3">
              Contato
            </span>
            <h2 className="font-heading text-4xl md:text-5xl font-bold text-white uppercase leading-[0.95] mb-6">
              Estamos Aqui<br />
              Para Ajudar
            </h2>
            <p className="text-white/50 text-lg leading-relaxed mb-10">
              Precisa de uma solucao em instrumentacao ou automacao? Nossa equipe de engenheiros esta
              pronta para atender seu projeto com agilidade e excelencia tecnica.
            </p>

            <div className="space-y-4">
              {contactCards.map((card) => {
                const Icon = card.icon;
                return (
                  <a
                    key={card.title}
                    href={card.href}
                    className="group flex items-center gap-5 p-5 bg-white/5 border border-white/10 hover:border-accent/30 transition-all"
                  >
                    <div className="w-14 h-14 bg-accent/10 flex items-center justify-center shrink-0 group-hover:bg-accent transition-colors">
                      <Icon className="w-6 h-6 text-accent group-hover:text-primary transition-colors" />
                    </div>
                    <div>
                      <p className="text-white font-bold text-sm uppercase tracking-wider mb-0.5">
                        {card.title}
                      </p>
                      <p className="text-white/70 text-sm">{card.line1}</p>
                      <p className="text-white/40 text-xs">{card.line2}</p>
                    </div>
                  </a>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
