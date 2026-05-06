#!/usr/bin/env node
/**
 * Pipeline de imagens responsivas — V2 (otimização agressiva)
 * ----------------------------------------------------------
 * Para cada PNG em public/images/, gera variants em 3 tamanhos × 3 formatos:
 *   - AVIF 480w / 1024w / 1920w  (~40% menor que WebP, suporte 95%+ browsers)
 *   - WebP 480w / 1024w / 1920w  (fallback universal moderno)
 *   - PNG  480w / 1024w / 1920w  (fallback final p/ browsers antigos)
 *
 * Cache: pula imagens cuja saída já existe e é mais nova que o source.
 *
 * Qualidade calibrada para fotos web (não para impressão):
 *   AVIF: 50  → ganho ~40% vs WebP, perda visual imperceptível
 *   WebP: 65  → ganho ~25% vs WebP-75, perda visual imperceptível
 *   PNG:  72  → fallback comprimido sem suporte AVIF/WebP
 */
import { readdir, stat, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, parse, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const ROOT = join(__dirname, '..')
const SOURCE_DIR = join(ROOT, 'public', 'images')

const SIZES = [480, 1024, 1920]

// Quality levels — calibrado para fotos industriais (não slides de infográfico)
const AVIF_QUALITY = 50  // AVIF é mais eficiente, qualidade menor produz menos artefatos
const WEBP_QUALITY = 65  // WebP em 65 é visualmente igual a 80
const PNG_QUALITY = 72   // PNG fallback (raro ser usado)

// Encontra recursivamente todos os arquivos no diretório
async function walkDir(dir) {
  const out = []
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...await walkDir(full))
    } else if (entry.isFile()) {
      out.push(full)
    }
  }
  return out
}

// Verifica se o arquivo de saída precisa ser regerado
async function shouldRegenerate(sourcePath, outPath) {
  if (!existsSync(outPath)) return true
  try {
    const [src, out] = await Promise.all([stat(sourcePath), stat(outPath)])
    return src.mtimeMs > out.mtimeMs
  } catch {
    return true
  }
}

async function processImage(filePath) {
  const { dir, name, ext } = parse(filePath)

  // Apenas PNG/JPG são processados (não SVG)
  if (!/\.(png|jpe?g)$/i.test(ext)) return null

  // Pula se o arquivo já é uma variant gerada (-480w, -1024w, -1920w)
  if (/-(480|1024|1920)w$/.test(name)) return null

  const meta = await sharp(filePath).metadata()
  const originalWidth = meta.width || 0

  // Pula imagens muito pequenas (não vale gerar variants)
  if (originalWidth < 480) return null

  const tasks = []
  let generatedCount = 0

  for (const targetWidth of SIZES) {
    // Não cria variant maior do que o original
    if (targetWidth > originalWidth) continue

    const sharpResize = () =>
      sharp(filePath).resize({ width: targetWidth, withoutEnlargement: true })

    // === AVIF variant (mais agressivo, melhor compressão) ===
    const avifOut = join(dir, `${name}-${targetWidth}w.avif`)
    if (await shouldRegenerate(filePath, avifOut)) {
      tasks.push(
        sharpResize()
          .avif({ quality: AVIF_QUALITY, effort: 4 })
          .toFile(avifOut)
          .then(() => generatedCount++)
          .catch(err => console.warn(`   ⚠️  AVIF falhou para ${name}-${targetWidth}w:`, err.message))
      )
    }

    // === WebP variant (fallback compatível) ===
    const webpOut = join(dir, `${name}-${targetWidth}w.webp`)
    if (await shouldRegenerate(filePath, webpOut)) {
      tasks.push(
        sharpResize()
          .webp({ quality: WEBP_QUALITY, effort: 5 })
          .toFile(webpOut)
          .then(() => generatedCount++)
      )
    }

    // === PNG variant (fallback raríssimo) ===
    const pngOut = join(dir, `${name}-${targetWidth}w${ext}`)
    if (await shouldRegenerate(filePath, pngOut)) {
      tasks.push(
        sharpResize()
          .png({ quality: PNG_QUALITY, compressionLevel: 9, palette: true })
          .toFile(pngOut)
          .then(() => generatedCount++)
      )
    }
  }

  // Variants do tamanho original (sem resize) — usado em image-set ou casos específicos
  const avifOriginalOut = join(dir, `${name}.avif`)
  if (await shouldRegenerate(filePath, avifOriginalOut)) {
    tasks.push(
      sharp(filePath)
        .avif({ quality: AVIF_QUALITY, effort: 4 })
        .toFile(avifOriginalOut)
        .then(() => generatedCount++)
        .catch(() => {})
    )
  }

  const webpOriginalOut = join(dir, `${name}.webp`)
  if (await shouldRegenerate(filePath, webpOriginalOut)) {
    tasks.push(
      sharp(filePath)
        .webp({ quality: WEBP_QUALITY, effort: 5 })
        .toFile(webpOriginalOut)
        .then(() => generatedCount++)
    )
  }

  await Promise.all(tasks)

  return { filePath, generated: generatedCount, width: originalWidth }
}

async function main() {
  console.log('🖼️  Gerando imagens responsivas (AVIF + WebP + PNG)...')
  const startTime = Date.now()

  if (!existsSync(SOURCE_DIR)) {
    console.warn(`⚠️  Diretório não existe: ${SOURCE_DIR} — pulando`)
    return
  }

  const files = await walkDir(SOURCE_DIR)
  const imageFiles = files.filter(f => /\.(png|jpe?g)$/i.test(f) && !/-(480|1024|1920)w/.test(f))

  console.log(`   Encontradas ${imageFiles.length} imagens-fonte para processar`)

  let totalGenerated = 0
  let totalSkipped = 0

  // AVIF é CPU-intensivo — 2 em paralelo para não esgotar memória/CPU
  const batchSize = 2
  for (let i = 0; i < imageFiles.length; i += batchSize) {
    const batch = imageFiles.slice(i, i + batchSize)
    const results = await Promise.all(batch.map(processImage))

    for (const result of results) {
      if (!result) {
        totalSkipped++
        continue
      }
      totalGenerated += result.generated
      if (result.generated > 0) {
        const rel = relative(ROOT, result.filePath).replace(/\\/g, '/')
        console.log(`   ✓ ${rel} (${result.width}px → ${result.generated} variants)`)
      }
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log(`✅ Concluído em ${elapsed}s — ${totalGenerated} variants geradas, ${totalSkipped} puladas\n`)
}

main().catch(err => {
  console.error('❌ Erro ao gerar imagens responsivas:', err)
  process.exit(1)
})
