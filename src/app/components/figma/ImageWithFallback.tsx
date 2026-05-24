import React, { useState } from 'react'
import { ResponsiveImage } from '../ResponsiveImage'

const ERROR_IMG_SRC =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODgiIGhlaWdodD0iODgiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgc3Ryb2tlPSIjMDAwIiBzdHJva2UtbGluZWpvaW49InJvdW5kIiBvcGFjaXR5PSIuMyIgZmlsbD0ibm9uZSIgc3Ryb2tlLXdpZHRoPSIzLjciPjxyZWN0IHg9IjE2IiB5PSIxNiIgd2lkdGg9IjU2IiBoZWlnaHQ9IjU2IiByeD0iNiIvPjxwYXRoIGQ9Im0xNiA1OCAxNi0xOCAzMiAzMiIvPjxjaXJjbGUgY3g9IjUzIiBjeT0iMzUiIHI9IjciLz48L3N2Zz4KCg=='

/**
 * ImageWithFallback — wrapper que usa ResponsiveImage automaticamente para
 * paths locais (`/images/...`), com fallback gracioso em caso de erro.
 *
 * Esta atualização foi crítica: 7+ páginas usam este componente para hero
 * images. Ao migrar internamente para ResponsiveImage, todas elas ganham
 * automaticamente srcset + WebP + lazy loading sem precisar refatorar
 * cada página individualmente.
 */
export function ImageWithFallback(props: React.ImgHTMLAttributes<HTMLImageElement>) {
  const [didError, setDidError] = useState(false)
  const { src, alt, style, className, loading, ...rest } = props

  const handleError = () => setDidError(true)

  // Estado de erro: mostra ícone fallback
  if (didError) {
    return (
      <div
        className={`inline-block bg-gray-100 text-center align-middle ${className ?? ''}`}
        style={style}
      >
        <div className="flex items-center justify-center w-full h-full">
          <img
            loading="lazy"
            src={ERROR_IMG_SRC}
            alt="Error loading image"
            {...rest}
            data-original-url={src}
          />
        </div>
      </div>
    )
  }

  // Detecta se o src é local (suporte a srcset/WebP)
  const srcStr = typeof src === 'string' ? src : ''
  const isLocal = srcStr.startsWith('/') && !srcStr.startsWith('//')
  const priority = loading === 'eager'

  if (isLocal) {
    return (
      <ResponsiveImage
        src={srcStr}
        alt={alt ?? ''}
        priority={priority}
        className={className}
        style={style}
        onError={handleError}
        {...rest}
      />
    )
  }

  // Path externo (figma:asset, http://, etc.) — img tradicional
  return (
    <img
      loading={loading ?? 'lazy'}
      src={src}
      alt={alt}
      className={className}
      style={style}
      {...rest}
      onError={handleError}
    />
  )
}
