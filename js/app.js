/**
 * Aura Scanner - Application Main Coordinator
 * Integrates FaceMesh tracking, rPPG filtering, WebGL shaders, and UI updates
 */

import { FaceTracker } from './tracker.js';
import { RppgEngine } from './rppg.js';
import { ShaderRenderer } from './shader.js';
import { UiController } from './ui.js';

class AuraScannerApp {
  constructor() {
    this.video = document.getElementById('webcam');
    this.arCanvas = document.getElementById('ar-canvas');
    this.startBtn = document.getElementById('start-btn');
    this.calibrationOverlay = document.getElementById('calibration-overlay');
    this.progressContainer = document.getElementById('progress-container');
    this.progressBar = document.getElementById('progress-bar');
    this.calibrationStatus = document.getElementById('calibration-status');
    this.instructionText = document.getElementById('instruction-text');
    this.statusDot = document.querySelector('.instructions-bar .status-dot');
    this.systemStatusDot = document.getElementById('system-status-dot');
    this.systemStatusText = document.getElementById('system-status-text');
    this.exportReportBtn = document.getElementById('export-report-btn');

    // Modules
    this.tracker = null;
    this.rppg = null;
    this.renderer = null;
    this.ui = null;

    // State machine flags
    this.isCalibrated = false;
    this.isCalibrating = false;
    this.calibrationProgress = 0;
    this.calibrationTimer = null;
    this.faceDataBuffer = [];
    this.activeMode = 'aura'; // 'aura' or 'clinical'

    // Bind event listeners
    this.startBtn.addEventListener('click', this.initializeApplication.bind(this));
    this.exportReportBtn.addEventListener('click', () => this.ui.showReport());
    
    document.getElementById('close-modal-btn').addEventListener('click', () => this.ui.closeReport());
    document.getElementById('reset-scanner-btn').addEventListener('click', () => this.resetCalibration());
    document.getElementById('print-report-btn').addEventListener('click', () => window.print());

    // Setup mode buttons for shaders
    const modeButtons = document.querySelectorAll('.hud-modes .hud-btn');
    modeButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        modeButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (this.renderer) {
          this.renderer.setMode(btn.dataset.mode);
        }
      });
    });

    // Setup Interface Mode Toggle (Bio-Spectral vs Clinical)
    const btnSpectral = document.getElementById('btn-mode-spectral');
    const btnClinical = document.getElementById('btn-mode-clinical');
    
    if (btnSpectral && btnClinical) {
      btnSpectral.addEventListener('click', () => this.switchInterfaceMode('aura'));
      btnClinical.addEventListener('click', () => this.switchInterfaceMode('clinical'));
    }
  }

  async initializeApplication() {
    this.startBtn.style.display = 'none';
    this.progressContainer.style.display = 'block';
    this.progressBar.style.width = '0%';
    this.calibrationStatus.style.display = 'block';
    
    this.updateCalibrationStatus('REQUESTING CAMERA ACCESS...', 5);

    try {
      // 1. Request camera stream (60 FPS ideal)
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 60, min: 30 },
          facingMode: 'user'
        },
        audio: false
      });
      
      this.video.srcObject = stream;
      this.video.play();
      
      // Wait for metadata to load to get accurate resolution
      await new Promise((resolve) => {
        this.video.onloadedmetadata = () => resolve();
      });

      this.updateCalibrationStatus('COMPILING GPU SHADERS...', 15);

      // 2. Initialize UI, Shader Renderer, and rPPG Engine
      this.ui = new UiController();
      this.ui.initAudio(); // Enable Web Audio synthesizers
      this.ui.setInterfaceMode(this.activeMode); // Ensure correct starting mode
      
      this.renderer = new ShaderRenderer(this.arCanvas);
      this.renderer.initialize();
      this.renderer.start();
      
      if (this.activeMode === 'clinical') {
        this.renderer.setMode('clinical');
        const hudModes = document.querySelector('.hud-modes');
        if (hudModes) hudModes.style.display = 'none';
      } else {
        const activeShaderBtn = document.querySelector('.hud-modes .hud-btn.active');
        this.renderer.setMode(activeShaderBtn ? activeShaderBtn.dataset.mode : 'spirit');
      }

      this.rppg = new RppgEngine();

      this.updateCalibrationStatus('STARTING COMPUTER VISION MODULES...', 30);

      // Wait a frame to ensure MediaPipe is fully ready in global scope
      await this.ensureMediaPipeLoaded();

      // 3. Initialize Face Tracker
      this.tracker = new FaceTracker(this.video, this.handleFaceUpdate.bind(this));
      await this.tracker.initialize();
      this.tracker.start();

      this.isCalibrating = true;
      this.updateCalibrationStatus(
        this.activeMode === 'clinical' 
          ? 'ALIGNING OPTICAL RETICLE (REMAIN STILL)...' 
          : 'ALIGNING LANDMARKS (LOOK STRETCHED)...', 
        40
      );

    } catch (error) {
      console.error('Core initialization failed:', error);
      this.updateCalibrationStatus(`INITIALIZATION ERROR: ${error.message || 'Check camera connection'}`, 0);
      this.startBtn.style.display = 'block';
      this.progressContainer.style.display = 'none';
    }
  }

  async ensureMediaPipeLoaded() {
    return new Promise((resolve) => {
      const check = () => {
        if (typeof FaceMesh !== 'undefined' && typeof Camera !== 'undefined') {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }

  updateCalibrationStatus(text, progressPercent) {
    this.calibrationStatus.textContent = text;
    this.progressBar.style.width = `${progressPercent}%`;
  }

  /**
   * Main entry point for facial coordinates update
   * Called ~30 times per second by FaceTracker
   */
  switchInterfaceMode(mode) {
    if (this.activeMode === mode) return;
    this.activeMode = mode;
    
    const btnSpectral = document.getElementById('btn-mode-spectral');
    const btnClinical = document.getElementById('btn-mode-clinical');
    
    if (mode === 'clinical') {
      if (btnClinical) btnClinical.classList.add('active');
      if (btnSpectral) btnSpectral.classList.remove('active');
      
      // Hide spiritual shader settings in HUD
      const hudModes = document.querySelector('.hud-modes');
      if (hudModes) hudModes.style.display = 'none';
      
      if (this.renderer) this.renderer.setMode('clinical');
      if (this.ui) this.ui.setInterfaceMode('clinical');
      
      if (this.isCalibrating) {
        this.calibrationStatus.textContent = 'CALIBRATING PP SENSORS...';
      }
    } else {
      if (btnSpectral) btnSpectral.classList.add('active');
      if (btnClinical) btnClinical.classList.remove('active');
      
      const hudModes = document.querySelector('.hud-modes');
      if (hudModes) hudModes.style.display = 'flex';
      
      const activeShaderBtn = document.querySelector('.hud-modes .hud-btn.active');
      if (this.renderer && activeShaderBtn) {
        this.renderer.setMode(activeShaderBtn.dataset.mode);
      } else if (this.renderer) {
        this.renderer.setMode('spirit');
      }
      
      if (this.ui) this.ui.setInterfaceMode('aura');
      
      if (this.isCalibrating) {
        this.calibrationStatus.textContent = 'MAPPING CHAKRA FREQUENCIES...';
      }
    }
  }

  handleFaceUpdate(faceData) {
    // 1. Update shaders with latest facial contour geometry
    if (this.renderer) {
      this.renderer.updateFace(faceData);
    }

    if (!faceData.detected) {
      this.handleFaceLost();
      return;
    }

    // Update HUD indicator
    this.instructionText.textContent = 'SYSTEM ALIGNED // REMAIN STILL';
    this.instructionText.style.color = '#fff';
    this.statusDot.className = 'status-dot';
    this.statusDot.style.backgroundColor = 'var(--color-green)';
    this.statusDot.style.boxShadow = '0 0 8px var(--color-green)';

    // 2. Pass frame to rPPG engine for signal extraction
    const biometrics = this.rppg.processFrame(this.video, faceData.rois);

    if (biometrics) {
      // Plot the live wave
      this.ui.pushSignal(biometrics.filteredValue);
      
      // Update UI numbers & dials
      this.ui.updateDashboard(biometrics, faceData.tension);

      // Feed biometrics back into the shaders
      const stressIndex = this.ui.getStressIndex();
      this.renderer.updateBiometrics(
        biometrics.bpm, 
        biometrics.hrv, 
        stressIndex, 
        faceData.tension
      );
      
      const ppgStatusEl = document.getElementById('rppg-signal-status');
      if (ppgStatusEl) {
        if (biometrics.snr > 15) {
          ppgStatusEl.textContent = this.activeMode === 'clinical' ? 'SIGNAL COHERENT' : 'HIGH COHERENCE';
          ppgStatusEl.style.color = 'var(--color-green)';
        } else if (biometrics.snr > 8) {
          ppgStatusEl.textContent = this.activeMode === 'clinical' ? 'MODERATE/STABLE' : 'MODERATE';
          ppgStatusEl.style.color = 'var(--color-yellow)';
        } else {
          ppgStatusEl.textContent = this.activeMode === 'clinical' ? 'REPOSITIONING' : 'NOISY (STILL)';
          ppgStatusEl.style.color = 'var(--color-red)';
        }
      }
    }

    // 3. Handle Calibration progress logic
    if (this.isCalibrating) {
      this.runCalibrationStep(biometrics);
    }
  }

  handleFaceLost() {
    this.instructionText.textContent = 'ALIGN FACE INSIDE THE RETICLE';
    this.instructionText.style.color = 'var(--color-red)';
    this.statusDot.className = 'status-dot processing';
    this.statusDot.style.backgroundColor = 'var(--color-red)';
    this.statusDot.style.boxShadow = '0 0 8px var(--color-red)';

    const ppgStatusEl = document.getElementById('rppg-signal-status');
    if (ppgStatusEl) {
      ppgStatusEl.textContent = 'LOST FOCUS';
      ppgStatusEl.style.color = 'var(--color-red)';
    }

    if (this.isCalibrating) {
      this.updateCalibrationStatus('FACE LOST - PLEASE CENTER YOUR FACE', this.calibrationProgress);
    }
  }

  runCalibrationStep(biometrics) {
    // Advance calibration progress only when biometric data is successfully streaming
    if (!biometrics || biometrics.bpm === 0) {
      const calibratingMsg = this.activeMode === 'clinical' 
        ? 'CALIBRATING PHOTO-PPG SENSOR...' 
        : 'SYNCHRONIZING PULSE SIGNAL...';
      this.updateCalibrationStatus(calibratingMsg, Math.max(45, this.calibrationProgress));
      return;
    }

    // Step-by-step progress update
    if (this.calibrationProgress < 100) {
      // Calibration advances about 1% per frame, ~3 seconds
      this.calibrationProgress += 0.6;
      
      let statusStr = '';
      if (this.activeMode === 'clinical') {
        if (this.calibrationProgress < 30) {
          statusStr = 'LOCKING FACIAL REGIONS OF INTEREST...';
        } else if (this.calibrationProgress < 60) {
          statusStr = 'DECODING SPECTRAL HEMOGLOBIN SIGNAL...';
        } else if (this.calibrationProgress < 85) {
          statusStr = 'COMPUTING AUTONOMIC RESPONSE METRICS...';
        } else {
          statusStr = 'FINALIZING HEMODYNAMIC LOG...';
        }
      } else {
        statusStr = 'SYNCHRONIZING COHERENCE...';
        if (this.calibrationProgress < 60) {
          statusStr = 'DECODING SPECTRAL HEMOGLOBIN...';
        } else if (this.calibrationProgress < 85) {
          statusStr = 'MAPPING CHAKRA FREQUENCIES...';
        } else if (this.calibrationProgress < 98) {
          statusStr = 'COMPILING AURIC PROFILE...';
        }
      }

      this.updateCalibrationStatus(statusStr, Math.floor(this.calibrationProgress));
    } else {
      // Calibration complete!
      this.isCalibrating = false;
      this.isCalibrated = true;
      this.finishCalibration();
    }
  }

  finishCalibration() {
    // Fade out overlay
    this.calibrationOverlay.style.opacity = 0;
    setTimeout(() => {
      this.calibrationOverlay.style.display = 'none';
    }, 500);

    // Update main HUD statuses
    this.systemStatusDot.className = 'status-dot';
    this.systemStatusDot.style.backgroundColor = 'var(--color-green)';
    this.systemStatusDot.style.boxShadow = '0 0 8px var(--color-green)';
    
    this.systemStatusText.textContent = this.activeMode === 'clinical' 
      ? 'CLINICAL TELEMETRY ACTIVE' 
      : 'SPECTRAL ANALYSIS ACTIVE';
    
    // Reveal export report button
    this.exportReportBtn.style.display = 'flex';
  }

  resetCalibration() {
    if (this.ui) {
      this.ui.closeReport();
      this.ui.initAudio();
    }
    
    // Reset Rppg
    if (this.rppg) this.rppg.reset();
    
    this.isCalibrated = false;
    this.isCalibrating = true;
    this.calibrationProgress = 0;
    
    // Show calibration overlay again
    this.calibrationOverlay.style.display = 'flex';
    setTimeout(() => {
      this.calibrationOverlay.style.opacity = 1;
    }, 50);

    this.progressContainer.style.display = 'block';
    this.progressBar.style.width = '0%';
    this.startBtn.style.display = 'none';
    this.exportReportBtn.style.display = 'none';
    const resetMsg = this.activeMode === 'clinical' 
      ? 'RE-CALIBRATING BIOMETRIC SENSORS...' 
      : 'RE-INITIALIZING BIOMETRIC FILTERS...';
    this.updateCalibrationStatus(resetMsg, 10);
  }
}

// Instantiate and start app
window.addEventListener('DOMContentLoaded', () => {
  window.appInstance = new AuraScannerApp();
});
