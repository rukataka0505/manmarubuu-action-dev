import type { InputManager } from '../core/InputManager';
import type { HudSnapshot } from '../types';

const TOP_CAMERA_RATIO = 0.35;
const LANDSCAPE_TOP_CAMERA_RATIO = 0.24;
const LANDSCAPE_LEFT_ZONE_RATIO = 0.46;
const TAP_MAX_MS = 260;
const TAP_MAX_MOVE_PX = 18;
const TWO_FINGER_ACTIVATE_PX = 12;
const PUNICON_MAX_RADIUS = 54;
const PUNICON_DEADZONE = 0.12;
const PUNICON_DASH_RATIO = 0.72;

type PointerRole = 'pending_bottom' | 'pending_top' | 'punicon' | 'camera' | 'tap_candidate';

interface TrackedPointer {
  id: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  downTimeMs: number;
  maxMoveDist: number;
  role: PointerRole;
}

export class TouchControls {
  private input: InputManager;
  private root: HTMLDivElement;
  private surface: HTMLDivElement;
  private puniconEl: HTMLDivElement;
  private puniconLineEl: HTMLDivElement;
  private puniconKnobEl: HTMLDivElement;
  private tapRippleEl: HTMLDivElement;

  private pointers = new Map<number, TrackedPointer>();
  private puniconPointerId: number | null = null;
  private camPointerId: number | null = null;
  private twoFingerCamActive = false;
  private puniconOriginX = 0;
  private puniconOriginY = 0;
  private rippleTimer: number | null = null;

  private lastVisible = false;
  private disabled = false;
  private lastDisabled = false;

  constructor(container: HTMLElement, input: InputManager) {
    this.input = input;

    this.root = document.createElement('div');
    this.root.className = 'touch-controls hidden';
    this.root.dataset.role = 'touch-controls';

    this.surface = document.createElement('div');
    this.surface.className = 'touch-surface';
    this.surface.dataset.role = 'touch-surface';

    this.puniconEl = document.createElement('div');
    this.puniconEl.className = 'punicon hidden';
    this.puniconEl.dataset.role = 'punicon';

    const ringEl = document.createElement('div');
    ringEl.className = 'punicon-ring';

    this.puniconLineEl = document.createElement('div');
    this.puniconLineEl.className = 'punicon-line';

    this.puniconKnobEl = document.createElement('div');
    this.puniconKnobEl.className = 'punicon-knob';

    this.puniconEl.append(ringEl, this.puniconLineEl, this.puniconKnobEl);

    this.tapRippleEl = document.createElement('div');
    this.tapRippleEl.className = 'touch-tap-ripple hidden';
    this.tapRippleEl.dataset.role = 'touch-tap-ripple';

    this.root.append(this.surface, this.puniconEl, this.tapRippleEl);
    container.appendChild(this.root);

    this.bindEvents();
  }

  private bindEvents(): void {
    this.root.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });

    this.surface.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    this.surface.addEventListener('pointermove', (e) => this.onPointerMove(e));
    this.surface.addEventListener('pointerup', (e) => this.onPointerEnd(e, false));
    this.surface.addEventListener('pointercancel', (e) => this.onPointerEnd(e, true));
  }

  private onPointerDown(e: PointerEvent): void {
    if (this.disabled) return;
    if (
      e.target instanceof Element &&
      e.target.closest(
        'button, input, a, .hud-top-right, .tutorial-card, .tut-confirm-wrap, .reward-card-wrap, .tour-subtitle, .modal-backdrop, .portrait-lock-overlay'
      )
    ) {
      return;
    }

    e.preventDefault();
    this.trySetPointerCapture(this.surface, e.pointerId);
    this.input.setTouchDeviceActive();

    const now = performance.now();
    const isLandscape = window.innerWidth > window.innerHeight;
    const isTopZone =
      e.clientY < window.innerHeight * (isLandscape ? LANDSCAPE_TOP_CAMERA_RATIO : TOP_CAMERA_RATIO);
    const isRightZone = isLandscape && e.clientX >= window.innerWidth * LANDSCAPE_LEFT_ZONE_RATIO;

    let role: PointerRole = 'tap_candidate';
    if (this.twoFingerCamActive) {
      role = 'camera';
    } else if (isLandscape) {
      if (!isTopZone && !isRightZone && this.puniconPointerId === null) {
        role = 'pending_bottom';
        this.puniconPointerId = e.pointerId;
        this.showPuniconAt(e.clientX, e.clientY);
      } else if ((isTopZone || isRightZone) && this.camPointerId === null) {
        role = 'pending_top';
        this.camPointerId = e.pointerId;
      }
    } else if (this.pointers.size === 0) {
      if (!isTopZone && this.puniconPointerId === null) {
        role = 'pending_bottom';
        this.puniconPointerId = e.pointerId;
        this.showPuniconAt(e.clientX, e.clientY);
      } else if (isTopZone && this.camPointerId === null) {
        role = 'pending_top';
        this.camPointerId = e.pointerId;
      }
    }

    this.pointers.set(e.pointerId, {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      downTimeMs: now,
      maxMoveDist: 0,
      role,
    });
  }

  private onPointerMove(e: PointerEvent): void {
    if (this.disabled) return;
    const ptr = this.pointers.get(e.pointerId);
    if (!ptr) return;

    e.preventDefault();

    const stepDx = e.clientX - ptr.lastX;
    const stepDy = e.clientY - ptr.lastY;
    ptr.lastX = e.clientX;
    ptr.lastY = e.clientY;

    const distFromStart = Math.hypot(e.clientX - ptr.startX, e.clientY - ptr.startY);
    if (distFromStart > ptr.maxMoveDist) {
      ptr.maxMoveDist = distFromStart;
    }

    // Activate 2-finger camera only when punicon is not actively locked and BOTH fingers moved intentionally
    if (!this.twoFingerCamActive && this.pointers.size >= 2) {
      const isLandscape = window.innerWidth > window.innerHeight;
      const dualThumbPair =
        isLandscape && this.puniconPointerId !== null && this.camPointerId !== null;
      const puniconPtr =
        this.puniconPointerId !== null ? this.pointers.get(this.puniconPointerId) : undefined;
      const hasCommittedPunicon = puniconPtr?.role === 'punicon';
      const activeList = Array.from(this.pointers.values());
      const bothDragged = activeList.filter((p) => p.maxMoveDist >= TWO_FINGER_ACTIVATE_PX).length >= 2;
      if (!dualThumbPair && !hasCommittedPunicon && ptr.role !== 'tap_candidate' && bothDragged) {
        this.activateTwoFingerCamera();
      }
    }

    if (this.twoFingerCamActive) {
      if (stepDx !== 0 || stepDy !== 0) {
        this.input.addTouchCameraDelta(stepDx * 0.78, stepDy * 0.72);
      }
      return;
    }

    if (ptr.role === 'pending_bottom' || ptr.role === 'punicon') {
      if (ptr.role === 'pending_bottom' && ptr.maxMoveDist >= TAP_MAX_MOVE_PX) {
        ptr.role = 'punicon';
      }
      this.updatePuniconFromPoint(e.clientX, e.clientY);
      return;
    }

    if (ptr.role === 'pending_top' || ptr.role === 'camera') {
      if (ptr.maxMoveDist >= TAP_MAX_MOVE_PX) {
        ptr.role = 'camera';
      }
      if ((ptr.role === 'camera' || ptr.maxMoveDist >= 14) && (stepDx !== 0 || stepDy !== 0)) {
        this.input.addTouchCameraDelta(stepDx * 1.45, stepDy * 1.35);
      }
      return;
    }

    // Secondary tap candidate (while primary finger operates punicon): promote to camera on drag
    if (ptr.role === 'tap_candidate' && ptr.maxMoveDist >= TAP_MAX_MOVE_PX) {
      ptr.role = 'camera';
      if (this.camPointerId === null) {
        this.camPointerId = ptr.id;
      }
      if (stepDx !== 0 || stepDy !== 0) {
        this.input.addTouchCameraDelta(stepDx * 1.45, stepDy * 1.35);
      }
    }
  }

  private onPointerEnd(e: PointerEvent, cancelled: boolean): void {
    const ptr = this.pointers.get(e.pointerId);
    if (!ptr) return;

    e.preventDefault();
    this.tryReleasePointerCapture(this.surface, e.pointerId);
    this.pointers.delete(e.pointerId);

    const elapsed = performance.now() - ptr.downTimeMs;
    const isShortTap =
      !cancelled &&
      !this.disabled &&
      !this.twoFingerCamActive &&
      ptr.role !== 'punicon' &&
      ptr.role !== 'camera' &&
      ptr.maxMoveDist < TAP_MAX_MOVE_PX &&
      elapsed < TAP_MAX_MS;

    if (this.puniconPointerId === e.pointerId) {
      this.puniconPointerId = null;
      this.hidePunicon();
      this.input.setTouchMove(0, 0);
    }

    if (this.camPointerId === e.pointerId) {
      this.camPointerId = null;
    }

    if (this.twoFingerCamActive && this.pointers.size === 0) {
      this.twoFingerCamActive = false;
    }

    if (isShortTap) {
      this.input.queueTouchTapAction();
      this.triggerTapRipple(e.clientX, e.clientY);
    }
  }

  private activateTwoFingerCamera(): void {
    this.twoFingerCamActive = true;
    this.puniconPointerId = null;
    this.camPointerId = null;
    this.hidePunicon();
    this.input.setTouchMove(0, 0);
    for (const p of this.pointers.values()) {
      p.role = 'camera';
    }
  }

  private showPuniconAt(x: number, y: number): void {
    this.puniconOriginX = x;
    this.puniconOriginY = y;
    this.puniconEl.style.left = `${x.toFixed(1)}px`;
    this.puniconEl.style.top = `${y.toFixed(1)}px`;
    this.puniconEl.classList.remove('hidden', 'sprinting');
    this.puniconEl.classList.add('active');
    this.puniconKnobEl.style.transform = '';
    this.puniconLineEl.style.width = '0px';
    this.puniconLineEl.style.opacity = '0';
  }

  private updatePuniconFromPoint(clientX: number, clientY: number): void {
    const rawDx = clientX - this.puniconOriginX;
    const rawDy = clientY - this.puniconOriginY;
    const dist = Math.hypot(rawDx, rawDy);
    const clampedDist = Math.min(dist, PUNICON_MAX_RADIUS);
    const angleRad = dist > 0.0001 ? Math.atan2(rawDy, rawDx) : 0;
    const angleDeg = (angleRad * 180) / Math.PI;
    const knobX = Math.cos(angleRad) * clampedDist;
    const knobY = Math.sin(angleRad) * clampedDist;
    const ratio = clampedDist / PUNICON_MAX_RADIUS;

    const stretch = dist > 4 ? Math.min(0.24, ratio * 0.24) : 0;
    const sx = (1 + stretch).toFixed(3);
    const sy = (1 - stretch * 0.55).toFixed(3);
    this.puniconKnobEl.style.transform = `translate(${knobX.toFixed(1)}px, ${knobY.toFixed(1)}px) rotate(${angleDeg.toFixed(1)}deg) scale(${sx}, ${sy})`;

    if (clampedDist > 6) {
      this.puniconLineEl.style.width = `${clampedDist.toFixed(1)}px`;
      this.puniconLineEl.style.transform = `translateY(-50%) rotate(${angleDeg.toFixed(1)}deg)`;
      this.puniconLineEl.style.opacity = '1';
    } else {
      this.puniconLineEl.style.width = '0px';
      this.puniconLineEl.style.opacity = '0';
    }

    this.puniconEl.classList.toggle('sprinting', ratio >= PUNICON_DASH_RATIO);

    if (ratio < PUNICON_DEADZONE) {
      this.input.setTouchMove(0, 0);
    } else {
      this.input.setTouchMove(knobX / PUNICON_MAX_RADIUS, -knobY / PUNICON_MAX_RADIUS);
    }
  }

  private hidePunicon(): void {
    this.puniconEl.classList.add('hidden');
    this.puniconEl.classList.remove('active', 'sprinting');
    this.puniconKnobEl.style.transform = '';
    this.puniconLineEl.style.width = '0px';
    this.puniconLineEl.style.opacity = '0';
  }

  private triggerTapRipple(x: number, y: number): void {
    if (this.rippleTimer !== null) {
      window.clearTimeout(this.rippleTimer);
      this.rippleTimer = null;
    }
    this.tapRippleEl.style.left = `${x.toFixed(1)}px`;
    this.tapRippleEl.style.top = `${y.toFixed(1)}px`;
    this.tapRippleEl.classList.remove('hidden', 'animate');
    // Force reflow so rapid consecutive taps re-trigger the ripple animation cleanly
    void this.tapRippleEl.offsetWidth;
    this.tapRippleEl.classList.add('animate');
    this.rippleTimer = window.setTimeout(() => {
      this.tapRippleEl.classList.add('hidden');
      this.tapRippleEl.classList.remove('animate');
      this.rippleTimer = null;
    }, 340);
  }

  private resetAllControls(): void {
    for (const id of this.pointers.keys()) {
      this.tryReleasePointerCapture(this.surface, id);
    }
    this.pointers.clear();
    this.puniconPointerId = null;
    this.camPointerId = null;
    this.twoFingerCamActive = false;
    this.hidePunicon();
    this.tapRippleEl.classList.add('hidden');
    this.tapRippleEl.classList.remove('animate');
    this.input.clearTouchState();
  }

  private trySetPointerCapture(el: Element, pointerId: number): void {
    try {
      el.setPointerCapture(pointerId);
    } catch {
      // Ignore synthetic/unsupported pointer capture
    }
  }

  private tryReleasePointerCapture(el: Element, pointerId: number): void {
    try {
      if (el.hasPointerCapture(pointerId)) {
        el.releasePointerCapture(pointerId);
      }
    } catch {
      // Ignore synthetic/unsupported pointer capture
    }
  }

  public update(snap: HudSnapshot): void {
    const visible = snap.touchActive && snap.phase === 'playing';
    if (visible !== this.lastVisible) {
      this.lastVisible = visible;
      this.root.classList.toggle('hidden', !visible);
      if (!visible) {
        this.resetAllControls();
      }
    }

    if (!visible) return;

    const nextDisabled =
      snap.portraitBlocked ||
      snap.tutorialAwaitingConfirm ||
      snap.rewardCard !== null ||
      snap.tutorialStep === 7 ||
      snap.modalOpen ||
      snap.welcomeMovieActive ||
      snap.rainbowMovieActive;
    if (nextDisabled !== this.lastDisabled) {
      this.lastDisabled = nextDisabled;
      this.disabled = nextDisabled;
      this.root.classList.toggle('disabled', nextDisabled);
      if (nextDisabled) {
        this.resetAllControls();
      }
    }
  }
}
