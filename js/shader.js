/**
 * Aura Scanner - GPU Shader and Three.js Renderer
 * Compiles custom WebGL shaders for fluid plasma flows and emits glowing bio-particles
 */

const VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  uniform vec2 u_resolution;
  uniform float u_time;
  uniform vec2 u_face_center;
  uniform vec2 u_face_size;
  uniform float u_face_roll;
  uniform float u_bpm;
  uniform float u_hrv;
  uniform float u_stress;
  uniform float u_tension;
  uniform int u_mode;
  
  varying vec2 vUv;

  // 2D Hash
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  // 2D Value Noise
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i + vec2(0.0,0.0)), hash(i + vec2(1.0,0.0)), u.x),
               mix(hash(i + vec2(0.0,1.0)), hash(i + vec2(1.0,1.0)), u.x), u.y);
  }

  // Fractal Brownian Motion
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    vec2 shift = vec2(100.0);
    // Rotate to reduce axial bias
    mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
    for (int i = 0; i < 4; ++i) {
      v += a * noise(p);
      p = rot * p * 2.0 + shift;
      a *= 0.5;
    }
    return v;
  }

  // Rotates a point around pivot
  vec2 rotate(vec2 p, vec2 pivot, float angle) {
    float s = sin(angle);
    float c = cos(angle);
    vec2 r = p - pivot;
    return vec2(r.x * c - r.y * s, r.x * s + r.y * c) + pivot;
  }

  void main() {
    // Correct aspect ratio
    vec2 aspect = vec2(u_resolution.x / u_resolution.y, 1.0);
    vec2 uv = vUv * aspect;
    vec2 center = u_face_center * aspect;
    
    // Reverse X coordinate because camera feed is mirrored
    // u_face_center is already mirrored in JS, but let's make sure coordinates align
    vec2 rotatedUv = rotate(uv, center, -u_face_roll);

    // Calculate signed distance to face ellipse
    // Major axis scale (vertical/horizontal stretch)
    vec2 faceRadius = u_face_size * aspect * 0.6;
    
    // Ellipse distance estimation
    vec2 diff = (rotatedUv - center) / max(faceRadius, vec2(0.01));
    float distToFace = length(diff);

    // Dynamic parameters based on biometrics
    float pulseSpeed = 1.0 + (u_bpm - 60.0) / 30.0; // scales speed with heart rate
    float turbulence = 0.5 + (u_tension / 100.0) * 0.8 + (1.0 - u_hrv / 100.0) * 0.4;
    
    // Distort the coordinates using noise
    vec2 noiseUv = uv * 3.0;
    float timeScale = u_time * pulseSpeed * 0.5;
    
    float n1 = fbm(noiseUv - vec2(0.0, timeScale));
    float n2 = fbm(noiseUv + vec2(n1, timeScale * 0.8));
    
    // Distort the face distance field
    float distortedDist = distToFace - n2 * 0.3 * turbulence;
    
    // Glow calculation
    float glowWidth = 0.4 + (1.0 - u_hrv / 100.0) * 0.2; // wider glow when stressed
    float glow = exp(-max(0.0, distortedDist - 0.9) / glowWidth);
    
    // Mask face interior so aura surrounds the face but doesn't cover features completely
    // We want a soft transition into the face
    float faceMask = smoothstep(0.4, 0.95, distToFace);
    glow *= faceMask;

    vec3 finalColor = vec3(0.0);

    if (u_mode == 0) {
      // 0: SPIRIT FLOW (Indigo, Violet, Magenta, Cyan)
      // Base colors
      vec3 colIndigo = vec3(0.12, 0.05, 0.6);
      vec3 colMagenta = vec3(0.74, 0.0, 0.5);
      vec3 colCyan = vec3(0.0, 0.95, 1.0);
      
      // Interpolate based on stress (high stress -> more active magenta/cyan ripples)
      vec3 colCalm = mix(colIndigo, colMagenta, n1);
      vec3 colStressed = mix(colMagenta, colCyan, n2);
      
      finalColor = mix(colCalm, colStressed, u_stress) * glow;
      
    } else if (u_mode == 1) {
      // 1: CHAKRA FLAME (Rising fire - Orange, Yellow, Gold, Crimson)
      // Scale vertically to look like rising energy
      vec2 flameUv = uv * 3.5 - vec2(0.0, u_time * pulseSpeed * 0.9);
      float fn = fbm(flameUv);
      
      float flameDist = distToFace - fn * 0.4 * turbulence;
      float flameGlow = exp(-max(0.0, flameDist - 0.9) / 0.3) * faceMask;

      vec3 colCrimson = vec3(0.9, 0.0, 0.1);
      vec3 colOrange = vec3(1.0, 0.35, 0.0);
      vec3 colYellow = vec3(1.0, 0.84, 0.0);
      
      // Base mix
      vec3 flameColor = mix(colCrimson, colOrange, fn);
      flameColor = mix(flameColor, colYellow, n2);
      
      // If stressed, make flames more crimson and spiky
      if (u_stress > 0.6) {
        flameColor = mix(flameColor, colCrimson, u_stress * 0.5);
      }
      
      finalColor = flameColor * flameGlow;
      
    } else if (u_mode == 2) {
      // 2: ASTRAL SPARKS / NEBULA (Nebulous background energy)
      vec3 colDeepBlue = vec3(0.02, 0.05, 0.25);
      vec3 colOrchid = vec3(0.6, 0.2, 0.8);
      vec3 colGold = vec3(0.95, 0.8, 0.3);
      
      vec3 nebColor = mix(colDeepBlue, colOrchid, n2);
      nebColor = mix(nebColor, colGold, n1 * 0.3);
      
      finalColor = nebColor * glow * 0.8;
    } else {
      // 3: CLINICAL DIAGNOSTIC SCANNER (Teal, Blue, Laser Sweep)
      vec3 colTeal = vec3(0.0, 0.95, 0.75);
      vec3 colBlue = vec3(0.0, 0.35, 0.95);
      
      float beatTime = fract(u_time * (u_bpm / 60.0));
      
      // Pulse rings expanding outward
      float ringRadius = beatTime * 2.0;
      float ringDist = abs(distToFace - ringRadius);
      float ringGlow = exp(-ringDist / 0.06) * 0.5 * (1.0 - beatTime);
      
      // Add a sweeping vertical scan line
      float scanCycle = sin(u_time * 2.0) * 1.2; // sweep up and down
      float scanDist = abs(rotatedUv.y - center.y - scanCycle * faceRadius.y);
      float scanLine = exp(-scanDist / 0.015) * smoothstep(0.0, 1.2, 1.2 - distToFace);
      
      // Combine base face glow with dynamic scan elements
      float faceOuterGlow = exp(-max(0.0, distToFace - 1.0) / 0.2) * faceMask;
      
      vec3 scanColor = mix(colBlue, colTeal, n1);
      finalColor = (scanColor * faceOuterGlow * 0.6) + 
                   (colTeal * ringGlow) + 
                   (colTeal * scanLine * 1.6);
    }

    // Boost brightness slightly
    finalColor *= 1.3;

    // Output transparent background where there is no aura glow
    gl_FragColor = vec4(finalColor, length(finalColor) * 0.6);
  }
`;

export class ShaderRenderer {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    
    // Shader materials & uniform values
    this.shaderMaterial = null;
    this.uniforms = null;
    this.clock = new THREE.Clock();

    // Particle system (Astral Sparks)
    this.particleCount = 500;
    this.particleGeometry = null;
    this.particles = null;
    this.particleData = []; // Position, velocity, age, life
    
    // Animation flags
    this.isRendering = false;
    this.currentMode = 0; // 0 = Spirit, 1 = Flame, 2 = Astral
  }

  initialize() {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;

    // Initialize Three.js Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: true
    });
    this.renderer.setSize(width, height, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.scene = new THREE.Scene();
    
    // Orthographic Camera for Fullscreen Shader Quad
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // Setup uniforms for the shader
    this.uniforms = {
      u_resolution: { value: new THREE.Vector2(width, height) },
      u_time: { value: 0.0 },
      u_face_center: { value: new THREE.Vector2(0.5, 0.5) },
      u_face_size: { value: new THREE.Vector2(0.25, 0.35) },
      u_face_roll: { value: 0.0 },
      u_bpm: { value: 72.0 },
      u_hrv: { value: 50.0 },
      u_stress: { value: 0.2 },
      u_tension: { value: 20.0 },
      u_mode: { value: 0 }
    };

    // Fullscreen quad mesh
    const geometry = new THREE.PlaneGeometry(2, 2);
    this.shaderMaterial = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      depthTest: false
    });

    const mesh = new THREE.Mesh(geometry, this.shaderMaterial);
    this.scene.add(mesh);

    // Initialize Particle System
    this.initParticles();

    // Listen for resize
    window.addEventListener('resize', this.onResize.bind(this));
  }

  initParticles() {
    this.particleGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(this.particleCount * 3);
    const colors = new Float32Array(this.particleCount * 3);

    this.particleData = [];

    // Setup placeholder particle states
    for (let i = 0; i < this.particleCount; i++) {
      positions[i * 3] = 0;
      positions[i * 3 + 1] = -9999; // hide initially
      positions[i * 3 + 2] = 0;

      colors[i * 3] = 1.0;
      colors[i * 3 + 1] = 1.0;
      colors[i * 3 + 2] = 1.0;

      this.particleData.push({
        active: false,
        age: 0,
        life: 0,
        x: 0, y: 0,
        vx: 0, vy: 0,
        r: 1, g: 1, b: 1
      });
    }

    this.particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    // Custom shader or glowing particle material
    // We create a canvas-based circle texture for particles
    const pCanvas = document.createElement('canvas');
    pCanvas.width = 16;
    pCanvas.height = 16;
    const pCtx = pCanvas.getContext('2d');
    const grad = pCtx.createRadialGradient(8, 8, 0, 8, 8, 8);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.3, 'rgba(255,255,255,0.8)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    pCtx.fillStyle = grad;
    pCtx.fillRect(0, 0, 16, 16);
    
    const pTexture = new THREE.CanvasTexture(pCanvas);

    const particleMaterial = new THREE.PointsMaterial({
      size: 0.045,
      map: pTexture,
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false
    });

    this.particles = new THREE.Points(this.particleGeometry, particleMaterial);
    this.scene.add(this.particles);
  }

  setMode(mode) {
    let modeVal = 0;
    if (mode === 'flame') modeVal = 1;
    if (mode === 'astral') modeVal = 2;
    if (mode === 'clinical') modeVal = 3;
    
    this.currentMode = modeVal;
    if (this.uniforms) {
      this.uniforms.u_mode.value = modeVal;
    }
  }

  updateBiometrics(bpm, hrv, stress, tension) {
    if (!this.uniforms) return;
    this.uniforms.u_bpm.value = bpm || 72.0;
    this.uniforms.u_hrv.value = hrv || 50.0;
    this.uniforms.u_stress.value = stress !== undefined ? stress : 0.2;
    this.uniforms.u_tension.value = tension !== undefined ? tension : 20.0;
  }

  /**
   * Updates face landmarks in the shader coordinates
   * @param {Object} data - landmark data from tracker
   */
  updateFace(data) {
    if (!this.uniforms || !data.detected) {
      // If face disappears, slowly fade the face size to zero to shrink aura
      this.uniforms.u_face_size.value.lerp(new THREE.Vector2(0, 0), 0.1);
      return;
    }

    const landmarks = data.landmarks;
    
    // Center point (Landmark 1 is nose tip)
    const nose = landmarks[1];
    
    // Mirror coordinates: MediaPipe X is [0, 1] left-to-right on camera,
    // which is right-to-left for the user. We flip it for canvas overlay.
    // In ThreeJS screen-space quad, UV coords are (0,0) bottom-left, (1,1) top-right.
    const faceCenterX = 1.0 - nose.x;
    const faceCenterY = 1.0 - nose.y;

    // Face bounding box dimensions using key outer boundary points:
    // Left: 234, Right: 454
    // Top: 10, Bottom: 152
    const leftPt = landmarks[234];
    const rightPt = landmarks[454];
    const topPt = landmarks[10];
    const bottomPt = landmarks[152];

    const faceWidth = Math.abs(rightPt.x - leftPt.x);
    const faceHeight = Math.abs(bottomPt.y - topPt.y);

    // Roll angle: angle between eyes (left: 33, right: 263)
    const eyeL = landmarks[33];
    const eyeR = landmarks[263];
    const dx = eyeR.x - eyeL.x;
    const dy = eyeR.y - eyeL.y;
    const rollAngle = Math.atan2(dy, dx);

    // Lerp (smooth) values to avoid jittering
    const centerTarget = new THREE.Vector2(faceCenterX, faceCenterY);
    this.uniforms.u_face_center.value.lerp(centerTarget, 0.25);

    const sizeTarget = new THREE.Vector2(faceWidth, faceHeight);
    this.uniforms.u_face_size.value.lerp(sizeTarget, 0.25);

    // Smooth roll
    this.uniforms.u_face_roll.value += (rollAngle - this.uniforms.u_face_roll.value) * 0.25;

    // Handle Particle Emission from face boundary
    if (this.currentMode === 2) { // Astral sparks mode
      this.emitFaceParticles(landmarks, faceCenterX, faceCenterY, faceWidth, faceHeight, rollAngle);
    }
  }

  emitFaceParticles(landmarks, centerX, centerY, faceW, faceH, roll) {
    // Choose 3 random landmarks on the face contour in each frame to emit a particle
    const emitterIndices = [10, 152, 234, 454, 109, 338, 50, 280, 117, 346];
    
    // Determine color based on stress
    const stress = this.uniforms.u_stress.value;
    const bpm = this.uniforms.u_bpm.value;
    
    // Aura color mappings for particles
    let pr = 0.5, pg = 0.2, pb = 0.9; // Base violet
    if (stress > 0.6) {
      // Stressed/Active: Neon magenta & Gold
      pr = 1.0; pg = 0.1 * (1.0 - stress); pb = 0.5 * stress;
    } else if (stress < 0.2) {
      // Relaxed: Deep Cyan / Emerald
      pr = 0.0; pg = 0.9; pb = 1.0;
    } else {
      // Balanced: Gold / Amber
      pr = 0.95; pg = 0.75; pb = 0.2;
    }

    const emitterCount = 3;
    for (let k = 0; k < emitterCount; k++) {
      // Find an inactive particle
      const pIdx = this.particleData.findIndex(p => !p.active);
      if (pIdx === -1) break;

      const randLandmarkIdx = emitterIndices[Math.floor(Math.random() * emitterIndices.length)];
      const pt = landmarks[randLandmarkIdx];
      
      const px = 1.0 - pt.x;
      const py = 1.0 - pt.y;

      const pData = this.particleData[pIdx];
      pData.active = true;
      pData.age = 0;
      pData.life = 40 + Math.random() * 50; // frames
      
      // Screen space coordinates mapping to ThreeJS orthographic space [-1, 1]
      pData.x = px * 2.0 - 1.0;
      pData.y = py * 2.0 - 1.0;

      // Particle velocity: floating outwards from the face center, and upwards
      const dirX = (px - centerX);
      const dirY = (py - centerY);
      const mag = Math.hypot(dirX, dirY) || 1;
      
      const speed = 0.004 + Math.random() * 0.006;
      pData.vx = (dirX / mag) * speed + (Math.random() - 0.5) * 0.002;
      pData.vy = (dirY / mag) * speed + 0.003 + Math.random() * 0.003; // float up

      pData.r = pr + (Math.random() - 0.5) * 0.1;
      pData.g = pg + (Math.random() - 0.5) * 0.1;
      pData.b = pb + (Math.random() - 0.5) * 0.1;
    }
  }

  updateParticles() {
    const positionAttr = this.particleGeometry.getAttribute('position');
    const colorAttr = this.particleGeometry.getAttribute('color');
    const positions = positionAttr.array;
    const colors = colorAttr.array;

    const stress = this.uniforms ? this.uniforms.u_stress.value : 0.2;

    for (let i = 0; i < this.particleCount; i++) {
      const pData = this.particleData[i];

      if (pData.active) {
        pData.age++;
        
        // Apply velocity & small noise drift
        pData.x += pData.vx;
        pData.y += pData.vy;
        pData.vx += (Math.random() - 0.5) * 0.0006; // slight drift
        
        // Decay
        if (pData.age >= pData.life) {
          pData.active = false;
          // Hide particle
          positions[i * 3 + 1] = -9999; 
        } else {
          // Update visual position in buffer
          positions[i * 3] = pData.x;
          positions[i * 3 + 1] = pData.y;
          positions[i * 3 + 2] = 0;

          // Fade out color as it ages
          const lifeRatio = 1.0 - (pData.age / pData.life);
          
          colors[i * 3] = pData.r * lifeRatio;
          colors[i * 3 + 1] = pData.g * lifeRatio;
          colors[i * 3 + 2] = pData.b * lifeRatio;
        }
      } else {
        positions[i * 3 + 1] = -9999; // keep hidden
      }
    }

    positionAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;
  }

  onResize() {
    if (!this.renderer) return;
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    this.renderer.setSize(width, height, false);
    this.uniforms.u_resolution.value.set(width, height);
  }

  start() {
    this.isRendering = true;
    this.clock.getDelta(); // reset clock
    this.animate();
  }

  stop() {
    this.isRendering = false;
  }

  animate() {
    if (!this.isRendering) return;
    
    requestAnimationFrame(this.animate.bind(this));

    const delta = this.clock.getDelta();
    this.uniforms.u_time.value += delta;

    // Update floating bio-particles
    this.updateParticles();

    // Render scene
    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    this.stop();
    window.removeEventListener('resize', this.onResize);
    if (this.renderer) {
      this.renderer.dispose();
    }
  }
}
