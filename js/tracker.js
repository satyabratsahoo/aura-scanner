/**
 * Aura Scanner - Face Tracker Module
 * Integrates MediaPipe Face Mesh and manages facial coordinates and regions of interest (ROI)
 */

export class FaceTracker {
  constructor(videoElement, onFaceDataCallback) {
    this.video = videoElement;
    this.onFaceData = onFaceDataCallback;
    this.faceMesh = null;
    this.isTracking = false;
    this.fps = 0;
    this.lastFrameTime = performance.now();
    this.frameCounter = 0;
    this.fpsTimer = setInterval(() => {
      this.fps = this.frameCounter;
      this.frameCounter = 0;
      const fpsEl = document.getElementById('gpu-fps');
      if (fpsEl) fpsEl.textContent = this.fps;
    }, 1000);

    // Create offscreen downscale canvas to optimize MediaPipe FaceMesh performance (~70% workload reduction)
    this.downscaleCanvas = document.createElement('canvas');
    this.downscaleCanvas.width = 320;
    this.downscaleCanvas.height = 240;
    this.downscaleCtx = this.downscaleCanvas.getContext('2d');
  }

  async initialize() {
    return new Promise((resolve, reject) => {
      try {
        if (typeof FaceMesh === 'undefined') {
          throw new Error('MediaPipe FaceMesh library not loaded. Ensure CDN links are active.');
        }

        this.faceMesh = new FaceMesh({
          locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
        });

        this.faceMesh.setOptions({
          maxNumFaces: 1,
          refineLandmarks: true,
          minDetectionConfidence: 0.6,
          minTrackingConfidence: 0.6
        });

        this.faceMesh.onResults((results) => {
          this.frameCounter++;
          this.handleTrackingResults(results);
        });

        // Set up the camera stream using MediaPipe Camera Utils
        const camera = new Camera(this.video, {
          onFrame: async () => {
            if (this.isTracking) {
              // Speed up FaceMesh by drawing to downscale canvas first
              this.downscaleCtx.drawImage(this.video, 0, 0, 320, 240);
              await this.faceMesh.send({ image: this.downscaleCanvas });
            }
          },
          width: 640,
          height: 480
        });

        this.camera = camera;
        resolve();
      } catch (error) {
        console.error('Tracker initialization failed:', error);
        reject(error);
      }
    });
  }

  start() {
    this.isTracking = true;
    this.camera.start();
  }

  stop() {
    this.isTracking = false;
    this.camera.stop();
  }

  handleTrackingResults(results) {
    if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
      this.onFaceData({
        detected: false,
        landmarks: null,
        rois: null,
        tension: 0
      });
      return;
    }

    const landmarks = results.multiFaceLandmarks[0];
    const width = this.video.videoWidth || 640;
    const height = this.video.videoHeight || 480;

    // Calculate specific regions of interest (ROIs) for rPPG
    // Landmarks layout:
    // Forehead: 10 (top), 9 (bottom center), 109 (left), 338 (right)
    // Left Cheek: 117 (center), 118, 123
    // Right Cheek: 346 (center), 347, 352
    const rois = this.extractROIs(landmarks, width, height);
    
    // Calculate facial expression indicators for tension/stress
    const tension = this.calculateFacialTension(landmarks);

    this.onFaceData({
      detected: true,
      landmarks: landmarks, // Raw normalized coordinates [0, 1]
      rois: rois,           // Pixel coordinates and bounding boxes
      tension: tension,     // Relative percentage 0-100
      width: width,
      height: height
    });
  }

  extractROIs(landmarks, width, height) {
    // Helper to scale normalized coordinates to pixel coordinates
    const getPixelPt = (index) => {
      const pt = landmarks[index];
      return { x: pt.x * width, y: pt.y * height };
    };

    // Forehead ROI bounds
    // Top-Center: 10, Bottom-Center: 9, Left: 109, Right: 338
    const pt10 = getPixelPt(10);
    const pt9 = getPixelPt(9);
    const pt109 = getPixelPt(109);
    const pt338 = getPixelPt(338);

    // Left Cheek ROI bounds
    // Center is around 118 / 117
    const ptLeftCheek = getPixelPt(117);
    
    // Right Cheek ROI bounds
    // Center is around 346 / 347
    const ptRightCheek = getPixelPt(346);

    // Let's create sub-rectangles for sampling
    // Forehead width: 50% of the distance between outer points
    const fhWidth = Math.hypot(pt338.x - pt109.x, pt338.y - pt109.y) * 0.5;
    const fhHeight = Math.hypot(pt10.x - pt9.x, pt10.y - pt9.y) * 0.4;
    const fhCenter = {
      x: (pt9.x + pt10.x) / 2,
      y: (pt9.y + pt10.y) / 2 - fhHeight * 0.2 // slightly adjust up
    };

    // Cheek size relative to face width
    const cheekSize = fhWidth * 0.4;

    return {
      forehead: {
        x: fhCenter.x - fhWidth / 2,
        y: fhCenter.y - fhHeight / 2,
        width: fhWidth,
        height: fhHeight
      },
      leftCheek: {
        x: ptLeftCheek.x - cheekSize / 2,
        y: ptLeftCheek.y - cheekSize / 2,
        width: cheekSize,
        height: cheekSize
      },
      rightCheek: {
        x: ptRightCheek.x - cheekSize / 2,
        y: ptRightCheek.y - cheekSize / 2,
        width: cheekSize,
        height: cheekSize
      }
    };
  }

  calculateFacialTension(landmarks) {
    // Measure eye squinting and mouth tight tension
    // Left Eye: 33 (corner), 133 (corner), 159 (top), 145 (bottom)
    const leftEyeHeight = Math.abs(landmarks[159].y - landmarks[145].y);
    const leftEyeWidth = Math.abs(landmarks[33].x - landmarks[133].x);
    const leftEyeRatio = leftEyeHeight / (leftEyeWidth || 1);

    // Mouth: 13 (top lip), 14 (bottom lip), 78 (left corner), 308 (right corner)
    const mouthHeight = Math.abs(landmarks[13].y - landmarks[14].y);
    const mouthWidth = Math.abs(landmarks[78].x - landmarks[308].x);
    const mouthRatio = mouthHeight / (mouthWidth || 1);

    // Eyebrows tension: distance between eyebrows (21, 251) relative to face size
    const eyebrowDist = Math.abs(landmarks[21].x - landmarks[251].x);
    const faceWidth = Math.abs(landmarks[234].x - landmarks[454].x);
    const browRatio = eyebrowDist / (faceWidth || 1);

    // Map ratios to tension percentage:
    // Low eye ratio (squinting) -> higher tension
    // Brow compression (low brow ratio) -> higher tension
    // Normal ratios: LeftEyeRatio ~0.25-0.3, BrowRatio ~0.35
    const squintTension = Math.max(0, Math.min(100, (0.3 - leftEyeRatio) * 400));
    const browTension = Math.max(0, Math.min(100, (0.35 - browRatio) * 350));
    
    // Combine them
    const tension = (squintTension * 0.5 + browTension * 0.5);
    return Math.round(Math.max(5, Math.min(95, tension)));
  }

  destroy() {
    clearInterval(this.fpsTimer);
    this.stop();
  }
}
