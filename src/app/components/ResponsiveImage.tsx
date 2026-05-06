import React from 'react'

interface ResponsiveImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src' | 'srcSet'> {
  /**
   * Path da imagem original (ex: "/images/heroes/1.1.png")
   * O componente gera automaticamente o srcset para AVIF/WebP/PNG em 480w/1024w/1920w.
   */
  src: string
  /**
   * Texto alternativo (obrigatório por acessibilidade)
   */
  alt: string
  /**
   * Sizes attribute para o navegador escolher o melhor tamanho.
   * Default: "(max-width: 768px) 480px, (max-width: 1280px) 1024px, 1920px"
   */
  sizes?: string
  /**
   * Se true, marca como hero image (loading eager + fetchpriority high).
   * Default: false (lazy loading)
   */
  priority?: boolean
  /**
   * Largura intrínseca da imagem (evita layout shift). Recomendado.
   */
  width?: number
  /**
   * Altura intrínseca (evita layout shift). Recomendado.
   */
  height?: number
  /**
   * Classes CSS aplicadas ao <img> (não ao <picture>)
   */
  className?: string
  /**
   * Estilo aplicado ao <img>
   */
  style?: React.CSSProperties
}

/**
 * Renderiza uma imagem responsiva com AVIF + WebP + PNG fallback.
 *
 * Requer que as variants tenham sido geradas via `scripts/generate-responsive-images.mjs`:
 *   - {name}-480w.{avif|webp|png}    (mobile)
 *   - {name}-1024w.{avif|webp|png}   (tablet)
 *   - {name}-1920w.{avif|webp|png}   (desktop)
 *
 * AVIF: ~40% menor que WebP, suportado por 95%+ dos browsers (2024+)
 * WebP: fallback para browsers que não suportam AVIF
 * PNG:  fallback final (Safari < 14, IE)
 */
export const ResponsiveImage: React.FC<ResponsiveImageProps> = ({
  src,
  alt,
  sizes = '(max-width: 768px) 480px, (max-width: 1280px) 1024px, 1920px',
  priority = false,
  width,
  height,
  className,
  style,
  ...rest
}) => {
  // Detecta paths externos (figma:asset, http://, etc.) — não processa
  const isLocal = src.startsWith('/') && !src.startsWith('//')

  if (!isLocal) {
    return (
      <img
        src={src}
        alt={alt}
        loading={priority ? 'eager' : 'lazy'}
        // @ts-expect-error fetchPriority é válido em React 18+
        fetchpriority={priority ? 'high' : undefined}
        decoding={priority ? 'sync' : 'async'}
        width={width}
        height={height}
        className={className}
        style={style}
        {...rest}
      />
    )
  }

  // Extrai diretório e nome base do arquivo
  // "/images/heroes/1.1.png" → dir="/images/heroes", name="1.1", ext=".png"
  const lastSlash = src.lastIndexOf('/')
  const lastDot = src.lastIndexOf('.')
  const dir = src.substring(0, lastSlash)
  const name = src.substring(lastSlash + 1, lastDot)
  const ext = src.substring(lastDot)

  // Monta srcset para um formato específico
  const buildSrcSet = (format: 'avif' | 'webp' | 'original') => {
    const formatExt = format === 'avif' ? '.avif' : format === 'webp' ? '.webp' : ext
    return [
      `${dir}/${name}-480w${formatExt} 480w`,
      `${dir}/${name}-1024w${formatExt} 1024w`,
      `${dir}/${name}-1920w${formatExt} 1920w`,
    ].join(', ')
  }

  const fallbackSrc = `${dir}/${name}-1024w${ext}` // tamanho médio como fallback

  return (
    <picture>
      {/* AVIF — mais novo, ~40% menor que WebP */}
      <source type="image/avif" srcSet={buildSrcSet('avif')} sizes={sizes} />
      {/* WebP — moderno, ~30% menor que PNG */}
      <source type="image/webp" srcSet={buildSrcSet('webp')} sizes={sizes} />
      {/* PNG/JPG fallback */}
      <img
        src={fallbackSrc}
        srcSet={buildSrcSet('original')}
        sizes={sizes}
        alt={alt}
        loading={priority ? 'eager' : 'lazy'}
        // @ts-expect-error fetchPriority é válido em React 18+
        fetchpriority={priority ? 'high' : undefined}
        decoding={priority ? 'sync' : 'async'}
        width={width}
        height={height}
        className={className}
        style={style}
        {...rest}
      />
    </picture>
  )
}

/**
 * Helper que retorna o caminho da imagem otimizada para `backgroundImage`.
 * Browsers modernos preferem AVIF, fallback automático via image-set().
 *
 * @param src Path original (ex: "/images/heroes/1.1.png")
 * @param width Tamanho desejado: 480 | 1024 | 1920
 * @param format Formato: 'avif' (default) | 'webp' | 'png'
 */
export function optimizedBg(
  src: string,
  width: 480 | 1024 | 1920 = 1920,
  format: 'avif' | 'webp' | 'png' = 'webp',
): string {
  const isLocal = src.startsWith('/') && !src.startsWith('//')
  if (!isLocal) return src

  const lastSlash = src.lastIndexOf('/')
  const lastDot = src.lastIndexOf('.')
  if (lastDot < lastSlash) return src // sem extensão

  const dir = src.substring(0, lastSlash)
  const name = src.substring(lastSlash + 1, lastDot)
  const ext = format === 'png' ? src.substring(lastDot) : `.${format}`
  return `${dir}/${name}-${width}w${ext}`
}

/**
 * CSS image-set() responsivo com AVIF → WebP fallback.
 * Browser escolhe o melhor formato + resolução suportado.
 *
 * @example
 * <div style={{ backgroundImage: responsiveBackgroundCss('/images/heroes/1.1.png') }} />
 */
export function responsiveBackgroundCss(src: string): string {
  const isLocal = src.startsWith('/') && !src.startsWith('//')
  if (!isLocal) return `url(${src})`

  const lastSlash = src.lastIndexOf('/')
  const lastDot = src.lastIndexOf('.')
  if (lastDot < lastSlash) return `url(${src})`

  const dir = src.substring(0, lastSlash)
  const name = src.substring(lastSlash + 1, lastDot)

  // image-set() com type-fallback: browser escolhe o primeiro formato suportado
  return `image-set(
    url(${dir}/${name}-1920w.avif) type("image/avif") 1x,
    url(${dir}/${name}-1920w.webp) type("image/webp") 1x
  )`
}

export default ResponsiveImage
