import * as THREE from 'three';
import { mergeIndexedOrNonIndexed } from '../assets/GeometryMerge';
import type { ResolvedQuality } from '../types';

interface DayCloudCluster {
  baseAngle: number;
  dist: number;
  baseY: number;
  speed: number;
  puffOffsets: Array<{ pos: THREE.Vector3; scale: THREE.Vector3 }>;
}

export class SkyboxAndLighting {
  public readonly sunLight: THREE.DirectionalLight;
  private readonly fillLight: THREE.DirectionalLight;
  private readonly hemiLight: THREE.HemisphereLight;
  private readonly skyMat: THREE.ShaderMaterial;
  private readonly dayCloudMat: THREE.ShaderMaterial;
  private readonly duskCloudMat: THREE.ShaderMaterial;
  private readonly seaCloudMat: THREE.ShaderMaterial;
  private dayCloudClusters: DayCloudCluster[] = [];
  private dayCloudInst: THREE.InstancedMesh;
  private highPuffGeo: THREE.BufferGeometry;
  private lowPuffGeo: THREE.BufferGeometry;
  private quality: ResolvedQuality;
  private cloudFrameCount = 0;
  private duskCloudMesh: THREE.Mesh | null = null;
  private seaCloudMesh: THREE.Mesh | null = null;
  private readonly tmpDummy = new THREE.Object3D();
  private readonly tmpLocalMat = new THREE.Matrix4();
  private readonly tmpInstMat = new THREE.Matrix4();
  private readonly zeroQuat = new THREE.Quaternion();

  private readonly daySunCol = new THREE.Color(0xffe9be);
  private readonly duskSunCol = new THREE.Color(0xff9f45);
  private readonly dayHemiSky = new THREE.Color(0xfff6e0);
  private readonly duskHemiSky = new THREE.Color(0x4c5ca8);
  private readonly dayHemiGround = new THREE.Color(0x68583c);
  private readonly duskHemiGround = new THREE.Color(0x4a2f1e);
  private readonly indoorSunCol = new THREE.Color(0xffe19c);
  private readonly indoorBossSunCol = new THREE.Color(0xffbe72);
  private readonly indoorHemiSky = new THREE.Color(0xfff6dc);
  private readonly indoorBossHemiSky = new THREE.Color(0xffe4bd);
  private readonly indoorHemiGround = new THREE.Color(0xc89a64);
  private readonly indoorBossHemiGround = new THREE.Color(0x9e7248);
  private readonly indoorFillCol = new THREE.Color(0xffe6be);
  private readonly outdoorFillCol = new THREE.Color(0xfff3dc);
  private readonly tmpSunDir = new THREE.Vector3();
  private indoorMode = false;

  constructor(scene: THREE.Scene, initialQuality: ResolvedQuality = 'medium') {
    // Dual-mood sunlit sky dome <-> dusk starry gradient sky dome for Boss Arena
    const skyGeo = new THREE.SphereGeometry(290, 40, 24);
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uBossMood: { value: 0.0 },
        uTime: { value: 0.0 },
      },
      vertexShader: `
        varying vec3 vWorldDir;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldDir = normalize(position);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform float uBossMood;
        uniform float uTime;
        varying vec3 vWorldDir;

        float hash31(vec3 p) {
          p = fract(p * 0.1031);
          p += dot(p, p.yzx + 33.33);
          return fract((p.x + p.y) * p.z);
        }

        void main() {
          vec3 d = normalize(vWorldDir);
          float h = d.y;

          // Day crisp Nintendo sky (Art Bible 07)
          vec3 dayBottom = vec3(0.74, 0.90, 1.0);
          vec3 dayMid = vec3(0.40, 0.78, 1.0);
          vec3 dayTop = vec3(0.12, 0.50, 0.92);
          vec3 dayCol = mix(dayBottom, dayMid, smoothstep(-0.08, 0.24, h));
          dayCol = mix(dayCol, dayTop, smoothstep(0.24, 0.84, h));

          // Dusk starry twilight sky (Art Bible 09: low golden sunset horizon -> deep indigo starfield!)
          float sunAzimuth = smoothstep(-0.35, 0.92, dot(normalize(vec2(d.x, d.z) + vec2(1e-4)), normalize(vec2(-0.78, -0.62))));
          vec3 duskGlow = mix(vec3(0.84, 0.48, 0.24), vec3(1.0, 0.78, 0.34), sunAzimuth);
          vec3 duskCoral = mix(vec3(0.22, 0.18, 0.36), vec3(0.74, 0.42, 0.28), sunAzimuth);
          vec3 duskIndigo = vec3(0.05, 0.09, 0.25);
          vec3 duskZenith = vec3(0.02, 0.04, 0.14);
          vec3 duskCol = mix(duskGlow, duskCoral, smoothstep(-0.02, 0.06, h));
          duskCol = mix(duskCol, duskIndigo, smoothstep(0.04, 0.16, h));
          duskCol = mix(duskCol, duskZenith, smoothstep(0.16, 0.52, h));

          // Crisp 2-layer twinkling starfield visible across upper twilight hemisphere
          if (uBossMood > 0.02 && h > 0.05) {
            float starMask = smoothstep(0.05, 0.20, h) * uBossMood;
            vec3 cell1 = floor(d * 120.0);
            float rnd1 = hash31(cell1);
            if (rnd1 > 0.985) {
              vec3 center1 = normalize(cell1 + 0.5);
              float dist1 = length(d - center1) * 120.0;
              float star1 = smoothstep(0.38, 0.04, dist1);
              float tw1 = 0.72 + 0.28 * sin(uTime * (2.0 + rnd1 * 4.0) + rnd1 * 50.0);
              duskCol += vec3(1.0, 0.96, 0.84) * star1 * tw1 * starMask * 1.45;
            }
            vec3 cell2 = floor(d * 230.0);
            float rnd2 = hash31(cell2 + 19.3);
            if (rnd2 > 0.982) {
              vec3 center2 = normalize(cell2 + 0.5);
              float dist2 = length(d - center2) * 230.0;
              float star2 = smoothstep(0.34, 0.05, dist2);
              float tw2 = 0.65 + 0.35 * cos(uTime * (2.6 + rnd2 * 3.5) + rnd2 * 70.0);
              duskCol += vec3(0.86, 0.92, 1.0) * star2 * tw2 * starMask * 0.95;
            }
          }

          vec3 col = mix(dayCol, duskCol, uBossMood);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    scene.add(new THREE.Mesh(skyGeo, this.skyMat));

    this.hemiLight = new THREE.HemisphereLight(0xfff6e0, 0x68583c, 0.40);
    scene.add(this.hemiLight);

    // Angled golden sunlight for crisp long diorama drop shadows!
    this.sunLight = new THREE.DirectionalLight(0xffe9be, 2.45);
    this.sunLight.position.set(46, 30, 26);
    const initShadowSz = initialQuality === 'high' ? 2048 : 1024;
    this.sunLight.castShadow = initialQuality !== 'low';
    this.sunLight.shadow.mapSize.set(initShadowSz, initShadowSz);
    this.sunLight.shadow.camera.near = 4;
    this.sunLight.shadow.camera.far = 145;
    const d = 38;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.00035;
    this.sunLight.shadow.normalBias = 0.025;
    scene.add(this.sunLight);
    scene.add(this.sunLight.target);

    // Restrained warm back fill so shadow depth stays crisp
    this.fillLight = new THREE.DirectionalLight(0xfff3dc, 0.12);
    this.fillLight.position.set(-45, 22, -35);
    scene.add(this.fillLight);

    const makeCloudShader = (
      litHex: number,
      shadowHex: number,
      rimHex: number,
      rimPow: number,
      rimStrength: number
    ): THREE.ShaderMaterial =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: true,
        uniforms: {
          uSunDir: { value: new THREE.Vector3(0.75, 0.50, 0.43).normalize() },
          uLitCol: { value: new THREE.Color(litHex) },
          uShadowCol: { value: new THREE.Color(shadowHex) },
          uRimCol: { value: new THREE.Color(rimHex) },
          uRimPow: { value: rimPow },
          uRimStrength: { value: rimStrength },
          uOpacity: { value: 1.0 },
        },
        vertexShader: `
          varying vec3 vWorldNormal;
          varying vec3 vViewDir;
          void main() {
            vec4 localPos = vec4(position, 1.0);
            vec3 localNormal = normal;
            #ifdef USE_INSTANCING
              localPos = instanceMatrix * localPos;
              vec3 c0 = instanceMatrix[0].xyz;
              vec3 c1 = instanceMatrix[1].xyz;
              vec3 c2 = instanceMatrix[2].xyz;
              localNormal =
                normal.x * c0 / max(dot(c0, c0), 1e-6) +
                normal.y * c1 / max(dot(c1, c1), 1e-6) +
                normal.z * c2 / max(dot(c2, c2), 1e-6);
            #endif
            vec4 wp = modelMatrix * localPos;
            vWorldNormal = normalize(mat3(modelMatrix) * localNormal);
            vViewDir = normalize(cameraPosition - wp.xyz);
            gl_Position = projectionMatrix * viewMatrix * wp;
          }
        `,
        fragmentShader: `
          uniform vec3 uSunDir;
          uniform vec3 uLitCol;
          uniform vec3 uShadowCol;
          uniform vec3 uRimCol;
          uniform float uRimPow;
          uniform float uRimStrength;
          uniform float uOpacity;
          varying vec3 vWorldNormal;
          varying vec3 vViewDir;
          void main() {
            vec3 n = normalize(vWorldNormal);
            vec3 v = normalize(vViewDir);
            float ndotl = dot(n, normalize(uSunDir)) * 0.5 + 0.5;
            float wrap = smoothstep(0.14, 0.86, ndotl);
            float rim = pow(1.0 - max(dot(n, v), 0.0), uRimPow);
            vec3 col = mix(uShadowCol, uLitCol, wrap) + uRimCol * rim * uRimStrength;
            gl_FragColor = vec4(col, uOpacity);
          }
        `,
      });

    // Pure white half-Lambert Nintendo cumulus clouds for daytime (Art Bible 07)
    this.dayCloudMat = makeCloudShader(0xffffff, 0xd8ecff, 0xffffff, 2.4, 0.14);
    // Painterly rose-violet flat-bottomed dusk cumulus clouds on side horizons (Art Bible 09)
    this.duskCloudMat = makeCloudShader(0xffb274, 0x56365c, 0xffda90, 2.0, 0.42);
    // Below-island cloud sea
    this.seaCloudMat = makeCloudShader(0xf7fbff, 0xcce3f8, 0xffffff, 3.0, 0.10);

    this.highPuffGeo = new THREE.SphereGeometry(1, 14, 10);
    this.lowPuffGeo = new THREE.SphereGeometry(1, 8, 6);
    this.quality = initialQuality;

    let totalDayPuffs = 0;
    for (let i = 0; i < 20; i++) {
      const ang = (i / 20) * Math.PI * 2;
      const dist = 102 + (i % 3) * 26;
      const y = 18 + (i % 4) * 5;
      const count = 4 + (i % 3);
      const puffOffsets: Array<{ pos: THREE.Vector3; scale: THREE.Vector3 }> = [];
      for (let j = 0; j < count; j++) {
        const s = 4.0 + ((i + j) % 3) * 1.9;
        puffOffsets.push({
          pos: new THREE.Vector3((j - count * 0.5) * 3.8, (j % 2) * 1.5, ((j * 7) % 3 - 1) * 1.6),
          scale: new THREE.Vector3(s * 1.25, s * 0.86, s),
        });
      }
      totalDayPuffs += count;
      this.dayCloudClusters.push({
        baseAngle: ang,
        dist,
        baseY: y,
        speed: 0.008 + (i % 4) * 0.003,
        puffOffsets,
      });
    }
    this.dayCloudInst = new THREE.InstancedMesh(
      initialQuality === 'low' ? this.lowPuffGeo : this.highPuffGeo,
      this.dayCloudMat,
      totalDayPuffs
    );
    this.dayCloudInst.frustumCulled = false;
    scene.add(this.dayCloudInst);

    // Painterly 7-puff flat-bottomed cumulus clouds flanking left/right horizons at dusk (Art Bible 09!)
    const duskSpecs: Array<[number, number, number, number]> = [
      [-92, 24, -152, 1.12],
      [96, 26, -150, 1.18],
      [-122, 20, -118, 0.92],
      [124, 21, -115, 0.95],
    ];
    const duskItems: Array<{ geometry: THREE.BufferGeometry; matrix: THREE.Matrix4 }> = [];
    for (let i = 0; i < duskSpecs.length; i++) {
      const [cx, cy, cz, sc] = duskSpecs[i];
      const puffs: Array<[number, number, number, number, number, number]> = [
        [0, -0.6, 0, 11.2, 2.2, 4.4],
        [-7.8, -0.9, 0.4, 7.6, 1.9, 3.8],
        [8.0, -0.8, -0.4, 7.8, 1.9, 3.8],
        [-3.4, 1.6, 0.2, 5.2, 2.8, 3.6],
        [2.4, 2.4, -0.1, 5.6, 3.4, 3.8],
        [-11.8, -1.1, 0.2, 4.4, 1.4, 3.0],
        [12.2, -1.0, -0.2, 4.6, 1.4, 3.0],
      ];
      for (const [px, py, pz, sx, sy, sz] of puffs) {
        const m4 = new THREE.Matrix4().compose(
          new THREE.Vector3(cx + px * sc, cy + py * sc, cz + pz * sc),
          this.zeroQuat,
          new THREE.Vector3(sx * sc, sy * sc, sz * sc)
        );
        duskItems.push({
          geometry: initialQuality === 'low' ? this.lowPuffGeo : this.highPuffGeo,
          matrix: m4,
        });
      }
    }
    const mergedDuskGeo = mergeIndexedOrNonIndexed(duskItems);
    if (mergedDuskGeo) {
      this.duskCloudMesh = new THREE.Mesh(mergedDuskGeo, this.duskCloudMat);
      this.duskCloudMesh.visible = false;
      this.duskCloudMesh.frustumCulled = true;
      scene.add(this.duskCloudMesh);
    }

    // Sea of clouds far below the floating islands
    const seaGeo = new THREE.SphereGeometry(1, 12, 10);
    const seaItems: Array<{ geometry: THREE.BufferGeometry; matrix: THREE.Matrix4 }> = [];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const r = 46 + (i % 4) * 20;
      const m4 = new THREE.Matrix4().compose(
        new THREE.Vector3(Math.cos(a) * r, -22 - (i % 3) * 4, Math.sin(a) * r - 8),
        this.zeroQuat,
        new THREE.Vector3(18 + (i % 4) * 5, 6, 18 + (i % 3) * 5)
      );
      seaItems.push({ geometry: seaGeo, matrix: m4 });
    }
    const mergedSeaGeo = mergeIndexedOrNonIndexed(seaItems);
    seaGeo.dispose();
    if (mergedSeaGeo) {
      this.seaCloudMesh = new THREE.Mesh(mergedSeaGeo, this.seaCloudMat);
      this.seaCloudMesh.frustumCulled = true;
      scene.add(this.seaCloudMesh);
    }
    this.update(0, new THREE.Vector3(0, 0, 46), 0, 0);
  }

  setShadowQuality(resolved: ResolvedQuality): void {
    this.quality = resolved;
    const targetPuffGeo = resolved === 'low' ? this.lowPuffGeo : this.highPuffGeo;
    if (this.dayCloudInst.geometry !== targetPuffGeo) {
      this.dayCloudInst.geometry = targetPuffGeo;
    }

    if (resolved === 'low') {
      this.sunLight.castShadow = false;
      if (this.sunLight.shadow.map) {
        this.sunLight.shadow.map.dispose();
        this.sunLight.shadow.map = null;
      }
      return;
    }

    this.sunLight.castShadow = true;
    const sz = resolved === 'high' ? 2048 : 1024;
    if (this.sunLight.shadow.mapSize.x !== sz || this.sunLight.shadow.mapSize.y !== sz) {
      this.sunLight.shadow.mapSize.set(sz, sz);
      this.sunLight.shadow.map?.dispose();
      this.sunLight.shadow.map = null;
    }
    this.sunLight.shadow.needsUpdate = true;
  }

  setIndoorMode(indoor: boolean): void {
    this.indoorMode = indoor;
    if (this.seaCloudMesh) {
      this.seaCloudMesh.visible = !indoor;
    }
    if (indoor) {
      this.dayCloudInst.visible = false;
      if (this.duskCloudMesh) this.duskCloudMesh.visible = false;
    }
  }

  update(dt: number, playerPos: THREE.Vector3, time: number, bossMood = 0): void {
    const t = THREE.MathUtils.clamp(bossMood, 0, 1);
    this.skyMat.uniforms.uBossMood.value = this.indoorMode ? t * 0.35 : t;
    this.skyMat.uniforms.uTime.value = time;

    // Interpolate angled sunlight from crisp golden midday -> warm low sunset angle
    if (this.indoorMode) {
      // Warm sunlit playroom morning diagonal light + grounded honey bounce (rich felt contrast without washout)
      this.sunLight.color.lerpColors(this.indoorSunCol, this.indoorBossSunCol, t * 0.65);
      this.sunLight.intensity = THREE.MathUtils.lerp(3.05, 2.65, t);
      this.hemiLight.color.lerpColors(this.indoorHemiSky, this.indoorBossHemiSky, t * 0.55);
      this.hemiLight.groundColor.lerpColors(this.indoorHemiGround, this.indoorBossHemiGround, t * 0.55);
      this.hemiLight.intensity = THREE.MathUtils.lerp(0.58, 0.54, t);
      this.fillLight.color.copy(this.indoorFillCol);
      this.fillLight.position.set(-34, 18, 28);
      this.fillLight.intensity = THREE.MathUtils.lerp(0.30, 0.26, t);
    } else {
      this.sunLight.color.lerpColors(this.daySunCol, this.duskSunCol, t);
      this.sunLight.intensity = THREE.MathUtils.lerp(2.45, 2.20, t);
      this.hemiLight.color.lerpColors(this.dayHemiSky, this.duskHemiSky, t);
      this.hemiLight.groundColor.lerpColors(this.dayHemiGround, this.duskHemiGround, t);
      this.hemiLight.intensity = THREE.MathUtils.lerp(0.40, 0.44, t);
      this.fillLight.color.copy(this.outdoorFillCol);
      this.fillLight.position.set(-45, 22, -35);
      this.fillLight.intensity = THREE.MathUtils.lerp(0.12, 0.14, t);
    }

    const sx = Math.round(playerPos.x);
    const sy = Math.round(playerPos.y);
    const sz = Math.round(playerPos.z);
    // Indoor playroom morning sun streams diagonally at a warm low angle from the East-North windows (+X, +Y, -Z)
    const sunOffX = this.indoorMode ? THREE.MathUtils.lerp(38, 22, t) : THREE.MathUtils.lerp(46, -52, t);
    const sunOffY = this.indoorMode ? THREE.MathUtils.lerp(25, 22, t) : THREE.MathUtils.lerp(30, 18, t);
    const sunOffZ = this.indoorMode ? THREE.MathUtils.lerp(-20, -28, t) : THREE.MathUtils.lerp(26, -44, t);
    this.sunLight.target.position.set(sx, sy, sz);
    this.sunLight.position.set(sx + sunOffX, sy + sunOffY, sz + sunOffZ);
    this.sunLight.target.updateMatrixWorld();

    this.tmpSunDir.set(sunOffX, sunOffY, sunOffZ).normalize();
    this.dayCloudMat.uniforms.uSunDir.value.copy(this.tmpSunDir);
    this.duskCloudMat.uniforms.uSunDir.value.copy(this.tmpSunDir);
    this.seaCloudMat.uniforms.uSunDir.value.copy(this.tmpSunDir);

    if (this.indoorMode) {
      this.dayCloudInst.visible = false;
      if (this.duskCloudMesh) this.duskCloudMesh.visible = false;
      if (this.seaCloudMesh) this.seaCloudMesh.visible = false;
      void dt;
      return;
    }

    const dayOp = Math.max(0, 1.0 - t * 2.2);
    this.dayCloudMat.uniforms.uOpacity.value = dayOp;
    const duskOp = Math.max(0, (t - 0.35) / 0.65);
    this.duskCloudMat.uniforms.uOpacity.value = duskOp;
    this.seaCloudMat.uniforms.uOpacity.value = Math.max(0, 1.0 - t * 1.4);

    this.dayCloudInst.visible = dayOp > 0.02;
    if (this.dayCloudInst.visible && (this.quality !== 'low' || this.cloudFrameCount++ % 3 === 0)) {
      let instIdx = 0;
      for (const c of this.dayCloudClusters) {
        const a = c.baseAngle + time * c.speed;
        const cx = Math.cos(a) * c.dist;
        const cz = Math.sin(a) * c.dist - 6;
        const cy = c.baseY + Math.sin(time * 0.5 + c.baseAngle) * 1.2;
        this.tmpDummy.position.set(cx, cy, cz);
        this.tmpDummy.lookAt(0, cy, 0);
        this.tmpDummy.updateMatrix();
        for (const puff of c.puffOffsets) {
          this.tmpLocalMat.compose(puff.pos, this.zeroQuat, puff.scale);
          this.tmpInstMat.multiplyMatrices(this.tmpDummy.matrix, this.tmpLocalMat);
          this.dayCloudInst.setMatrixAt(instIdx++, this.tmpInstMat);
        }
      }
      this.dayCloudInst.instanceMatrix.needsUpdate = true;
    }
    if (this.duskCloudMesh) {
      this.duskCloudMesh.visible = duskOp > 0.02;
    }
    if (this.seaCloudMesh) {
      this.seaCloudMesh.visible = t < 0.72;
    }
    void dt;
  }
}
