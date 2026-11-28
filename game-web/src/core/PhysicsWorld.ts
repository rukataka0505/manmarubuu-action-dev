import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { withTimeout } from '../assets/AssetLoaderUtils';

export interface DynamicBodyRecord {
  id: number;
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  mesh: THREE.Object3D;
  kind: 'block' | 'crate' | 'domino' | 'pin' | 'debris';
  hp: number;
  broken: boolean;
  onBreak?: (pos: THREE.Vector3, kind: DynamicBodyRecord['kind']) => void;
}

export class PhysicsWorld {
  public rapier!: typeof RAPIER;
  public world!: RAPIER.World;
  public charController!: RAPIER.KinematicCharacterController;
  public playerCollider!: RAPIER.Collider;
  public playerBody!: RAPIER.RigidBody;

  private dynamicRecords = new Map<number, DynamicBodyRecord>();
  private colliderToRecord = new Map<number, DynamicBodyRecord>();
  private staticColliders = new Set<number>();
  private staticBodyByCollider = new Map<number, RAPIER.RigidBody>();
  private slideColliders = new Set<number>();
  private slideDirByCollider = new Map<number, { x: number; z: number }>();
  private cushionColliders = new Map<number, { topY: number; onBounce?: () => void }>();
  private nextId = 1;
  private maxDynamicCount = 160;

  static async create(): Promise<PhysicsWorld> {
    const pw = new PhysicsWorld();
    await pw.init();
    return pw;
  }

  private initWorldState(): void {
    this.dynamicRecords.clear();
    this.colliderToRecord.clear();
    this.staticColliders.clear();
    this.staticBodyByCollider.clear();
    this.slideColliders.clear();
    this.slideDirByCollider.clear();
    this.cushionColliders.clear();
    this.nextId = 1;

    this.world = new RAPIER.World({ x: 0, y: -24.0, z: 0 });

    // Character controller for Mario-style crisp platforming
    this.charController = this.world.createCharacterController(0.03);
    this.charController.enableAutostep(0.38, 0.22, true);
    this.charController.enableSnapToGround(0.32);
    this.charController.setMaxSlopeClimbAngle((52 * Math.PI) / 180);
    this.charController.setMinSlopeSlideAngle((58 * Math.PI) / 180);
    this.charController.setApplyImpulsesToDynamicBodies(true);
    this.charController.setCharacterMass(3.2);

    // Player capsule collider (1.0m total height, center at +0.50m)
    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 1.2, 42);
    this.playerBody = this.world.createRigidBody(bodyDesc);
    const colDesc = RAPIER.ColliderDesc.capsule(0.22, 0.28).setTranslation(0, 0.50, 0);
    this.playerCollider = this.world.createCollider(colDesc, this.playerBody);
  }

  async init(): Promise<void> {
    await withTimeout(RAPIER.init(), 20000, 'Rapier physics WASM');
    this.rapier = RAPIER;
    this.initWorldState();
  }

  reset(): void {
    try {
      this.world?.free();
    } catch {
      // Ignore double-free
    }
    this.initWorldState();
  }

  setPlayerPosition(x: number, y: number, z: number): void {
    this.playerBody.setNextKinematicTranslation({ x, y, z });
    this.playerBody.setTranslation({ x, y, z }, true);
  }

  getPlayerPosition(out = new THREE.Vector3()): THREE.Vector3 {
    const t = this.playerBody.translation();
    return out.set(t.x, t.y, t.z);
  }

  addStaticBox(
    cx: number,
    cy: number,
    cz: number,
    hx: number,
    hy: number,
    hz: number,
    opts?: {
      rotEuler?: THREE.Euler;
      friction?: number;
      isSlide?: boolean;
      slideDir?: { x: number; z: number };
      cushionTopY?: number;
      onCushion?: () => void;
      ignoreRays?: boolean;
    }
  ): RAPIER.Collider {
    const rbDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(cx, cy, cz);
    if (opts?.rotEuler) {
      const q = new THREE.Quaternion().setFromEuler(opts.rotEuler);
      rbDesc.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    }
    const rb = this.world.createRigidBody(rbDesc);
    const colDesc = RAPIER.ColliderDesc.cuboid(hx, hy, hz).setFriction(opts?.friction ?? 0.6);
    const col = this.world.createCollider(colDesc, rb);
    this.staticBodyByCollider.set(col.handle, rb);
    if (!opts?.ignoreRays) {
      this.staticColliders.add(col.handle);
    }
    if (opts?.isSlide) {
      this.slideColliders.add(col.handle);
      if (opts.slideDir) this.slideDirByCollider.set(col.handle, opts.slideDir);
    }
    if (opts?.cushionTopY !== undefined) {
      this.cushionColliders.set(col.handle, { topY: opts.cushionTopY, onBounce: opts.onCushion });
    }
    return col;
  }

  removeStaticCollider(col: RAPIER.Collider): void {
    const handle = col.handle;
    this.staticColliders.delete(handle);
    this.slideColliders.delete(handle);
    this.slideDirByCollider.delete(handle);
    this.cushionColliders.delete(handle);
    const rb = this.staticBodyByCollider.get(handle);
    if (rb) {
      this.staticBodyByCollider.delete(handle);
      this.world.removeRigidBody(rb);
    } else {
      this.world.removeCollider(col, true);
    }
  }

  addStaticCylinder(
    cx: number,
    cy: number,
    cz: number,
    halfHeight: number,
    radius: number,
    opts?: { friction?: number }
  ): RAPIER.Collider {
    const rb = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(cx, cy, cz));
    const col = this.world.createCollider(
      RAPIER.ColliderDesc.cylinder(halfHeight, radius).setFriction(opts?.friction ?? 0.65),
      rb
    );
    this.staticColliders.add(col.handle);
    return col;
  }

  addStaticTrimesh(
    geometry: THREE.BufferGeometry,
    pos: THREE.Vector3,
    rot?: THREE.Euler,
    opts?: { isSlide?: boolean; slideDir?: { x: number; z: number }; friction?: number }
  ): RAPIER.Collider | null {
    const posAttr = geometry.getAttribute('position');
    if (!posAttr) return null;
    const vertices = new Float32Array(posAttr.count * 3);
    for (let i = 0; i < posAttr.count; i++) {
      vertices[i * 3] = posAttr.getX(i);
      vertices[i * 3 + 1] = posAttr.getY(i);
      vertices[i * 3 + 2] = posAttr.getZ(i);
    }
    let indices: Uint32Array;
    if (geometry.index) {
      const idx = geometry.index.array;
      indices = new Uint32Array(idx.length);
      for (let i = 0; i < idx.length; i++) indices[i] = idx[i];
    } else {
      indices = new Uint32Array(posAttr.count);
      for (let i = 0; i < posAttr.count; i++) indices[i] = i;
    }

    const rbDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(pos.x, pos.y, pos.z);
    if (rot) {
      const q = new THREE.Quaternion().setFromEuler(rot);
      rbDesc.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    }
    const rb = this.world.createRigidBody(rbDesc);
    const colDesc = RAPIER.ColliderDesc.trimesh(vertices, indices).setFriction(opts?.friction ?? 0.25);
    const col = this.world.createCollider(colDesc, rb);
    this.staticColliders.add(col.handle);
    if (opts?.isSlide) {
      this.slideColliders.add(col.handle);
      if (opts.slideDir) this.slideDirByCollider.set(col.handle, opts.slideDir);
    }
    return col;
  }

  addDynamicBox(
    mesh: THREE.Object3D,
    hx: number,
    hy: number,
    hz: number,
    kind: DynamicBodyRecord['kind'],
    hp = 1,
    density = 0.85,
    onBreak?: DynamicBodyRecord['onBreak']
  ): DynamicBodyRecord {
    // Enforce cap for 60fps safety
    if (this.dynamicRecords.size >= this.maxDynamicCount) {
      const firstKey = this.dynamicRecords.keys().next().value;
      if (firstKey !== undefined) this.removeDynamic(firstKey);
    }

    const p = mesh.position;
    const q = mesh.quaternion;
    const rbDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(p.x, p.y, p.z)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
      .setLinearDamping(0.35)
      .setAngularDamping(0.45)
      .setCanSleep(true);
    const body = this.world.createRigidBody(rbDesc);
    const colDesc = RAPIER.ColliderDesc.cuboid(hx, hy, hz)
      .setDensity(density)
      .setFriction(0.55)
      .setRestitution(0.24);
    const collider = this.world.createCollider(colDesc, body);

    const rec: DynamicBodyRecord = {
      id: this.nextId++,
      body,
      collider,
      mesh,
      kind,
      hp,
      broken: false,
      onBreak,
    };
    this.dynamicRecords.set(rec.id, rec);
    this.colliderToRecord.set(collider.handle, rec);
    return rec;
  }

  removeDynamic(id: number): void {
    const rec = this.dynamicRecords.get(id);
    if (!rec) return;
    rec.broken = true;
    this.colliderToRecord.delete(rec.collider.handle);
    this.world.removeRigidBody(rec.body);
    rec.mesh.parent?.remove(rec.mesh);
    this.dynamicRecords.delete(id);
  }

  movePlayer(
    desiredDelta: THREE.Vector3
  ): {
    pos: THREE.Vector3;
    grounded: boolean;
    onSlide: boolean;
    slideDir: { x: number; z: number } | null;
    hitWall: boolean;
    hitCushion: { topY: number; onBounce?: () => void } | null;
    touchedDynamics: DynamicBodyRecord[];
  } {
    this.charController.computeColliderMovement(
      this.playerCollider,
      { x: desiredDelta.x, y: desiredDelta.y, z: desiredDelta.z },
      undefined,
      undefined,
      (col) => col.handle !== this.playerCollider.handle
    );

    const corr = this.charController.computedMovement();
    const cur = this.playerBody.translation();
    const next = {
      x: cur.x + corr.x,
      y: cur.y + corr.y,
      z: cur.z + corr.z,
    };
    this.playerBody.setNextKinematicTranslation(next);

    let grounded = this.charController.computedGrounded();
    let onSlide = false;
    let slideDir: { x: number; z: number } | null = null;
    let hitWall = false;
    let hitCushion: { topY: number; onBounce?: () => void } | null = null;
    const touchedDynamics: DynamicBodyRecord[] = [];
    const seenIds = new Set<number>();

    const count = this.charController.numComputedCollisions();
    for (let i = 0; i < count; i++) {
      const c = this.charController.computedCollision(i);
      if (!c) continue;
      if (c.normal1 && Math.abs(c.normal1.y) < 0.35 && Math.hypot(desiredDelta.x, desiredDelta.z) > 0.01) {
        // Horizontal obstruction check
        const dot = desiredDelta.x * c.normal1.x + desiredDelta.z * c.normal1.z;
        if (dot < -0.02) hitWall = true;
      }
      if (c.collider) {
        const h = c.collider.handle;
        if (this.slideColliders.has(h)) {
          onSlide = true;
          grounded = true;
          const sd = this.slideDirByCollider.get(h);
          if (sd) slideDir = sd;
        }
        const cush = this.cushionColliders.get(h);
        if (cush && c.normal1 && c.normal1.y > 0.45) {
          hitCushion = cush;
        }
        const dyn = this.colliderToRecord.get(h);
        if (dyn && !seenIds.has(dyn.id)) {
          seenIds.add(dyn.id);
          touchedDynamics.push(dyn);
        }
      }
    }

    return {
      pos: new THREE.Vector3(next.x, next.y, next.z),
      grounded,
      onSlide,
      slideDir,
      hitWall,
      hitCushion,
      touchedDynamics,
    };
  }

  castGroundRay(origin: THREE.Vector3, maxDist = 40): { y: number; isSlide: boolean } | null {
    const ray = new this.rapier.Ray({ x: origin.x, y: origin.y, z: origin.z }, { x: 0, y: -1, z: 0 });
    const hit = this.world.castRay(
      ray,
      maxDist,
      true,
      undefined,
      undefined,
      this.playerCollider,
      undefined,
      (col) => this.staticColliders.has(col.handle)
    );
    if (!hit) return null;
    return {
      y: origin.y - hit.timeOfImpact,
      isSlide: this.slideColliders.has(hit.collider.handle),
    };
  }

  castCameraRay(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number): number | null {
    const ray = new this.rapier.Ray(
      { x: origin.x, y: origin.y, z: origin.z },
      { x: dir.x, y: dir.y, z: dir.z }
    );
    const hit = this.world.castRay(
      ray,
      maxDist,
      true,
      undefined,
      undefined,
      this.playerCollider,
      undefined,
      (col) => this.staticColliders.has(col.handle)
    );
    return hit ? hit.timeOfImpact : null;
  }

  applyRadialSmash(
    center: THREE.Vector3,
    radius: number,
    impulseMag: number,
    breakCrates = true
  ): DynamicBodyRecord[] {
    const affected: DynamicBodyRecord[] = [];
    const toRemove: number[] = [];

    for (const rec of this.dynamicRecords.values()) {
      if (rec.broken) continue;
      const t = rec.body.translation();
      const dx = t.x - center.x;
      const dy = t.y - center.y;
      const dz = t.z - center.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > radius) continue;

      const falloff = 1.0 - dist / (radius * 1.15);
      const nx = dist > 0.05 ? dx / dist : (Math.random() - 0.5);
      const nz = dist > 0.05 ? dz / dist : (Math.random() - 0.5);
      rec.body.wakeUp();
      rec.body.applyImpulse(
        {
          x: nx * impulseMag * falloff,
          y: (impulseMag * 0.85 + 4.5) * falloff,
          z: nz * impulseMag * falloff,
        },
        true
      );
      rec.body.applyTorqueImpulse(
        {
          x: (Math.random() - 0.5) * impulseMag * 0.8,
          y: (Math.random() - 0.5) * impulseMag * 0.8,
          z: (Math.random() - 0.5) * impulseMag * 0.8,
        },
        true
      );

      if (breakCrates && (rec.kind === 'crate' || rec.kind === 'block')) {
        rec.hp -= 1;
        if (rec.hp <= 0) {
          rec.broken = true;
          rec.onBreak?.(new THREE.Vector3(t.x, t.y, t.z), rec.kind);
          toRemove.push(rec.id);
        }
      }
      affected.push(rec);
    }

    for (const id of toRemove) {
      this.removeDynamic(id);
    }
    return affected;
  }

  getDynamicRecords(): IterableIterator<DynamicBodyRecord> {
    return this.dynamicRecords.values();
  }

  step(dt: number): void {
    this.world.timestep = Math.min(dt, 1 / 30);
    this.world.step();

    // Sync Three.js meshes from Rapier dynamic bodies
    const toCull: number[] = [];
    for (const rec of this.dynamicRecords.values()) {
      const t = rec.body.translation();
      if (t.y < -35) {
        toCull.push(rec.id);
        continue;
      }
      const r = rec.body.rotation();
      rec.mesh.position.set(t.x, t.y, t.z);
      rec.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }
    for (const id of toCull) {
      this.removeDynamic(id);
    }
  }
}
