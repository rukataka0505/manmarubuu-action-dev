import * as THREE from 'three';
import { mergeIndexedOrNonIndexed } from '../assets/GeometryMerge';

function createJellyDropGeometry(variant: 'mint' | 'pink', scaleFactor = 1.0): THREE.LatheGeometry {
  // Bottom-heavy plump waterdrop gumdrop silhouette matching art-bible 02!
  const pts: THREE.Vector2[] = [];
  const baseSteps = 5;
  for (let i = 0; i <= baseSteps; i++) {
    const u = i / baseSteps;
    const ang = u * Math.PI * 0.5;
    const r = Math.max(0.001, 0.70 * Math.sin(ang));
    const y = 0.08 * (1 - Math.cos(ang));
    pts.push(new THREE.Vector2(r * scaleFactor, y * scaleFactor));
  }
  const domeSteps = 20;
  for (let i = 1; i <= domeSteps; i++) {
    const s = i / domeSteps;
    const phi = s * Math.PI * 0.5;
    // Plump belly bulge around s=0.22 (~30% height), then smooth dome taper to apex
    const bulge = 1.0 + 0.16 * Math.sin(s * Math.PI);
    const r = Math.max(0.001, 0.70 * bulge * Math.pow(Math.cos(phi), 0.80));
    const y = 0.08 + 0.88 * Math.sin(phi);
    pts.push(new THREE.Vector2(r * scaleFactor, y * scaleFactor));
  }
  const geo = new THREE.LatheGeometry(pts, 38);
  geo.computeVertexNormals();

  // Soft vertical vertex gradient (cyan-mint top -> luminous lime bottom, or rose -> peach)
  const posAttr = geo.attributes.position;
  const colors = new Float32Array(posAttr.count * 3);
  const topCol = new THREE.Color(variant === 'mint' ? 0x8ef5f0 : 0xffa8ec);
  const midCol = new THREE.Color(variant === 'mint' ? 0x5aeaba : 0xf47be0);
  const botCol = new THREE.Color(variant === 'mint' ? 0xb4fa64 : 0xffc690);
  const cTmp = new THREE.Color();

  for (let i = 0; i < posAttr.count; i++) {
    const y01 = THREE.MathUtils.clamp(posAttr.getY(i) / (0.96 * scaleFactor), 0, 1);
    if (y01 < 0.45) {
      cTmp.lerpColors(botCol, midCol, y01 / 0.45);
    } else {
      cTmp.lerpColors(midCol, topCol, (y01 - 0.45) / 0.55);
    }
    colors[i * 3] = cTmp.r;
    colors[i * 3 + 1] = cTmp.g;
    colors[i * 3 + 2] = cTmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

export class JellySlime {
  public readonly group = new THREE.Group();
  public readonly pos: THREE.Vector3;
  public readonly homePos: THREE.Vector3;
  public alive = true;
  public isTutorialTarget = false;

  private bodyMesh: THREE.Mesh;
  private eyesGroup = new THREE.Group();
  private bubblesGroup = new THREE.Group();
  private visualRoot = new THREE.Group();
  private shadowDisc: THREE.Mesh;
  private hopPhase = Math.random() * Math.PI * 2;
  private prevHop = 0;
  private wobbleTimer = 0;
  private wanderAngle = Math.random() * Math.PI * 2;
  private squash = 1.0;
  private hitTimer = 0;
  private popOutVel: THREE.Vector3 | null = null;
  private popOutTimer = 0;

  constructor(
    pos: THREE.Vector3,
    variant: 'mint' | 'pink' = 'mint',
    isTutorial = false,
    externalVisual?: THREE.Object3D | null
  ) {
    this.pos = pos.clone();
    this.homePos = pos.clone();
    this.isTutorialTarget = isTutorial;
    this.group.position.copy(pos);
    this.group.add(this.visualRoot);

    const emissive = variant === 'mint' ? 0x20c88a : 0xd248c0;
    const geo = createJellyDropGeometry(variant, 1.0);
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      vertexColors: true,
      emissive,
      emissiveIntensity: 0.18,
      roughness: 0.06,
      metalness: 0.0,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      transparent: true,
      opacity: 0.82,
      envMapIntensity: 1.15,
    });
    this.bodyMesh = new THREE.Mesh(geo, mat);
    this.bodyMesh.castShadow = true;
    this.bodyMesh.receiveShadow = true;

    // Luminous inner gummy core visible through glossy translucent shell (zero transmission clipping!)
    const innerGeo = createJellyDropGeometry(variant, 0.72);
    const innerMat = new THREE.MeshBasicMaterial({
      color: variant === 'mint' ? 0x9cf7c8 : 0xffbdf0,
      transparent: true,
      opacity: 0.55,
    });
    const innerCore = new THREE.Mesh(innerGeo, innerMat);
    innerCore.position.y = 0.06;

    // Suspended jelly micro-bubbles inside dome matching art-bible 02! (merged to 1 draw call)
    const bubbleMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.62,
    });
    const bubbleGeo = new THREE.SphereGeometry(1, 8, 6);
    const bubbleItems: Array<{ geometry: THREE.BufferGeometry; matrix: THREE.Matrix4 }> = [];
    const bQuat = new THREE.Quaternion();
    const bPos = new THREE.Vector3();
    const bScale = new THREE.Vector3();
    for (let i = 0; i < 18; i++) {
      const a = i * 2.399;
      const r = 0.14 + (i % 4) * 0.11;
      const y = 0.18 + (i % 5) * 0.12;
      const sc = 0.02 + (i % 3) * 0.015;
      bPos.set(Math.cos(a) * r, y, Math.sin(a) * r);
      bScale.setScalar(sc);
      bubbleItems.push({
        geometry: bubbleGeo,
        matrix: new THREE.Matrix4().compose(bPos, bQuat, bScale),
      });
    }
    const mergedBubbleGeo = mergeIndexedOrNonIndexed(bubbleItems);
    bubbleGeo.dispose();
    if (mergedBubbleGeo) {
      this.bubblesGroup.add(new THREE.Mesh(mergedBubbleGeo, bubbleMat));
    }

    // Glossy black jelly eyes with crisp white highlight nestled on lower plump curve (merged L+R)
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x161820 });
    const eyeGeo = new THREE.SphereGeometry(0.088, 12, 10);
    const shineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const shineGeo = new THREE.SphereGeometry(0.034, 8, 6);

    const eyeItems: Array<{ geometry: THREE.BufferGeometry; matrix: THREE.Matrix4 }> = [];
    const shineItems: Array<{ geometry: THREE.BufferGeometry; matrix: THREE.Matrix4 }> = [];
    const eyeScale = new THREE.Vector3(0.95, 1.15, 0.70);
    const oneScale = new THREE.Vector3(1, 1, 1);
    for (const sx of [-0.21, 0.21]) {
      const eyeM = new THREE.Matrix4().compose(
        new THREE.Vector3(sx, 0.36, 0.63),
        bQuat,
        eyeScale
      );
      eyeItems.push({ geometry: eyeGeo, matrix: eyeM });

      const localShineM = new THREE.Matrix4().compose(
        new THREE.Vector3(0.026, 0.035, 0.065),
        bQuat,
        oneScale
      );
      shineItems.push({
        geometry: shineGeo,
        matrix: new THREE.Matrix4().multiplyMatrices(eyeM, localShineM),
      });
    }
    const mergedEyeGeo = mergeIndexedOrNonIndexed(eyeItems);
    const mergedShineGeo = mergeIndexedOrNonIndexed(shineItems);
    eyeGeo.dispose();
    shineGeo.dispose();
    if (mergedEyeGeo) this.eyesGroup.add(new THREE.Mesh(mergedEyeGeo, eyeMat));
    if (mergedShineGeo) this.eyesGroup.add(new THREE.Mesh(mergedShineGeo, shineMat));
    this.visualRoot.add(innerCore, this.bodyMesh, this.bubblesGroup, this.eyesGroup);

    // Grounded contact shadow disc right under the slime
    this.shadowDisc = new THREE.Mesh(
      new THREE.CircleGeometry(0.72, 20),
      new THREE.MeshBasicMaterial({
        color: 0x182818,
        transparent: true,
        opacity: 0.30,
        depthWrite: false,
      })
    );
    this.shadowDisc.rotation.x = -Math.PI / 2;
    this.shadowDisc.position.y = 0.02;
    this.group.add(this.shadowDisc);

    if (externalVisual) {
      innerCore.visible = false;
      this.bodyMesh.visible = false;
      this.bubblesGroup.visible = false;
      this.eyesGroup.visible = false;
      this.visualRoot.add(externalVisual);
    }
  }

  defeat(knockDir?: THREE.Vector3): void {
    if (!this.alive) return;
    this.alive = false;
    const dir = knockDir ? knockDir.clone().normalize() : new THREE.Vector3(0, 1, 0);
    this.popOutVel = new THREE.Vector3(dir.x * 7, 9.5, dir.z * 7);
    this.popOutTimer = 0.48;
  }

  update(
    dt: number,
    playerPos: THREE.Vector3,
    playerVelY: number,
    feverActive: boolean,
    onStomped: (slime: JellySlime) => void,
    onTouchDamage: (slime: JellySlime) => void
  ): void {
    if (!this.alive) {
      if (this.popOutVel && this.popOutTimer > 0) {
        this.popOutTimer -= dt;
        this.popOutVel.y -= 24 * dt;
        this.group.position.addScaledVector(this.popOutVel, dt);
        this.group.scale.multiplyScalar(Math.max(0.05, 1 - dt * 2.8));
        this.group.rotation.x += 12 * dt;
      } else {
        this.group.visible = false;
      }
      return;
    }

    if (this.hitTimer > 0) this.hitTimer -= dt;

    // Gentle hopping patrol around home + elastic landing wobble
    const prevHop = this.prevHop;
    this.hopPhase += dt * 4.0;
    const hop = Math.max(0, Math.sin(this.hopPhase));
    this.prevHop = hop;
    if (prevHop > 0.03 && hop <= 0.03) {
      this.wobbleTimer = 0.55;
    }
    if (this.wobbleTimer > 0) this.wobbleTimer = Math.max(0, this.wobbleTimer - dt);
    const wobble = this.wobbleTimer > 0 ? Math.sin(this.wobbleTimer * 28.0) * (this.wobbleTimer / 0.55) * 0.20 : 0.0;
    this.squash = 1 + (hop > 0.1 ? 0.16 * hop : -0.16 * Math.abs(Math.sin(this.hopPhase))) - wobble;
    this.bubblesGroup.rotation.y += dt * 0.6;

    if (!this.isTutorialTarget) {
      this.wanderAngle += dt * 0.7;
      const targetX = this.homePos.x + Math.cos(this.wanderAngle) * 2.8;
      const targetZ = this.homePos.z + Math.sin(this.wanderAngle) * 2.8;
      const dx = targetX - this.pos.x;
      const dz = targetZ - this.pos.z;
      this.pos.x += dx * dt * 1.1;
      this.pos.z += dz * dt * 1.1;
      this.group.rotation.y = Math.atan2(dx, dz);
    } else {
      // Tutorial slime faces player invitingly
      this.group.rotation.y = Math.atan2(playerPos.x - this.pos.x, playerPos.z - this.pos.z);
    }

    this.group.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.visualRoot.position.y = hop * 0.52;
    const invSqrt = 1 / Math.sqrt(Math.max(0.5, this.squash));
    this.visualRoot.scale.set(invSqrt, this.squash, invSqrt);
    this.shadowDisc.scale.setScalar(Math.max(0.65, 1.0 - hop * 0.28));
    (this.shadowDisc.material as THREE.MeshBasicMaterial).opacity = Math.max(0.14, 0.30 - hop * 0.12);

    // Player interaction
    const horizDist = Math.hypot(playerPos.x - this.pos.x, playerPos.z - this.pos.z);
    const slimeY = this.pos.y + hop * 0.52;
    const slimeTop = slimeY + 0.85;
    if (horizDist < 1.18) {
      const dy = playerPos.y - slimeY;
      if (feverActive) {
        this.defeat(new THREE.Vector3(this.pos.x - playerPos.x, 0.5, this.pos.z - playerPos.z));
        onStomped(this);
      } else if (dy > 0.28 && dy < 1.55 && playerVelY <= 1.8) {
        this.defeat();
        onStomped(this);
      } else if (Math.abs(playerPos.y - slimeY) < 0.9 && playerPos.y < slimeTop && !this.isTutorialTarget) {
        onTouchDamage(this);
      }
    }
  }
}
