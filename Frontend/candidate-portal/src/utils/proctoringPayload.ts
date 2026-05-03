export function captureVideoFrameBase64(
  video: HTMLVideoElement | null,
  width = 224,
  height = 224,
): string | null {
  if (!video || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return null;
  }

  ctx.drawImage(video, 0, 0, width, height);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
  return dataUrl || null;
}

export function toWaveformPayload(
  frame: Float32Array | null,
  maxLength = 32000,
): number[] | null {
  if (!frame || frame.length === 0) {
    return null;
  }

  const source = frame.length > maxLength ? frame.slice(frame.length - maxLength) : frame;
  const out: number[] = new Array(source.length);
  for (let i = 0; i < source.length; i += 1) {
    const sample = source[i];
    out[i] = Math.max(-1, Math.min(1, Number.isFinite(sample) ? sample : 0));
  }
  return out;
}

export function quantizeWaveform(
  waveform: number[] | null,
  levels = 32,
): number[] | null {
  if (!waveform || waveform.length === 0) {
    return null;
  }

  const safeLevels = Math.max(4, levels);
  const step = 2 / (safeLevels - 1);
  return waveform.map((value) => {
    const bounded = Math.max(-1, Math.min(1, value));
    const normalized = (bounded + 1) / step;
    const bucket = Math.round(normalized);
    const quantized = (bucket * step) - 1;
    return Math.max(-1, Math.min(1, Number(quantized.toFixed(4))));
  });
}

export function quantizeTimestampBucket(
  timestampSeconds: number,
  bucketSizeSeconds = 5,
): number {
  const safeBucket = Math.max(1, Math.floor(bucketSizeSeconds));
  const safeTs = Math.max(0, Math.floor(timestampSeconds));
  return Math.floor(safeTs / safeBucket) * safeBucket;
}
