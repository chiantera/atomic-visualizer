import * as THREE from 'three';

export type OrbitalMaterialUniforms = {
  n: number;
  l: number;
  m: number;
  occupancy: number;
  zeff: number;
  isoValue: number;
  boxSize?: number;
};

const fragmentShader = /* glsl */ `
  precision highp float;
  precision highp int;

  uniform int uN;
  uniform int uL;
  uniform int uM;
  uniform float uOccupancy;
  uniform float uZEff;
  uniform float uIso;
  uniform vec3 uBox;
  uniform vec3 uCamPos;
  varying vec3 vWorldPos;

  const float PI = 3.14159265359;
  const int STEPS = 120;

  float factorialf(int k) {
    float f = 1.0;
    for (int i = 2; i <= 16; i++) {
      if (i > k) break;
      f *= float(i);
    }
    return f;
  }

  float laguerreL(int p, int q, float x) {
    // Associated Laguerre L_p^q(x), small-order recurrence
    if (p == 0) return 1.0;
    if (p == 1) return 1.0 + float(q) - x;
    float Lnm1 = 1.0 + float(q) - x;
    float Lnm2 = 1.0;
    float Ln = 0.0;
    for (int i = 2; i <= 16; i++) {
      if (i > p) break;
      float kf = float(i - 1);
      Ln = ((2.0 * kf + 1.0 + float(q) - x) * Lnm1 - (kf + float(q)) * Lnm2) / float(i);
      Lnm2 = Lnm1;
      Lnm1 = Ln;
    }
    return Ln;
  }

  float radialComponent(int n, int l, float r, float Zeff) {
    float rho = 2.0 * Zeff * r / float(n);
    int k = n - l - 1;
    if (k < 0) return 0.0;
    float norm = sqrt(pow(2.0 * Zeff / float(n), 3.0) * factorialf(k) / (2.0 * float(n) * factorialf(n + l)));
    float lag = laguerreL(k, 2 * l + 1, rho);
    return norm * exp(-rho * 0.5) * pow(rho, float(l)) * lag;
  }

  float realYlm(int l, int m, vec3 dir) {
    float r = length(dir);
    if (r < 1e-6) return 0.0;
    float x = dir.x / r;
    float y = dir.y / r;
    float z = dir.z / r;
    float phi = atan(y, x);
    float cost = z;
    float sint = sqrt(max(0.0, 1.0 - cost * cost));

    if (l == 0) return 0.5 * sqrt(1.0 / PI);

    if (l == 1) {
      if (m == -1) return sqrt(3.0 / (4.0 * PI)) * y;
      if (m == 0) return sqrt(3.0 / (4.0 * PI)) * z;
      return sqrt(3.0 / (4.0 * PI)) * x;
    }

    if (l == 2) {
      if (m == -2) return sqrt(15.0 / (4.0 * PI)) * x * y;
      if (m == -1) return sqrt(15.0 / (4.0 * PI)) * y * z;
      if (m == 0) return 0.25 * sqrt(5.0 / PI) * (3.0 * z * z - 1.0);
      if (m == 1) return sqrt(15.0 / (4.0 * PI)) * x * z;
      return 0.25 * sqrt(15.0 / PI) * (x * x - y * y);
    }

    if (l == 3) {
      // real forms, scaled for qualitative shape
      if (m == -3) return 0.25 * sqrt(35.0 / (2.0 * PI)) * sint * sint * sint * sin(3.0 * phi);
      if (m == -2) return 0.25 * sqrt(105.0 / PI) * sint * sint * cost * sin(2.0 * phi);
      if (m == -1) return 0.25 * sqrt(21.0 / (2.0 * PI)) * sint * (5.0 * cost * cost - 1.0) * sin(phi);
      if (m == 0) return 0.25 * sqrt(7.0 / PI) * (5.0 * cost * cost * cost - 3.0 * cost);
      if (m == 1) return 0.25 * sqrt(21.0 / (2.0 * PI)) * sint * (5.0 * cost * cost - 1.0) * cos(phi);
      if (m == 2) return 0.25 * sqrt(105.0 / PI) * sint * sint * cost * cos(2.0 * phi);
      return 0.25 * sqrt(35.0 / (2.0 * PI)) * sint * sint * sint * cos(3.0 * phi);
    }

    // fallback: isotropic
    return 0.5 * sqrt(1.0 / PI);
  }

  vec2 intersectBox(vec3 ro, vec3 rd, vec3 extents) {
    vec3 m = 1.0 / rd;
    vec3 n = m * ro;
    vec3 k = abs(m) * extents;
    vec3 t1 = -n - k;
    vec3 t2 = -n + k;
    float tN = max(max(t1.x, t1.y), t1.z);
    float tF = min(min(t2.x, t2.y), t2.z);
    return vec2(tN, tF);
  }

  vec3 colormap(float v) {
    float x = clamp(v, 0.0, 1.0);
    vec3 c1 = vec3(0.1, 0.3, 0.8);
    vec3 c2 = vec3(0.2, 0.8, 0.9);
    vec3 c3 = vec3(0.95, 0.95, 1.0);
    return mix(c1, mix(c2, c3, smoothstep(0.3, 1.0, x)), smoothstep(0.6, 1.0, x));
  }

  float densityAt(vec3 p) {
    float r = length(p);
    float R = radialComponent(uN, uL, r, uZEff);
    float Y = realYlm(uL, uM, p);
    float psi = R * Y;
    return psi * psi * uOccupancy;
  }

  void main() {
    vec3 ro = uCamPos;
    vec3 rd = normalize(vWorldPos - ro);

    vec2 hit = intersectBox(ro, rd, uBox);
    if (hit.x > hit.y) discard;
    float t0 = max(hit.x, 0.0);
    float t1 = hit.y;
    float dt = (t1 - t0) / float(STEPS);

    vec3 accum = vec3(0.0);
    float alpha = 0.0;
    float t = t0;
    for (int i = 0; i < STEPS; i++) {
      vec3 pos = ro + rd * t;
      float d = densityAt(pos);
      d = max(0.0, d - uIso);
      float a = 1.0 - exp(-d * 6.0 * dt);
      vec3 c = colormap(d * 3.0);
      accum += (1.0 - alpha) * a * c;
      alpha += (1.0 - alpha) * a;
      if (alpha > 0.98) break;
      t += dt;
    }

    if (alpha < 0.01) discard;
    gl_FragColor = vec4(accum, alpha);
  }
`;

const vertexShader = /* glsl */ `
  varying vec3 vWorldPos;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

export const createOrbitalMaterial = (params: OrbitalMaterialUniforms) => {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uN: { value: params.n },
      uL: { value: params.l },
      uM: { value: params.m },
      uOccupancy: { value: params.occupancy },
      uZEff: { value: params.zeff },
      uIso: { value: params.isoValue },
      uBox: { value: new THREE.Vector3(params.boxSize ?? 4, params.boxSize ?? 4, params.boxSize ?? 4) },
      uCamPos: { value: new THREE.Vector3() },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader,
    fragmentShader,
  });

  return material;
};

export const updateOrbitalUniforms = (
  material: THREE.ShaderMaterial,
  params: Partial<OrbitalMaterialUniforms>,
) => {
  if (params.n !== undefined) material.uniforms.uN.value = params.n;
  if (params.l !== undefined) material.uniforms.uL.value = params.l;
  if (params.m !== undefined) material.uniforms.uM.value = params.m;
  if (params.occupancy !== undefined) material.uniforms.uOccupancy.value = params.occupancy;
  if (params.zeff !== undefined) material.uniforms.uZEff.value = params.zeff;
  if (params.isoValue !== undefined) material.uniforms.uIso.value = params.isoValue;
  if (params.boxSize !== undefined) {
    const v = material.uniforms.uBox.value as THREE.Vector3;
    v.set(params.boxSize, params.boxSize, params.boxSize);
  }
};
