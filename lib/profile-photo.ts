// Foto de perfil reduzida no navegador antes de salvar: recorte quadrado no
// centro, 320 px, JPEG. Foto de câmera de celular (vários MB) vira ~30–60 KB
// e cabe no limite da rota /api/colleagues. Só roda no navegador (canvas).

const SIZE = 320;

export async function profilePhotoDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Escolha um arquivo de imagem (JPG, PNG ou WEBP).');
  const bitmap = await loadBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Não foi possível processar a imagem.');
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
  if ('close' in bitmap) bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.85);
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  // createImageBitmap respeita a orientação EXIF da câmera.
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* cai no <img> */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } catch {
    throw new Error('Não foi possível abrir esta imagem. Tente outra foto.');
  } finally {
    URL.revokeObjectURL(url);
  }
}
