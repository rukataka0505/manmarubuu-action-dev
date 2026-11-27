import * as THREE from 'three';

interface Particle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  rotVel: THREE.Vector3;
  age: number;
  maxAge: number;
  gravity: number;
  startScale: number;
  endScale: number;
}

interface ShockRing {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  age: number;
  maxAge: number;
  maxRadius: number;
}

export class VfxManager {
  private group = new THREE.Group();
  private particles: Particle[] = [];
  private rings: ShockRing[] = [];
  private maxParticles = 240;

  // Shared geometries
  private sphereGeo = new THREE.SphereGeometry(0.18, 8, 6);
  private boxGeo = new THREE.BoxGeometry(0.22, 0.22, 0.22);
  private confettiGeo = new THREE.PlaneGeometry(0.26, 0.16);
  private starGeo: THREE.BufferGeometry;
  private ringGeo = new THREE.RingGeometry(0.65, 1.0, 36);

  private dustMat = new THREE.MeshBasicMaterial({ color: 0xfff8ef, transparent: true, opacity: 0.85 });
  private paletteMats: THREE.MeshBasicMaterial[];
  private woodMats: THREE.MeshStandardMaterial[];

  constructor(scene: THREE.Scene) {
    scene.add(this.group);

    // 5-pointed star geometry
    const shape = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 0.24 : 0.11;
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    shape.closePath();
    this.starGeo = new THREE.ShapeGeometry(shape);

    const colors = [0xffde4a, 0xff6b9d, 0x5ee0ff, 0x80f078, 0xb884ff, 0xff9d4a];
    this.paletteMats = colors.map(
      (c) => new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide })
    );
    this.woodMats = [0xe8b674, 0xee6666, 0x55a8ef, 0x67cc74, 0xf2c94c].map(
      (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55 })
    );
  }

  private spawnParticle(
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    pos: THREE.Vector3,
    vel: THREE.Vector3,
    opts: { maxAge: number; gravity: number; startScale: number; endScale: number; spin?: number }
  ): void {
    if (this.particles.length >= this.maxParticles) {
      const old = this.particles.shift()!;
      this.group.remove(old.mesh);
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    mesh.scale.setScalar(opts.startScale);
    this.group.add(mesh);
    const sp = opts.spin ?? 4;
    this.particles.push({
      mesh,
      vel,
      rotVel: new THREE.Vector3(
        (Math.random() - 0.5) * sp,
        (Math.random() - 0.5) * sp,
        (Math.random() - 0.5) * sp
      ),
      age: 0,
      maxAge: opts.maxAge,
      gravity: opts.gravity,
      startScale: opts.startScale,
      endScale: opts.endScale,
    });
  }

  spawnCottonDust(pos: THREE.Vector3, count = 4): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 0.8 + Math.random() * 1.8;
      this.spawnParticle(
        this.sphereGeo,
        this.dustMat,
        new THREE.Vector3(pos.x + (Math.random() - 0.5) * 0.4, pos.y + 0.12, pos.z + (Math.random() - 0.5) * 0.4),
        new THREE.Vector3(Math.cos(a) * spd, 0.8 + Math.random() * 1.4, Math.sin(a) * spd),
        { maxAge: 0.42 + Math.random() * 0.18, gravity: 1.2, startScale: 0.9, endScale: 0.05 }
      );
    }
  }

  spawnStarBurst(pos: THREE.Vector3, count = 14, speed = 6.5): void {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const up = 2.5 + Math.random() * speed;
      const mat = this.paletteMats[i % this.paletteMats.length];
      this.spawnParticle(
        this.starGeo,
        mat,
        pos.clone().add(new THREE.Vector3(0, 0.5, 0)),
        new THREE.Vector3(Math.cos(a) * speed * 0.8, up, Math.sin(a) * speed * 0.8),
        { maxAge: 0.72 + Math.random() * 0.25, gravity: 14, startScale: 1.15, endScale: 0.1, spin: 9 }
      );
    }
  }

  spawnWoodChips(pos: THREE.Vector3, count = 12): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 3.0 + Math.random() * 6.0;
      const mat = this.woodMats[i % this.woodMats.length];
      this.spawnParticle(
        this.boxGeo,
        mat,
        pos.clone().add(new THREE.Vector3(0, 0.4, 0)),
        new THREE.Vector3(Math.cos(a) * sp, 4.0 + Math.random() * 6.5, Math.sin(a) * sp),
        { maxAge: 0.85, gravity: 22, startScale: 1.0, endScale: 0.05, spin: 12 }
      );
    }
  }

  spawnConfetti(pos: THREE.Vector3, count = 32): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 2.0 + Math.random() * 7.5;
      const mat = this.paletteMats[i % this.paletteMats.length];
      this.spawnParticle(
        this.confettiGeo,
        mat,
        pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.4, 1.2, (Math.random() - 0.5) * 1.4)),
        new THREE.Vector3(Math.cos(a) * sp, 6.0 + Math.random() * 8.0, Math.sin(a) * sp),
        { maxAge: 2.2 + Math.random() * 1.0, gravity: 7.5, startScale: 1.35, endScale: 0.9, spin: 11 }
      );
    }
  }

  spawnShockwaveRing(pos: THREE.Vector3, maxRadius = 6.2, colorHex = 0xffe46b, maxAge = 0.44): void {
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(this.ringGeo, mat);
    mesh.position.set(pos.x, pos.y + 0.14, pos.z);
    mesh.rotation.x = -Math.PI / 2;
    this.group.add(mesh);
    this.rings.push({ mesh, mat, age: 0, maxAge, maxRadius });
  }

  update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += dt;
      if (p.age >= p.maxAge) {
        this.group.remove(p.mesh);
        this.particles.splice(i, 1);
        continue;
      }
      p.vel.y -= p.gravity * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += p.rotVel.x * dt;
      p.mesh.rotation.y += p.rotVel.y * dt;
      p.mesh.rotation.z += p.rotVel.z * dt;
      const k = p.age / p.maxAge;
      const s = THREE.MathUtils.lerp(p.startScale, p.endScale, k);
      p.mesh.scale.setScalar(s);
    }

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.age += dt;
      if (r.age >= r.maxAge) {
        this.group.remove(r.mesh);
        r.mat.dispose();
        this.rings.splice(i, 1);
        continue;
      }
      const k = r.age / r.maxAge;
      const easeOut = 1 - Math.pow(1 - k, 3);
      r.mesh.scale.setScalar(0.5 + easeOut * r.maxRadius);
      r.mat.opacity = 0.92 * (1 - k);
    }
  }
}
