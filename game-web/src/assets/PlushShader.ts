import * as THREE from 'three';

export interface PlushUniforms {
  uRimColor: { value: THREE.Color };
  uRimStrength: { value: number };
  uFeverStrength: { value: number };
  uTime: { value: number };
}

export function enhancePlushMaterial(
  mat: THREE.MeshStandardMaterial,
  sharedUniforms: PlushUniforms
): void {
  mat.roughness = Math.min(1.0, Math.max(0.72, mat.roughness));
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uRimColor = sharedUniforms.uRimColor;
    shader.uniforms.uRimStrength = sharedUniforms.uRimStrength;
    shader.uniforms.uFeverStrength = sharedUniforms.uFeverStrength;
    shader.uniforms.uTime = sharedUniforms.uTime;

    shader.fragmentShader =
      `
      uniform vec3 uRimColor;
      uniform float uRimStrength;
      uniform float uFeverStrength;
      uniform float uTime;
      ` + shader.fragmentShader;

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `
      vec3 nrm = normalize(vNormal);
      vec3 viewDir = normalize(vViewPosition);
      float fresnel = pow(1.0 - clamp(dot(nrm, viewDir), 0.0, 1.0), 2.35);
      vec3 plushRim = uRimColor * fresnel * uRimStrength;
      if (uFeverStrength > 0.01) {
        float phase = nrm.x * 2.2 + nrm.y * 2.2 + uTime * 5.0;
        vec3 rainbow = 0.55 + 0.45 * cos(phase + vec3(0.0, 2.094, 4.188));
        plushRim = mix(plushRim, rainbow * (0.08 + fresnel * 1.15), clamp(uFeverStrength, 0.0, 1.0));
      }
      gl_FragColor.rgb += plushRim;
      #include <dithering_fragment>
      `
    );
  };
  mat.customProgramCacheKey = () => 'manmarubuu-plush-rim-v1';
  mat.needsUpdate = true;
}
