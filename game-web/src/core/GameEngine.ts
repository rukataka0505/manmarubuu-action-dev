import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import {
  BloomEffect,
  Effect,
  EffectComposer,
  EffectPass,
  NormalPass,
  RenderPass,
  SMAAEffect,
  SMAAPreset,
  SSAOEffect,
} from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import type { ResolvedQuality } from '../types';
import { isMobileDefaultDevice } from './SettingsStore';
import { resolveAssetUrl, withTimeout } from '../assets/AssetLoaderUtils';

class TiltShiftToyboxEffect extends Effect {
  constructor() {
    super(
      'TiltShiftToyboxEffect',
      `
      uniform float uBlurAmount;
      uniform float uFeverPulse;
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        // Multi-tap Gaussian diorama tilt-shift at top/bottom bands (zero double-image ghosting)
        float distFromCenter = abs(uv.y - 0.50);
        float band = smoothstep(0.30, 0.50, distFromCenter) * uBlurAmount;
        vec2 r1 = texelSize * (0.9 + band * 1.1);
        vec2 r2 = texelSize * (1.8 + band * 2.1);
        vec4 c = inputColor;
        if (band > 0.01) {
          vec4 acc = inputColor * 0.22;
          // Inner 4 cardinal taps
          acc += texture2D(inputBuffer, uv + vec2(r1.x, 0.0)) * 0.085;
          acc += texture2D(inputBuffer, uv - vec2(r1.x, 0.0)) * 0.085;
          acc += texture2D(inputBuffer, uv + vec2(0.0, r1.y)) * 0.085;
          acc += texture2D(inputBuffer, uv - vec2(0.0, r1.y)) * 0.085;
          // Outer 8 Poisson ring taps
          acc += texture2D(inputBuffer, uv + vec2(r2.x * 0.92, r2.y * 0.38)) * 0.055;
          acc += texture2D(inputBuffer, uv + vec2(r2.x * 0.38, r2.y * 0.92)) * 0.055;
          acc += texture2D(inputBuffer, uv + vec2(-r2.x * 0.38, r2.y * 0.92)) * 0.055;
          acc += texture2D(inputBuffer, uv + vec2(-r2.x * 0.92, r2.y * 0.38)) * 0.055;
          acc += texture2D(inputBuffer, uv + vec2(-r2.x * 0.92, -r2.y * 0.38)) * 0.055;
          acc += texture2D(inputBuffer, uv + vec2(-r2.x * 0.38, -r2.y * 0.92)) * 0.055;
          acc += texture2D(inputBuffer, uv + vec2(r2.x * 0.38, -r2.y * 0.92)) * 0.055;
          acc += texture2D(inputBuffer, uv + vec2(r2.x * 0.92, -r2.y * 0.38)) * 0.055;
          c = mix(inputColor, acc, band);
        }
        // Subtle warm lens vignette
        vec2 d = uv - vec2(0.5);
        float vig = smoothstep(0.45, 0.94, dot(d, d) * 1.45);
        c.rgb = mix(c.rgb, c.rgb * vec3(1.01, 0.98, 0.95), vig * 0.24);
        if (uFeverPulse > 0.01) {
          float edge = smoothstep(0.32, 0.72, length(d));
          vec3 rainbow = 0.55 + 0.45 * cos(uv.x * 6.0 + uv.y * 4.0 + vec3(0.0, 2.1, 4.2));
          c.rgb += rainbow * edge * uFeverPulse * 0.14;
        }
        outputColor = c;
      }
      `,
      {
        uniforms: new Map<string, THREE.Uniform<number>>([
          ['uBlurAmount', new THREE.Uniform(0.95)],
          ['uFeverPulse', new THREE.Uniform(0.0)],
        ]),
      }
    );
  }

  setFeverPulse(val: number): void {
    const u = this.uniforms.get('uFeverPulse');
    if (u) u.value = val;
  }

  setBlurAmount(val: number): void {
    const u = this.uniforms.get('uBlurAmount');
    if (u) u.value = val;
  }
}

export class GameEngine {
  public readonly renderer: THREE.WebGLRenderer;
  public readonly scene: THREE.Scene;
  public readonly camera: THREE.PerspectiveCamera;
  public composer: EffectComposer | null = null;
  private composerFailed = false;
  private tiltShift: TiltShiftToyboxEffect | null = null;
  private bloom: BloomEffect | null = null;
  private n8aoPass: N8AOPostPass | null = null;
  private dayEnvTex: THREE.Texture | null = null;
  private duskEnvTex: THREE.Texture | null = null;
  private indoorEnvTex: THREE.Texture | null = null;
  private hitStopTimer = 0;
  private quality: ResolvedQuality = 'medium';
  private pixelRatioCap = 1.25;
  private feverVisualActive = false;
  private baseBloomIntensity = 0.28;
  public timeScale = 1.0;
  public hdriLoaded = false;
  private hdriLoadPromise: Promise<boolean> | null = null;
  private hdriUrls = {
    day: '/hdri/kloofendal_48d_partly_cloudy_puresky_1k.hdr',
    dusk: '/hdri/belfast_sunset_puresky_1k.hdr',
  };
  public n8aoEnabled = false;
  public currentBossMood = 0;

  private readonly isMobileDevice: boolean;
  private viewportWidth = 1;
  private viewportHeight = 1;

  private readonly dayFogColor = new THREE.Color(0x9bdcff);
  private readonly indoorFogColor = new THREE.Color(0xfff1d8);
  private readonly duskFogColor = new THREE.Color(0x201c36);
  private indoorMode = false;

  constructor(canvas: HTMLCanvasElement, initialQuality: ResolvedQuality = 'medium') {
    this.isMobileDevice = isMobileDefaultDevice();
    this.viewportWidth = window.innerWidth;
    this.viewportHeight = Math.max(1, window.innerHeight);
    this.quality = initialQuality;
    this.pixelRatioCap =
      initialQuality === 'high' ? 1.5 : this.isMobileDevice ? 1.5 : initialQuality === 'medium' ? 1.25 : 1.25;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      powerPreference: this.isMobileDevice ? 'default' : 'high-performance',
      antialias: this.isMobileDevice || initialQuality === 'low',
      stencil: false,
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.pixelRatioCap));
    this.renderer.setSize(this.viewportWidth, this.viewportHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.98;
    this.renderer.shadowMap.enabled = this.shouldEnableShadows(initialQuality);
    this.renderer.shadowMap.type = this.isMobileDevice ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    this.renderer.autoClear = false;
    this.renderer.info.autoReset = false;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x9bdcff, 0.0020);

    this.camera = new THREE.PerspectiveCamera(
      52,
      this.viewportWidth / this.viewportHeight,
      0.15,
      420
    );

    // Fallback PMREM before async HDRI load completes
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envScene = new THREE.Scene();
    envScene.background = new THREE.Color(0x90d6ff);
    const hemi = new THREE.HemisphereLight(0xfffdf2, 0x6b9c4a, 1.5);
    envScene.add(hemi);
    this.dayEnvTex = pmrem.fromScene(envScene, 0.04).texture;

    // Dedicated warm sunlit playroom PMREM (eliminates cool sky-blue tint on indoor walls & plush)
    const indoorEnvScene = new THREE.Scene();
    indoorEnvScene.background = new THREE.Color(0xffefcf);
    const inHemi = new THREE.HemisphereLight(0xfff8e6, 0xd8a872, 2.0);
    indoorEnvScene.add(inHemi);
    const inWindowGlow = new THREE.DirectionalLight(0xffe6aa, 2.2);
    inWindowGlow.position.set(12, 8, -6);
    indoorEnvScene.add(inWindowGlow);
    const inWarmBounce = new THREE.DirectionalLight(0xffdfba, 1.0);
    inWarmBounce.position.set(-10, 4, 10);
    indoorEnvScene.add(inWarmBounce);
    this.indoorEnvTex = pmrem.fromScene(indoorEnvScene, 0.04).texture;

    this.scene.environment = this.dayEnvTex;
    this.scene.environmentIntensity = 0.54;
    pmrem.dispose();

    this.applyQuality(initialQuality);
    window.addEventListener('resize', () => this.onResize());
  }

  private ensureComposer(): EffectComposer | null {
    if (this.composerFailed) return null;
    if (this.composer) return this.composer;

    const w = window.innerWidth;
    const h = Math.max(1, window.innerHeight);

    try {
      // Postprocessing pipeline: RenderPass -> N8AOPostPass -> EffectPass(Bloom, TiltShift, SMAA)
      const composer = new EffectComposer(this.renderer, {
        frameBufferType: THREE.HalfFloatType,
        depthBuffer: true,
      });
      composer.addPass(new RenderPass(this.scene, this.camera));

      const bloom = new BloomEffect({
        mipmapBlur: true,
        luminanceThreshold: 1.12,
        luminanceSmoothing: 0.22,
        intensity: this.baseBloomIntensity,
      });
      const tiltShift = new TiltShiftToyboxEffect();
      const smaa = new SMAAEffect({ preset: SMAAPreset.MEDIUM });

      let fallbackSsao: SSAOEffect | null = null;
      try {
        const n8ao = new N8AOPostPass(this.scene, this.camera, w, h);
        n8ao.configuration.halfRes = true;
        n8ao.configuration.aoRadius = this.indoorMode ? 0.85 : 0.55;
        n8ao.configuration.distanceFalloff = this.indoorMode ? 1.15 : 1.2;
        n8ao.configuration.intensity = this.indoorMode ? 3.85 : 3.2;
        n8ao.configuration.aoSamples = 8;
        n8ao.configuration.denoiseSamples = 4;
        n8ao.configuration.denoiseIterations = 1;
        n8ao.configuration.gammaCorrection = false;
        composer.addPass(n8ao);
        this.n8aoPass = n8ao;
        this.n8aoEnabled = true;
      } catch (err) {
        console.warn('[GameEngine] N8AOPostPass init failed, falling back to SSAOEffect:', err);
        const normalPass = new NormalPass(this.scene, this.camera);
        composer.addPass(normalPass);
        fallbackSsao = new SSAOEffect(this.camera, normalPass.texture, {
          intensity: 1.8,
          radius: 0.45,
          samples: 12,
        });
      }

      const effects = fallbackSsao
        ? [fallbackSsao, bloom, tiltShift, smaa]
        : [bloom, tiltShift, smaa];
      composer.addPass(new EffectPass(this.camera, ...effects));
      composer.setSize(w, h);
      this.n8aoPass?.setSize(w, h);

      this.composer = composer;
      this.bloom = bloom;
      this.tiltShift = tiltShift;
      return composer;
    } catch (err) {
      console.warn('[GameEngine] EffectComposer init failed, falling back to direct WebGLRenderer:', err);
      this.composerFailed = true;
      this.composer = null;
      this.bloom = null;
      this.tiltShift = null;
      this.n8aoPass = null;
      this.n8aoEnabled = false;
      return null;
    }
  }

  private shouldUseComposer(resolved: ResolvedQuality): boolean {
    if (this.composerFailed) return false;
    if (resolved === 'low') return false;
    // モバイルの標準画質（medium）では多数のFBOバインドが発生するEffectComposer/N8AOを避け、
    // ハードウェアMSAAダイレクト描画で高画質と高FPSを両立する。PC版は従来通り。
    if (this.isMobileDevice && resolved !== 'high') return false;
    return true;
  }

  private shouldEnableShadows(resolved: ResolvedQuality): boolean {
    if (resolved === 'low') return false;
    // モバイル標準（medium）では全シーン再描画のシャドウパスと全ピクセルシャドウ計算を省き、
    // 動的プレイヤー接地丸影＋1K PBR＋HDRI＋4x MSAA＋鮮やかな緑草で美しさと高FPSを両立する。
    // PC版（medium/high）およびモバイル手動highはリアルタイムシャドウを完全維持。
    if (this.isMobileDevice && resolved !== 'high') return false;
    return true;
  }

  public hasComposer(): boolean {
    return this.composer !== null;
  }

  public applyQuality(resolved: ResolvedQuality): void {
    this.quality = resolved;

    const enableShadows = this.shouldEnableShadows(resolved);
    const shadowChanged = this.renderer.shadowMap.enabled !== enableShadows;
    this.renderer.shadowMap.enabled = enableShadows;
    if (shadowChanged && enableShadows) {
      this.renderer.shadowMap.needsUpdate = true;
    }

    const isLow = resolved === 'low';
    const seenMats = new Set<THREE.Material>();
    this.scene.traverse((obj) => {
      if (!(obj as THREE.Mesh).isMesh) return;
      const mat = (obj as THREE.Mesh).material;
      const mats = Array.isArray(mat) ? mat : mat ? [mat] : [];
      for (const m of mats) {
        if (!m || seenMats.has(m)) continue;
        seenMats.add(m);

        if (m instanceof THREE.MeshStandardMaterial) {
          for (const tex of [m.map, m.normalMap, m.roughnessMap, m.emissiveMap]) {
            if (!tex) continue;
            if (tex.userData._origAniso === undefined) {
              tex.userData._origAniso = tex.anisotropy;
            }
            const origAniso = tex.userData._origAniso as number;
            const targetAniso = isLow ? Math.min(2, origAniso) : origAniso;
            if (tex.anisotropy !== targetAniso) {
              tex.anisotropy = targetAniso;
              tex.needsUpdate = true;
            }
          }
        }
        if (shadowChanged) m.needsUpdate = true;
      }
    });

    if (resolved === 'high') {
      this.pixelRatioCap = 1.5;
      this.ensureComposer();
      if (!this.hdriLoaded && !this.hdriLoadPromise) {
        void this.loadEnvironmentHdri(false, this.hdriUrls.day, this.hdriUrls.dusk);
      }
      if (this.n8aoPass) {
        this.n8aoPass.enabled = true;
        this.n8aoPass.configuration.halfRes = true;
        this.n8aoPass.configuration.aoSamples = 12;
        this.n8aoPass.configuration.denoiseSamples = 4;
        this.n8aoPass.configuration.denoiseIterations = 2;
      }
      this.tiltShift?.setBlurAmount(0.85);
      this.baseBloomIntensity = 0.32;
      this.n8aoEnabled = Boolean(this.n8aoPass && this.n8aoPass.enabled);
    } else if (resolved === 'medium') {
      if (!this.hdriLoaded && !this.hdriLoadPromise) {
        void this.loadEnvironmentHdri(false, this.hdriUrls.day, this.hdriUrls.dusk);
      }
      if (this.shouldUseComposer('medium')) {
        this.pixelRatioCap = 1.25;
        this.ensureComposer();
        if (this.n8aoPass) {
          this.n8aoPass.enabled = true;
          this.n8aoPass.configuration.halfRes = true;
          this.n8aoPass.configuration.aoSamples = 8;
          this.n8aoPass.configuration.denoiseSamples = 4;
          this.n8aoPass.configuration.denoiseIterations = 1;
        }
        this.tiltShift?.setBlurAmount(0.60);
        this.baseBloomIntensity = 0.28;
        this.n8aoEnabled = Boolean(this.n8aoPass && this.n8aoPass.enabled);
      } else {
        this.pixelRatioCap = 1.5;
        if (this.n8aoPass) {
          this.n8aoPass.enabled = false;
        }
        this.tiltShift?.setBlurAmount(0.0);
        this.baseBloomIntensity = 0.20;
        this.n8aoEnabled = false;
      }
    } else {
      this.pixelRatioCap = 1.25;
      if (!this.hdriLoaded && !this.hdriLoadPromise) {
        void this.loadEnvironmentHdri(false, this.hdriUrls.day, this.hdriUrls.dusk);
      }
      if (this.n8aoPass) {
        this.n8aoPass.enabled = false;
      }
      this.tiltShift?.setBlurAmount(0.0);
      this.baseBloomIntensity = 0.20;
      this.n8aoEnabled = false;
    }

    if (!this.feverVisualActive && this.bloom) {
      this.bloom.intensity = this.baseBloomIntensity;
    }
    this.onResize();
  }

  async loadEnvironmentHdri(
    skipOnLow = false,
    dayUrl = '/hdri/kloofendal_48d_partly_cloudy_puresky_1k.hdr',
    duskUrl = '/hdri/belfast_sunset_puresky_1k.hdr'
  ): Promise<boolean> {
    void skipOnLow;
    const resolvedDayUrl = resolveAssetUrl(dayUrl);
    const resolvedDuskUrl = resolveAssetUrl(duskUrl);
    this.hdriUrls = { day: resolvedDayUrl, dusk: resolvedDuskUrl };
    if (this.hdriLoaded) return true;
    if (this.hdriLoadPromise) return this.hdriLoadPromise;

    this.hdriLoadPromise = (async () => {
      let pmrem: THREE.PMREMGenerator | null = null;
      try {
        const rgbe = new RGBELoader();
        pmrem = new THREE.PMREMGenerator(this.renderer);
        pmrem.compileEquirectangularShader();

        const [dayHdr, duskHdr] = await Promise.all([
          withTimeout(rgbe.loadAsync(resolvedDayUrl), 20000, 'day HDRI'),
          withTimeout(rgbe.loadAsync(resolvedDuskUrl), 20000, 'dusk HDRI').catch(() => null),
        ]);

        const dayTarget = pmrem.fromEquirectangular(dayHdr);
        dayHdr.dispose();
        if (this.dayEnvTex) this.dayEnvTex.dispose();
        this.dayEnvTex = dayTarget.texture;

        if (duskHdr) {
          const duskTarget = pmrem.fromEquirectangular(duskHdr);
          duskHdr.dispose();
          if (this.duskEnvTex) this.duskEnvTex.dispose();
          this.duskEnvTex = duskTarget.texture;
        }

        pmrem.dispose();
        if (this.indoorMode && this.indoorEnvTex) {
          this.scene.environment = this.indoorEnvTex;
          this.scene.environmentIntensity = THREE.MathUtils.lerp(0.50, 0.54, this.currentBossMood);
        } else {
          this.scene.environment =
            this.currentBossMood > 0.5 && this.duskEnvTex ? this.duskEnvTex : this.dayEnvTex;
          this.scene.environmentIntensity = THREE.MathUtils.lerp(0.54, 0.76, this.currentBossMood);
        }
        this.hdriLoaded = true;
        return true;
      } catch {
        pmrem?.dispose();
        return false;
      } finally {
        this.hdriLoadPromise = null;
      }
    })();

    return this.hdriLoadPromise;
  }

  setIndoorMode(indoor: boolean): void {
    this.indoorMode = indoor;
    if (this.n8aoPass) {
      this.n8aoPass.configuration.aoRadius = indoor ? 0.85 : 0.55;
      this.n8aoPass.configuration.distanceFalloff = indoor ? 1.15 : 1.2;
      this.n8aoPass.configuration.intensity = indoor ? 3.85 : 3.2;
    }
    this.setBossMood(this.currentBossMood);
  }

  setBossMood(mood01: number): void {
    const t = THREE.MathUtils.clamp(mood01, 0, 1);
    this.currentBossMood = t;
    const useDusk = !this.indoorMode && t > 0.5 && this.duskEnvTex !== null;
    const desiredEnv = this.indoorMode
      ? this.indoorEnvTex ?? this.dayEnvTex
      : useDusk
        ? this.duskEnvTex
        : this.dayEnvTex;
    if (desiredEnv && this.scene.environment !== desiredEnv) {
      this.scene.environment = desiredEnv;
    }
    this.scene.environmentIntensity = this.indoorMode
      ? THREE.MathUtils.lerp(0.50, 0.54, t)
      : THREE.MathUtils.lerp(0.54, 0.76, t);
    this.renderer.toneMappingExposure = this.indoorMode
      ? THREE.MathUtils.lerp(0.99, 1.00, t)
      : THREE.MathUtils.lerp(0.98, 1.04, t);

    if (this.scene.fog instanceof THREE.FogExp2) {
      const baseFog = this.indoorMode ? this.indoorFogColor : this.dayFogColor;
      this.scene.fog.color.lerpColors(baseFog, this.duskFogColor, this.indoorMode ? t * 0.14 : t);
      this.scene.fog.density = this.indoorMode
        ? THREE.MathUtils.lerp(0.00034, 0.00028, t)
        : THREE.MathUtils.lerp(0.0020, 0.00075, t);
    }
  }

  onResize(): void {
    const w = window.innerWidth;
    const h = Math.max(1, window.innerHeight);
    this.viewportWidth = w;
    this.viewportHeight = h;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.pixelRatioCap));
    this.renderer.setSize(w, h);
    this.composer?.setSize(w, h);
    this.n8aoPass?.setSize(w, h);
  }

  triggerHitStop(seconds: number): void {
    this.hitStopTimer = Math.max(this.hitStopTimer, seconds);
  }

  consumeHitStop(rawDt: number): boolean {
    if (this.hitStopTimer > 0) {
      this.hitStopTimer = Math.max(0, this.hitStopTimer - rawDt);
      return true;
    }
    return false;
  }

  setFeverVisual(active: boolean, t: number): void {
    this.feverVisualActive = active;
    if (!this.shouldUseComposer(this.quality) || !this.composer) {
      return;
    }
    this.tiltShift?.setFeverPulse(active ? 0.65 + 0.35 * Math.sin(t * 7) : 0);
    if (this.bloom) {
      this.bloom.intensity = active ? 0.58 : this.baseBloomIntensity;
    }
  }

  renderMain(): void {
    this.renderer.info.reset();
    this.renderer.setRenderTarget(null);
    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, this.viewportWidth, this.viewportHeight);
    this.renderer.clear();
    if (!this.shouldUseComposer(this.quality) || !this.composer) {
      this.renderer.render(this.scene, this.camera);
    } else {
      try {
        this.composer.render();
      } catch (err) {
        console.warn(
          '[GameEngine] EffectComposer render failed, switching to direct WebGLRenderer:',
          err
        );
        this.composerFailed = true;
        this.n8aoEnabled = false;
        this.renderer.setRenderTarget(null);
        this.renderer.setScissorTest(false);
        this.renderer.setViewport(0, 0, this.viewportWidth, this.viewportHeight);
        this.renderer.clear();
        this.renderer.render(this.scene, this.camera);
      }
    }
  }
}
