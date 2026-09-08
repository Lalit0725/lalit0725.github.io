/**
 * Ambient Dither Background & Universal Card Glow
 * - Procedural 3D Simplex noise with domain warping (organic crawling, non-repetitive)
 * - Session-based procedural randomization and seeding
 * - Bayer 8x8 ordered dithering with cyber cyan (#00f0ff) aesthetic
 * - Smooth interactive mouse ripple perturbation
 * - Battery-friendly: pauses on background tab, respects prefers-reduced-motion
 * - Universal mouse-tracking radial glow for all cards
 */

(function () {
  'use strict';

  // --- 1. Universal Card Mouse-Tracking Glow ---
  function initCardGlow() {
    const selector = '.card, .bento-card, .cap-card, .past-role-card, article.card, aside.card, section.card';
    const updateMouse = (e) => {
      const card = e.currentTarget;
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      card.style.setProperty('--mouse-x', `${x}px`);
      card.style.setProperty('--mouse-y', `${y}px`);
    };

    const attachGlow = () => {
      document.querySelectorAll(selector).forEach((card) => {
        if (!card._glowAttached) {
          card._glowAttached = true;
          card.addEventListener('mousemove', updateMouse, { passive: true });
        }
      });
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', attachGlow);
    } else {
      attachGlow();
    }
  }
  initCardGlow();

  // --- 2. Ambient Dither WebGL Shader ---
  function initAmbientDither() {
    let canvas = document.getElementById('ambient-dither');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'ambient-dither';
      canvas.setAttribute('aria-hidden', 'true');
      document.body.prepend(canvas);
    }

    const gl =
      canvas.getContext('webgl', {
        powerPreference: 'low-power',
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
      }) || canvas.getContext('experimental-webgl');

    if (!gl) {
      canvas.style.display = 'none';
      return;
    }

    const vsSource = `
      attribute vec2 a_position;
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;

    const fsSource = `
      #ifdef GL_ES
      precision highp float;
      #endif

      uniform vec2 u_resolution;
      uniform float u_time;
      uniform vec2 u_mouse;
      uniform vec3 u_color;
      uniform vec3 u_bg;
      uniform vec2 u_seed;
      uniform float u_seed_time;

      // 8x8 Bayer Matrix Ordered Dithering
      float Bayer2(vec2 a) {
        a = floor(a);
        return fract(a.x * 0.5 + a.y * a.y * 0.75);
      }
      #define Bayer4(a) (Bayer2(0.5 * (a)) * 0.25 + Bayer2(a))
      #define Bayer8(a) (Bayer4(0.5 * (a)) * 0.25 + Bayer2(a))

      // Ashima Arts / Stefan Gustavson Simplex 3D Noise
      vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
      vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

      float snoise(vec3 v) {
        const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
        const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

        vec3 i  = floor(v + dot(v, C.yyy));
        vec3 x0 = v - i + dot(i, C.xxx);

        vec3 g = step(x0.yzx, x0.xyz);
        vec3 l = 1.0 - g;
        vec3 i1 = min(g.xyz, l.zxy);
        vec3 i2 = max(g.xyz, l.zxy);

        vec3 x1 = x0 - i1 + C.xxx;
        vec3 x2 = x0 - i2 + C.yyy;
        vec3 x3 = x0 - D.yyy;

        i = mod289(i);
        vec4 p = permute(permute(permute(
                   i.z + vec4(0.0, i1.z, i2.z, 1.0))
                 + i.y + vec4(0.0, i1.y, i2.y, 1.0))
                 + i.x + vec4(0.0, i1.x, i2.x, 1.0));

        float n_ = 0.142857142857;
        vec3  ns = n_ * D.wyz - D.xzx;

        vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

        vec4 x_ = floor(j * ns.z);
        vec4 y_ = floor(j - 7.0 * x_);

        vec4 x = x_ * ns.x + ns.yyyy;
        vec4 y = y_ * ns.x + ns.yyyy;
        vec4 h = 1.0 - abs(x) - abs(y);

        vec4 b0 = vec4(x.xy, y.xy);
        vec4 b1 = vec4(x.zw, y.zw);

        vec4 s0 = floor(b0) * 2.0 + 1.0;
        vec4 s1 = floor(b1) * 2.0 + 1.0;
        vec4 sh = -step(h, vec4(0.0));

        vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
        vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

        vec3 p0 = vec3(a0.xy, h.x);
        vec3 p1 = vec3(a0.zw, h.y);
        vec3 p2 = vec3(a1.xy, h.z);
        vec3 p3 = vec3(a1.zw, h.w);

        vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
        p0 *= norm.x;
        p1 *= norm.y;
        p2 *= norm.z;
        p3 *= norm.w;

        vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
        m = m * m;
        return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
      }

      void main() {
        vec2 uv = gl_FragCoord.xy / u_resolution.xy;
        vec2 aspectUV = uv;
        aspectUV.x *= u_resolution.x / u_resolution.y;

        // Continuous time-slice on 3rd dimension (Z-axis) prevents rigid 2D conveyor sliding
        float t = (u_time + u_seed_time) * 0.034;
        vec3 p = vec3(aspectUV * 1.45 + u_seed, t);

        // 2-step domain warp: organic fluid curling and non-repetitive tendrils
        vec3 q = vec3(
          snoise(p),
          snoise(p + vec3(4.3, 2.1, 0.4)),
          snoise(p + vec3(1.9, 6.7, 0.7))
        );
        vec3 r = vec3(
          snoise(p + 1.6 * q + vec3(2.4, 1.7, 0.3)),
          snoise(p + 1.6 * q + vec3(7.1, 4.3, 0.5)),
          snoise(p + 1.6 * q + vec3(3.5, 8.2, 0.4))
        );

        vec3 warped = p + 1.75 * r;
        float f = 0.65 * snoise(warped) + 0.35 * snoise(warped * 2.1 + vec3(1.1, 0.8, 0.2));

        // Interactive subtle mouse disturbance ripple
        if (u_mouse.x >= 0.0) {
          vec2 mAspect = u_mouse / u_resolution;
          mAspect.x *= u_resolution.x / u_resolution.y;
          float dist = length(aspectUV - mAspect);
          float mouseWave = exp(-dist * 4.5) * sin(dist * 22.0 - u_time * 2.8);
          f += mouseWave * 0.12;
        }

        float val = clamp(f * 0.5 + 0.5, 0.0, 1.0);

        // Finer 8x8 Bayer ordered dithering grain
        vec2 ditherCoord = floor(gl_FragCoord.xy / 2.0);
        float bayer = Bayer8(ditherCoord) - 0.5;

        // Elevated thresholds so dither dots only appear in graceful organic clusters
        float dither1 = step(0.52, val + bayer * 0.45);
        float dither2 = step(0.68, val + bayer * 0.40);
        float dither3 = step(0.82, val + bayer * 0.35);

        vec3 col = u_bg;
        col = mix(col, vec3(0.02, 0.08, 0.12), dither1 * 0.45);
        col = mix(col, vec3(0.01, 0.22, 0.30), dither2 * 0.40);
        col = mix(col, vec3(0.0, 0.65, 0.80), dither3 * 0.45);

        // Soft vignette framing
        vec2 vig = uv * (1.0 - uv);
        col *= clamp(vig.x * vig.y * 16.0, 0.40, 1.0);

        gl_FragColor = vec4(col, 1.0);
      }
    `;

    function createShader(gl, type, src) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, src);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.warn(gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    }

    const vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
    if (!vs || !fs) return;

    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn(gl.getProgramInfoLog(program));
      return;
    }
    gl.useProgram(program);

    // Quad geometry covering full viewport
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );
    const aPos = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    // Uniforms
    const uRes = gl.getUniformLocation(program, 'u_resolution');
    const uTime = gl.getUniformLocation(program, 'u_time');
    const uMouse = gl.getUniformLocation(program, 'u_mouse');
    const uColor = gl.getUniformLocation(program, 'u_color');
    const uBg = gl.getUniformLocation(program, 'u_bg');
    const uSeed = gl.getUniformLocation(program, 'u_seed');
    const uSeedTime = gl.getUniformLocation(program, 'u_seed_time');

    // Gentle cyber cyan highlights on deep obsidian background (#06090e)
    gl.uniform3f(uColor, 0.0, 0.80, 0.90);
    gl.uniform3f(uBg, 0.024, 0.035, 0.055);

    // Generative procedural seeds per page load
    const seedX = Math.random() * 800.0 + 17.23;
    const seedY = Math.random() * 800.0 + 53.91;
    const seedTime = Math.random() * 600.0 + 31.41;
    gl.uniform2f(uSeed, seedX, seedY);
    gl.uniform1f(uSeedTime, seedTime);

    let targetMouse = { x: -1, y: -1 };
    let curMouse = { x: -1, y: -1 };

    // Pixel-scale optimization: downsample canvas internal buffer for 60+ FPS efficiency
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const scale = dpr * 0.65;
      const w = Math.max(1, Math.floor(window.innerWidth * scale));
      const h = Math.max(1, Math.floor(window.innerHeight * scale));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
        gl.uniform2f(uRes, w, h);
      }
    };
    resize();
    window.addEventListener('resize', resize, { passive: true });

    window.addEventListener(
      'pointermove',
      (e) => {
        const scale = canvas.width / window.innerWidth;
        targetMouse.x = e.clientX * scale;
        targetMouse.y = (window.innerHeight - e.clientY) * scale;
        if (curMouse.x < 0) {
          curMouse.x = targetMouse.x;
          curMouse.y = targetMouse.y;
        }
      },
      { passive: true }
    );

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const startTime = performance.now();
    let animId = null;

    function render(now) {
      if (document.hidden) return;

      if (curMouse.x >= 0) {
        curMouse.x += (targetMouse.x - curMouse.x) * 0.08;
        curMouse.y += (targetMouse.y - curMouse.y) * 0.08;
        gl.uniform2f(uMouse, curMouse.x, curMouse.y);
      } else {
        gl.uniform2f(uMouse, -1, -1);
      }

      const elapsed = (now - startTime) * 0.001;
      gl.uniform1f(uTime, elapsed);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      if (!prefersReduced.matches) {
        animId = requestAnimationFrame(render);
      }
    }

    animId = requestAnimationFrame(render);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (animId) cancelAnimationFrame(animId);
      } else if (!prefersReduced.matches) {
        animId = requestAnimationFrame(render);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAmbientDither);
  } else {
    initAmbientDither();
  }
})();
