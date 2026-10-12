/**
 * Pothole Detection & Real-Time Computer Vision Inference Utility
 * 
 * Manages streaming frame capture, bounding box normalization, 
 * audio chime synthesis with singleton Web Audio Context, 
 * and debounced speech alerts.
 */

// Singleton Web Audio Context to prevent exceeding browser AudioContext limits
let sharedAudioCtx = null;
const getAudioContext = () => {
  try {
    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        sharedAudioCtx = new AudioCtx();
      }
    }
    if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {});
    }
  } catch (e) {
    console.warn('[AudioContext] Init warning:', e);
  }
  return sharedAudioCtx;
};

/**
 * Play a zero-touch driving notification chime using Web Audio API oscillator.
 * Reuses the singleton AudioContext to prevent audio thread memory exhaustion.
 */
export const playDetectionChime = (type = 'detected') => {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    if (type === 'verified') {
      // Affirmative two-tone chime (F5 -> A5)
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(698.46, ctx.currentTime);
      osc.frequency.setValueAtTime(880.00, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.20, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } else {
      // Potential defect chime (D5)
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880.0, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    }
  } catch (e) {
    console.warn('[PotholeDetector] Audio chime notice:', e);
  }
};

// Debounced Speech Synthesis manager to prevent UI renderer stutter
let lastSpeechTime = 0;
let lastSpeechText = '';

export const speakDetectionAlert = (text) => {
  try {
    if (!('speechSynthesis' in window)) return;
    const now = Date.now();
    // Prevent duplicate speech within 6 seconds or new speech within 3 seconds
    if (text === lastSpeechText && now - lastSpeechTime < 6000) return;
    if (now - lastSpeechTime < 3000) return;

    lastSpeechTime = now;
    lastSpeechText = text;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.05;
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
  } catch (e) {
    console.warn('[PotholeDetector] Speech notice:', e);
  }
};

/**
 * Capture a JPEG frame from an active HTMLVideoElement using an offscreen canvas.
 * Preserves native aspect ratio and scales down to maxDim to minimize network payload.
 */
export const captureFrameFromVideo = (video, canvas, maxDim = 640) => {
  if (!video || !canvas) return null;
  if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0 || video.paused) {
    return null;
  }

  const vw = video.videoWidth;
  const vh = video.videoHeight;

  let targetW = vw;
  let targetH = vh;
  if (vw >= vh && vw > maxDim) {
    targetW = maxDim;
    targetH = Math.round((maxDim * vh) / vw);
  } else if (vh > vw && vh > maxDim) {
    targetH = maxDim;
    targetW = Math.round((maxDim * vw) / vh);
  }

  if (targetW % 2 !== 0) targetW += 1;
  if (targetH % 2 !== 0) targetH += 1;

  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, targetW, targetH);

  return canvas.toDataURL('image/jpeg', 0.82);
};

/**
 * Normalize and format raw bounding boxes from the YOLO detector 
 * into solid red overlay bounding box descriptors with percentage confidence scores.
 * Accurately places confidence score badge adjacent to or inside the box.
 */
export const formatPotholeBoundingBoxes = (detections = []) => {
  if (!Array.isArray(detections)) return [];

  return detections.map((det, index) => {
    const nb = det.normalized_bbox || (det.bbox ? [
      det.bbox[0] / 640,
      det.bbox[1] / 360,
      det.bbox[2] / 640,
      det.bbox[3] / 360
    ] : [0.2, 0.25, 0.6, 0.65]);

    const leftPct = Math.max(0, Math.min(95, nb[0] * 100));
    const topPct = Math.max(0, Math.min(95, nb[1] * 100));
    const widthPct = Math.max(3, Math.min(100 - leftPct, (nb[2] - nb[0]) * 100));
    const heightPct = Math.max(3, Math.min(100 - topPct, (nb[3] - nb[1]) * 100));
    const confidencePct = Math.round((det.confidence || 0.85) * 100);

    // Place label inside top edge if bounding box is near top of video to avoid clipping
    const isAdjacentAbove = topPct >= 7.0;

    return {
      id: `pothole-bbox-${Date.now()}-${index}`,
      className: det.class_name || 'Pothole',
      confidence: det.confidence || 0.85,
      confidencePct,
      style: {
        left: `${leftPct.toFixed(2)}%`,
        top: `${topPct.toFixed(2)}%`,
        width: `${widthPct.toFixed(2)}%`,
        height: `${heightPct.toFixed(2)}%`
      },
      labelInside: !isAdjacentAbove,
      severity: (det.severity || 'HIGH').toUpperCase()
    };
  });
};

/**
 * List of bundled real road pothole sample images for simulation & offline demonstration
 */
export const SAMPLE_POTHOLE_IMAGES = [
  '/sample_potholes/pothole_1.jpg',
  '/sample_potholes/pothole_2.jpg',
  '/sample_potholes/pothole_3.jpg',
  '/sample_potholes/pothole_4.jpg',
  '/sample_potholes/pothole_5.jpg',
  '/sample_potholes/pothole_6.jpg',
  '/sample_potholes/pothole_7.jpg',
  '/sample_potholes/pothole_8.jpg',
];
