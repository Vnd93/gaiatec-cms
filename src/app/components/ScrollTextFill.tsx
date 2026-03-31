import { useEffect, useRef, useState, useCallback } from "react";

interface ScrollTextFillProps {
  text: string;
  className?: string;
  style?: React.CSSProperties;
  baseColor?: string;
  fillColor?: string;
  as?: "h1" | "h2" | "h3" | "h4" | "p" | "span";
}

export function ScrollTextFill({
  text,
  className = "",
  style,
  baseColor = "rgb(255, 106, 0)",
  fillColor = "rgb(0, 0, 0)",
  as: Tag = "h2",
}: ScrollTextFillProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const lettersRef = useRef<(HTMLSpanElement | null)[]>([]);
  const [filledCount, setFilledCount] = useState(0);

  const words = text.split(" ");
  let totalChars = 0;
  words.forEach((word, wIdx) => {
    totalChars += word.length;
    if (wIdx < words.length - 1) totalChars++; // spaces
  });

  const handleScroll = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;

    // Find the parent section container to measure full scroll range
    const container = track.closest("section") || track.parentElement?.parentElement;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const trackRect = track.getBoundingClientRect();
    const stickyHeight = trackRect.height;
    const containerHeight = containerRect.height;
    const travelDistance = containerHeight - stickyHeight;
    
    if (travelDistance <= 0) return;

    const STICKY_TOP = 100;
    const scrolled = STICKY_TOP - containerRect.top;
    const progress = Math.max(0, Math.min(1, scrolled / travelDistance));
    const newFilledCount = Math.floor(progress * totalChars);

    setFilledCount(newFilledCount);
  }, [totalChars]);

  useEffect(() => {
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll, { passive: true });
    handleScroll();
    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, [handleScroll]);

  const wordElements: React.ReactNode[] = [];
  let charIndex = 0;
  
  words.forEach((word, wIdx) => {
    const spans: React.ReactNode[] = [];
    for (const char of word) {
      const idx = charIndex;
      const isFilled = idx < filledCount;
      spans.push(
        <span 
          key={idx} 
          ref={(el) => { lettersRef.current[idx] = el; }}
          style={{ 
            display: "inline",
            color: isFilled ? fillColor : baseColor, 
            transition: "color 0.2s ease",
            ...style
          }}
        >
          {char}
        </span>
      );
      charIndex++;
    }
    
    wordElements.push(
      <span key={`word-${wIdx}`} style={{ display: "inline" }}>{spans}</span>
    );
    
    if (wIdx < words.length - 1) {
      const spaceIdx = charIndex;
      const isSpaceFilled = spaceIdx < filledCount;
      wordElements.push(
        <span 
          key={`space-${wIdx}`} 
          ref={(el) => { lettersRef.current[spaceIdx] = el; }}
          style={{ 
            display: "inline",
            color: isSpaceFilled ? fillColor : baseColor, 
            transition: "color 0.2s ease" 
          }}
        >
          {" "}
        </span>
      );
      charIndex++;
    }
  });

  return (
    <div ref={trackRef}>
      <Tag className={className} style={style}>{wordElements}</Tag>
    </div>
  );
}