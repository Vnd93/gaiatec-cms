import type { ImgHTMLAttributes } from "react";

type ResponsiveApplicationImageProps = Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  "src" | "srcSet"
> & {
  src: string;
};

const LOCAL_APPLICATION_IMAGE =
  /^\/images\/aplicacoes\/.+\.(?:avif|webp)$/i;

function buildSrcSet(base: string, extension: "avif" | "webp") {
  return [480, 1024, 1920]
    .map((width) => `${base}-${width}w.${extension} ${width}w`)
    .join(", ");
}

/**
 * Entrega os novos assets de Aplicacoes em AVIF/WebP responsivos e preserva
 * compatibilidade caso uma URL externa volte a ser fornecida pelo CMS.
 */
export function ResponsiveApplicationImage({
  src,
  alt,
  sizes = "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw",
  ...imgProps
}: ResponsiveApplicationImageProps) {
  if (!LOCAL_APPLICATION_IMAGE.test(src)) {
    return <img src={src} alt={alt} sizes={sizes} {...imgProps} />;
  }

  const base = src.replace(/\.(?:avif|webp)$/i, "");

  return (
    <picture>
      <source
        type="image/avif"
        srcSet={buildSrcSet(base, "avif")}
        sizes={sizes}
      />
      <source
        type="image/webp"
        srcSet={buildSrcSet(base, "webp")}
        sizes={sizes}
      />
      <img
        src={`${base}.webp`}
        srcSet={buildSrcSet(base, "webp")}
        sizes={sizes}
        alt={alt}
        {...imgProps}
      />
    </picture>
  );
}
