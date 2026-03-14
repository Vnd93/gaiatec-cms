import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export function useScrollAnimation<T extends HTMLElement>(
  animation: (el: T) => gsap.core.Timeline | gsap.core.Tween,
  deps: unknown[] = []
) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    const anim = animation(el);
    return () => {
      anim.kill();
      ScrollTrigger.getAll().forEach((t) => {
        if (t.vars.trigger === el || (t.vars.trigger as Element)?.contains?.(el)) {
          t.kill();
        }
      });
    };
  }, deps);

  return ref;
}

export function useFadeIn<T extends HTMLElement>(direction: 'up' | 'left' | 'right' = 'up', delay = 0) {
  const dirMap = {
    up: { y: 60, x: 0 },
    left: { x: -60, y: 0 },
    right: { x: 60, y: 0 },
  };

  return useScrollAnimation<T>((el) =>
    gsap.from(el, {
      ...dirMap[direction],
      opacity: 0,
      duration: 1,
      delay,
      ease: 'power3.out',
      immediateRender: false,
      scrollTrigger: {
        trigger: el,
        start: 'top 85%',
        toggleActions: 'play none none none',
      },
    })
  );
}

export function useStaggerChildren<T extends HTMLElement>(stagger = 0.15) {
  return useScrollAnimation<T>((el) =>
    gsap.from(el.children, {
      y: 40,
      opacity: 0,
      duration: 0.8,
      stagger,
      ease: 'power3.out',
      immediateRender: false,
      scrollTrigger: {
        trigger: el,
        start: 'top 80%',
        toggleActions: 'play none none none',
      },
    })
  );
}

export function useParallax<T extends HTMLElement>(speed = 0.3) {
  return useScrollAnimation<T>((el) =>
    gsap.to(el, {
      yPercent: speed * 100,
      ease: 'none',
      scrollTrigger: {
        trigger: el,
        start: 'top bottom',
        end: 'bottom top',
        scrub: true,
      },
    })
  );
}

export function useCountUp(target: number, duration = 2) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const obj = { val: 0 };
    const anim = gsap.to(obj, {
      val: target,
      duration,
      ease: 'power2.out',
      scrollTrigger: {
        trigger: el,
        start: 'top 85%',
        toggleActions: 'play none none none',
      },
      onUpdate: () => {
        el.textContent = Math.round(obj.val).toString();
      },
    });

    return () => { anim.kill(); };
  }, [target, duration]);

  return ref;
}
