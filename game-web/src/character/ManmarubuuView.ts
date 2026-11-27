import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { AnimName, ExpressionName } from '../types';
import { enhancePlushMaterial, type PlushUniforms } from '../assets/PlushShader';
import { fetchWithTimeout, resolveAssetUrl, withTimeout } from '../assets/AssetLoaderUtils';
import { isMobileDefaultDevice } from '../core/SettingsStore';

type PresetsMap = Record<ExpressionName, string[]>;

const FALLBACK_PRESETS: PresetsMap = {
  Sleep: ['Face_Eyes_Sleep', 'Face_Mouth_Default'],
  Happy: ['Face_Eyes_Happy', 'Face_Mouth_Happy', 'Face_Blush_Hatched'],
  Damage: ['Face_Eyes_Damage', 'Face_Mouth_Wavy', 'Face_Blush_Strong', 'Face_Tears_Damage'],
  Pien: ['Face_Eyes_Pien', 'Face_Brow_Pien', 'Face_Mouth_Sad', 'Face_Blush_Warm', 'Face_Tears_Pien'],
  Ganbaru: ['Face_Eyes_Ganbaru', 'Face_Brow_Ganbaru', 'Face_Mouth_Omega'],
  Panic: ['Face_Eyes_Panic', 'Face_Mouth_Surprise', 'Face_Blush_Hatched', 'Face_Sweat_Panic'],
  Pout: ['Face_Eyes_Pout', 'Face_Mouth_Sad', 'Face_Cheeks_Puff', 'Face_Blush_Puff'],
  Fever: ['Face_Eyes_Happy', 'Face_Mouth_Fever', 'Face_Blush_Strong', 'Face_Sparkles_Fever'],
};

const NON_LOOP_ANIMS = new Set<AnimName>([
  'Brake',
  'Turn',
  'JumpStart',
  'DoubleJump',
  'StompBounce',
  'Land',
  'TrampolineFly',
  'HipDropStart',
  'HipDropSlam',
  'WallBounce',
  'FeverBurst',
  'Damage',
  'Recover',
]);

export class ManmarubuuView {
  public readonly root = new THREE.Group();
  public readonly modelContainer = new THREE.Group();
  public modelRoot!: THREE.Object3D;
  private mixer!: THREE.AnimationMixer;
  private actions = new Map<AnimName, THREE.AnimationAction>();
  private currentAnim: AnimName = 'Idle';
  private currentExpr: ExpressionName = 'Sleep';
  private faceMeshes = new Map<string, THREE.Object3D>();
  private presets: PresetsMap = FALLBACK_PRESETS;

  // Secondary bone wobble
  private earL?: THREE.Object3D;
  private earR?: THREE.Object3D;
  private tail?: THREE.Object3D;
  private readonly wobbleQuat = new THREE.Quaternion();
  private readonly wobbleEuler = new THREE.Euler();

  // Squash & Stretch spring state
  private scaleY = 1.0;
  private scaleYVel = 0.0;
  private targetScaleY = 1.0;
  private wobblePhase = 0;

  // Plush shader uniforms
  public readonly plushUniforms: PlushUniforms = {
    uRimColor: { value: new THREE.Color(0xfff1c9) },
    uRimStrength: { value: 0.42 },
    uFeverStrength: { value: 0.0 },
    uTime: { value: 0.0 },
  };

  private plushMaterials: THREE.MeshStandardMaterial[] = [];
  private lastEmissiveMode: 'none' | 'fever' | 'hit' = 'none';
  private hitFlashTimer = 0;

  constructor() {
    this.root.add(this.modelContainer);
  }

  async load(modelUrl = './models/manmarubuu_animated.glb'): Promise<void> {
    const loader = new GLTFLoader();
    const effectiveUrl =
      isMobileDefaultDevice() && modelUrl === './models/manmarubuu_animated.glb'
        ? './models/mobile/manmarubuu_animated_mobile.glb'
        : modelUrl;
    const loadPresets = async (): Promise<PresetsMap> => {
      try {
        const res = await fetchWithTimeout('./models/expressions_presets.json', 10000);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const json = (await res.json()) as Partial<PresetsMap>;
        return { ...FALLBACK_PRESETS, ...json };
      } catch (err) {
        console.warn('[ManmarubuuView] Failed to load expression presets, using fallback:', err);
        return FALLBACK_PRESETS;
      }
    };

    const loadModelWithFallback = async () => {
      const candidates = Array.from(
        new Set([
          resolveAssetUrl(effectiveUrl),
          resolveAssetUrl(modelUrl),
          resolveAssetUrl('./models/manmarubuu_animated.glb'),
        ])
      );
      let lastErr: unknown;
      for (const candidate of candidates) {
        try {
          return await withTimeout(loader.loadAsync(candidate), 30000, `hero model (${candidate})`);
        } catch (err) {
          lastErr = err;
        }
      }
      throw lastErr;
    };
    const [presets, gltf] = await Promise.all([loadPresets(), loadModelWithFallback()]);
    this.presets = presets;

    this.modelRoot = gltf.scene;
    this.modelContainer.add(this.modelRoot);

    // Setup materials, cast/receive shadows, collect face meshes and secondary bones
    this.modelRoot.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.castShadow = !mesh.name.startsWith('Face_');
        mesh.receiveShadow = true;

        if (mesh.name.startsWith('Face_')) {
          this.faceMeshes.set(mesh.name, mesh);
        } else if (mesh.name === 'Plush' && mesh.material instanceof THREE.MeshStandardMaterial) {
          enhancePlushMaterial(mesh.material, this.plushUniforms);
          this.plushMaterials.push(mesh.material);
        }
      }
      if (obj.name === 'Ear.L') this.earL = obj;
      if (obj.name === 'Ear.R') this.earR = obj;
      if (obj.name === 'Tail') this.tail = obj;
    });

    // Setup AnimationMixer with all 20 clips
    this.mixer = new THREE.AnimationMixer(this.modelRoot);
    for (const clip of gltf.animations) {
      const name = clip.name as AnimName;
      const action = this.mixer.clipAction(clip);
      if (NON_LOOP_ANIMS.has(name)) {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      } else {
        action.setLoop(THREE.LoopRepeat, Infinity);
      }
      this.actions.set(name, action);
    }

    const idle = this.actions.get('Idle');
    if (idle) {
      idle.play();
    }
    this.setExpression('Sleep', true);
  }

  /** Creates a lightweight GPU-shared clone for the bottom-left 3D Live Face Wipe camera. */
  createWipeClone(): {
    root: THREE.Object3D;
    setExpression: (name: ExpressionName) => void;
    updatePose: (dt: number, expr: ExpressionName, anim: AnimName) => void;
    resetNeutralPose: (expr: ExpressionName) => void;
  } {
    const cloned = cloneSkeleton(this.modelRoot);
    const cloneFaces = new Map<string, THREE.Object3D>();
    let cloneHead: THREE.Object3D | undefined;
    let cloneEarL: THREE.Object3D | undefined;
    let cloneEarR: THREE.Object3D | undefined;
    let cloneArmL: THREE.Object3D | undefined;
    let cloneArmR: THREE.Object3D | undefined;
    let cloneBelly: THREE.Object3D | undefined;

    cloned.traverse((obj) => {
      if (obj.name.startsWith('Face_')) {
        cloneFaces.set(obj.name, obj);
      }
      if ((obj as THREE.Mesh).isMesh) {
        const m = obj as THREE.Mesh;
        m.castShadow = false;
        m.receiveShadow = false;
        m.frustumCulled = false;
      }
      if (obj.name === 'Head') cloneHead = obj;
      if (obj.name === 'Ear.L') cloneEarL = obj;
      if (obj.name === 'Ear.R') cloneEarR = obj;
      if (obj.name === 'Arm.L') cloneArmL = obj;
      if (obj.name === 'Arm.R') cloneArmR = obj;
      if (obj.name === 'Belly') cloneBelly = obj;
    });

    const presets = this.presets ?? FALLBACK_PRESETS;
    let lastExpr: ExpressionName | null = null;
    const setExpr = (name: ExpressionName) => {
      if (lastExpr === name) return;
      lastExpr = name;
      const active = new Set(presets[name] ?? presets.Sleep);
      for (const [partName, mesh] of cloneFaces) {
        mesh.visible = active.has(partName);
      }
    };
    setExpr('Sleep');

    let t = 0;
    const baseHeadQuat = cloneHead ? cloneHead.quaternion.clone() : new THREE.Quaternion();
    const baseEarLQuat = cloneEarL ? cloneEarL.quaternion.clone() : new THREE.Quaternion();
    const baseEarRQuat = cloneEarR ? cloneEarR.quaternion.clone() : new THREE.Quaternion();
    const baseArmLQuat = cloneArmL ? cloneArmL.quaternion.clone() : new THREE.Quaternion();
    const baseArmRQuat = cloneArmR ? cloneArmR.quaternion.clone() : new THREE.Quaternion();
    const qTmp = new THREE.Quaternion();
    const eTmp = new THREE.Euler();

    const updatePose = (dt: number, expr: ExpressionName, anim: AnimName) => {
      t += dt;
      setExpr(expr);

      // Lively portrait reactions per expression/action so the live wipe feels alive!
      let headPitch = 0;
      let headYaw = 0;
      let headRoll = 0;
      let earFlap = 0;
      let armWave = 0;
      let bobY = 0;

      if (expr === 'Happy' || expr === 'Fever') {
        bobY = Math.abs(Math.sin(t * 7.5)) * 0.035;
        headRoll = Math.sin(t * 5.2) * 0.1;
        earFlap = Math.sin(t * 9.0) * 0.10;
        armWave = 0.45 + Math.sin(t * 9.0) * 0.25;
      } else if (expr === 'Damage' || expr === 'Pien') {
        headRoll = Math.sin(t * 18.0) * 0.07;
        headPitch = 0.08 + Math.sin(t * 8.0) * 0.05;
        earFlap = -0.09 + Math.sin(t * 14.0) * 0.05;
      } else if (expr === 'Panic') {
        headYaw = Math.sin(t * 13.0) * 0.14;
        earFlap = Math.sin(t * 18.0) * 0.11;
        armWave = Math.sin(t * 15.0) * 0.35;
      } else if (expr === 'Ganbaru') {
        bobY = Math.abs(Math.sin(t * 10.0)) * 0.025;
        headPitch = -0.06;
        earFlap = -0.07 + Math.sin(t * 11.0) * 0.06;
      } else if (expr === 'Pout') {
        headYaw = 0.12;
        headRoll = -0.10;
        earFlap = -0.05;
      } else {
        // Sleep gentle breathing
        bobY = Math.sin(t * 2.4) * 0.014;
        headRoll = Math.sin(t * 1.4) * 0.05;
        earFlap = Math.sin(t * 2.4) * 0.04;
      }

      if (anim === 'RollSpin' || anim === 'DoubleJump') {
        headRoll += Math.sin(t * 14.0) * 0.14;
      }

      cloned.position.y = bobY;
      if (cloneHead) {
        eTmp.set(headPitch, headYaw, headRoll);
        qTmp.setFromEuler(eTmp);
        cloneHead.quaternion.copy(baseHeadQuat).multiply(qTmp);
      }
      if (cloneEarL) {
        eTmp.set(0, 0, earFlap);
        cloneEarL.quaternion.copy(baseEarLQuat).multiply(qTmp.setFromEuler(eTmp));
      }
      if (cloneEarR) {
        eTmp.set(0, 0, -earFlap);
        cloneEarR.quaternion.copy(baseEarRQuat).multiply(qTmp.setFromEuler(eTmp));
      }
      if (cloneArmL) {
        eTmp.set(0, 0, armWave);
        cloneArmL.quaternion.copy(baseArmLQuat).multiply(qTmp.setFromEuler(eTmp));
      }
      if (cloneArmR) {
        eTmp.set(0, 0, -armWave);
        cloneArmR.quaternion.copy(baseArmRQuat).multiply(qTmp.setFromEuler(eTmp));
      }
      if (cloneBelly) {
        const s = 1 + bobY * 0.6;
        cloneBelly.scale.set(1 / Math.sqrt(s), s, 1 / Math.sqrt(s));
      }
    };

    const resetNeutralPose = (expr: ExpressionName) => {
      setExpr(expr);
      cloned.position.set(0, 0, 0);
      if (cloneHead) cloneHead.quaternion.copy(baseHeadQuat);
      if (cloneEarL) cloneEarL.quaternion.copy(baseEarLQuat);
      if (cloneEarR) cloneEarR.quaternion.copy(baseEarRQuat);
      if (cloneArmL) cloneArmL.quaternion.copy(baseArmLQuat);
      if (cloneArmR) cloneArmR.quaternion.copy(baseArmRQuat);
      if (cloneBelly) cloneBelly.scale.set(1, 1, 1);
      cloned.updateMatrixWorld(true);
    };

    return { root: cloned, setExpression: setExpr, updatePose, resetNeutralPose };
  }

  setExpression(name: ExpressionName, force = false): void {
    if (!force && this.currentExpr === name) return;
    this.currentExpr = name;
    const presets = this.presets ?? FALLBACK_PRESETS;
    const active = new Set(presets[name] ?? presets.Sleep);
    for (const [partName, mesh] of this.faceMeshes) {
      mesh.visible = active.has(partName);
    }
  }

  getExpression(): ExpressionName {
    return this.currentExpr;
  }

  playAnimation(name: AnimName, fadeSec = 0.12, timeScale = 1.0): void {
    const nextAction = this.actions.get(name);
    if (!nextAction) return;

    if (this.currentAnim === name) {
      nextAction.timeScale = timeScale;
      return;
    }

    const prevAction = this.actions.get(this.currentAnim);
    this.currentAnim = name;

    nextAction.reset();
    nextAction.enabled = true;
    nextAction.timeScale = timeScale;
    nextAction.setEffectiveWeight(1.0);
    nextAction.play();

    if (prevAction && prevAction !== nextAction) {
      prevAction.crossFadeTo(nextAction, fadeSec, false);
    }
  }

  getAnimation(): AnimName {
    return this.currentAnim;
  }

  getLoadedClipNames(): string[] {
    return Array.from(this.actions.keys());
  }

  getBlushVisibility(): Record<string, boolean> {
    const res: Record<string, boolean> = {};
    for (const [name, obj] of this.faceMeshes) {
      if (name.startsWith('Face_Blush_')) {
        res[name] = obj.visible;
      }
    }
    return res;
  }

  triggerSquash(scaleY: number): void {
    this.scaleY = scaleY;
  }

  triggerHitFlash(seconds = 0.14): void {
    this.hitFlashTimer = seconds;
  }

  update(
    dt: number,
    horizSpeed: number,
    vertSpeed: number,
    feverActive: boolean,
    invulnTimer: number
  ): void {
    this.plushUniforms.uTime.value += dt;
    this.plushUniforms.uFeverStrength.value = THREE.MathUtils.lerp(
      this.plushUniforms.uFeverStrength.value,
      feverActive ? 1.0 : 0.0,
      Math.min(1, dt * 8)
    );

    if (this.mixer) {
      this.mixer.update(dt);
    }

    // Real-time Squash & Stretch spring damper (volume-preserving)
    const stiffness = 190;
    const damping = 16;
    const force = (this.targetScaleY - this.scaleY) * stiffness - this.scaleYVel * damping;
    this.scaleYVel += force * dt;
    this.scaleY = THREE.MathUtils.clamp(this.scaleY + this.scaleYVel * dt, 0.56, 1.42);
    const radial = 1.0 / Math.sqrt(Math.max(0.45, this.scaleY));
    this.modelContainer.scale.set(radial, this.scaleY, radial);

    // Secondary motion overlap on ears & tail driven by velocity
    this.wobblePhase += dt * (4.0 + horizSpeed * 1.15);
    const earLag = THREE.MathUtils.clamp(-vertSpeed * 0.010, -0.13, 0.13);
    const earFlutter = Math.sin(this.wobblePhase) * Math.min(0.075, 0.015 + horizSpeed * 0.008);

    if (this.earL) {
      this.wobbleEuler.set(0, 0, earLag + earFlutter);
      this.earL.quaternion.multiply(this.wobbleQuat.setFromEuler(this.wobbleEuler));
    }
    if (this.earR) {
      this.wobbleEuler.set(0, 0, -earLag - earFlutter);
      this.earR.quaternion.multiply(this.wobbleQuat.setFromEuler(this.wobbleEuler));
    }
    if (this.tail) {
      const wag = Math.sin(this.wobblePhase * 1.6) * (0.12 + Math.min(0.28, horizSpeed * 0.03));
      this.wobbleEuler.set(0, wag, 0);
      this.tail.quaternion.multiply(this.wobbleQuat.setFromEuler(this.wobbleEuler));
    }

    // Hit flash & invulnerability blink
    let nextMode: 'none' | 'fever' | 'hit';
    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer -= dt;
      nextMode = 'hit';
    } else if (feverActive) {
      nextMode = 'fever';
    } else {
      nextMode = 'none';
    }

    if (nextMode !== this.lastEmissiveMode) {
      this.lastEmissiveMode = nextMode;
      const hex = nextMode === 'hit' ? 0xffffff : nextMode === 'fever' ? 0xffdd77 : 0x000000;
      const intensity = nextMode === 'hit' ? 0.65 : nextMode === 'fever' ? 0.12 : 0.0;
      for (const m of this.plushMaterials) {
        m.emissive.setHex(hex);
        m.emissiveIntensity = intensity;
      }
    }

    const nextVisible = invulnTimer > 0 ? Math.floor(invulnTimer * 18) % 2 === 0 : true;
    if (this.root.visible !== nextVisible) {
      this.root.visible = nextVisible;
    }
  }
}
