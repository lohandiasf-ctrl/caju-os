export type PhotoValidationResult = {
  isValid: boolean;
  isDark: boolean;
  isBlurryOrLowContrast: boolean;
  lumaAverage: number;
  contrastStdDev: number;
  message: string;
};

export function validateImageQuality(canvas: HTMLCanvasElement): PhotoValidationResult {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return { isValid: true, isDark: false, isBlurryOrLowContrast: false, lumaAverage: 128, contrastStdDev: 50, message: 'Não foi possível analisar os pixels da imagem.' };
  }

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  let totalLuma = 0;
  const pixelCount = data.length / 4;
  const lumas: number[] = new Array(pixelCount);

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    lumas[i / 4] = luma;
    totalLuma += luma;
  }

  const lumaAverage = totalLuma / pixelCount;

  let varianceSum = 0;
  for (let i = 0; i < pixelCount; i++) {
    const diff = lumas[i] - lumaAverage;
    varianceSum += diff * diff;
  }
  const contrastStdDev = Math.sqrt(varianceSum / pixelCount);

  const isDark = lumaAverage < 42;
  const isBlurryOrLowContrast = contrastStdDev < 16;

  let message = 'Foto aprovada com boa legibilidade e iluminação.';
  if (isDark && isBlurryOrLowContrast) {
    message = 'Atenção: A foto está muito escura e ilegível. Ligue a luz ou use o flash.';
  } else if (isDark) {
    message = 'Atenção: Foto muito escura. Ilumine melhor o documento ou peça.';
  } else if (isBlurryOrLowContrast) {
    message = 'Atenção: Foto embaçada ou sem contraste. Redefina o foco da câmera.';
  }

  return {
    isValid: !isDark && !isBlurryOrLowContrast,
    isDark,
    isBlurryOrLowContrast,
    lumaAverage: Math.round(lumaAverage),
    contrastStdDev: Math.round(contrastStdDev),
    message,
  };
}
