import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { useAtomState } from '../state/atomState';
import { createOrbitalMaterial, updateOrbitalUniforms } from '../three/orbitalMaterial';
import { effectiveZ } from '../utils/effectiveZ';

const BG_COLOR = 0x05060b;

export const OrbitalViewer = () => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  const pointsRef = useRef<THREE.Points | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  const { Z, orbitals, selectedOrbitalIndex, isoValue, displayMode, sampleCount } = useAtomState();
  const orbital = orbitals[selectedOrbitalIndex];
  const zeff = useMemo(() => (orbital ? effectiveZ(Z, orbital.n, orbital.l) : 1), [Z, orbital]);

  useEffect(() => {
    if (!mountRef.current) return;
    const container = mountRef.current;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(BG_COLOR);
    sceneRef.current = scene;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const camera = new THREE.PerspectiveCamera(48, container.clientWidth / container.clientHeight, 0.1, 50);
    camera.position.set(6, 5, 6);
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 0, 0);

    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffffff, 0.6);
    dir.position.set(4, 6, 2);
    scene.add(dir);

    const nucleus = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 32, 32),
      new THREE.MeshPhysicalMaterial({
        color: 0xff7788,
        emissive: 0x221018,
        roughness: 0.25,
        metalness: 0.05,
        transmission: 0.25,
        opacity: 0.9,
        transparent: true,
      }),
    );
    scene.add(nucleus);

    const orbitalMaterial = createOrbitalMaterial({
      n: orbital?.n ?? 1,
      l: orbital?.l ?? 0,
      m: orbital?.m ?? 0,
      occupancy: orbital?.occupancy ?? 1,
      zeff,
      isoValue,
      boxSize: 5,
    });
    materialRef.current = orbitalMaterial;

    const volume = new THREE.Mesh(new THREE.BoxGeometry(6, 6, 6), orbitalMaterial);
    volume.frustumCulled = false;
    volume.renderOrder = 1;
    scene.add(volume);

    const grid = new THREE.GridHelper(10, 10, 0x203040, 0x101820);
    grid.position.y = -3;
    scene.add(grid);

    const resize = () => {
      if (!rendererRef.current || !cameraRef.current || !mountRef.current) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      rendererRef.current.setSize(w, h);
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
    };
    window.addEventListener('resize', resize);

    let raf = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      orbitalMaterial.uniforms.uCamPos.value.copy(camera.position);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      controls.dispose();
      renderer.dispose();
      scene.traverse((obj: THREE.Object3D) => {
        if ((obj as THREE.Mesh).geometry) (obj as THREE.Mesh).geometry.dispose();
        if ((obj as THREE.Mesh).material) {
          const m = (obj as THREE.Mesh).material;
          if (Array.isArray(m)) m.forEach((x) => x.dispose());
          else m.dispose();
        }
      });
      container.removeChild(renderer.domElement);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!materialRef.current || !orbital) return;
    updateOrbitalUniforms(materialRef.current, {
      n: orbital.n,
      l: orbital.l,
      m: orbital.m,
      occupancy: orbital.occupancy,
      zeff,
      isoValue,
    });
  }, [orbital, zeff, isoValue]);

  useEffect(() => {
    if (!sceneRef.current || !orbital) return;
    if (displayMode !== 'points') {
      if (pointsRef.current) {
        sceneRef.current.remove(pointsRef.current);
        pointsRef.current.geometry.dispose();
        (pointsRef.current.material as THREE.Material).dispose();
        pointsRef.current = null;
      }
      if (materialRef.current) materialRef.current.visible = true;
      return;
    }

    if (materialRef.current) materialRef.current.visible = false;
    const geometry = generatePointCloud(orbital, zeff, sampleCount);
    const points = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        color: 0x6de2ff,
        size: 0.06,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    points.renderOrder = 2;
    pointsRef.current && sceneRef.current.remove(pointsRef.current);
    sceneRef.current.add(points);
    pointsRef.current = points;
  }, [displayMode, orbital, zeff, sampleCount]);

  return <div className="viewer" ref={mountRef} />;
};

// CPU sampling utilities for point-cloud preview
const factorial = (k: number) => {
  let f = 1;
  for (let i = 2; i <= k; i++) f *= i;
  return f;
};

const assocLaguerre = (p: number, q: number, x: number) => {
  if (p === 0) return 1;
  if (p === 1) return 1 + q - x;
  let Lnm1 = 1 + q - x;
  let Lnm2 = 1;
  let Ln = 0;
  for (let i = 2; i <= p; i++) {
    const kf = i - 1;
    Ln = ((2 * kf + 1 + q - x) * Lnm1 - (kf + q) * Lnm2) / i;
    Lnm2 = Lnm1;
    Lnm1 = Ln;
  }
  return Ln;
};

const radial = (n: number, l: number, r: number, zeff: number) => {
  const rho = (2 * zeff * r) / n;
  const k = n - l - 1;
  if (k < 0) return 0;
  const norm = Math.sqrt(Math.pow((2 * zeff) / n, 3) * (factorial(k) / (2 * n * factorial(n + l))));
  return norm * Math.exp(-rho * 0.5) * Math.pow(rho, l) * assocLaguerre(k, 2 * l + 1, rho);
};

const realY = (l: number, m: number, v: THREE.Vector3) => {
  const r = v.length();
  if (r < 1e-6) return 0;
  const x = v.x / r;
  const y = v.y / r;
  const z = v.z / r;
  const phi = Math.atan2(y, x);
  const cost = z;
  const sint = Math.sqrt(Math.max(0, 1 - cost * cost));

  if (l === 0) return 0.5 * Math.sqrt(1 / Math.PI);
  if (l === 1) {
    if (m === -1) return Math.sqrt(3 / (4 * Math.PI)) * y;
    if (m === 0) return Math.sqrt(3 / (4 * Math.PI)) * z;
    return Math.sqrt(3 / (4 * Math.PI)) * x;
  }
  if (l === 2) {
    if (m === -2) return Math.sqrt(15 / (4 * Math.PI)) * x * y;
    if (m === -1) return Math.sqrt(15 / (4 * Math.PI)) * y * z;
    if (m === 0) return 0.25 * Math.sqrt(5 / Math.PI) * (3 * z * z - 1);
    if (m === 1) return Math.sqrt(15 / (4 * Math.PI)) * x * z;
    return 0.25 * Math.sqrt(15 / Math.PI) * (x * x - y * y);
  }
  if (l === 3) {
    if (m === -3) return 0.25 * Math.sqrt(35 / (2 * Math.PI)) * sint * sint * sint * Math.sin(3 * phi);
    if (m === -2) return 0.25 * Math.sqrt(105 / Math.PI) * sint * sint * cost * Math.sin(2 * phi);
    if (m === -1) return 0.25 * Math.sqrt(21 / (2 * Math.PI)) * sint * (5 * cost * cost - 1) * Math.sin(phi);
    if (m === 0) return 0.25 * Math.sqrt(7 / Math.PI) * (5 * cost * cost * cost - 3 * cost);
    if (m === 1) return 0.25 * Math.sqrt(21 / (2 * Math.PI)) * sint * (5 * cost * cost - 1) * Math.cos(phi);
    if (m === 2) return 0.25 * Math.sqrt(105 / Math.PI) * sint * sint * cost * Math.cos(2 * phi);
    return 0.25 * Math.sqrt(35 / (2 * Math.PI)) * sint * sint * sint * Math.cos(3 * phi);
  }
  return 0.5 * Math.sqrt(1 / Math.PI);
};

const density = (n: number, l: number, m: number, p: THREE.Vector3, zeff: number) => {
  const r = p.length();
  const R = radial(n, l, r, zeff);
  const Y = realY(l, m, p);
  const psi = R * Y;
  return psi * psi;
};

const generatePointCloud = (orbital: { n: number; l: number; m: number }, zeff: number, target: number) => {
  const positions = new Float32Array(target * 3);
  const tmp = new THREE.Vector3();
  let filled = 0;
  let attempts = 0;
  const scaleR = (orbital.n + orbital.l + 1) / Math.max(zeff, 0.4);
  const targetAttempts = target * 400;
  const gain = 4;

  while (filled < target && attempts < targetAttempts) {
    attempts++;
    const u = Math.random();
    const r = -Math.log(1 - u) * scaleR * 0.9;
    const theta = Math.acos(2 * Math.random() - 1);
    const phi = 2 * Math.PI * Math.random();
    tmp.set(
      r * Math.sin(theta) * Math.cos(phi),
      r * Math.sin(theta) * Math.sin(phi),
      r * Math.cos(theta),
    );
    const d = density(orbital.n, orbital.l, orbital.m, tmp, zeff);
    if (Math.random() < d * gain) {
      positions[3 * filled] = tmp.x;
      positions[3 * filled + 1] = tmp.y;
      positions[3 * filled + 2] = tmp.z;
      filled++;
    }
  }

  return new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(positions, 3));
};
