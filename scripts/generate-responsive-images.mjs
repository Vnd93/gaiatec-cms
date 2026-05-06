#!/usr/bin/env node
/**
 * Pipeline de imagens responsivas
 * --------------------------------
 * Para cada PNG em public/images/, gera variants em 3 tamanhos × 2 formatos:
 *   - PNG 480w / 1024w / 1920w
 *   - WebP 480w / 1024w / 1920w
 *
 * Cache: pula imagens cuja saída já existe e é mais nova que o source.
 *
 * Uso: rodado antes do `vite build` via package.json:
 *   "build": "node scripts/generate-responsive-images.mjs && vite build"
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
const WEBP_QUALITY = 75
const PNG_QUALITY = 80

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

    // PNG/JPG variant
    const pngOut = join(dir, `${name}-${targetWidth}w${ext}`)
    if (await shouldRegenerate(filePath, pngOut)) {
      tasks.push(
        sharp(filePath)
          .resize({ width: targetWidth, withoutEnlargement: true })
          .png({ quality: PNG_QUALITY, compressionLevel: 9 })
          .toFile(pngOut)
          .then(() => generatedCount++)
      )
    }

    // WebP variant
    const webpOut = join(dir, `${name}-${targetWidth}w.webp`)
    if (await shouldRegenerate(filePath, webpOut)) {
      tasks.push(
        sharp(filePath)
          .resize({ width: targetWidth, withoutEnlargement: true })
          .webp({ quality: WEBP_QUALITY })
          .toFile(webpOut)
          .then(() => generatedCount++)
      )
    }
  }

  // Variant WebP do tamanho original (sem resize, só conversão)
  const webpOriginalOut = join(dir, `${name}.webp`)
  if (await shouldRegenerate(filePath, webpOriginalOut)) {
    tasks.push(
      sharp(filePath)
        .webp({ quality: WEBP_QUALITY })
        .toFile(webpOriginalOut)
        .then(() => generatedCount++)
    )
  }

  await Promise.all(tasks)

  return { filePath, generated: generatedCount, width: originalWidth }
}

async function main() {
  console.log('🖼️  Gerando imagens responsivas...')
  const startTime = Date.now()

  if (!existsSync(SOURCE_DIR)) {
    console.warn(`⚠️  Diretório não existe: ${SOURCE_DIR} — pulando`)
    return
  }

  const files = await walkDir(SOURCE_DIR)
  const imageFiles = files.filter(f => /\.(png|jpe?g)$/i.test(f))

  console.log(`   Encontradas ${imageFiles.length} imagens para processar`)

  let totalGenerated = 0
  let totalSkipped = 0

  // Processa em paralelo (4 por vez para não estourar memória)
  const batchSize = 4
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
