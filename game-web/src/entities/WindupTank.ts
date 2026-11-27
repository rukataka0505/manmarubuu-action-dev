import * as THREE from 'three';

export class WindupTank {
  public readonly group = new THREE.Group();
  public readonly pos: THREE.Vector3;
  public readonly homePos: THREE.Vector3;
  public alive = true;
  public isBowlingGuard = false;

  private windupKey: THREE.Object3D;
  private visualRoot = new THREE.Group();
  private alertBadge = new THREE.Group();
  private wheels: THREE.Mesh[] = [];
  private state: 'patrol' | 'telegraph' | 'charge' | 'cooldown' = 'patrol';
  private stateTimer = 0;
  private chargeYaw = 0;
  private patrolAngle = Math.random() * Math.PI * 2;
  private popVel: THREE.Vector3 | null = null;
  private popTimer = 0;

  constructor(
    pos: THREE.Vector3,
    isBowlingGuard = false,
    externalVisual?: THREE.Object3D | null
  ) {
    this.pos = pos.clone();
    this.homePos = pos.clone();
    this.isBowlingGuard = isBowlingGuard;
    this.group.position.copy(pos);
    this.group.add(this.visualRoot);

    const woodMat = new THREE.MeshStandardMaterial({ color: 0xdfb47d, roughness: 0.52 });
    const mintCapMat = new THREE.MeshStandardMaterial({ color: 0x7bd3cf, roughness: 0.42 });
    const pinkRingMat = new THREE.MeshStandardMaterial({ color: 0xf498ba, roughness: 0.45 });
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xe3b142,
      metalness: 0.86,
      roughness: 0.25,
    });
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x353238, roughness: 0.75 });

    // Wooden tank body
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.95, 20), mintCapMat);
    body.rotation.z = Math.PI / 2;
    body.position.y = 0.72;
    body.castShadow = true;
    this.group.add(body);

    const sideDiskGeo = new THREE.CylinderGeometry(0.56, 0.56, 1.02, 20);
    sideDiskGeo.rotateZ(Math.PI / 2);
    const sideWood = new THREE.Mesh(sideDiskGeo, woodMat);
    sideWood.position.y = 0.72;
    this.group.add(sideWood);

    const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.07, 10, 20), pinkRingMat);
    stripe.rotation.y = Math.PI / 2;
    stripe.position.set(0.32, 0.72, 0);
    const stripe2 = stripe.clone();
    stripe2.position.x = -0.32;
    this.group.add(stripe, stripe2);

    // Cute wooden cannon snout (+Z forward)
    const cannon = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 0.72, 14), woodMat);
    cannon.rotation.x = Math.PI * 0.36;
    cannon.position.set(0, 1.05, 0.52);
    cannon.castShadow = true;
    this.group.add(cannon);

    // Googly eyes
    const eyeWhiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0x202226 });
    for (const sx of [-0.24, 0.24]) {
      const ew = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), eyeWhiteMat);
      ew.position.set(sx, 0.76, 0.58);
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), pupilMat);
      p.position.set(0, -0.02, 0.09);
      ew.add(p);
      this.group.add(ew);
    }

    // 4 wheels
    const wheelGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.16, 16);
    wheelGeo.rotateZ(Math.PI / 2);
    for (const [wx, wz] of [
      [-0.56, 0.38],
      [0.56, 0.38],
      [-0.56, -0.38],
      [0.56, -0.38],
    ]) {
      const w = new THREE.Mesh(wheelGeo, tireMat);
      w.position.set(wx, 0.26, wz);
      w.castShadow = true;
      this.group.add(w);
      this.wheels.push(w);
    }

    // Back golden wind-up key
    this.windupKey = new THREE.Group();
    this.windupKey.position.set(0, 1.18, -0.52);
    this.windupKey.rotation.x = -0.45;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.38, 10), brassMat);
    shaft.rotation.x = Math.PI / 2;
    shaft.position.z = -0.18;
    const loop1 = new THREE.Mesh(new THREE.TorusGeometry(0.20, 0.045, 8, 16), brassMat);
    loop1.position.set(0, 0.17, -0.40);
    const loop2 = loop1.clone();
    loop2.position.y = -0.17;
    this.windupKey.add(shaft, loop1, loop2);
    this.group.add(this.windupKey);

    for (const ch of [...this.group.children]) {
      if (ch !== this.visualRoot) this.visualRoot.add(ch);
    }
    if (externalVisual) {
      for (const ch of [...this.visualRoot.children]) ch.visible = false;
      this.visualRoot.add(externalVisual);
      externalVisual.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.castShadow = true;
          obj.receiveShadow = true;
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const m of mats) {
            if (m instanceof THREE.MeshStandardMaterial) {
              m.envMapIntensity = m.metalness > 0.5 ? 1.35 : 0.85;
              m.needsUpdate = true;
            }
          }
        }
      });
      const extKey =
        externalVisual.getObjectByName('WindupKey') ??
        externalVisual.getObjectByName('BackWindupKey');
      if (extKey) this.windupKey = extKey;
      const extWheels: THREE.Mesh[] = [];
      externalVisual.traverse((obj) => {
        if (obj.name.startsWith('Wheel_') && obj instanceof THREE.Object3D) {
          extWheels.push(obj as THREE.Mesh);
        }
      });
      if (extWheels.length > 0) this.wheels = extWheels;
    }

    // Mario-style red "!" telegraph alert badge above tank before charge
    const alertMat = new THREE.MeshBasicMaterial({ color: 0xff3b52 });
    const bar = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.28, 4, 8), alertMat);
    bar.position.y = 0.24;
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.068, 10, 8), alertMat);
    dot.position.y = -0.02;
    this.alertBadge.add(bar, dot);
    this.alertBadge.position.set(0, 1.85, 0);
    this.alertBadge.visible = false;
    this.group.add(this.alertBadge);
  }

  defeat(knockDir?: THREE.Vector3): void {
    if (!this.alive) return;
    this.alive = false;
    const dir = knockDir ? knockDir.clone().normalize() : new THREE.Vector3(0, 0.5, 1);
    this.popVel = new THREE.Vector3(dir.x * 11, 11.5, dir.z * 11);
    this.popTimer = 0.65;
  }

  update(
    dt: number,
    playerPos: THREE.Vector3,
    playerVelY: number,
    feverActive: boolean,
    onDefeated: (tank: WindupTank) => void,
    onTouchDamage: (tank: WindupTank) => void
  ): void {
    if (!this.alive) {
      if (this.popVel && this.popTimer > 0) {
        this.popTimer -= dt;
        this.popVel.y -= 24 * dt;
        this.group.position.addScaledVector(this.popVel, dt);
        this.group.rotation.x += 10 * dt;
        this.group.rotation.z += 8 * dt;
        this.group.scale.multiplyScalar(Math.max(0.05, 1 - dt * 1.6));
      } else {
        this.group.visible = false;
      }
      return;
    }

    const toPlayerX = playerPos.x - this.pos.x;
    const toPlayerZ = playerPos.z - this.pos.z;
    const dist = Math.hypot(toPlayerX, toPlayerZ);
    const inDetectRange = dist < 9.5 && Math.abs(playerPos.y - this.pos.y) < 3.0;

    let speed = 2.1;
    let keySpin = 5.5;
    let tiltX = Math.sin(this.patrolAngle * 6) * 0.04;
    let shakeZ = 0;

    if (this.state === 'patrol') {
      this.alertBadge.visible = false;
      if (inDetectRange) {
        this.state = 'telegraph';
        this.stateTimer = 0.55;
        this.chargeYaw = Math.atan2(toPlayerX, toPlayerZ);
      } else {
        this.patrolAngle += dt * 0.75;
        const patrolR = this.isBowlingGuard ? 2.1 : 3.5;
        const tx = this.homePos.x + Math.cos(this.patrolAngle) * patrolR;
        const tz = this.homePos.z + Math.sin(this.patrolAngle) * patrolR;
        const dx = tx - this.pos.x;
        const dz = tz - this.pos.z;
        this.group.rotation.y = Math.atan2(dx, dz);
      }
    } else if (this.state === 'telegraph') {
      this.stateTimer -= dt;
      speed = 0;
      keySpin = 24.0;
      tiltX = -0.14;
      shakeZ = Math.sin(performance.now() * 0.048) * 0.10;
      this.alertBadge.visible = true;
      this.alertBadge.scale.setScalar(1.0 + Math.sin(performance.now() * 0.03) * 0.16);
      const targetYaw = Math.atan2(toPlayerX, toPlayerZ);
      const diff = Math.atan2(
        Math.sin(targetYaw - this.group.rotation.y),
        Math.cos(targetYaw - this.group.rotation.y)
      );
      this.group.rotation.y += diff * Math.min(1, dt * 8.0);
      this.chargeYaw = this.group.rotation.y;
      if (this.stateTimer <= 0) {
        this.state = 'charge';
        this.stateTimer = 1.45;
        this.alertBadge.visible = false;
      }
    } else if (this.state === 'charge') {
      this.stateTimer -= dt;
      speed = 5.3;
      keySpin = 16.0;
      tiltX = 0.16;
      const targetYaw = Math.atan2(toPlayerX, toPlayerZ);
      const diff = Math.atan2(
        Math.sin(targetYaw - this.chargeYaw),
        Math.cos(targetYaw - this.chargeYaw)
      );
      this.chargeYaw += diff * Math.min(1, dt * 1.4);
      this.group.rotation.y = this.chargeYaw;
      if (this.stateTimer <= 0) {
        this.state = 'cooldown';
        this.stateTimer = 0.95;
      }
    } else {
      // Cooldown pause: windup key slows & tank pants, inviting player stomp!
      this.stateTimer -= dt;
      speed = 0;
      keySpin = 1.2;
      tiltX = 0.08 * Math.sin(this.stateTimer * 10);
      this.alertBadge.visible = false;
      if (this.stateTimer <= 0) {
        this.state = 'patrol';
      }
    }

    const fwdX = Math.sin(this.group.rotation.y);
    const fwdZ = Math.cos(this.group.rotation.y);
    this.pos.x += fwdX * speed * dt;
    this.pos.z += fwdZ * speed * dt;

    // Keep within home leash radius (tighter near bowling pins so tanks never clip pins)
    const maxLeash = this.isBowlingGuard ? 3.2 : 7.5;
    const leashX = this.pos.x - this.homePos.x;
    const leashZ = this.pos.z - this.homePos.z;
    const leashD = Math.hypot(leashX, leashZ);
    if (leashD > maxLeash) {
      this.pos.x = this.homePos.x + (leashX / leashD) * maxLeash;
      this.pos.z = this.homePos.z + (leashZ / leashD) * maxLeash;
    }

    this.group.position.set(
      this.pos.x,
      this.pos.y + (speed > 0.1 ? Math.abs(Math.sin(performance.now() * 0.012)) * (this.state === 'charge' ? 0.08 : 0.03) : 0),
      this.pos.z
    );
    this.visualRoot.rotation.x = tiltX;
    this.visualRoot.rotation.z = shakeZ;
    this.windupKey.rotation.z += dt * keySpin;
    for (const w of this.wheels) {
      w.rotation.x += dt * speed * 3.2;
    }

    // Player collision
    if (dist < 1.25 && Math.abs(playerPos.y - this.pos.y) < 1.75) {
      const dy = playerPos.y - this.pos.y;
      if (feverActive) {
        this.defeat(new THREE.Vector3(this.pos.x - playerPos.x, 0.5, this.pos.z - playerPos.z));
        onDefeated(this);
      } else if (dy > 0.62 && playerVelY <= 1.8) {
        this.defeat(new THREE.Vector3(-fwdX, 0.5, -fwdZ));
        onDefeated(this);
      } else if (dy < 0.85) {
        onTouchDamage(this);
      }
    }
  }
}
