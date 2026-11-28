import * as THREE from 'three';
import type { PhysicsWorld } from './PhysicsWorld';

export interface CameraCinematicOverride {
  duration: number;
  elapsed: number;
  lerpSpeed?: number;
  getPose: (
    t01: number,
    playerPos: THREE.Vector3,
    playerYaw: number
  ) => { pos: THREE.Vector3; lookAt: THREE.Vector3; fov?: number };
}

export class CameraController {
  public yaw = 0; // 0 = camera at +Z looking toward -Z (Castle & Boss Gate)
  public pitch = 0.34;
  public distance = 9.4;
  public autoFollow = false;

  private currentPos = new THREE.Vector3(0, 6, 52);
  private currentLook = new THREE.Vector3(0, 1.5, 42);
  private shakeTime = 0;
  private shakeMaxTime = 0.25;
  private shakeStrength = 0;
  private shakeDir = new THREE.Vector3(0, 1, 0);
  private feverPulseTimer = 0;
  private feverPulseDuration = 0.65;
  private manualCamCooldown = 0;
  private override: CameraCinematicOverride | null = null;
  private tempVec = new THREE.Vector3();
  private tempOrigin = new THREE.Vector3();
  private tempDir = new THREE.Vector3();
  private tempIdeal = new THREE.Vector3();
  private tempDesiredPos = new THREE.Vector3();
  private tempDesiredLook = new THREE.Vector3();

  public setAutoFollow(enabled: boolean): void {
    this.autoFollow = enabled;
  }

  resetBehind(pos: THREE.Vector3, playerFacingYaw: number): void {
    // Behind player whose front is (+sin(yaw), 0, +cos(yaw))
    this.yaw = playerFacingYaw + Math.PI;
    this.pitch = 0.34;
    this.manualCamCooldown = 0;
    const ideal = this.computeIdealPos(pos, this.distance, undefined, this.tempIdeal);
    this.currentPos.copy(ideal);
    this.currentLook.set(pos.x, pos.y + 1.05, pos.z);
  }

  triggerShake(strength: number, duration = 0.24, dir?: THREE.Vector3): void {
    this.shakeStrength = Math.max(this.shakeStrength, strength);
    this.shakeMaxTime = duration;
    this.shakeTime = duration;
    if (dir && dir.lengthSq() > 0.001) {
      this.shakeDir.copy(dir).normalize();
    } else {
      this.shakeDir.set(0.3, 1, 0.2).normalize();
    }
  }

  triggerFeverPulse(duration = 0.65): void {
    this.feverPulseDuration = Math.max(0.1, duration);
    this.feverPulseTimer = this.feverPulseDuration;
  }

  startCinematic(
    duration: number,
    getPose: CameraCinematicOverride['getPose']
  ): void {
    this.override = { duration, elapsed: 0, getPose };
  }

  startShowcaseFront(
    duration: number,
    getPose: (
      playerPos: THREE.Vector3,
      playerYaw: number
    ) => { pos: THREE.Vector3; lookAt: THREE.Vector3; fov?: number }
  ): void {
    this.startCinematic(duration, (_t01, pPos, pYaw) => getPose(pPos, pYaw));
  }

  startHoldCinematic(
    getPose: (
      playerPos: THREE.Vector3,
      playerYaw: number
    ) => { pos: THREE.Vector3; lookAt: THREE.Vector3; fov?: number },
    lerpSpeed = 4.8
  ): void {
    this.override = {
      duration: Number.POSITIVE_INFINITY,
      elapsed: 0,
      lerpSpeed,
      getPose: (_t01, pPos, pYaw) => getPose(pPos, pYaw),
    };
  }

  clearCinematic(): void {
    this.override = null;
  }

  isCinematicActive(): boolean {
    return this.override !== null;
  }

  private computeIdealPos(
    playerPos: THREE.Vector3,
    dist: number,
    pitchOverride?: number,
    out: THREE.Vector3 = this.tempIdeal
  ): THREE.Vector3 {
    const p = pitchOverride ?? this.pitch;
    const cp = Math.cos(p);
    const sp = Math.sin(p);
    return out.set(
      playerPos.x + Math.sin(this.yaw) * cp * dist,
      playerPos.y + 1.0 + sp * dist,
      playerPos.z + Math.cos(this.yaw) * cp * dist
    );
  }

  update(
    dt: number,
    camera: THREE.PerspectiveCamera,
    physics: PhysicsWorld,
    playerPos: THREE.Vector3,
    playerYaw: number,
    horizSpeed: number,
    camDeltaX: number,
    camDeltaY: number,
    options: {
      isTitle: boolean;
      isVictory: boolean;
      onSlide: boolean;
      isTrampolineFly: boolean;
      isFever?: boolean;
      bossPos?: THREE.Vector3 | null;
      moveYaw?: number;
      time: number;
      titleCamera?: {
        radius: number;
        yBase: number;
        yAmp: number;
        zOffset: number;
        lookAt: [number, number, number];
        fov: number;
        xCenter?: number;
        xAmp?: number;
        zAmp?: number;
      };
    }
  ): void {
    // Cinematic override takes priority
    if (this.override) {
      const isFiniteDur = Number.isFinite(this.override.duration);
      this.override.elapsed += dt;
      const t01 = isFiniteDur
        ? Math.min(1, this.override.elapsed / Math.max(0.01, this.override.duration))
        : 0;
      const pose = this.override.getPose(t01, playerPos, playerYaw);
      const speed = this.override.lerpSpeed ?? 8.5;
      const lerpAmt = 1 - Math.exp(-speed * dt);
      this.currentPos.lerp(pose.pos, lerpAmt);
      this.currentLook.lerp(pose.lookAt, lerpAmt);
      if (pose.fov !== undefined) {
        const prevFov = camera.fov;
        camera.fov = THREE.MathUtils.lerp(camera.fov, pose.fov, lerpAmt);
        if (Math.abs(camera.fov - prevFov) > 0.001) {
          camera.updateProjectionMatrix();
        }
      }
      camera.position.copy(this.currentPos);
      this.applyShake(dt, camera);
      camera.lookAt(this.currentLook);
      if (isFiniteDur && this.override.elapsed >= this.override.duration) {
        this.override = null;
      }
      return;
    }

    if (options.isTitle) {
      // Sweeping scenic orbit showcasing active world & Manmarubuu
      const tc = options.titleCamera ?? {
        radius: 58,
        yBase: 24,
        yAmp: 4,
        zOffset: 14,
        lookAt: [0, 6.5, 2] as [number, number, number],
        fov: 50,
      };
      const a = options.time * 0.14;
      if (tc.xCenter !== undefined) {
        this.tempDesiredPos.set(
          tc.xCenter + Math.sin(a * 0.85) * (tc.xAmp ?? 5.5),
          tc.yBase + Math.sin(a * 0.6) * tc.yAmp,
          tc.zOffset + Math.cos(a * 0.75) * (tc.zAmp ?? 1.8)
        );
      } else {
        this.tempDesiredPos.set(
          Math.sin(a) * tc.radius * 0.72,
          tc.yBase + Math.sin(a * 0.7) * tc.yAmp,
          tc.zOffset + Math.cos(a) * tc.radius * 0.78
        );
      }
      this.tempDesiredLook.set(tc.lookAt[0], tc.lookAt[1], tc.lookAt[2]);
      const k = 1 - Math.exp(-3.5 * dt);
      this.currentPos.lerp(this.tempDesiredPos, k);
      this.currentLook.lerp(this.tempDesiredLook, k);
      const prevFov = camera.fov;
      camera.fov = THREE.MathUtils.lerp(camera.fov, tc.fov, k);
      if (Math.abs(camera.fov - prevFov) > 0.001) {
        camera.updateProjectionMatrix();
      }
      camera.position.copy(this.currentPos);
      camera.lookAt(this.currentLook);
      return;
    }

    if (options.isVictory) {
      // Wide celebratory front-quarter angle framing dancing Buu and the opened chest
      const a = playerYaw + 0.35 + Math.sin(options.time * 0.75) * 0.25;
      this.tempDesiredPos.set(
        playerPos.x + Math.sin(a) * 6.4,
        playerPos.y + 2.05,
        playerPos.z + Math.cos(a) * 6.4
      );
      this.tempDesiredLook.set(playerPos.x + 1.2, playerPos.y + 1.05, playerPos.z - 0.8);
      const k = 1 - Math.exp(-5.0 * dt);
      this.currentPos.lerp(this.tempDesiredPos, k);
      this.currentLook.lerp(this.tempDesiredLook, k);
      const prevFov = camera.fov;
      camera.fov = THREE.MathUtils.lerp(camera.fov, 48, k);
      if (Math.abs(camera.fov - prevFov) > 0.001) {
        camera.updateProjectionMatrix();
      }
      camera.position.copy(this.currentPos);
      camera.lookAt(this.currentLook);
      return;
    }

    // Manual orbit
    this.yaw -= camDeltaX;
    this.pitch = THREE.MathUtils.clamp(this.pitch + camDeltaY, 0.08, 1.12);

    const userMovedCam = Math.abs(camDeltaX) + Math.abs(camDeltaY) > 0.001;
    if (userMovedCam) {
      this.manualCamCooldown = 1.5;
    } else if (this.manualCamCooldown > 0) {
      this.manualCamCooldown = Math.max(0, this.manualCamCooldown - dt);
    }

    // Smart auto-follow behind player:
    // - Smoothly swings behind when running forward/sideways (±125 deg)
    // - Strongly suppresses follow when running back toward camera (>= 135 deg) to avoid dizzy spinning
    // - Pauses for 1.5s after any manual camera movement
    if (this.autoFollow && !userMovedCam && this.manualCamCooldown <= 0) {
      if (horizSpeed > 1.8 || options.onSlide) {
        const headingYaw = options.moveYaw ?? playerYaw;
        const behindYaw = headingYaw + Math.PI;
        const diff = Math.atan2(Math.sin(behindYaw - this.yaw), Math.cos(behindYaw - this.yaw));
        const absDiffDeg = Math.abs(diff) * (180 / Math.PI);
        let angleWeight = 0;
        if (absDiffDeg <= 125) {
          angleWeight = 1.0;
        } else if (absDiffDeg < 135) {
          angleWeight = (135 - absDiffDeg) / 10;
        }
        if (angleWeight > 0) {
          const speedFactor = options.onSlide
            ? 1.0
            : THREE.MathUtils.clamp((horizSpeed - 1.5) / 6.5, 0.3, 1.0);
          const baseRate = options.onSlide ? 3.2 : 2.35;
          const followRate = baseRate * speedFactor * angleWeight;
          this.yaw += diff * (1 - Math.exp(-followRate * dt));
        }
      }
    }

    let feverFovBoost = options.isFever ? 2.5 : 0;
    if (this.feverPulseTimer > 0) {
      this.feverPulseTimer = Math.max(0, this.feverPulseTimer - dt);
      const pulseT = 1 - this.feverPulseTimer / this.feverPulseDuration;
      feverFovBoost += Math.sin(pulseT * Math.PI) * 5.5;
    }

    const isBossFight = Boolean(options.bossPos);
    const targetFov =
      (options.isTrampolineFly ? 60 : isBossFight ? 56 : horizSpeed > 12 ? 58 : 52) + feverFovBoost;
    const targetDist = options.onSlide
      ? 7.2
      : options.isTrampolineFly
        ? 8.2
        : isBossFight
          ? 11.4
          : this.distance;
    const effectivePitch = isBossFight ? Math.min(this.pitch, 0.21) : this.pitch;

    const ideal = this.computeIdealPos(playerPos, targetDist, effectivePitch, this.tempIdeal);
    this.tempOrigin.set(playerPos.x, playerPos.y + 0.9, playerPos.z);
    this.tempDir.subVectors(ideal, this.tempOrigin);
    const maxLen = this.tempDir.length();
    if (maxLen > 0.2) {
      this.tempDir.divideScalar(maxLen);
      const hitDist = physics.castCameraRay(this.tempOrigin, this.tempDir, maxLen);
      if (hitDist !== null && hitDist < maxLen) {
        ideal.copy(this.tempOrigin).addScaledVector(this.tempDir, Math.max(1.8, hitDist - 0.35));
      }
    }

    const lookTarget = options.bossPos
      ? this.tempVec.set(
          THREE.MathUtils.lerp(playerPos.x, options.bossPos.x, 0.22),
          playerPos.y + 2.65,
          THREE.MathUtils.lerp(playerPos.z, options.bossPos.z, 0.22)
        )
      : this.tempVec.set(playerPos.x, playerPos.y + 0.95, playerPos.z);
    const posLerp = 1 - Math.exp(-11.0 * dt);
    const lookLerp = 1 - Math.exp(-14.0 * dt);

    this.currentPos.lerp(ideal, posLerp);
    this.currentLook.lerp(lookTarget, lookLerp);
    const prevFov = camera.fov;
    camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 1 - Math.exp(-6.0 * dt));
    if (Math.abs(camera.fov - prevFov) > 0.001) {
      camera.updateProjectionMatrix();
    }

    camera.position.copy(this.currentPos);
    this.applyShake(dt, camera);
    camera.lookAt(this.currentLook);
  }

  private applyShake(dt: number, camera: THREE.PerspectiveCamera): void {
    if (this.shakeTime <= 0) return;
    this.shakeTime = Math.max(0, this.shakeTime - dt);
    const decay = this.shakeTime / Math.max(0.01, this.shakeMaxTime);
    const mag = this.shakeStrength * decay;
    const rx = (Math.random() * 2 - 1) * 0.4 + this.shakeDir.x * Math.sin(this.shakeTime * 75);
    const ry = (Math.random() * 2 - 1) * 0.4 + this.shakeDir.y * Math.cos(this.shakeTime * 82);
    const rz = (Math.random() * 2 - 1) * 0.4 + this.shakeDir.z * Math.sin(this.shakeTime * 68);
    camera.position.x += rx * mag;
    camera.position.y += ry * mag;
    camera.position.z += rz * mag;
    if (this.shakeTime <= 0) {
      this.shakeStrength = 0;
    }
  }
}
