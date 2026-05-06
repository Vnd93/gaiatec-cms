import React from 'react'

interface ResponsiveImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src' | 'srcSet'> {
  /**
   * Path da imagem original (ex: "/images/heroes/1.1.png")
   * O componente gera automaticamente o srcset para webp/png em 480w/1024w/1920w.
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
   * Classes CSS aplicadas ao <img> (não ao <picture>)
   */
  className?: string
  /**
   * Estilo aplicado ao <img>
   */
  style?: React.CSSProperties
}

/**
 * Renderiza uma imagem responsiva com srcset + WebP fallback.
 *
 * Requer que as variants tenham sido geradas via `scripts/generate-responsive-images.mjs`:
 *   - {name}.webp                (full size)
 *   - {name}-480w.webp / -480w.png
 *   - {name}-1024w.webp / -1024w.png
 *   - {name}-1920w.webp / -1920w.png
 *
 * @example
 * <ResponsiveImage
 *   src="/images/heroes/1.1.png"
 *   alt="Hero industrial"
 *   priority   // hero — loading eager
 * />
 */
export const ResponsiveImage: React.FC<ResponsiveImageProps> = ({
  src,
  alt,
  sizes = '(max-width: 768px) 480px, (max-width: 1280px) 1024px, 1920px',
  priority = false,
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

  // Monta URLs para cada variant
  const buildSrcSet = (format: 'webp' | 'original') => {
    const formatExt = format === 'webp' ? '.webp' : ext
    return [
      `${dir}/${name}-480w${formatExt} 480w`,
      `${dir}/${name}-1024w${formatExt} 1024w`,
      `${dir}/${name}-1920w${formatExt} 1920w`,
    ].join(', ')
  }

  const fallbackSrc = `${dir}/${name}-1024w${ext}` // tamanho médio como fallback

  return (
    <picture>
      {/* WebP — moderno, ~30% menor que PNG */}
      <source type="image/webp" srcSet={buildSrcSet('webp')} sizes={sizes} />
      {/* PNG/JPG fallback — Safari < 14, navegadores antigos */}
      <img
        src={fallbackSrc}
        srcSet={buildSrcSet('original')}
        sizes={sizes}
        alt={alt}
        loading={priority ? 'eager' : 'lazy'}
        // @ts-expect-error fetchPriority é válido em React 18+
        fetchpriority={priority ? 'high' : undefined}
        decoding={priority ? 'sync' : 'async'}
        className={className}
        style={style}
        {...rest}
      />
    </picture>
  )
}

/**
 * Helper que retorna o caminho da WebP otimizada de tamanho específico.
 * Útil pra `backgroundImage` em divs onde refatorar para <picture> não é prático.
 *
 * @example
 * const bgUrl = optimizedBg('/images/heroes/1.1.png', 1920)
 * <div style={{ backgroundImage: `url(${bgUrl})` }} />
 *
 * @param src Path original (ex: "/images/heroes/1.1.png")
 * @param width Tamanho desejado: 480 | 1024 | 1920
 */
export function optimizedBg(src: string, width: 480 | 1024 | 1920 = 1920): string {
  const isLocal = src.startsWith('/') && !src.startsWith('//')
  if (!isLocal) return src

  const lastSlash = src.lastIndexOf('/')
  const lastDot = src.lastIndexOf('.')
  if (lastDot < lastSlash) return src // sem extensão

  const dir = src.substring(0, lastSlash)
  const name = src.substring(lastSlash + 1, lastDot)
  return `${dir}/${name}-${width}w.webp`
}

/**
 * Para uso com CSS image-set() em backgrounds responsivos.
 * Gera string image-set() com 3 tamanhos. Browsers escolhem o ideal.
 *
 * @example
 * const bg = responsiveBackgroundCss('/images/heroes/1.1.png')
 * <div style={{ backgroundImage: bg }} />
 */
export function responsiveBackgroundCss(src: string): string {
  const isLocal = src.startsWith('/') && !src.startsWith('//')
  if (!isLocal) return `url(${src})`

  const lastSlash = src.lastIndexOf('/')
  const lastDot = src.lastIndexOf('.')
  if (lastDot < lastSlash) return `url(${src})`

  const dir = src.substring(0, lastSlash)
  const name = src.substring(lastSlash + 1, lastDot)

  // image-set() é suportado por todos os navegadores modernos (2022+).
  // Browsers escolhem a melhor versão baseado na resolução.
  return `image-set(
    url(${dir}/${name}-480w.webp) type("image/webp") 1x,
    url(${dir}/${name}-1024w.webp) type("image/webp") 1.5x,
    url(${dir}/${name}-1920w.webp) type("image/webp") 2x
  )`
}

export default ResponsiveImage
