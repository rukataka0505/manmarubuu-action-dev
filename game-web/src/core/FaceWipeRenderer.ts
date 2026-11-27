import * as THREE from 'three';
import type { AnimName, ExpressionName, ResolvedQuality } from '../types';
import type { ManmarubuuView } from '../character/ManmarubuuView';

const BG_BY_EXPRESSION: Record<ExpressionName, number> = {
  Sleep: 0xffe8cc,
  Happy: 0xfff3a8,
  Damage: 0xffb3c1,
  Pien: 0xbde4ff,
  Ganbaru: 0xffd6a5,
  Panic: 0xd0e8ff,
  Pout: 0xffcce0,
  Fever: 0xffa6eb,
};

interface CachedWipeRect {
  left: number;
  bottom: number;
  width: number;
  height: number;
  winH: number;
}

export class FaceWipeRenderer {
  private wipeScene = new THREE.Scene();
  private wipeCamera = new THREE.PerspectiveCamera(26, 1, 0.1, 15);
  private bgMat: THREE.MeshBasicMaterial;
  private bgMesh: THREE.Mesh;
  private lightKey: THREE.DirectionalLight;
  private avatarSource: ManmarubuuView | null = null;
  private cloneObj?: THREE.Object3D;
  private updateClonePose?: (dt: number, expr: ExpressionName, anim: AnimName) => void;
  private resetCloneNeutralPose?: (expr: ExpressionName) => void;
  private viewportEl: HTMLElement | null = null;
  private time = 0;
  private cachedRect: CachedWipeRect | null = null;
  private lastViewportW = 0;
  private lastViewportH = 0;
  private resizeObserver: ResizeObserver | null = null;
  private observedEl: HTMLElement | null = null;
  private quality: ResolvedQuality = 'medium';
  private poseAccum = 0;
  private readonly handleWindowResize = (): void => {
    this.cachedRect = null;
  };

  constructor() {
    this.wipeScene.background = null;

    const hemi = new THREE.HemisphereLight(0xfff9ee, 0xf2cfa8, 1.55);
    this.wipeScene.add(hemi);

    this.lightKey = new THREE.DirectionalLight(0xfff5dc, 1.9);
    this.lightKey.position.set(1.2, 1.6, 2.4);
    this.wipeScene.add(this.lightKey);

    const rim = new THREE.DirectionalLight(0xaaddff, 0.85);
    rim.position.set(-1.5, 1.2, -1.6);
    this.wipeScene.add(rim);

    // Circular pastel backdrop disc sized to cover the full circular badge frame
    this.bgMat = new THREE.MeshBasicMaterial({ color: 0xffe8cc, depthWrite: false });
    this.bgMesh = new THREE.Mesh(new THREE.CircleGeometry(1.95, 48), this.bgMat);
    this.bgMesh.position.set(0.0, 0.50, -1.2);
    this.wipeScene.add(this.bgMesh);

    // Front framing on Manmarubuu with comfortable margins around ears, hands & feet (model faces +Z in glTF Y-up)
    this.wipeCamera.fov = 29;
    this.wipeCamera.position.set(0.04, 0.52, 2.95);
    this.wipeCamera.lookAt(0, 0.50, 0);
    this.wipeCamera.updateProjectionMatrix();

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', this.handleWindowResize);
    }
  }

  setAvatarSource(view: ManmarubuuView): void {
    this.avatarSource = view;
  }

  ensureAttached(): void {
    if (!this.cloneObj && this.avatarSource) {
      this.attachClone(this.avatarSource.createWipeClone());
    }
  }

  hasClone(): boolean {
    return Boolean(this.cloneObj);
  }

  attachAvatar(view: ManmarubuuView): void {
    this.avatarSource = view;
    this.attachClone(view.createWipeClone());
  }

  attachClone(clone: ReturnType<ManmarubuuView['createWipeClone']>): void {
    if (this.cloneObj) {
      this.wipeScene.remove(this.cloneObj);
    }
    this.cloneObj = clone.root;
    this.updateClonePose = clone.updatePose;
    this.resetCloneNeutralPose = clone.resetNeutralPose;
    this.wipeScene.add(clone.root);
  }

  captureTransparentExpressionPng(expr: ExpressionName, size = 256): string | null {
    this.ensureAttached();
    if (!this.cloneObj || !this.resetCloneNeutralPose) return null;

    const hiSize = size * 2;
    const prevBgVisible = this.bgMesh.visible;
    const prevAspect = this.wipeCamera.aspect;
    const plushUniforms = this.avatarSource?.plushUniforms;
    const prevFeverStrength = plushUniforms ? plushUniforms.uFeverStrength.value : 0;
    const prevTime = plushUniforms ? plushUniforms.uTime.value : 0;

    let offscreen: THREE.WebGLRenderer | null = null;
    try {
      this.bgMesh.visible = false;
      this.resetCloneNeutralPose(expr);
      if (plushUniforms) {
        plushUniforms.uFeverStrength.value = expr === 'Fever' ? 1.0 : 0.0;
        plushUniforms.uTime.value = 1.4;
      }

      this.wipeCamera.aspect = 1;
      this.wipeCamera.updateProjectionMatrix();

      offscreen = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        preserveDrawingBuffer: true,
      });
      offscreen.setPixelRatio(1);
      offscreen.setSize(hiSize, hiSize, false);
      offscreen.outputColorSpace = THREE.SRGBColorSpace;
      offscreen.toneMapping = THREE.ACESFilmicToneMapping;
      offscreen.toneMappingExposure = 0.98;
      offscreen.setClearColor(0x000000, 0);
      offscreen.clear();
      offscreen.render(this.wipeScene, this.wipeCamera);

      const outCanvas = document.createElement('canvas');
      outCanvas.width = size;
      outCanvas.height = size;
      const ctx = outCanvas.getContext('2d');
      if (!ctx) return null;
      ctx.clearRect(0, 0, size, size);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(offscreen.domElement, 0, 0, size, size);
      return outCanvas.toDataURL('image/png');
    } finally {
      offscreen?.dispose();
      this.bgMesh.visible = prevBgVisible;
      this.wipeCamera.aspect = prevAspect;
      this.wipeCamera.updateProjectionMatrix();
      if (plushUniforms) {
        plushUniforms.uFeverStrength.value = prevFeverStrength;
        plushUniforms.uTime.value = prevTime;
      }
    }
  }

  setViewportElement(el: HTMLElement | null): void {
    this.viewportEl = el;
    this.observeElement(el);
    this.cachedRect = null;
  }

  invalidateRect(): void {
    this.cachedRect = null;
  }

  setQuality(resolved: ResolvedQuality): void {
    this.quality = resolved;
    this.poseAccum = 0;
  }

  private observeElement(el: HTMLElement | null): void {
    if (this.observedEl === el) return;
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    this.observedEl = el;
    this.cachedRect = null;
    if (el && typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.cachedRect = null;
      });
      this.resizeObserver.observe(el);
    }
  }

  private measureRect(el: HTMLElement): CachedWipeRect {
    const rect = el.getBoundingClientRect();
    const measured: CachedWipeRect = {
      left: rect.left,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
      winH: window.innerHeight,
    };
    this.cachedRect = measured;
    return measured;
  }

  render(
    renderer: THREE.WebGLRenderer,
    viewportEl: HTMLElement | null,
    dt: number,
    expr: ExpressionName,
    anim: AnimName,
    feverActive: boolean
  ): void {
    this.ensureAttached();
    const targetEl = viewportEl ?? this.viewportEl;
    if (!this.cloneObj || !this.updateClonePose || !targetEl) return;

    if (targetEl !== this.observedEl) {
      this.observeElement(targetEl);
    }

    let rect = this.cachedRect;
    if (!rect || rect.width < 10) {
      rect = this.measureRect(targetEl);
    }
    if (rect.width < 10 || rect.height < 10) return;

    this.time += dt;
    if (this.quality === 'low') {
      this.poseAccum += dt;
      if (this.poseAccum >= 1 / 30) {
        this.updateClonePose(this.poseAccum, expr, anim);
        this.poseAccum = 0;
      }
    } else {
      this.poseAccum = 0;
      this.updateClonePose(dt, expr, anim);
    }

    if (feverActive || expr === 'Fever') {
      const h = (this.time * 0.45) % 1;
      this.bgMat.color.setHSL(h, 0.82, 0.82);
    } else {
      const colHex = BG_BY_EXPRESSION[expr] ?? 0xffe8cc;
      if (this.bgMat.color.getHex() !== colHex) {
        this.bgMat.color.setHex(colHex);
      }
    }

    const canvasH = rect.winH;
    const x = Math.round(rect.left);
    const y = Math.round(canvasH - rect.bottom);
    const w = Math.round(rect.width);
    const h = Math.round(rect.height);

    if (w !== this.lastViewportW || h !== this.lastViewportH) {
      this.lastViewportW = w;
      this.lastViewportH = h;
      this.wipeCamera.aspect = w / Math.max(1, h);
      this.wipeCamera.updateProjectionMatrix();
    }

    renderer.setRenderTarget(null);
    renderer.setScissorTest(true);
    renderer.setViewport(x, y, w, h);
    renderer.setScissor(x, y, w, h);
    renderer.clearDepth();
    renderer.render(this.wipeScene, this.wipeCamera);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, window.innerWidth, Math.max(1, window.innerHeight));
  }
}
