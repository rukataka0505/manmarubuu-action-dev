import * as THREE from 'three';
import type { InputState } from '../core/InputManager';
import type { PhysicsWorld, DynamicBodyRecord } from '../core/PhysicsWorld';
import type { SoundEngine } from '../audio/SoundEngine';
import type { AnimName, ExpressionName } from '../types';
import { ManmarubuuView } from './ManmarubuuView';
import { EXPRESSION_LABELS_JA, resolveExpression } from './ExpressionLogic';

export interface PlayerCallbacks {
  onHipDropImpact: (pos: THREE.Vector3) => void;
  onJumpParticle: (pos: THREE.Vector3, doubleJump: boolean) => void;
  onLandParticle: (pos: THREE.Vector3, heavy: boolean) => void;
  onDashDust: (pos: THREE.Vector3) => void;
  onDamageTaken: (pos: THREE.Vector3) => void;
  onFellOut: (pos: THREE.Vector3, remainingHp: number) => void;
  onGameOver: (cause: 'damage' | 'fall') => void;
  onDynamicHit: (rec: DynamicBodyRecord, speed: number) => void;
}

export class ManmarubuuController {
  public readonly view: ManmarubuuView;
  public readonly pos = new THREE.Vector3(0, 1.2, 42);
  public readonly vel = new THREE.Vector3();
  public facingYaw = Math.PI; // Facing -Z (north toward Castle)
  public grounded = false;
  public onSlide = false;
  public hp = 3;
  public maxHp = 3;

  // Gameplay counters & states
  public jumpCount = 0;
  public stompCombo = 0;
  public hipDropState: 'none' | 'windup' | 'diving' | 'recovery' = 'none';
  public trampolineTimer = 0;
  public invulnTimer = 0;
  public damageAnimTimer = 0;
  public happyTimer = 0;
  public bossIntroPienTimer = 0;
  public feverBurstTimer = 0;
  public isVictory = false;
  public isCutsceneStar = false;
  public idleSec = 0;
  public damageTakenCount = 0;
  public stepMadeJump = false;
  public stepMadeDoubleJump = false;
  public stepMadeHipDrop = false;
  public isDead = false;
  public fallOutEnabled = true;
  public safeFloorBounds: { minX: number; maxX: number; minZ: number; maxZ: number } | null = null;

  private lastSlideDir = { x: 0.30, z: -0.95 };
  private coyoteTimer = 0;
  private jumpBufferTimer = 0;
  private jumpBufferFromTap = false;
  private tapJumpHoldTimer = 0;
  private hipDropTimer = 0;
  private landAnimTimer = 0;
  private brakeTimer = 0;
  private turnTimer = 0;
  private recoverTimer = 0;
  private dustCooldown = 0;
  private prevMoveDir = new THREE.Vector3(0, 0, -1);
  private lastSafePos = new THREE.Vector3(0, 1.2, 42);
  private checkpointPos = new THREE.Vector3(0, 1.2, 42);
  private checkpointYaw = Math.PI;
  private wasGrounded = false;
  private nearLedge = false;
  private ledgeCheckTimer = 0;
  private readonly tmpLedgePos = new THREE.Vector3();

  private callbacks: PlayerCallbacks;
  private sound: SoundEngine;

  constructor(view: ManmarubuuView, sound: SoundEngine, callbacks: PlayerCallbacks) {
    this.view = view;
    this.sound = sound;
    this.callbacks = callbacks;
  }

  setCheckpoint(pos: THREE.Vector3, yaw = Math.PI): void {
    this.checkpointPos.copy(pos);
    this.checkpointYaw = yaw;
    this.lastSafePos.copy(pos);
  }

  getCheckpointPos(): THREE.Vector3 {
    return this.checkpointPos.clone();
  }

  getCheckpointYaw(): number {
    return this.checkpointYaw;
  }

  teleport(physics: PhysicsWorld, pos: THREE.Vector3, yaw?: number): void {
    this.pos.copy(pos);
    this.vel.set(0, 0, 0);
    this.grounded = false;
    this.hipDropState = 'none';
    this.tapJumpHoldTimer = 0;
    this.jumpBufferFromTap = false;
    this.trampolineTimer = 0;
    if (yaw !== undefined) this.facingYaw = yaw;
    physics.setPlayerPosition(pos.x, pos.y, pos.z);
    this.syncViewTransform();
  }

  bounceUp(heightVel: number, isStomp = false, isTrampoline = false): void {
    this.vel.y = heightVel;
    this.grounded = false;
    this.hipDropState = 'none';
    this.tapJumpHoldTimer = 0;
    this.jumpBufferFromTap = false;
    this.jumpCount = 1; // Allow 2nd jump after bounce!
    if (isStomp) {
      this.stompCombo += 1;
      this.happyTimer = 0.75;
      this.view.triggerSquash(1.26);
      this.view.playAnimation('StompBounce', 0.06);
      this.sound.playStomp(this.stompCombo - 1);
    } else if (isTrampoline) {
      this.trampolineTimer = 0.85;
      this.happyTimer = 1.05;
      this.view.triggerSquash(1.32);
      this.view.playAnimation('TrampolineFly', 0.08);
      this.sound.playTrampoline();
    } else {
      // Cushion bounce
      this.happyTimer = 0.45;
      this.view.triggerSquash(1.20);
      this.view.playAnimation('JumpStart', 0.08);
      this.sound.playCushion();
    }
  }

  takeDamage(knockFromPos?: THREE.Vector3, amount = 1): boolean {
    if (this.invulnTimer > 0 || this.isVictory || this.isDead) return false;
    this.hp = Math.max(0, this.hp - amount);
    this.damageTakenCount += 1;
    this.invulnTimer = 1.8;
    this.damageAnimTimer = 0.55;
    this.recoverTimer = 0.35;
    this.hipDropState = 'none';
    this.tapJumpHoldTimer = 0;
    this.jumpBufferFromTap = false;
    this.stompCombo = 0;

    const push = new THREE.Vector3();
    if (knockFromPos) {
      push.subVectors(this.pos, knockFromPos);
      push.y = 0;
    }
    if (push.lengthSq() < 0.01) {
      push.set(-Math.sin(this.facingYaw), 0, -Math.cos(this.facingYaw));
    } else {
      push.normalize();
    }
    this.vel.x = push.x * 7.5;
    this.vel.z = push.z * 7.5;
    this.vel.y = 8.0;
    this.grounded = false;

    this.view.triggerHitFlash(0.18);
    this.view.triggerSquash(0.76);
    this.view.playAnimation('Damage', 0.05);
    this.sound.playDamage();
    this.callbacks.onDamageTaken(this.pos.clone());

    if (this.hp <= 0) {
      this.isDead = true;
      this.callbacks.onGameOver('damage');
    }
    return true;
  }

  heal(amount = 1): boolean {
    if (this.isDead || this.hp >= this.maxHp) return false;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    this.happyTimer = 0.85;
    this.view.triggerSquash(1.18);
    return true;
  }

  setMaxHp(newMaxHp: number, fullHeal = false): boolean {
    const clamped = Math.max(3, Math.min(4, Math.floor(newMaxHp)));
    const increased = clamped > this.maxHp;
    this.maxHp = clamped;
    if (fullHeal) {
      this.hp = this.maxHp;
      this.happyTimer = Math.max(this.happyTimer, 2.0);
      this.view.triggerSquash(1.24);
    } else {
      this.hp = Math.min(this.hp, this.maxHp);
    }
    return increased;
  }

  triggerFeverBurst(): void {
    this.feverBurstTimer = 0.65;
    this.view.triggerSquash(1.26);
    this.view.playAnimation('FeverBurst', 0.08);
  }

  respawnAfterGameOver(physics: PhysicsWorld): void {
    this.isDead = false;
    this.hp = this.maxHp;
    this.invulnTimer = 1.8;
    this.damageAnimTimer = 0;
    this.recoverTimer = 0;
    this.happyTimer = 0;
    this.feverBurstTimer = 0;
    this.trampolineTimer = 0;
    this.landAnimTimer = 0;
    this.brakeTimer = 0;
    this.turnTimer = 0;
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.jumpBufferFromTap = false;
    this.tapJumpHoldTimer = 0;
    this.hipDropTimer = 0;
    this.hipDropState = 'none';
    this.jumpCount = 0;
    this.stompCombo = 0;
    this.idleSec = 0;
    this.teleport(
      physics,
      this.checkpointPos.clone().add(new THREE.Vector3(0, 0.5, 0)),
      this.checkpointYaw
    );
  }

  respawnAtCheckpoint(physics: PhysicsWorld): void {
    this.respawnAfterGameOver(physics);
  }

  getExpression(): ExpressionName {
    return this.view.getExpression();
  }

  getExpressionLabelJa(): string {
    return EXPRESSION_LABELS_JA[this.view.getExpression()];
  }

  update(
    dt: number,
    input: InputState,
    cameraYaw: number,
    physics: PhysicsWorld,
    feverActive: boolean,
    controlsLocked: boolean
  ): void {
    if (this.invulnTimer > 0) this.invulnTimer = Math.max(0, this.invulnTimer - dt);
    if (this.damageAnimTimer > 0) this.damageAnimTimer = Math.max(0, this.damageAnimTimer - dt);
    if (this.happyTimer > 0) this.happyTimer = Math.max(0, this.happyTimer - dt);
    if (this.bossIntroPienTimer > 0) this.bossIntroPienTimer = Math.max(0, this.bossIntroPienTimer - dt);
    if (this.feverBurstTimer > 0) this.feverBurstTimer = Math.max(0, this.feverBurstTimer - dt);
    if (this.trampolineTimer > 0) this.trampolineTimer = Math.max(0, this.trampolineTimer - dt);
    if (this.landAnimTimer > 0) this.landAnimTimer = Math.max(0, this.landAnimTimer - dt);
    if (this.brakeTimer > 0) this.brakeTimer = Math.max(0, this.brakeTimer - dt);
    if (this.turnTimer > 0) this.turnTimer = Math.max(0, this.turnTimer - dt);
    if (this.tapJumpHoldTimer > 0) this.tapJumpHoldTimer = Math.max(0, this.tapJumpHoldTimer - dt);
    if (this.recoverTimer > 0 && this.damageAnimTimer <= 0) {
      this.recoverTimer = Math.max(0, this.recoverTimer - dt);
    }

    if (this.isDead) {
      this.hipDropState = 'none';
      this.view.playAnimation('Damage', 0.1);
      this.view.setExpression('Damage');
      this.view.update(dt, 0, 0, false, 0);
      this.syncViewTransform();
      return;
    }

    if (this.isVictory || controlsLocked) {
      const anim: AnimName = this.isVictory ? 'VictoryDance' : 'Idle';
      this.view.playAnimation(anim, 0.14);
      const expr = resolveExpression({
        isVictory: this.isVictory,
        damageTimer: this.damageAnimTimer,
        bossIntroPienTimer: this.bossIntroPienTimer,
        feverActive,
        happyTimer: this.happyTimer,
        isHipDropping: false,
        isDashing: false,
        isNearLedgeOrFallingFast: false,
        hp: this.hp,
        idleSec: 0,
        isCutsceneStar: this.isCutsceneStar,
      });
      this.view.setExpression(expr);
      this.view.update(dt, 0, 0, feverActive, this.invulnTimer);
      this.syncViewTransform();
      return;
    }

    // Track idle time
    const anyInput =
      Math.hypot(input.moveX, input.moveY) > 0.08 ||
      input.jumpPressed ||
      input.hipDropPressed ||
      input.touchTapActionPressed ||
      input.cameraMoved;
    if (anyInput) {
      this.idleSec = 0;
    } else {
      this.idleSec += dt;
    }

    // Camera-relative movement direction
    const sinY = Math.sin(cameraYaw);
    const cosY = Math.cos(cameraYaw);
    // Forward = (-sinY, 0, -cosY), Right = (cosY, 0, -sinY)
    const wishX = input.moveY * -sinY + input.moveX * cosY;
    const wishZ = input.moveY * -cosY + input.moveX * -sinY;
    const wishLen = Math.hypot(wishX, wishZ);
    const dirX = wishLen > 0.05 ? wishX / wishLen : 0;
    const dirZ = wishLen > 0.05 ? wishZ / wishLen : 0;

    // Speed targets
    const speedMul = feverActive ? 1.32 : 1.0;
    const maxSpeed = (this.onSlide ? 18.5 : 10.6) * speedMul;

    if (this.hipDropState === 'none' && this.damageAnimTimer <= 0) {
      if (wishLen > 0.06) {
        // Turnaround detection for cute Turn animation
        const dot = this.prevMoveDir.x * dirX + this.prevMoveDir.z * dirZ;
        const curHoriz = Math.hypot(this.vel.x, this.vel.z);
        if (dot < -0.45 && curHoriz > 5.0 && this.grounded) {
          this.turnTimer = 0.22;
        }
        this.prevMoveDir.set(dirX, 0, dirZ);

        const accel = !this.grounded
          ? 22
          : this.onSlide
            ? 28
            : curHoriz > maxSpeed
              ? 5.5
              : 42;
        const targetVx = dirX * maxSpeed * Math.min(1, wishLen);
        const targetVz = dirZ * maxSpeed * Math.min(1, wishLen);
        this.vel.x = THREE.MathUtils.lerp(this.vel.x, targetVx, 1 - Math.exp(-accel * dt));
        this.vel.z = THREE.MathUtils.lerp(this.vel.z, targetVz, 1 - Math.exp(-accel * dt));

        // Rotate character smoothly toward movement direction
        const targetYaw = Math.atan2(dirX, dirZ);
        const yawDiff = Math.atan2(
          Math.sin(targetYaw - this.facingYaw),
          Math.cos(targetYaw - this.facingYaw)
        );
        this.facingYaw += yawDiff * Math.min(1, dt * 15);
      } else if (this.onSlide) {
        // Brisk downhill slide acceleration without fighting directional steering
        const curHoriz = Math.hypot(this.vel.x, this.vel.z);
        if (curHoriz > 0.4 && curHoriz < 18.0) {
          const boost = 1 + 0.65 * dt;
          this.vel.x *= boost;
          this.vel.z *= boost;
        } else if (curHoriz <= 0.4) {
          this.vel.x += this.lastSlideDir.x * 12.0 * dt;
          this.vel.z += this.lastSlideDir.z * 12.0 * dt;
        } else {
          this.vel.x *= Math.exp(-0.3 * dt);
          this.vel.z *= Math.exp(-0.3 * dt);
        }
      } else {
        const curHoriz = Math.hypot(this.vel.x, this.vel.z);
        if (curHoriz > 5.5 && this.grounded && this.brakeTimer <= 0) {
          this.brakeTimer = 0.24;
        }
        const friction = this.grounded ? 14.0 : 2.2;
        const damp = Math.exp(-friction * dt);
        this.vel.x *= damp;
        this.vel.z *= damp;
      }
    }

    // Coyote & Jump Buffer (plus 3-tap touch action: Jump -> Double Jump -> Hip Drop)
    if (this.grounded) {
      this.coyoteTimer = 0.13;
      this.jumpCount = 0;
      this.stompCombo = 0;
    } else {
      this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);
    }

    let hipDropTrigger = input.hipDropPressed;
    if (input.touchTapActionPressed) {
      if (
        !this.grounded &&
        this.coyoteTimer <= 0 &&
        this.jumpCount >= 2 &&
        this.hipDropState === 'none' &&
        this.damageAnimTimer <= 0
      ) {
        hipDropTrigger = true;
        this.jumpBufferTimer = 0;
        this.jumpBufferFromTap = false;
        this.tapJumpHoldTimer = 0;
      } else {
        this.jumpBufferTimer = 0.14;
        this.jumpBufferFromTap = true;
      }
    } else if (input.jumpPressed) {
      this.jumpBufferTimer = 0.14;
      this.jumpBufferFromTap = false;
    } else {
      this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - dt);
      if (this.jumpBufferTimer <= 0) {
        this.jumpBufferFromTap = false;
      }
    }

    // Jump / Double Jump execution
    if (this.jumpBufferTimer > 0 && this.hipDropState === 'none' && this.damageAnimTimer <= 0) {
      if (this.coyoteTimer > 0) {
        this.vel.y = 12.6;
        this.grounded = false;
        this.coyoteTimer = 0;
        this.jumpBufferTimer = 0;
        this.jumpCount = 1;
        this.stepMadeJump = true;
        if (this.jumpBufferFromTap) {
          this.tapJumpHoldTimer = 0.34;
          this.jumpBufferFromTap = false;
        }
        this.view.triggerSquash(1.24);
        this.view.playAnimation('JumpStart', 0.06);
        this.sound.playJump(false);
        this.callbacks.onJumpParticle(this.pos.clone(), false);
      } else if (this.jumpCount < 2) {
        this.vel.y = 11.4;
        this.jumpBufferTimer = 0;
        this.jumpCount = 2;
        this.stepMadeDoubleJump = true;
        if (this.jumpBufferFromTap) {
          this.tapJumpHoldTimer = 0.34;
          this.jumpBufferFromTap = false;
        }
        this.view.triggerSquash(1.22);
        this.view.playAnimation('DoubleJump', 0.06);
        this.sound.playJump(true);
        this.callbacks.onJumpParticle(this.pos.clone(), true);
      }
    }

    // Variable jump height cut (preserve full arc for touch tap jumps)
    if (
      !input.jumpHeld &&
      this.tapJumpHoldTimer <= 0 &&
      this.vel.y > 4.8 &&
      this.trampolineTimer <= 0 &&
      this.hipDropState === 'none'
    ) {
      this.vel.y -= 28.0 * dt;
    }

    // Hip-drop activation in mid-air
    if (
      hipDropTrigger &&
      !this.grounded &&
      this.hipDropState === 'none' &&
      this.damageAnimTimer <= 0
    ) {
      this.hipDropState = 'windup';
      this.hipDropTimer = 0.24;
      this.tapJumpHoldTimer = 0;
      this.vel.set(0, 1.4, 0);
      this.view.playAnimation('HipDropStart', 0.05);
      this.sound.playHipDropStart();
    }

    // Gravity & Hip-drop physics
    if (this.hipDropState === 'windup') {
      this.hipDropTimer -= dt;
      this.vel.set(0, 0.8, 0);
      if (this.hipDropTimer <= 0) {
        this.hipDropState = 'diving';
        this.vel.set(0, -28.0, 0);
        this.view.playAnimation('HipDropSlam', 0.05);
      }
    } else if (this.hipDropState === 'diving') {
      this.vel.x *= 0.85;
      this.vel.z *= 0.85;
      this.vel.y = -28.0;
    } else if (this.hipDropState === 'recovery') {
      this.hipDropTimer -= dt;
      this.vel.x = 0;
      this.vel.z = 0;
      this.vel.y -= 32.0 * dt;
      if (this.hipDropTimer <= 0) {
        this.hipDropState = 'none';
      }
    } else {
      const grav = this.vel.y > 0 ? 29.0 : 34.0;
      this.vel.y = Math.max(-30.0, this.vel.y - grav * dt);
    }

    // Move through Rapier Character Controller
    const delta = new THREE.Vector3(this.vel.x * dt, this.vel.y * dt, this.vel.z * dt);
    const res = physics.movePlayer(delta);
    this.pos.copy(res.pos);

    this.wasGrounded = this.grounded;
    this.grounded = res.grounded;
    this.onSlide = res.onSlide;
    if (res.slideDir) {
      this.lastSlideDir.x = res.slideDir.x;
      this.lastSlideDir.z = res.slideDir.z;
    }

    if (this.safeFloorBounds) {
      const b = this.safeFloorBounds;
      if (
        this.pos.x < b.minX ||
        this.pos.x > b.maxX ||
        this.pos.z < b.minZ ||
        this.pos.z > b.maxZ
      ) {
        this.pos.x = THREE.MathUtils.clamp(this.pos.x, b.minX, b.maxX);
        this.pos.z = THREE.MathUtils.clamp(this.pos.z, b.minZ, b.maxZ);
        physics.setPlayerPosition(this.pos.x, this.pos.y, this.pos.z);
      }
    }

    // Cushion automatic bounce!
    if (res.hitCushion && this.vel.y <= 0.5 && this.hipDropState === 'none') {
      res.hitCushion.onBounce?.();
      this.bounceUp(14.0, false, false);
    }

    // Dynamic body collision when dashing, sliding, or in fever
    const horizSpeed = Math.hypot(this.vel.x, this.vel.z);
    for (const rec of res.touchedDynamics) {
      if (feverActive || horizSpeed > 4.5 || this.onSlide) {
        this.callbacks.onDynamicHit(rec, horizSpeed);
      }
    }

    // Landing detection
    if (this.grounded) {
      this.tapJumpHoldTimer = 0;
      if (this.hipDropState === 'diving') {
        this.hipDropState = 'recovery';
        this.hipDropTimer = 0.24;
        this.stepMadeHipDrop = true;
        this.vel.y = 0;
        this.view.triggerSquash(0.60);
        this.sound.playHipDropSlam();
        this.callbacks.onHipDropImpact(this.pos.clone());
        this.callbacks.onLandParticle(this.pos.clone(), true);
      } else if (!this.wasGrounded && this.vel.y < -3.0) {
        const heavy = this.vel.y < -14.0;
        this.vel.y = 0;
        this.landAnimTimer = 0.22;
        this.view.triggerSquash(heavy ? 0.68 : 0.78);
        this.view.playAnimation('Land', 0.05);
        this.callbacks.onLandParticle(this.pos.clone(), heavy);
      } else if (this.vel.y < 0) {
        this.vel.y = 0;
      }

      // Save safe ground pos (avoid saving precarious edges or slide steep zones)
      if (!this.onSlide && !res.hitCushion && this.pos.y > -2) {
        this.lastSafePos.copy(this.pos);
      }
    }

    // Ledge / cliff panic detection for facial expression (throttled to ~8 Hz while grounded)
    if (!this.fallOutEnabled) {
      this.nearLedge = !this.grounded && this.vel.y < -15.5;
      this.ledgeCheckTimer = 0;
    } else if (!this.grounded && this.vel.y < -9.5) {
      this.nearLedge = true;
      this.ledgeCheckTimer = 0;
    } else if (this.grounded) {
      this.ledgeCheckTimer -= dt;
      if (this.ledgeCheckTimer <= 0) {
        this.ledgeCheckTimer = 0.12;
        this.tmpLedgePos.set(
          this.pos.x + Math.sin(this.facingYaw) * 1.4,
          this.pos.y + 0.8,
          this.pos.z + Math.cos(this.facingYaw) * 1.4
        );
        const ray = physics.castGroundRay(this.tmpLedgePos, 6.5);
        this.nearLedge = ray === null;
      }
    } else {
      this.nearLedge = false;
      this.ledgeCheckTimer = 0;
    }

    // Out of bounds fall recovery -> 1 damage in sky worlds; zero-damage safe recovery in enclosed floor worlds
    if (!this.fallOutEnabled && this.pos.y < -6.0) {
      this.teleport(physics, this.lastSafePos.clone().add(new THREE.Vector3(0, 0.8, 0)));
      return;
    }
    if (this.fallOutEnabled && this.pos.y < -14.0) {
      this.hp = Math.max(0, this.hp - 1);
      this.damageTakenCount += 1;
      if (this.hp <= 0) {
        this.isDead = true;
        this.callbacks.onGameOver('fall');
        return;
      } else {
        this.sound.playDamage();
        this.invulnTimer = 1.8;
        this.damageAnimTimer = 0.45;
        this.callbacks.onFellOut(this.pos.clone(), this.hp);
        this.teleport(physics, this.lastSafePos.clone().add(new THREE.Vector3(0, 0.8, 0)));
        return;
      }
    }

    // Idle look-back toward camera so player sees Buu's cute Sleep / Pout face!
    if (this.idleSec > 3.5 && this.grounded && horizSpeed < 0.3) {
      const camSideYaw = cameraYaw; // camera is at +sin(camYaw), +cos(camYaw) relative to player
      const diff = Math.atan2(
        Math.sin(camSideYaw - this.facingYaw),
        Math.cos(camSideYaw - this.facingYaw)
      );
      this.facingYaw += diff * Math.min(1, dt * 4.5);
    }

    // Running cotton-dust particles
    if (this.grounded && horizSpeed > 4.2) {
      this.dustCooldown -= dt;
      if (this.dustCooldown <= 0) {
        this.dustCooldown = horizSpeed > 9.0 ? 0.09 : 0.16;
        this.callbacks.onDashDust(this.pos.clone());
      }
    }

    // Animation selection
    const anim = this.pickAnimation(horizSpeed, feverActive);
    const animSpeed =
      anim === 'Walk'
        ? THREE.MathUtils.clamp(horizSpeed / 4.5, 0.85, 1.15)
        : anim === 'Dash'
        ? THREE.MathUtils.clamp(horizSpeed / 9.2, 0.90, 1.22)
        : 1.0;
    this.view.playAnimation(anim, 0.11, animSpeed);

    // Expression selection (respecting no-blush on Sleep/Ganbaru!)
    const expr = resolveExpression({
      isVictory: this.isVictory,
      damageTimer: this.damageAnimTimer,
      bossIntroPienTimer: this.bossIntroPienTimer,
      feverActive,
      happyTimer: this.happyTimer,
      isHipDropping: this.hipDropState !== 'none',
      isDashing: horizSpeed > 7.2 || this.onSlide,
      isNearLedgeOrFallingFast: this.nearLedge,
      hp: this.hp,
      idleSec: this.idleSec,
      isCutsceneStar: this.isCutsceneStar,
    });
    this.view.setExpression(expr);

    this.view.update(dt, horizSpeed, this.vel.y, feverActive, this.invulnTimer);
    this.syncViewTransform();
  }

  private pickAnimation(horizSpeed: number, feverActive: boolean): AnimName {
    if (this.feverBurstTimer > 0) return 'FeverBurst';
    if (this.damageAnimTimer > 0) return 'Damage';
    if (this.recoverTimer > 0 && this.grounded) return 'Recover';
    if (this.hipDropState === 'windup') return 'HipDropStart';
    if (this.hipDropState === 'diving' || this.hipDropState === 'recovery') return 'HipDropSlam';
    if (!this.grounded) {
      if (this.trampolineTimer > 0 && this.vel.y > 0) return 'TrampolineFly';
      if (this.vel.y > 0.5) {
        if (this.stompCombo > 0) return 'StompBounce';
        return this.jumpCount >= 2 ? 'DoubleJump' : 'JumpStart';
      }
      return 'Fall';
    }
    if (this.landAnimTimer > 0 && horizSpeed < 3.0) return 'Land';
    if (this.turnTimer > 0) return 'Turn';
    if (this.brakeTimer > 0 && horizSpeed < 5.0) return 'Brake';
    if (horizSpeed > 6.2 || (feverActive && horizSpeed > 3.5)) return 'Dash';
    if (horizSpeed > 0.6) return 'Walk';
    return 'Idle';
  }

  private syncViewTransform(): void {
    this.view.root.position.copy(this.pos);
    this.view.root.rotation.set(0, this.facingYaw, 0);
  }
}
