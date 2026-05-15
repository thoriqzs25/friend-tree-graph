export type CropArea = { x: number; y: number; width: number; height: number };

export function getCroppedDataUrl(
  imageSrc: string,
  cropPx: CropArea,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = cropPx.width;
      canvas.height = cropPx.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(
        img,
        cropPx.x,
        cropPx.y,
        cropPx.width,
        cropPx.height,
        0,
        0,
        cropPx.width,
        cropPx.height,
      );
      resolve(canvas.toDataURL("image/jpeg", 0.92));
    };
    img.onerror = reject;
    img.src = imageSrc;
  });
}
