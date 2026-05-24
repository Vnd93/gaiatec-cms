import {
  useScroll,
  useTransform,
  motion,
} from "motion/react";
import React, { useEffect, useRef, useState } from "react";

interface TimelineEntry {
  title: string;
  content: React.ReactNode;
}

export const Timeline = ({ data }: { data: TimelineEntry[] }) => {
  const ref = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setHeight(rect.height);
    }
  }, [ref]);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start 10%", "end 50%"],
  });

  const heightTransform = useTransform(scrollYProgress, [0, 1], [0, height]);
  const opacityTransform = useTransform(scrollYProgress, [0, 0.1], [0, 1]);

  // Atualiza o índice ativo baseado no progresso do scroll
  useEffect(() => {
    const unsubscribe = scrollYProgress.on("change", (latest) => {
      const index = Math.floor(latest * data.length);
      setActiveIndex(Math.min(index, data.length - 1));
    });

    return () => unsubscribe();
  }, [scrollYProgress, data.length]);

  return (
    <div
      className="w-full bg-white font-sans"
      style={{ position: "relative" }}
    >
      <div ref={containerRef} className="relative max-w-7xl mx-auto pb-20" style={{ position: "relative" }}>
        <div ref={ref} className="relative" style={{ position: "relative" }}>
          {data.map((item, index) => (
            <div
              key={index}
              className="flex justify-start pt-10 md:pt-40 md:gap-10 relative"
            >
              <div className="sticky flex flex-col md:flex-row z-40 items-center top-40 self-start max-w-xs lg:max-w-sm md:w-full">
                <div className="h-10 absolute left-3 md:left-3 w-10 rounded-full bg-white flex items-center justify-center">
                  <motion.div 
                    className="h-4 w-4 rounded-full border-2 p-2"
                    animate={{
                      backgroundColor: index <= activeIndex ? "#F97316" : "#E5E7EB",
                      borderColor: index <= activeIndex ? "#F97316" : "#D1D5DB"
                    }}
                    transition={{
                      duration: 0.3,
                      ease: "easeOut"
                    }}
                  />
                </div>
                <h3 className="hidden md:block text-xl md:pl-20 md:text-5xl font-bold text-gray-500">
                  {item.title}
                </h3>
              </div>

              <div className="relative pl-20 pr-4 md:pl-4 w-full">
                <h3 className="md:hidden block text-2xl mb-4 text-left font-bold text-gray-500">
                  {item.title}
                </h3>
                {item.content}
              </div>
            </div>
          ))}
          <div
            style={{
              height: height + "px",
            }}
            className="absolute md:left-8 left-8 top-0 overflow-hidden w-[2px] bg-[linear-gradient(to_bottom,var(--tw-gradient-stops))] from-transparent from-[0%] via-gray-200 to-transparent to-[99%] [mask-image:linear-gradient(to_bottom,transparent_0%,black_10%,black_90%,transparent_100%)]"
          >
            <motion.div
              style={{
                height: heightTransform,
                opacity: opacityTransform,
              }}
              transition={{
                duration: 0.3,
                ease: "easeOut",
              }}
              className="absolute inset-x-0 top-0 w-[2px] bg-[#0057DE] rounded-full shadow-[0_0_10px_rgba(249,115,22,0.5)]"
            />
          </div>
        </div>
      </div>
    </div>
  );
};