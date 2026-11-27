import * as THREE from 'three';

export class PropellerBalloon {
  public readonly group = new THREE.Group();
  public readonly pos: THREE.Vector3;
  public readonly homePos: THREE.Vector3;
  public alive = true;

  private propeller: THREE.Object3D;
  private visualRoot = new THREE.Group();
  private targetHalo: THREE.Mesh;
  private respawnTimer = 0;
  private popBurstTimer = 0;
  private respawnSpringTimer = 0;
  private phase = Math.random() * Math.PI * 2;

  constructor(pos: THREE.Vector3, externalVisual?: THREE.Object3D | null) {
    this.pos = pos.clone();
    this.homePos = pos.clone();
    this.group.position.copy(pos);
    this.group.add(this.visualRoot);

    const balloonMat = new THREE.MeshPhysicalMaterial({
      color: 0xb784f5,
      roughness: 0.16,
      clearcoat: 0.85,
      clearcoatRoughness: 0.1,
    });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0xdfb27c, roughness: 0.48 });

    const body = new THREE.Mesh(new THREE.SphereGeometry(0.74, 22, 16), balloonMat);
    body.scale.set(0.95, 1.15, 0.95);
    body.castShadow = true;
    this.group.add(body);

    // Knot at bottom
    const knot = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.22, 10), balloonMat);
    knot.position.y = -0.88;
    this.group.add(knot);

    // Wooden cap & propeller
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5),
      woodMat
    );
    cap.position.y = 0.74;
    this.group.add(cap);

    this.propeller = new THREE.Group();
    this.propeller.position.y = 1.06;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.05, 0.18), woodMat);
    blade.castShadow = true;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.12, 10), woodMat);
    this.propeller.add(blade, hub);
    this.group.add(this.propeller);

    // Angry cute face
    const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const darkMat = new THREE.MeshBasicMaterial({ color: 0x221c2a });
    for (const sx of [-0.22, 0.22]) {
      const ew = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 10), whiteMat);
      ew.position.set(sx, 0.12, 0.65);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), darkMat);
      pupil.position.set(0, 0, 0.11);
      ew.add(pupil);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.07, 0.08), balloonMat);
      brow.position.set(sx, 0.27, 0.68);
      brow.rotation.z = sx < 0 ? -0.35 : 0.35;
      this.group.add(ew, brow);
    }
    const mouth = new THREE.Mesh(
      new THREE.TorusGeometry(0.12, 0.032, 6, 12, Math.PI),
      darkMat
    );
    mouth.position.set(0, -0.18, 0.68);
    this.visualRoot.add(body, knot, cap, this.propeller, mouth);
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
              m.envMapIntensity = m.metalness > 0.5 ? 1.25 : 0.95;
              m.needsUpdate = true;
            }
          }
        }
      });
      const extProp = externalVisual.getObjectByName('Propeller') ?? externalVisual.getObjectByName('Rotor');
      if (extProp) this.propeller = extProp;
    }

    // Soft aerial target ring below balloon to aid mid-air stomp depth perception
    this.targetHalo = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.72, 24),
      new THREE.MeshBasicMaterial({
        color: 0xdab8ff,
        transparent: true,
        opacity: 0.42,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    this.targetHalo.rotation.x = -Math.PI / 2;
    this.targetHalo.position.y = -0.35;
    this.group.add(this.targetHalo);
  }

  pop(): void {
    if (!this.alive) return;
    this.alive = false;
    this.popBurstTimer = 0.08;
    this.respawnTimer = 4.2; // Respawns cleanly so platforming bridges stay reliable
  }

  update(
    dt: number,
    playerPos: THREE.Vector3,
    playerVelY: number,
    feverActive: boolean,
    onBounced: (balloon: PropellerBalloon) => void
  ): void {
    if (!this.alive) {
      if (this.popBurstTimer > 0) {
        this.popBurstTimer -= dt;
        const k = 1 - Math.max(0, this.popBurstTimer / 0.08);
        this.visualRoot.scale.setScalar(1.0 + k * 0.42);
        if (this.popBurstTimer <= 0) {
          this.group.visible = false;
          this.visualRoot.scale.setScalar(1.0);
        }
        return;
      }
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) {
        this.alive = true;
        this.group.visible = true;
        this.respawnSpringTimer = 0.45;
      }
      return;
    }

    if (this.respawnSpringTimer > 0) {
      this.respawnSpringTimer = Math.max(0, this.respawnSpringTimer - dt);
      const k = 1 - this.respawnSpringTimer / 0.45;
      const sc = k + Math.sin(k * Math.PI * 2.5) * (1 - k) * 0.35;
      this.visualRoot.scale.setScalar(Math.max(0.1, sc));
    } else {
      this.visualRoot.scale.setScalar(1.0);
    }

    this.phase += dt * 2.4;
    this.pos.y = this.homePos.y + Math.sin(this.phase) * 0.45;
    this.group.position.copy(this.pos);
    this.group.rotation.z = Math.sin(this.phase * 1.4) * 0.08;
    this.propeller.rotation.y += dt * 22.0;
    this.targetHalo.scale.setScalar(1.0 + Math.sin(this.phase * 2.0) * 0.08);

    // Face gently toward player
    const targetYaw = Math.atan2(playerPos.x - this.pos.x, playerPos.z - this.pos.z);
    this.group.rotation.y = targetYaw;

    const horizDist = Math.hypot(playerPos.x - this.pos.x, playerPos.z - this.pos.z);
    const dy = playerPos.y - this.pos.y;
    if (horizDist < 1.35 && dy > -0.6 && dy < 1.45 && (playerVelY <= 1.5 || feverActive)) {
      this.pop();
      onBounced(this);
    }
  }
}
