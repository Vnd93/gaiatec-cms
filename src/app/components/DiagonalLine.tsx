interface DiagonalLineProps {
  topColor: string;
  bottomColor: string;
}

export function DiagonalLine({ topColor, bottomColor }: DiagonalLineProps) {
  return (
    <div className="relative w-full" style={{ height: "60px" }}>
    </div>
  );
}