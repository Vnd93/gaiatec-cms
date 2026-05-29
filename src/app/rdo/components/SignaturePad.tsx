import { useCallback, useEffect, useRef, useState } from "react";
import { Eraser } from "lucide-react";

/**
 * Campo de assinatura por traço (dedo no celular ou mouse no desktop).
 * Usa Pointer Events + canvas em alta resolução (devicePixelRatio).
 * onChange recebe o PNG (data URL) enquanto houver traço, ou null se vazio.
 */
export function SignaturePad({
  onChange,
  height = 168,
  disabled,
}: {
  onChange: (dataUrl: string | null) => void;
  height?: number;
  disabled?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [hasInk, setHasInk] = useState(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const fit = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = wrap.clientWidth;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.scale(dpr, dpr);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = "#14161c";
    }
  }, [height]);

  // Ajusta o tamanho na montagem e quando o container muda de largura (só se vazio).
  useEffect(() => {
    fit();
    const ro = new ResizeObserver(() => {
      if (!hasInk) fit();
    });
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [fit, hasInk]);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    e.preventDefault();
    drawing.current = true;
    last.current = pos(e);
    canvasRef.current?.setPointerCapture(e.pointerId);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || disabled) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx || !last.current) return;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    if (!hasInk) setHasInk(true);
  }

  function end(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    e.preventDefault();
    drawing.current = false;
    last.current = null;
    try {
      canvasRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const canvas = canvasRef.current;
    if (canvas && hasInk) onChangeRef.current(canvas.toDataURL("image/png"));
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
    onChangeRef.current(null);
  }

  return (
    <div>
      <div
        ref={wrapRef}
        className="relative overflow-hidden rounded-md border border-[var(--rdo-line-strong)] bg-white"
        style={{ height }}
      >
        {/* linha-base */}
        <div className="pointer-events-none absolute inset-x-6 bottom-9 border-t border-dashed border-[var(--rdo-line-strong)]" />
        {!hasInk && (
          <span className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-[11px] text-[var(--rdo-ghost)]">
            Assine no quadro acima
          </span>
        )}
        <canvas
          ref={canvasRef}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          onPointerLeave={end}
          className="relative block h-full w-full"
          style={{ touchAction: "none", cursor: disabled ? "not-allowed" : "crosshair" }}
        />
      </div>
      <div className="mt-1.5 flex justify-end">
        <button
          type="button"
          onClick={clear}
          disabled={disabled || !hasInk}
          className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--rdo-ink-3)] transition-colors hover:text-[var(--rdo-ink)] disabled:opacity-45"
        >
          <Eraser size={13} /> Limpar
        </button>
      </div>
    </div>
  );
}
