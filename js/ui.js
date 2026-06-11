/**
 * Aura Scanner - UI & Telemetry Dashboard Module
 * Handles plotting the real-time PPG waveform, updates SVG dials,
 * chakra levels, aura descriptions, and report exports.
 */

export class UiController {
  constructor() {
    // Canvas for PPG Wave
    this.ppgCanvas = document.getElementById('ppg-canvas');
    this.ppgCtx = this.ppgCanvas.getContext('2d');
    this.waveHistory = [];
    this.maxWavePoints = 180;

    // UI elements
    this.bpmRing = document.getElementById('bpm-ring');
    this.hrvRing = document.getElementById('hrv-ring');
    this.bpmVal = document.getElementById('bpm-val');
    this.hrvVal = document.getElementById('hrv-val');
    
    this.vibFreq = document.getElementById('vib-freq');
    this.respRate = document.getElementById('resp-rate');
    this.signalSnr = document.getElementById('signal-snr');
    this.faceTension = document.getElementById('face-tension');

    this.auraBadge = document.getElementById('aura-badge');
    this.auraDesc = document.getElementById('aura-desc');

    // Clinical elements
    this.bpmLabel = document.getElementById('bpm-label');
    this.hrvLabel = document.getElementById('hrv-label');
    
    this.spo2Ring = document.getElementById('spo2-ring');
    this.spo2Val = document.getElementById('spo2-val');
    
    this.detailLabels = [
      document.getElementById('detail-lbl-1'),
      document.getElementById('detail-lbl-2'),
      document.getElementById('detail-lbl-3'),
      document.getElementById('detail-lbl-4')
    ];
    
    this.clinicalBadge = document.getElementById('clinical-badge');
    this.clinicalDesc = document.getElementById('clinical-desc');
    
    this.ansBarSym = document.getElementById('ans-bar-sym');
    this.ansBarPara = document.getElementById('ans-bar-para');
    this.ansValSym = document.getElementById('ans-val-sym');
    this.ansValPara = document.getElementById('ans-val-para');
    
    this.clinicalSdnn = document.getElementById('clinical-sdnn');
    this.clinicalLfhf = document.getElementById('clinical-lfhf');

    this.mode = 'aura'; // Default interface mode

    // Web Audio Synthesizer states
    this.audioCtx = null;
    this.carrierOsc = null;
    this.binauralOsc = null;
    this.carrierGain = null;

    // Aura modes data mapping
    this.auraStates = {
      violet: {
        name: 'Crown Violet',
        color: '#af52de',
        badgeClass: 'chakra-violet',
        desc: 'Crown / Spiritual Integration: Highly coherent energy field indicating deep inner peace, mental expansion, and alignment of the higher self. Your autonomic system is operating in complete parasympathetic harmony.'
      },
      indigo: {
        name: 'Third-Eye Indigo',
        color: '#5856d6',
        badgeClass: 'chakra-indigo',
        desc: 'Third-Eye / Intuitive Awareness: Balanced cognitive energy, deep contemplation, and intuitive insight. Characterized by high neural synchronization and relaxed somatic state.'
      },
      blue: {
        name: 'Throat Blue',
        color: '#5ac8fa',
        badgeClass: 'chakra-blue',
        desc: 'Throat / Expressive Clarity: Calm, reflective, and communicatively receptive state. Your heart rate variability indicates a strong rest-and-digest response with low muscle tension.'
      },
      green: {
        name: 'Heart Green',
        color: '#34c759',
        badgeClass: 'chakra-green',
        desc: 'Heart / Harmonic Vitality: Balanced emotional presence, empathy, and social connection. The body is in a healthy, adaptive state, ready to respond to environmental shifts.'
      },
      yellow: {
        name: 'Solar Plexus Yellow',
        color: '#ffcc00',
        badgeClass: 'chakra-yellow',
        desc: 'Solar Plexus / Mental Focus: Highly analytical, focused, and intellectually active state. Elevated alertness with moderate sympathetic activation.'
      },
      orange: {
        name: 'Sacral Orange',
        color: '#ff9500',
        badgeClass: 'chakra-orange',
        desc: 'Sacral / Creative Flow: Passionate, sensory, and creatively stimulated energy field. Characterized by dynamic biometric fluctuations and high emotional engagement.'
      },
      red: {
        name: 'Root Red',
        color: '#ff3b30',
        badgeClass: 'chakra-red',
        desc: 'Root / Primal Strength: High sympathetic arousal, acute stress response, or deep physical exertion. The energy field is spiky, defensive, and highly focused on structural security.'
      }
    };

    // Current state
    this.currentAura = this.auraStates.blue;

    this.resizeCanvas();
    window.addEventListener('resize', this.resizeCanvas.bind(this));
    
    // Listen for heartbeat animations
    document.addEventListener('heartbeat', this.onHeartbeat.bind(this));
  }

  setInterfaceMode(mode) {
    this.mode = mode;
    if (mode === 'clinical') {
      document.body.classList.add('clinical-mode');
      
      // Update label texts
      if (this.bpmLabel) this.bpmLabel.textContent = 'HEART RATE';
      if (this.hrvLabel) this.hrvLabel.textContent = 'HRV (RMSSD)';
      
      if (this.detailLabels[0]) this.detailLabels[0].textContent = 'Blood Pressure';
      if (this.detailLabels[1]) this.detailLabels[1].textContent = 'Respiration';
      if (this.detailLabels[2]) this.detailLabels[2].textContent = 'Perfusion Index';
      if (this.detailLabels[3]) this.detailLabels[3].textContent = 'Cardiac Rhythm';
      
    } else {
      document.body.classList.remove('clinical-mode');
      
      // Reset label texts
      if (this.bpmLabel) this.bpmLabel.textContent = 'Heart Rate';
      if (this.hrvLabel) this.hrvLabel.textContent = 'HRV (Stress)';
      
      if (this.detailLabels[0]) this.detailLabels[0].textContent = 'Vibrational Freq';
      if (this.detailLabels[1]) this.detailLabels[1].textContent = 'Respiration Rate';
      if (this.detailLabels[2]) this.detailLabels[2].textContent = 'Signal SNR';
      if (this.detailLabels[3]) this.detailLabels[3].textContent = 'Facial Tension';
    }
    this.resizeCanvas();
  }

  resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.ppgCanvas.getBoundingClientRect();
    this.ppgCanvas.width = rect.width * dpr;
    this.ppgCanvas.height = rect.height * dpr;
    this.ppgCtx.scale(dpr, dpr);
  }

  /**
   * Initializes or resumes the Web Audio API context and setup carrier hum
   */
  initAudio() {
    try {
      if (this.audioCtx) {
        if (this.audioCtx.state === 'suspended') {
          this.audioCtx.resume();
        }
        return;
      }

      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      
      // Create binaural carrier oscillators (136.1Hz "Om" carrier frequency + 6Hz Theta offset)
      const baseFreq = 136.1;
      const thetaBeat = 6.0;

      this.carrierOsc = this.audioCtx.createOscillator();
      this.carrierOsc.type = 'sine';
      this.carrierOsc.frequency.setValueAtTime(baseFreq, this.audioCtx.currentTime);

      this.binauralOsc = this.audioCtx.createOscillator();
      this.binauralOsc.type = 'sine';
      this.binauralOsc.frequency.setValueAtTime(baseFreq + thetaBeat, this.audioCtx.currentTime);

      // Connect through a master gain node (keep volume low & atmospheric)
      this.carrierGain = this.audioCtx.createGain();
      this.carrierGain.gain.setValueAtTime(0.015, this.audioCtx.currentTime);

      this.carrierOsc.connect(this.carrierGain);
      this.binauralOsc.connect(this.carrierGain);
      this.carrierGain.connect(this.audioCtx.destination);

      this.carrierOsc.start();
      this.binauralOsc.start();

      console.log('Bio-sonification audio engine initialized.');
    } catch (e) {
      console.warn('Web Audio initialization failed:', e);
    }
  }

  /**
   * Dynamically modulates the binaural carrier pitch and volume based on biometrics
   */
  updateAudioCarrier(bpm, hrv, tension) {
    if (!this.audioCtx || this.audioCtx.state === 'suspended' || !this.carrierOsc) return;

    const now = this.audioCtx.currentTime;
    
    if (this.mode === 'clinical') {
      // Stable, clean medical telemetry hum (low frequency and low volume)
      const targetFreq = 100.0;
      this.carrierOsc.frequency.setTargetAtTime(targetFreq, now, 1.0);
      this.binauralOsc.frequency.setTargetAtTime(targetFreq, now, 1.0);
      this.carrierGain.gain.setTargetAtTime(0.004, now, 0.5);
    } else {
      // Smooth frequency adjustments: stress/excitement speeds up hum
      const targetFreq = 136.1 + (bpm > 0 ? (bpm - 72) * 0.4 : 0);
      this.carrierOsc.frequency.setTargetAtTime(targetFreq, now, 0.8);
      this.binauralOsc.frequency.setTargetAtTime(targetFreq + 6.0, now, 0.8);

      // Dynamic volume adjustment: higher coherence (higher HRV, lower tension) boosts volume
      const stressIndex = this.getStressIndex();
      const targetVol = 0.01 + (1.0 - stressIndex) * 0.02; // ranges between 0.01 and 0.03
      this.carrierGain.gain.setTargetAtTime(targetVol, now, 0.4);
    }
  }

  /**
   * Play a clean, resonant chime synced to the heartbeat
   */
  playHeartbeatChime(bpm) {
    if (!this.audioCtx || this.audioCtx.state === 'suspended') return;

    const now = this.audioCtx.currentTime;
    
    if (this.mode === 'clinical') {
      // ---------------- ECG Monitor Blip ----------------
      const osc = this.audioCtx.createOscillator();
      const gainNode = this.audioCtx.createGain();
      const filter = this.audioCtx.createBiquadFilter();

      const freq = 920.0; // medical beep pitch

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      // Sharp medical beep envelope
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(0.06, now + 0.002);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      filter.type = 'bandpass';
      filter.frequency.value = freq;
      filter.Q.value = 2.0;

      osc.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(this.audioCtx.destination);

      osc.start(now);
      osc.stop(now + 0.12);
    } else {
      // ---------------- Resonant Chakra Chime ----------------
      const osc = this.audioCtx.createOscillator();
      const gainNode = this.audioCtx.createGain();
      const filter = this.audioCtx.createBiquadFilter();

      // Map Aura Color to pure chakra frequencies (musical scales)
      let freq = 523.3; // Root: Red (C5)
      if (this.currentAura.color === '#af52de') freq = 987.8; // Crown: Violet (B5)
      else if (this.currentAura.color === '#5856d6') freq = 880.0; // Third-Eye: Indigo (A5)
      else if (this.currentAura.color === '#5ac8fa') freq = 784.0; // Throat: Blue (G5)
      else if (this.currentAura.color === '#34c759') freq = 698.5; // Heart: Green (F5)
      else if (this.currentAura.color === '#ffcc00') freq = 659.3; // Solar: Yellow (E5)
      else if (this.currentAura.color === '#ff9500') freq = 587.3; // Sacral: Orange (D5)

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      // Exponential frequency slide for bell decay resonance
      osc.frequency.exponentialRampToValueAtTime(freq * 0.5, now + 1.2);

      // Chime volume envelope (Rapid attack, exponential decay)
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(0.08, now + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 1.3);

      // Bandpass filter to isolate chime warmth
      filter.type = 'bandpass';
      filter.frequency.value = freq;
      filter.Q.value = 1.2;

      osc.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(this.audioCtx.destination);

      osc.start(now);
      osc.stop(now + 1.4);
    }
  }

  /**
   * Push a raw signal point to the PPG waveform history
   * @param {number} val - filtered signal value
   */
  pushSignal(val) {
    this.waveHistory.push(val);
    if (this.waveHistory.length > this.maxWavePoints) {
      this.waveHistory.shift();
    }
    this.drawPPG();
  }

  drawPPG() {
    const width = this.ppgCanvas.width / (window.devicePixelRatio || 1);
    const height = this.ppgCanvas.height / (window.devicePixelRatio || 1);
    const ctx = this.ppgCtx;

    ctx.clearRect(0, 0, width, height);

    if (this.waveHistory.length < 2) return;

    // Find min/max for auto-scaling
    let max = -Infinity;
    let min = Infinity;
    for (let v of this.waveHistory) {
      if (v > max) max = v;
      if (v < min) min = v;
    }
    let amp = max - min;
    if (amp < 0.01) amp = 1.0;

    // Draw grid lines (subtle cyan lines)
    ctx.strokeStyle = 'rgba(0, 243, 255, 0.03)';
    ctx.lineWidth = 1;
    const gridCols = 8;
    const gridRows = 4;
    for (let i = 0; i <= gridCols; i++) {
      const x = (width / gridCols) * i;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let i = 0; i <= gridRows; i++) {
      const y = (height / gridRows) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Draw the PPG curve
    ctx.beginPath();
    ctx.lineWidth = 2.5;

    // Color gradient based on stress
    const grad = ctx.createLinearGradient(0, 0, width, 0);
    grad.addColorStop(0, this.currentAura.color + '44');
    grad.addColorStop(1, this.currentAura.color);
    ctx.strokeStyle = grad;
    
    // Add glow filter effect
    ctx.shadowBlur = 6;
    ctx.shadowColor = this.currentAura.color;

    const step = width / (this.maxWavePoints - 1);
    const startX = width - (this.waveHistory.length - 1) * step;

    for (let i = 0; i < this.waveHistory.length; i++) {
      const x = startX + i * step;
      // Normalize to canvas height (leave 10px padding top/bottom)
      const normVal = (this.waveHistory[i] - min) / amp;
      const y = height - 10 - normVal * (height - 20);

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.stroke();
    ctx.shadowBlur = 0; // reset shadow glow
  }

  onHeartbeat(e) {
    // Flash the BPM circle glow when a beat is detected
    if (this.bpmRing) {
      this.bpmRing.style.filter = `drop-shadow(0 0 12px ${this.currentAura.color})`;
      setTimeout(() => {
        if (this.bpmRing) {
          this.bpmRing.style.filter = `drop-shadow(0 0 4px ${this.currentAura.color})`;
        }
      }, 150);
    }
    // Synthesize a heartbeat chime
    this.playHeartbeatChime(e.detail.bpm || 72);
  }

  updateDashboard(biometrics, tension) {
    if (!biometrics) return;

    const { bpm, hrv, snr, breathing, spo2, pi, sdnn, bp } = biometrics;

    // Update numbers
    this.bpmVal.textContent = bpm > 0 ? bpm : '--';
    this.hrvVal.textContent = hrv > 0 ? hrv : '--';
    
    if (this.mode === 'clinical') {
      // 1. SpO2 Circle Update
      if (this.spo2Val) {
        this.spo2Val.textContent = spo2 > 0 ? Math.round(spo2) : '--';
      }
      if (this.spo2Ring) {
        if (spo2 > 0) {
          const spo2Percent = Math.max(0, Math.min(100, (spo2 - 80) / 20)); // map 80-100%
          this.spo2Ring.style.strokeDashoffset = 282 - (282 * spo2Percent);
        } else {
          this.spo2Ring.style.strokeDashoffset = 282;
        }
      }

      // 2. Details Grid (BP, Resp Rate, Perfusion Index, Cardiac Rhythm)
      this.vibFreq.textContent = bp || '--/--'; // BP replacing Vib Freq
      this.respRate.textContent = breathing > 0 ? `${breathing} rpm` : '-- rpm';
      this.signalSnr.textContent = pi > 0 ? `${pi}%` : '--%'; // PI replacing SNR
      
      let rhythmText = 'SINUS RHYTHM';
      let rhythmColor = 'var(--color-green)';
      if (bpm > 0) {
        if (sdnn > 40) {
          rhythmText = 'SINUS ARRHYTHMIA';
          rhythmColor = 'var(--color-yellow)';
        } else if (hrv < 25 && bpm > 90) {
          rhythmText = 'TACHYCARDIA TRAIT';
          rhythmColor = 'var(--color-red)';
        }
      } else {
        rhythmText = '--';
      }
      
      this.faceTension.textContent = rhythmText; // Rhythm replacing tension text
      this.faceTension.style.color = rhythmColor;

      // 3. Clinical diagnostics summary panel
      if (this.clinicalBadge) {
        let stateText = 'HEMODYNAMICS ACTIVE';
        let stateBg = 'rgba(0, 243, 255, 0.05)';
        let stateColor = 'var(--primary-accent)';
        if (bpm > 90 || tension > 50) {
          stateText = 'ELEVATED SYSTEM AROUSAL';
          stateBg = 'rgba(255, 51, 102, 0.05)';
          stateColor = 'var(--color-red)';
        } else if (bpm === 0) {
          stateText = 'CALIBRATING SENSORS...';
          stateBg = 'rgba(255, 255, 255, 0.03)';
          stateColor = 'var(--text-muted)';
        }
        
        this.clinicalBadge.textContent = stateText;
        this.clinicalBadge.style.background = stateBg;
        this.clinicalBadge.style.color = stateColor;
        this.clinicalBadge.style.borderColor = stateColor + '44';
        
        this.clinicalDesc.textContent = `Hemodynamic monitoring detects a heart rate of ${bpm || '--'} BPM and Respiration of ${breathing || '--'} rpm. ` +
          `Autonomic indices output an RMSSD of ${hrv || '--'} ms (SDNN: ${sdnn || '--'} ms), indicating a standard physiological baseline with ${rhythmText.toLowerCase()} patterns.`;
      }

      // 4. Update ANS balance bars
      if (this.ansBarSym && this.ansBarPara) {
        const normBpm = Math.max(0, Math.min(1, (bpm - 60) / 50)); 
        const normHrv = 1.0 - Math.max(0, Math.min(1, (hrv - 15) / 85));
        const normTension = tension / 100;
        
        const symPercent = bpm > 0 ? Math.round(15 + (normBpm * 30 + normHrv * 35 + normTension * 20)) : 50;
        const paraPercent = 100 - symPercent;
        
        this.ansBarSym.style.width = `${symPercent}%`;
        this.ansBarPara.style.width = `${paraPercent}%`;
        
        if (this.ansValSym) this.ansValSym.textContent = bpm > 0 ? `${symPercent}%` : '--';
        if (this.ansValPara) this.ansValPara.textContent = bpm > 0 ? `${paraPercent}%` : '--';
      }

      // 5. Update Clinical HRV detail fields
      if (this.clinicalSdnn) this.clinicalSdnn.textContent = sdnn > 0 ? `${sdnn} ms` : '-- ms';
      if (this.clinicalLfhf) {
        const ratio = bpm > 0 ? parseFloat(((100 - hrv) / Math.max(10, hrv) * 1.5).toFixed(2)) : 0;
        this.clinicalLfhf.textContent = ratio > 0 ? ratio : '--';
      }
    } else {
      // Reset color styling on tension text
      this.faceTension.style.color = 'var(--primary-accent)';

      // Update frequency (BPM scale to 432-528 Hz range)
      const frequency = bpm > 0 ? Math.round(432 + ((bpm - 60) * 1.5)) : 0;
      this.vibFreq.textContent = frequency > 0 ? `${frequency} Hz` : '-- Hz';
      this.respRate.textContent = breathing > 0 ? `${breathing} rpm` : '-- rpm';
      this.signalSnr.textContent = snr > 0 ? `${snr} dB` : '-- dB';
      this.faceTension.textContent = `${tension}%`;

      // Determine Aura and Chakra resonance
      this.updateAuraState(bpm, hrv, tension);
    }

    // Radial Progress Bars (stroke-dasharray is 282)
    if (bpm > 0) {
      const bpmPercent = Math.max(0, Math.min(100, (bpm - 45) / 105)); // map 45-150 bpm
      this.bpmRing.style.strokeDashoffset = 282 - (282 * bpmPercent);
    } else {
      this.bpmRing.style.strokeDashoffset = 282;
    }

    if (hrv > 0) {
      const hrvPercent = Math.max(0, Math.min(100, (hrv - 15) / 95)); // map 15-110 ms
      this.hrvRing.style.strokeDashoffset = 282 - (282 * hrvPercent);
    } else {
      this.hrvRing.style.strokeDashoffset = 282;
    }

    // Modulate binaural audio carrier dynamically
    this.updateAudioCarrier(bpm, hrv, tension);
  }

  updateAuraState(bpm, hrv, tension) {
    if (bpm === 0 || hrv === 0) return;

    // Stress index calculated from Heart Rate & HRV & Face Tension
    // Higher BPM + Lower HRV + Higher Tension = High Stress
    // bpm ranges ~50-130, hrv ~10-120
    const normBpm = Math.max(0, Math.min(1, (bpm - 60) / 60)); // 60-120 bpm
    const normHrv = 1.0 - Math.max(0, Math.min(1, (hrv - 20) / 80)); // 20-100 ms (reversed: low hrv is stress)
    const normTension = tension / 100;

    const stressIndex = (normBpm * 0.3 + normHrv * 0.4 + normTension * 0.3);

    // Map stressIndex 0-1 to Aura States
    let auraKey = 'green';
    if (stressIndex < 0.15 && hrv > 75) {
      auraKey = 'violet';
    } else if (stressIndex < 0.3 && hrv > 55) {
      auraKey = 'indigo';
    } else if (stressIndex < 0.45 && hrv > 45) {
      auraKey = 'blue';
    } else if (stressIndex < 0.6) {
      auraKey = 'green';
    } else if (stressIndex < 0.72) {
      auraKey = 'yellow';
    } else if (stressIndex < 0.85) {
      auraKey = 'orange';
    } else {
      auraKey = 'red';
    }

    this.currentAura = this.auraStates[auraKey];

    // Update Aura Badge & Text
    this.auraBadge.textContent = `${this.currentAura.name} Aura`;
    this.auraBadge.style.background = this.currentAura.color + '22';
    this.auraBadge.style.color = this.currentAura.color;
    this.auraBadge.style.borderColor = this.currentAura.color + '55';
    this.auraDesc.textContent = this.currentAura.desc;

    // Update ring colors to match dominant Aura
    this.bpmRing.style.stroke = this.currentAura.color;
    this.bpmRing.style.filter = `drop-shadow(0 0 4px ${this.currentAura.color})`;

    // Calculate dynamic chakra activations (out of 100%)
    // Root: Sympathetic stress activation
    const rootVal = Math.round(40 + (stressIndex * 55));
    // Sacral: Flow/Creativity (active when medium heart rate, stable tension)
    const sacralVal = Math.round(50 + (1.0 - Math.abs(bpm - 75) / 25) * 35);
    // Solar Plexus: Focus/Cognition (active in focus ranges, slightly high stress)
    const solarVal = Math.round(45 + (stressIndex > 0.4 && stressIndex < 0.85 ? 40 : 15));
    // Heart: Coherence (high when HRV is healthy and stable)
    const heartVal = Math.round(20 + (hrv / 120) * 75);
    // Throat: Communication/Expression (balanced when tension is low and heart is steady)
    const throatVal = Math.round(35 + (1.0 - tension / 100) * 55);
    // Third Eye: Insight (active when in deep rest/meditative state, high HRV, low stress)
    const thirdeyeVal = Math.round(20 + (hrv > 60 ? (hrv / 120) * 75 : 10));
    // Crown: Connection (active in maximum parasympathetic resonance)
    const crownVal = Math.round(10 + (hrv > 75 ? (hrv / 120) * 85 : 5));

    this.setChakra('root', rootVal);
    this.setChakra('sacral', sacralVal);
    this.setChakra('solar', solarVal);
    this.setChakra('heart', heartVal);
    this.setChakra('throat', throatVal);
    this.setChakra('thirdeye', thirdeyeVal);
    this.setChakra('crown', crownVal);
  }

  setChakra(id, value) {
    const fill = document.getElementById(`chakra-${id}`);
    const percentText = document.getElementById(`chakra-percent-${id}`);
    if (fill && percentText) {
      fill.style.width = `${value}%`;
      percentText.textContent = `${value}%`;
    }
  }

  getStressIndex() {
    // Recompute current stress index for the shaders
    // (returns values between 0.0 - 1.0)
    const bpm = parseInt(this.bpmVal.textContent) || 72;
    const hrv = parseInt(this.hrvVal.textContent) || 50;
    const tension = parseInt(this.faceTension.textContent) || 20;

    const normBpm = Math.max(0, Math.min(1, (bpm - 60) / 60));
    const normHrv = 1.0 - Math.max(0, Math.min(1, (hrv - 20) / 80));
    const normTension = tension / 100;

    return parseFloat((normBpm * 0.3 + normHrv * 0.4 + normTension * 0.3).toFixed(2));
  }

  showReport() {
    const backdrop = document.getElementById('report-modal-backdrop');
    
    // Populate report timestamp
    document.getElementById('report-time').textContent = new Date().toLocaleString();
    
    const indicator = document.getElementById('report-aura-indicator');
    const titleText = document.getElementById('report-title-text');
    const label2 = document.getElementById('report-stat-lbl-2');
    const label3 = document.getElementById('report-stat-lbl-3');
    const descTitle = document.getElementById('report-desc-title');
    const breakdownTitle = document.getElementById('report-breakdown-title');
    
    const bpmVal = parseInt(this.bpmVal.textContent) || 0;
    const hrvVal = parseInt(this.hrvVal.textContent) || 0;
    const tensionVal = parseInt(this.faceTension.textContent) || 0;

    if (this.mode === 'clinical') {
      // ---------------- Clinical Report Modal ----------------
      titleText.textContent = 'CLINICAL BIOMETRIC ASSESSMENT';
      label2.textContent = 'HRV (RMSSD)';
      label3.textContent = 'OXYGEN SATURATION';
      descTitle.textContent = 'Hemodynamic Assessment Summary';
      breakdownTitle.textContent = 'Autonomic Metric Breakdown';

      // Use clinical teal color for report indicator
      indicator.style.color = '#00f3ff';
      indicator.style.backgroundColor = 'rgba(0, 243, 255, 0.25)';
      
      const spo2ValText = document.getElementById('spo2-val');
      const spo2Val = spo2ValText ? parseInt(spo2ValText.textContent) || 98 : 98;
      
      document.getElementById('report-aura-color').textContent = 'Clinical Diagnostic Log';
      document.getElementById('report-aura-color').style.color = '#00f3ff';
      
      let rhythmText = 'Sinus Rhythm';
      if (bpmVal > 0) {
        const sdnnVal = this.clinicalSdnn ? parseInt(this.clinicalSdnn.textContent) || 20 : 20;
        if (sdnnVal > 40) rhythmText = 'Sinus Arrhythmia';
        else if (hrvVal < 25 && bpmVal > 90) rhythmText = 'Elevated Heart Rate / Low HRV';
      }
      document.getElementById('report-aura-type').textContent = `Cardiac Rhythm: ${rhythmText}`;
      
      document.getElementById('report-bpm').textContent = `${bpmVal} BPM`;
      document.getElementById('report-hrv').textContent = `${hrvVal} ms`;
      document.getElementById('report-energy').textContent = `${spo2Val}%`;

      const bpValText = this.vibFreq.textContent;
      const piValText = this.signalSnr.textContent;
      const sdnnValText = this.clinicalSdnn ? this.clinicalSdnn.textContent : '-- ms';
      const lfhfValText = this.clinicalLfhf ? this.clinicalLfhf.textContent : '--';

      document.getElementById('report-long-desc').textContent = 
        `This biometric assessment details the cardiovascular and autonomic nervous system (ANS) metrics captured via remote photoplethysmography (rPPG). ` +
        `The subject's heart rate was recorded at ${bpmVal} BPM with an inter-beat interval variability (RMSSD) of ${hrvVal} ms. ` +
        `Oxygen saturation was stable at ${spo2Val}%, and peripheral perfusion index was measured at ${piValText}. ` +
        `Relative blood pressure trends indicate a resting range of ${bpValText} mmHg, and autonomic diagnostics indicate an SDNN of ${sdnnValText} with an LF/HF ratio of ${lfhfValText}. ` +
        `Overall autonomic balance indicates stable parasympathetic tone.`;

      // Autonomic Metric breakdown list
      const breakdown = document.getElementById('report-chakra-breakdown');
      breakdown.innerHTML = ''; // clear

      const clinicalMetrics = [
        { name: 'PARASYMPATHETIC TONE (PNS)', val: this.ansBarPara ? this.ansBarPara.style.width : '50%', color: '#00f3ff' },
        { name: 'SYMPATHETIC TONE (SNS)', val: this.ansBarSym ? this.ansBarSym.style.width : '50%', color: '#ff3b30' },
        { name: 'OXYGENATION LEVEL', val: `${spo2Val}%`, color: '#00f3ff' },
        { name: 'PERFUSION STRENGTH', val: piValText, color: '#0088ff' }
      ];

      clinicalMetrics.forEach(m => {
        const row = document.createElement('div');
        row.className = 'chakra-bar-wrapper';
        row.innerHTML = `
          <span class="chakra-name" style="color: ${m.color}; font-size: 0.65rem; width: 180px;">${m.name}</span>
          <div class="chakra-bar-bg" style="height: 4px; flex: 1;">
            <div class="chakra-bar-fill" style="width: ${m.val.includes('%') ? m.val : '100%'}; background: ${m.color}; height: 100%;"></div>
          </div>
          <span class="chakra-percent" style="font-size: 0.65rem; width: 45px; text-align: right;">${m.val}</span>
        `;
        breakdown.appendChild(row);
      });

    } else {
      // ---------------- Spiritual Aura Report ----------------
      titleText.textContent = 'BIO-SPECTRAL AURA REPORT';
      label2.textContent = 'HRV (STRESS)';
      label3.textContent = 'ENERGY LEVEL';
      descTitle.textContent = 'Energy Field Description';
      breakdownTitle.textContent = 'Chakra Balance Metrics';

      indicator.style.color = this.currentAura.color;
      indicator.style.backgroundColor = this.currentAura.color + 'dd';
      
      document.getElementById('report-aura-color').textContent = `${this.currentAura.name} Aura`;
      document.getElementById('report-aura-color').style.color = this.currentAura.color;

      let coherence = 'Standard';
      if (hrvVal > 60 && tensionVal < 30) coherence = 'Highly Coherent';
      else if (hrvVal < 30 || tensionVal > 60) coherence = 'Sympathetic Dominant (High Stress)';
      
      document.getElementById('report-aura-type').textContent = `Field State: ${coherence}`;
      document.getElementById('report-bpm').textContent = `${bpmVal} BPM`;
      document.getElementById('report-hrv').textContent = `${hrvVal} ms`;

      // Energy Level is mapped from a combined balance
      const energyLevel = Math.round(Math.min(100, Math.max(10, (hrvVal / 120) * 60 + (100 - tensionVal) * 0.4)));
      document.getElementById('report-energy').textContent = `${energyLevel}%`;

      // Generate descriptive summary text based on the aura
      document.getElementById('report-long-desc').textContent = this.currentAura.desc + ' ' +
        `Your cardiac spectral analysis demonstrates a heart rate of ${bpmVal} BPM with an inter-beat variance (HRV) of ${hrvVal}ms. ` +
        `This configuration indicates that your autonomic energy index is ${energyLevel}%, with a somatic tension index of ${tensionVal}%. ` +
        `We recommend focusing on slow, rhythmic breathing to expand your cardiac coherence field and shift your profile toward higher frequencies.`;

      // Clone the chakra bars into the report modal
      const breakdown = document.getElementById('report-chakra-breakdown');
      breakdown.innerHTML = ''; // clear

      const chakras = ['crown', 'thirdeye', 'throat', 'heart', 'solar', 'sacral', 'root'];
      const chakraColors = {
        crown: 'var(--chakra-violet)',
        thirdeye: 'var(--chakra-indigo)',
        throat: 'var(--chakra-blue)',
        heart: 'var(--chakra-green)',
        solar: 'var(--chakra-yellow)',
        sacral: 'var(--chakra-orange)',
        root: 'var(--chakra-red)'
      };

      chakras.forEach(c => {
        const origBar = document.getElementById(`chakra-${c}`);
        const val = origBar ? origBar.style.width : '0%';
        
        const row = document.createElement('div');
        row.className = 'chakra-bar-wrapper';
        row.innerHTML = `
          <span class="chakra-name" style="color: ${chakraColors[c]}; font-size: 0.65rem; width: 85px;">${c.toUpperCase()}</span>
          <div class="chakra-bar-bg" style="height: 4px;">
            <div class="chakra-bar-fill" style="width: ${val}; background: ${chakraColors[c]}; height: 100%;"></div>
          </div>
          <span class="chakra-percent" style="font-size: 0.65rem; width: 30px;">${val}</span>
        `;
        breakdown.appendChild(row);
      });
    }

    backdrop.classList.add('active');
  }

  closeReport() {
    document.getElementById('report-modal-backdrop').classList.remove('active');
  }
}
