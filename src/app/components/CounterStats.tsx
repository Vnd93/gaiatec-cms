import React, { useEffect, useRef, useState } from 'react';

interface StatItem {
  value: number;
  suffix?: string;
  label: string;
  prefix?: string;
}

interface CounterStatsProps {
  title: string;
  subtitle?: string;
  stats: StatItem[];
  className?: string;
}

export const CounterStats: React.FC<CounterStatsProps> = ({
  title,
  subtitle,
  stats,
  className = ''
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [counts, setCounts] = useState<number[]>(stats.map(() => 0));
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !isVisible) {
          setIsVisible(true);
        }
      },
      { threshold: 0.3 }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => {
      if (sectionRef.current) {
        observer.unobserve(sectionRef.current);
      }
    };
  }, [isVisible]);

  useEffect(() => {
    if (!isVisible) return;

    const duration = 2000; // 2 segundos
    const frameRate = 1000 / 60; // 60 FPS
    const totalFrames = Math.round(duration / frameRate);

    let frame = 0;
    const counters = stats.map(() => 0);

    const timer = setInterval(() => {
      frame++;
      const progress = frame / totalFrames;
      const easeOutQuart = 1 - Math.pow(1 - progress, 4);

      stats.forEach((stat, index) => {
        counters[index] = Math.round(easeOutQuart * stat.value);
      });

      setCounts([...counters]);

      if (frame === totalFrames) {
        clearInterval(timer);
        setCounts(stats.map(s => s.value));
      }
    }, frameRate);

    return () => clearInterval(timer);
  }, [isVisible, stats]);

  return (
    <section ref={sectionRef} className={`py-20 bg-white ${className}`}>
      <div className="container mx-auto px-6">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="text-center mb-16">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
              {title}
            </h2>
            {subtitle && (
              <p className="text-base text-gray-600 max-w-3xl mx-auto">
                {subtitle}
              </p>
            )}
          </div>

          {/* Stats Grid */}
          <div className={`grid gap-8 ${
            stats.length === 3 ? 'md:grid-cols-3' : 
            stats.length === 4 ? 'md:grid-cols-2 lg:grid-cols-4' : 
            'md:grid-cols-2'
          }`}>
            {stats.map((stat, index) => (
              <div
                key={index}
                className="text-center p-8 bg-gradient-to-br from-blue-50 to-white border-2 border-blue-100 rounded-lg hover:border-blue-300 transition-all duration-300 hover:shadow-lg"
              >
                <div className="text-4xl font-bold text-blue-600 mb-4">
                  {stat.prefix || ''}
                  {counts[index].toLocaleString('pt-BR')}
                  {stat.suffix || ''}
                </div>
                <div className="text-base text-gray-700 font-medium leading-tight">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};