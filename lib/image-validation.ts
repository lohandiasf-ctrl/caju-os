export type PhotoValidationResult = {
  isValid: boolean;
  isDark: boolean;
  isBlurryOrLowContrast: boolean;
  isLowResolution: boolean;
  width: number;
  height: number;
  lumaAverage: number;
  contrastStdDev: number;
  message: string;
  warnings: string[];
};

type ValidationOptions = {
  minWidth?: number;
  minHeight?: number;
  darkThreshold?: number;
  contrastThreshold?: number;
  sampleStride?: number;
};

const defaults = {
  minWidth: 700,
  minHeight: 500,
  darkThreshold: 38,
  contrastThreshold: 22,
  sampleStride: 16,
};

export function validateImageQuality(canvas: HTMLCanvasElement, options: ValidationOptions = {}): PhotoValidationResult {
  const settings = { ...defaults, ...options };
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return { isValid: true, isDark: false, isBlurryOrLowContrast: false, isLowResolution: false, width: canvas.width, height: canvas.height, lumaAverage: 128, contrastStdDev: 50, warnings: [], message: 'Não foi possível analisar os pixels da imagem.' };
  }

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  let totalLuma = 0;
  const lumas: number[] = [];

  for (let i = 0; i < data.length; i += Math.max(4, settings.sampleStride)) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    lumas.push(luma);
    totalLuma += luma;
  }

  const pixelCount = Math.max(1, lumas.length);
  const lumaAverage = totalLuma / pixelCount;

  let varianceSum = 0;
  for (let i = 0; i < pixelCount; i++) {
    const diff = lumas[i] - lumaAverage;
    varianceSum += diff * diff;
  }
  const contrastStdDev = Math.sqrt(varianceSum / pixelCount);

  const isLowResolution = canvas.width < settings.minWidth || canvas.height < settings.minHeight;
  const isDark = lumaAverage < settings.darkThreshold;
  const isBlurryOrLowContrast = contrastStdDev < settings.contrastThreshold;
  const warnings = [
    ...(isLowResolution ? [`Resolução baixa (${canvas.width}x${canvas.height}).`] : []),
    ...(isDark ? ['Foto muito escura.'] : []),
    ...(isBlurryOrLowContrast ? ['Contraste baixo, pode ficar ilegível.'] : []),
  ];

  let message = 'Foto aprovada com boa legibilidade e iluminação.';
  if (warnings.length) {
    message = `Atenção: ${warnings.join(' ')}`;
  }
  if (isDark && isBlurryOrLowContrast) {
    message = 'Atenção: A foto está muito escura e ilegível. Ligue a luz ou use o flash.';
  } else if (isDark) {
    message = 'Atenção: Foto muito escura. Ilumine melhor o documento ou peça.';
  } else if (isBlurryOrLowContrast) {
    message = 'Atenção: Foto embaçada ou sem contraste. Redefina o foco da câmera.';
  }

  return {
    isValid: !isLowResolution && !isDark && !isBlurryOrLowContrast,
    isDark,
    isBlurryOrLowContrast,
    isLowResolution,
    width: canvas.width,
    height: canvas.height,
    lumaAverage: Math.round(lumaAverage),
    contrastStdDev: Math.round(contrastStdDev),
    warnings,
    message,
  };
}

export async function validateImageFile(file: File, options: ValidationOptions = {}) {
  const bitmap = await createImageBitmap(file);
  const width = bitmap.width;
  const height = bitmap.height;
  const scale = Math.min(1, 320 / Math.max(width, height, 1));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  canvas.getContext('2d', { willReadFrequently: true })?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const result = validateImageQuality(canvas, { minWidth: 1, minHeight: 1, ...options });
  const isLowResolution = width < (options.minWidth ?? defaults.minWidth) || height < (options.minHeight ?? defaults.minHeight);
  const warnings = [
    ...(isLowResolution ? [`Resolução baixa (${width}x${height}).`] : []),
    ...(result.isDark ? ['Foto muito escura.'] : []),
    ...(result.isBlurryOrLowContrast ? ['Contraste baixo, pode ficar ilegível.'] : []),
  ];
  return {
    ...result,
    isValid: warnings.length === 0,
    isLowResolution,
    width,
    height,
    warnings,
    message: warnings.length ? `Atenção: ${warnings.join(' ')}` : result.message,
  };
}

export async function validateEvidenceFiles(files: File[]) {
  const warnings: string[] = [];
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;
    const result = await validateImageFile(file).catch(() => null);
    if (!result) continue;
    warnings.push(...result.warnings.map((warning) => `${file.name}: ${warning}`));
  }
  return warnings;
}
