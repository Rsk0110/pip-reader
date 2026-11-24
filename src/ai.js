// On-device AI: MediaPipe hand landmarks + Tesseract OCR. Both load their
// models from this site's own /vendor folder; nothing leaves the device.

const here = (p) => new URL(p, import.meta.url).href;

let handLandmarker = null;
let handLoading = null;

export const loadHands = () =>
  (handLoading ??= (async () => {
    const { FilesetResolver, HandLandmarker } = await import('../vendor/mediapipe/vision_bundle.mjs');
    const fileset = await FilesetResolver.forVisionTasks(here('../vendor/mediapipe/wasm'));
    const opts = (delegate) => ({
      baseOptions: { modelAssetPath: here('../vendor/models/hand_landmarker.task'), delegate },
      runningMode: 'VIDEO',
      numHands: 1,
      minHandDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    try {
      handLandmarker = await HandLandmarker.createFromOptions(fileset, opts('GPU'));
    } catch {
      handLandmarker = await HandLandmarker.createFromOptions(fileset, opts('CPU'));
    }
    return handLandmarker;
  })());

/** Index fingertip in pixel coords of the video, or null. */
export const fingertip = (video, nowMs) => {
  if (!handLandmarker || !video.videoWidth) return null;
  const res = handLandmarker.detectForVideo(video, nowMs);
  const hand = res.landmarks?.[0];
  if (!hand) return null;
  const tip = hand[8];
  const knuckle = hand[6];
  return {
    x: tip.x * video.videoWidth,
    y: tip.y * video.videoHeight,
    // pointing up-ish? (tip above the middle knuckle) — avoids reading when the hand is just resting
    pointing: tip.y < knuckle.y + 0.02,
  };
};

let worker = null;
let workerLoading = null;

export const loadOcr = (onProgress) =>
  (workerLoading ??= (async () => {
    const Tesseract = (await import('../vendor/tesseract/tesseract.esm.min.js')).default;
    worker = await Tesseract.createWorker('eng', 1, {
      workerPath: here('../vendor/tesseract/worker.min.js'),
      corePath: here('../vendor/tesseract/core'),
      langPath: here('../vendor/tesseract/lang'),
      gzip: true,
      workerBlobURL: false,
      logger: (m) => onProgress?.(m),
    });
    await worker.setParameters({ tessedit_pageseg_mode: '6' }); // a uniform block of text
    return worker;
  })());

/**
 * Read the words in `region` of `source` (video or canvas). Upscales the crop
 * for better accuracy and returns word boxes in source coordinates.
 */
export const readRegion = async (source, region, scale = 2) => {
  await loadOcr();
  const c = document.createElement('canvas');
  c.width = Math.round(region.w * scale);
  c.height = Math.round(region.h * scale);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.filter = 'grayscale(1) contrast(1.35)';
  ctx.drawImage(source, region.x, region.y, region.w, region.h, 0, 0, c.width, c.height);
  const { data } = await worker.recognize(c, {}, { blocks: true });
  const words = [];
  for (const b of data.blocks ?? [])
    for (const p of b.paragraphs ?? [])
      for (const l of p.lines ?? [])
        for (const w of l.words ?? [])
          words.push({
            text: w.text,
            confidence: w.confidence,
            bbox: {
              x0: region.x + w.bbox.x0 / scale,
              y0: region.y + w.bbox.y0 / scale,
              x1: region.x + w.bbox.x1 / scale,
              y1: region.y + w.bbox.y1 / scale,
            },
          });
  return words;
};
