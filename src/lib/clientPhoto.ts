// Browser-only. Turns any picked photo (including iPhone HEIC) into a JPEG no larger than
// UPLOAD_MAX_EDGE, which is what the server works at anyway - keeps uploads small.
const UPLOAD_MAX_EDGE = 1568;
const JPEG_QUALITY = 0.88;

function isHeicFile(file: File): boolean {
  return /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
}

function shrinkToJpeg(blob: Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, UPLOAD_MAX_EDGE / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas not supported"));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (out) => (out ? resolve(out) : reject(new Error("could not be read"))),
        "image/jpeg",
        JPEG_QUALITY
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("could not be read - try a JPG or PNG."));
    };
    img.src = url;
  });
}

export async function convertToJpeg(file: File): Promise<Blob> {
  let source: Blob = file;
  if (isHeicFile(file)) {
    // Loaded on demand - the HEIC decoder is large and most photos never need it.
    const { heicTo } = await import("heic-to");
    source = await heicTo({ blob: file, type: "image/jpeg", quality: 0.92 });
  }
  return shrinkToJpeg(source);
}
