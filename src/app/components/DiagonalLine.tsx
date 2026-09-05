interface DiagonalLineProps {
  topColor: string;
  bottomColor: string;
}

export function DiagonalLine({ topColor, bottomColor }: DiagonalLineProps) {
  return (
    <div
      aria-hidden="true"
      className="relative h-[60px] w-full"
      style={{
        background: `linear-gradient(to bottom right, ${topColor} 0 49.5%, ${bottomColor} 50.5% 100%)`,
      }}
    />
  );
}
