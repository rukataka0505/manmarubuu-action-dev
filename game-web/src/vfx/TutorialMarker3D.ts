import * as THREE from 'three';

export class TutorialMarker3D {
  private readonly root: THREE.Group;
  private readonly arrowGroup: THREE.Group;
  private readonly ringMesh: THREE.Mesh;
  private readonly pulseRingMesh: THREE.Mesh;
  private readonly ringMat: THREE.MeshBasicMaterial;
  private readonly pulseRingMat: THREE.MeshBasicMaterial;
  private readonly arrowMat: THREE.MeshStandardMaterial;
  private readonly geometries: THREE.BufferGeometry[] = [];

  private active = false;
  private heightOffset = 2.0;

  constructor(scene: THREE.Scene) {
    this.root = new THREE.Group();
    this.root.visible = false;

    this.arrowGroup = new THREE.Group();

    this.arrowMat = new THREE.MeshStandardMaterial({
      color: 0xffd54f,
      emissive: 0xffa000,
      emissiveIntensity: 0.65,
      roughness: 0.25,
      metalness: 0.55,
    });

    // 下向きコーン（矢じり）
    const coneGeo = new THREE.ConeGeometry(0.36, 0.62, 12);
    this.geometries.push(coneGeo);
    const coneMesh = new THREE.Mesh(coneGeo, this.arrowMat);
    coneMesh.rotation.x = Math.PI;
    coneMesh.position.y = 0.31;
    this.arrowGroup.add(coneMesh);

    // 矢印の軸
    const shaftGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.56, 10);
    this.geometries.push(shaftGeo);
    const shaftMesh = new THREE.Mesh(shaftGeo, this.arrowMat);
    shaftMesh.position.y = 0.88;
    this.arrowGroup.add(shaftMesh);

    this.root.add(this.arrowGroup);

    // 足元の脈打つ光のリング
    const ringGeo = new THREE.RingGeometry(0.52, 0.78, 32);
    this.geometries.push(ringGeo);
    this.ringMat = new THREE.MeshBasicMaterial({
      color: 0xffe066,
      transparent: true,
      opacity: 0.82,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.ringMesh = new THREE.Mesh(ringGeo, this.ringMat);
    this.ringMesh.rotation.x = -Math.PI / 2;
    this.root.add(this.ringMesh);

    // 外側へ広がるサブパルスリング
    const pulseRingGeo = new THREE.RingGeometry(0.62, 0.76, 32);
    this.geometries.push(pulseRingGeo);
    this.pulseRingMat = new THREE.MeshBasicMaterial({
      color: 0xfff3b0,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.pulseRingMesh = new THREE.Mesh(pulseRingGeo, this.pulseRingMat);
    this.pulseRingMesh.rotation.x = -Math.PI / 2;
    this.root.add(this.pulseRingMesh);

    scene.add(this.root);
  }

  setTarget(pos: THREE.Vector3 | null, heightOffset = 2.0, ringYOffset = 0.08): void {
    if (!pos) {
      this.active = false;
      this.root.visible = false;
      return;
    }

    this.active = true;
    this.root.visible = true;
    this.heightOffset = heightOffset;
    this.root.position.copy(pos);
    this.arrowGroup.position.y = heightOffset;
    this.ringMesh.position.y = ringYOffset;
    this.pulseRingMesh.position.y = ringYOffset + 0.01;
  }

  update(dt: number, time: number): void {
    if (!this.active) return;

    // 矢印の回転＆上下バウンド
    this.arrowGroup.rotation.y += dt * 2.4;
    const bob = Math.sin(time * 4.5) * 0.28;
    this.arrowGroup.position.y = this.heightOffset + bob;
    const arrowScale = 1 + Math.sin(time * 4.5) * 0.06;
    this.arrowGroup.scale.setScalar(arrowScale);

    // 足元リングの脈打ち
    const pulse = 0.5 + 0.5 * Math.sin(time * 4.2);
    this.ringMesh.scale.setScalar(0.92 + pulse * 0.24);
    this.ringMat.opacity = 0.52 + (1 - pulse) * 0.36;

    // 広がる波紋リング
    const wave = (time * 1.1) % 1;
    this.pulseRingMesh.scale.setScalar(0.85 + wave * 0.75);
    this.pulseRingMat.opacity = (1 - wave) * 0.55;
  }

  dispose(): void {
    this.root.removeFromParent();
    for (const geo of this.geometries) {
      geo.dispose();
    }
    this.arrowMat.dispose();
    this.ringMat.dispose();
    this.pulseRingMat.dispose();
  }
}
