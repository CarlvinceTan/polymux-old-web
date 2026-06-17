// Pure, framework-free helpers for client-side workspace-avatar processing.
// Decode an uploaded image and center-crop it to a square data URL (webp,
// jpeg fallback). No Vue reactivity — auto-imported from app/utils.

export const AVATAR_MAX_INPUT_BYTES = 1 * 1024 * 1024
export const AVATAR_OUTPUT_SIZE = 256
export const AVATAR_OUTPUT_QUALITY = 0.85

export function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode-failed')) }
    img.src = url
  })
}

export function cropImageToDataURL(img: HTMLImageElement): string {
  const side = Math.min(img.naturalWidth, img.naturalHeight)
  const sx = Math.floor((img.naturalWidth - side) / 2)
  const sy = Math.floor((img.naturalHeight - side) / 2)
  const canvas = document.createElement('canvas')
  canvas.width = AVATAR_OUTPUT_SIZE
  canvas.height = AVATAR_OUTPUT_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas-unsupported')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, sx, sy, side, side, 0, 0, AVATAR_OUTPUT_SIZE, AVATAR_OUTPUT_SIZE)
  let dataUrl = canvas.toDataURL('image/webp', AVATAR_OUTPUT_QUALITY)
  if (!dataUrl.startsWith('data:image/webp')) {
    dataUrl = canvas.toDataURL('image/jpeg', AVATAR_OUTPUT_QUALITY)
  }
  return dataUrl
}
