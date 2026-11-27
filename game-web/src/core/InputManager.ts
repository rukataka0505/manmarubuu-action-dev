import type { InputDevice } from '../types';

export interface InputState {
  moveX: number; // -1..+1 (right positive)
  moveY: number; // -1..+1 (forward positive)
  camDeltaX: number;
  camDeltaY: number;
  jumpPressed: boolean;
  jumpHeld: boolean;
  hipDropPressed: boolean;
  touchTapActionPressed: boolean;
  feverPressed: boolean;
  pausePressed: boolean;
  confirmPressed: boolean;
  tutorialNextPressed: boolean;
  device: InputDevice;
  pointerLocked: boolean;
  cameraMoved: boolean;
}

export class InputManager {
  private keys = new Set<string>();
  private prevKeys = new Set<string>();
  private latchedKeys = new Set<string>();
  private mouseButtons = new Set<number>();
  private prevMouseButtons = new Set<number>();
  private latchedMouseButtons = new Set<number>();
  private mouseAccumX = 0;
  private mouseAccumY = 0;
  private dragging = false;
  private lastDevice: InputDevice = 'kbm';
  private pointerLocked = false;
  private canvas: HTMLCanvasElement;
  private prevPadButtons: boolean[] = [];
  private activeGamepadIndex: number | null = null;
  private onFirstGesture?: () => void;
  private firedFirstGesture = false;
  private cameraSensitivity = 1.0;
  private touchMoveX = 0;
  private touchMoveY = 0;
  private touchCamAccumX = 0;
  private touchCamAccumY = 0;
  private touchTapActionQueued = false;
  private touchFeverQueued = false;
  private touchPauseQueued = false;
  private recentTouchMs = 0;

  constructor(canvas: HTMLCanvasElement, onFirstGesture?: () => void) {
    this.canvas = canvas;
    this.onFirstGesture = onFirstGesture;
    this.bindEvents();
  }

  public setCameraSensitivity(val: number): void {
    if (!Number.isFinite(val)) return;
    this.cameraSensitivity = Math.min(2.0, Math.max(0.4, val));
  }

  public isTouchCapable(): boolean {
    return (
      typeof window !== 'undefined' &&
      ('ontouchstart' in window ||
        navigator.maxTouchPoints > 0 ||
        (typeof window.matchMedia === 'function' &&
          window.matchMedia('(pointer: coarse)').matches))
    );
  }

  public setTouchMove(x: number, y: number): void {
    this.notifyGesture();
    this.touchMoveX = Math.min(1, Math.max(-1, x));
    this.touchMoveY = Math.min(1, Math.max(-1, y));
    this.markTouchActivity();
  }

  public addTouchCameraDelta(dx: number, dy: number): void {
    this.notifyGesture();
    this.touchCamAccumX += dx;
    this.touchCamAccumY += dy;
    this.markTouchActivity();
  }

  public queueTouchTapAction(): void {
    this.notifyGesture();
    this.touchTapActionQueued = true;
    this.markTouchActivity();
  }

  public queueTouchFever(): void {
    this.notifyGesture();
    this.touchFeverQueued = true;
    this.markTouchActivity();
  }

  public queueTouchPause(): void {
    this.notifyGesture();
    this.touchPauseQueued = true;
    this.markTouchActivity();
  }

  public setTouchDeviceActive(): void {
    this.markTouchActivity();
  }

  private clearAllInputState(): void {
    this.keys.clear();
    this.latchedKeys.clear();
    this.mouseButtons.clear();
    this.latchedMouseButtons.clear();
    this.mouseAccumX = 0;
    this.mouseAccumY = 0;
    this.dragging = false;
    this.clearTouchState();
  }

  public clearTouchState(): void {
    this.touchMoveX = 0;
    this.touchMoveY = 0;
    this.touchCamAccumX = 0;
    this.touchCamAccumY = 0;
    this.touchTapActionQueued = false;
    this.touchFeverQueued = false;
    this.touchPauseQueued = false;
  }

  private markTouchActivity(): void {
    this.lastDevice = 'touch';
    this.recentTouchMs = performance.now();
  }

  private isRecentTouch(): boolean {
    return this.recentTouchMs > 0 && performance.now() - this.recentTouchMs < 500;
  }

  private notifyGesture(): void {
    if (!this.firedFirstGesture) {
      this.firedFirstGesture = true;
      this.onFirstGesture?.();
    }
  }

  private bindEvents(): void {
    window.addEventListener('keydown', (e) => {
      this.notifyGesture();
      if (
        ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)
      ) {
        e.preventDefault();
      }
      if (!e.repeat) {
        this.latchedKeys.add(e.code);
      }
      this.keys.add(e.code);
      this.lastDevice = 'kbm';
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });

    window.addEventListener('blur', () => {
      this.clearAllInputState();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.clearAllInputState();
      }
    });

    window.addEventListener(
      'touchstart',
      () => {
        this.notifyGesture();
        this.markTouchActivity();
      },
      { passive: true },
    );

    window.addEventListener(
      'pointerdown',
      (e) => {
        if (e.pointerType === 'touch') {
          this.notifyGesture();
          this.markTouchActivity();
        }
      },
      { passive: true },
    );

    this.canvas.addEventListener('mousedown', (e) => {
      if (this.isRecentTouch()) return;
      this.notifyGesture();
      this.mouseButtons.add(e.button);
      this.latchedMouseButtons.add(e.button);
      this.lastDevice = 'kbm';
      if (e.button === 0) {
        this.dragging = true;
      }
    });

    window.addEventListener('mouseup', (e) => {
      this.mouseButtons.delete(e.button);
      if (e.button === 0) {
        this.dragging = false;
      }
    });

    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (this.isRecentTouch()) return;
      if (document.pointerLockElement === this.canvas) {
        this.mouseAccumX += e.movementX;
        this.mouseAccumY += e.movementY;
        this.lastDevice = 'kbm';
      } else if (this.dragging) {
        this.mouseAccumX += e.movementX * 1.15;
        this.mouseAccumY += e.movementY * 1.15;
        this.lastDevice = 'kbm';
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.canvas;
    });

    window.addEventListener('gamepadconnected', (e) => {
      this.activeGamepadIndex = e.gamepad.index;
    });
  }

  requestPointerLock(): void {
    if (this.lastDevice === 'touch' || this.isTouchCapable()) return;
    if (document.pointerLockElement !== this.canvas && this.canvas.requestPointerLock) {
      try {
        const res = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
        if (res && typeof res.catch === 'function') {
          res.catch(() => {});
        }
      } catch {
        // Ignore in headless/sandbox
      }
    }
  }

  exitPointerLock(): void {
    if (document.pointerLockElement && document.exitPointerLock) {
      try {
        document.exitPointerLock();
      } catch {
        // Ignore
      }
    }
  }

  rumble(durationMs: number, weak: number, strong: number): void {
    if (this.lastDevice !== 'gamepad') return;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = this.activeGamepadIndex !== null ? pads[this.activeGamepadIndex] : pads.find(Boolean);
    const act = (pad as Gamepad & { vibrationActuator?: { playEffect: (t: string, p: unknown) => Promise<string> } })?.vibrationActuator;
    if (act && typeof act.playEffect === 'function') {
      act
        .playEffect('dual-rumble', {
          startDelay: 0,
          duration: durationMs,
          weakMagnitude: Math.min(1, Math.max(0, weak)),
          strongMagnitude: Math.min(1, Math.max(0, strong)),
        })
        .catch(() => {});
    }
  }

  poll(dt: number): InputState {
    // Keyboard movement
    let moveX = 0;
    let moveY = 0;
    if (this.keys.has('KeyA')) moveX -= 1;
    if (this.keys.has('KeyD')) moveX += 1;
    if (this.keys.has('KeyW')) moveY += 1;
    if (this.keys.has('KeyS')) moveY -= 1;

    // Arrow keys also rotate camera nicely when playing on laptop without mouse
    let camDeltaX = this.mouseAccumX * 0.0032;
    let camDeltaY = this.mouseAccumY * 0.0026;
    this.mouseAccumX = 0;
    this.mouseAccumY = 0;

    if (this.keys.has('ArrowLeft')) {
      camDeltaX -= 2.2 * dt;
      this.lastDevice = 'kbm';
    }
    if (this.keys.has('ArrowRight')) {
      camDeltaX += 2.2 * dt;
      this.lastDevice = 'kbm';
    }
    if (this.keys.has('ArrowUp')) {
      camDeltaY -= 1.6 * dt;
      this.lastDevice = 'kbm';
    }
    if (this.keys.has('ArrowDown')) {
      camDeltaY += 1.6 * dt;
      this.lastDevice = 'kbm';
    }

    const justKey = (code: string) =>
      (this.keys.has(code) && !this.prevKeys.has(code)) || this.latchedKeys.has(code);
    const justMouse = (btn: number) =>
      (this.mouseButtons.has(btn) && !this.prevMouseButtons.has(btn)) ||
      this.latchedMouseButtons.has(btn);

    let jumpHeld = this.keys.has('Space') || this.latchedKeys.has('Space');
    let jumpPressed = justKey('Space');
    let hipDropPressed =
      justKey('ControlLeft') || justKey('ControlRight') || justKey('KeyE') || justMouse(2);
    let feverPressed = justKey('KeyQ');
    let pausePressed = justKey('Escape');
    let confirmPressed = justKey('Enter') || justKey('Space');
    let tutorialNextPressed = justKey('Enter') || justKey('NumpadEnter');

    // Gamepad polling
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let pad: Gamepad | null = null;
    for (const p of pads) {
      if (p && p.connected) {
        pad = p;
        this.activeGamepadIndex = p.index;
        break;
      }
    }

    if (pad) {
      const lx = Math.abs(pad.axes[0] ?? 0) > 0.16 ? pad.axes[0] : 0;
      const ly = Math.abs(pad.axes[1] ?? 0) > 0.16 ? -(pad.axes[1] ?? 0) : 0;
      const rx = Math.abs(pad.axes[2] ?? 0) > 0.16 ? pad.axes[2] : 0;
      const ry = Math.abs(pad.axes[3] ?? 0) > 0.16 ? pad.axes[3] : 0;

      if (lx !== 0 || ly !== 0) {
        moveX = lx;
        moveY = ly;
        this.lastDevice = 'gamepad';
      }
      if (rx !== 0 || ry !== 0) {
        camDeltaX += rx * 2.6 * dt;
        camDeltaY += ry * 1.9 * dt;
        this.lastDevice = 'gamepad';
      }

      const btn = (idx: number) => Boolean(pad?.buttons[idx]?.pressed);
      const justBtn = (idx: number) => btn(idx) && !this.prevPadButtons[idx];

      if (pad.buttons.some((b) => b.pressed)) {
        this.lastDevice = 'gamepad';
      }

      if (btn(0)) jumpHeld = true;
      if (justBtn(0)) {
        jumpPressed = true;
        confirmPressed = true;
        tutorialNextPressed = true;
      }
      if (justBtn(1)) hipDropPressed = true;
      if (justBtn(4) || justBtn(5)) feverPressed = true;
      if (justBtn(9)) pausePressed = true;

      this.prevPadButtons = pad.buttons.map((b) => b.pressed);
    } else {
      this.prevPadButtons = [];
    }

    // Touch input integration
    if (this.touchMoveX !== 0 || this.touchMoveY !== 0) {
      moveX += this.touchMoveX;
      moveY += this.touchMoveY;
    }

    camDeltaX += this.touchCamAccumX * 0.0068;
    camDeltaY += this.touchCamAccumY * 0.0048;

    camDeltaX *= this.cameraSensitivity;
    camDeltaY *= this.cameraSensitivity;

    const touchTapActionPressed = this.touchTapActionQueued;
    feverPressed = feverPressed || this.touchFeverQueued;
    pausePressed = pausePressed || this.touchPauseQueued;

    const len = Math.hypot(moveX, moveY);
    if (len > 1) {
      moveX /= len;
      moveY /= len;
    }

    this.prevKeys = new Set(this.keys);
    this.prevMouseButtons = new Set(this.mouseButtons);
    this.latchedKeys.clear();
    this.latchedMouseButtons.clear();
    this.touchTapActionQueued = false;
    this.touchFeverQueued = false;
    this.touchPauseQueued = false;
    this.touchCamAccumX = 0;
    this.touchCamAccumY = 0;

    return {
      moveX,
      moveY,
      camDeltaX,
      camDeltaY,
      jumpPressed,
      jumpHeld,
      hipDropPressed,
      touchTapActionPressed,
      feverPressed,
      pausePressed,
      confirmPressed,
      tutorialNextPressed,
      device: this.lastDevice,
      pointerLocked: this.pointerLocked,
      cameraMoved: Math.abs(camDeltaX) + Math.abs(camDeltaY) > 0.002,
    };
  }
}
