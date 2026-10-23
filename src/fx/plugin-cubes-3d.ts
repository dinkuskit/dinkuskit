// Three.js Studio WebGL PBR + binary glTF 2.0 (.glb) runtime for DinkusKit
// 3D plugin cubes (<PluginCube3D />). Uses the MacBook Pro Studio PBR recipe:
// 6-strip HDR Studio Softbox cubemap (PMREMGenerator), MeshPhysicalMaterial
// clearcoat & anisotropic normal maps, PCFSoftShadowMap, radial ground glow
// halos, Inventory breathing gill pulsation, Commerce emerald storefront glow,
// and Payments hero isometric sway + animated EMV card reader dip/approval cycle.

interface ThreeColor {
  r: number;
  g: number;
  b: number;
  setRGB(r: number, g: number, b: number): this;
  setHex(hex: number): this;
  clone(): ThreeColor;
}

interface ThreeColorCtor {
  new (r?: number | string, g?: number, b?: number): ThreeColor;
}

interface ThreeVector2 {
  set(x: number, y: number): this;
}

interface ThreeVector2Ctor {
  new (x?: number, y?: number): ThreeVector2;
}

interface ThreeVector3 {
  x: number;
  y: number;
  z: number;
  set(x: number, y: number, z: number): this;
}

interface ThreeEuler {
  x: number;
  y: number;
  z: number;
  set(x: number, y: number, z: number): this;
}

interface ThreeTexture {
  anisotropy?: number;
  encoding?: number;
  needsUpdate?: boolean;
}

interface ThreeMaterial {
  name?: string;
  color?: ThreeColor;
  map?: ThreeTexture | null;
  emissiveMap?: ThreeTexture | null;
  metalness?: number;
  roughness?: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  emissive?: ThreeColor;
  emissiveIntensity?: number;
  envMapIntensity?: number;
  normalMap?: ThreeTexture | null;
  normalScale?: ThreeVector2;
  opacity?: number;
  transparent?: boolean;
  side?: number;
  needsUpdate?: boolean;
}

interface ThreeObject3D {
  name: string;
  isMesh?: boolean;
  visible?: boolean;
  material?: ThreeMaterial;
  castShadow?: boolean;
  receiveShadow?: boolean;
  position: ThreeVector3;
  rotation: ThreeEuler;
  scale: ThreeVector3;
  add(child: ThreeObject3D): void;
  lookAt(x: number, y: number, z: number): void;
  traverse(cb: (node: ThreeObject3D) => void): void;
}

interface ThreeScene extends ThreeObject3D {
  background: unknown;
  environment: unknown;
}

interface ThreeCamera extends ThreeObject3D {
  aspect: number;
  updateProjectionMatrix(): void;
}

interface ThreeLightShadow {
  mapSize: { width: number; height: number };
  camera: { near: number; far: number; left: number; right: number; top: number; bottom: number };
  bias: number;
}

interface ThreeLight extends ThreeObject3D {
  intensity: number;
  color: ThreeColor;
  shadow: ThreeLightShadow;
}

interface ThreeWebGLRenderer {
  domElement: HTMLCanvasElement;
  physicallyCorrectLights: boolean;
  toneMapping: number;
  toneMappingExposure: number;
  outputEncoding: number;
  shadowMap: { enabled: boolean; type: number };
  capabilities: { getMaxAnisotropy(): number };
  setPixelRatio(ratio: number): void;
  setSize(width: number, height: number, updateStyle?: boolean): void;
  render(scene: ThreeScene, camera: ThreeCamera): void;
  dispose(): void;
}

interface ThreePMREMGenerator {
  compileCubemapShader(): void;
  compileEquirectangularShader(): void;
  fromScene(scene: ThreeScene, sigma?: number): { texture: unknown };
  dispose(): void;
}

interface ThreeGLTFLoader {
  load(
    url: string,
    onLoad: (gltf: { scene: ThreeObject3D }) => void,
    onProgress?: unknown,
    onError?: (err: unknown) => void,
  ): void;
  parse(
    buffer: ArrayBuffer,
    path: string,
    onLoad: (gltf: { scene: ThreeObject3D }) => void,
    onError?: (err: unknown) => void,
  ): void;
}

interface ThreeNamespace {
  ACESFilmicToneMapping: number;
  PCFSoftShadowMap: number;
  sRGBEncoding: number;
  DoubleSide: number;
  Color: ThreeColorCtor;
  Vector2: ThreeVector2Ctor;
  Scene: new () => ThreeScene;
  Group: new () => ThreeObject3D;
  PerspectiveCamera: new (fov: number, aspect: number, near: number, far: number) => ThreeCamera;
  WebGLRenderer: new (params: Record<string, unknown>) => ThreeWebGLRenderer;
  PMREMGenerator: new (renderer: ThreeWebGLRenderer) => ThreePMREMGenerator;
  PlaneGeometry: new (width: number, height: number) => unknown;
  MeshBasicMaterial: new (params: Record<string, unknown>) => ThreeMaterial;
  MeshPhysicalMaterial: new (params: Record<string, unknown>) => ThreeMaterial;
  CanvasTexture: new (canvas: HTMLCanvasElement) => ThreeTexture;
  Mesh: new (geometry: unknown, material: unknown) => ThreeObject3D;
  DirectionalLight: new (color: number, intensity: number) => ThreeLight;
  HemisphereLight: new (skyColor: number, groundColor: number, intensity: number) => ThreeLight;
  PointLight: new (color: number, intensity: number, distance: number) => ThreeLight;
  Clock: new () => { getDelta(): number; getElapsedTime(): number };
  GLTFLoader?: new () => ThreeGLTFLoader;
}

interface WindowWithThree extends Window {
  THREE?: ThreeNamespace;
  DINKUS_PLUGIN_CUBES_GLB_B64?: Record<string, string>;
}

interface GlowMaterialEntry {
  mat: ThreeMaterial;
  baseEmissive: ThreeColor;
  baseIntensity: number;
  pulseScale: number;
}

interface CubeInstance {
  name: string;
  stage: HTMLElement;
  renderer: ThreeWebGLRenderer;
  scene: ThreeScene;
  camera: ThreeCamera;
  pivot: ThreeObject3D;
  rimLight: ThreeLight;
  fillLight: ThreeLight;
  haloMat: ThreeMaterial;
  cardRig: ThreeObject3D | null;
  slotGlowNode: ThreeObject3D | null;
  strataBot: ThreeObject3D | null;
  strataMid: ThreeObject3D | null;
  strataTop: ThreeObject3D | null;
  seamLower: ThreeObject3D | null;
  seamUpper: ThreeObject3D | null;
  flapLeft: ThreeObject3D | null;
  flapRight: ThreeObject3D | null;
  tapeBack: ThreeObject3D | null;
  tapeTop: ThreeObject3D | null;
  tapeFront: ThreeObject3D | null;
  glowMaterials: GlowMaterialEntry[];
  loaded: boolean;
  resize: () => void;
  dragging: boolean;
  userOrbited: boolean;
  lastX: number;
  lastY: number;
  velY: number;
  baseYaw: number;
  targetX: number;
  phaseOffset: number;
}

const ACCENT_COLORS: Record<string, number> = {
  Commerce: 0x10b981,
  Payments: 0x38bdf8,
  Inventory: 0xf59e0b,
  Ship: 0xf97316,
};

const HALO_RGBA: Record<string, [number, number, number]> = {
  Commerce: [16, 185, 129],
  Payments: [56, 189, 248],
  Inventory: [245, 158, 11],
  Ship: [249, 115, 22],
};

const INITIAL_YAW: Record<string, number> = {
  Commerce: -0.64,
  Payments: -0.68,
  Inventory: -0.66,
  Ship: -0.66,
};

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-vendor-src="${src}"]`);
    if (existing) {
      if (existing.getAttribute('data-loaded') === 'true') {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.setAttribute('data-vendor-src', src);
    script.addEventListener('load', () => {
      script.setAttribute('data-loaded', 'true');
      resolve();
    }, { once: true });
    script.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
    document.head.appendChild(script);
  });
}

function decodeBase64GLB(b64: string): ArrayBuffer {
  const bin = window.atob(b64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * 6-Strip HDR Studio Softbox Environment (MacBook Pro PBR technique).
 * Deep obsidian studio void (0x030509) with focused grazing warm/cool softboxes
 * so anodized metallic bevels show crisp specular sweeps while flat faces stay rich and dark.
 */
function createStudioEnvironment(THREE: ThreeNamespace, renderer: ThreeWebGLRenderer): unknown {
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x030509);

  const addSoftbox = (
    w: number,
    h: number,
    hdrRgb: [number, number, number],
    pos: [number, number, number],
    look: [number, number, number],
  ) => {
    const geo = new THREE.PlaneGeometry(w, h);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(hdrRgb[0], hdrRgb[1], hdrRgb[2]),
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(pos[0], pos[1], pos[2]);
    mesh.lookAt(look[0], look[1], look[2]);
    envScene.add(mesh);
  };

  // 1. Back-Left Grazing Rim Softbox Strip (keeps top cap dark obsidian while lighting bevels)
  addSoftbox(8.5, 2.2, [3.4, 3.2, 3.0], [-10.5, 6.2, -6.5], [0, 0, 0]);
  // 2. Front-Left Warm Grazing Softbox Strip
  addSoftbox(7.5, 2.4, [3.4, 2.5, 1.8], [-11.8, 4.2, 6.8], [0, 0.2, 0]);
  // 3. Front-Right Cool Sky Rim Softbox Strip
  addSoftbox(7.5, 2.4, [1.8, 3.0, 4.5], [11.8, 4.5, 6.4], [0, 0.3, 0]);
  // 4. Back-Top Grazing Horizon Strip
  addSoftbox(11.0, 1.8, [3.6, 2.8, 1.8], [0, 5.8, -11.8], [0, 0.2, 0]);
  // 5. Left-Low Grazing Bevel Strip
  addSoftbox(6.5, 1.5, [1.6, 2.8, 4.2], [-11.8, 0.8, 1.5], [0, 0.0, 0]);
  // 6. Front-Low Grazing Specular Strip
  addSoftbox(8.0, 1.4, [3.0, 2.9, 2.7], [0, 0.8, 12.2], [0, 0.0, 1.0]);

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileCubemapShader();
  const envTex = pmrem.fromScene(envScene, 0.0).texture;
  pmrem.dispose();
  return envTex;
}

/**
 * Generates a radial studio ground glow + soft contact shadow texture under each cube.
 */
function createGlowHaloTexture(THREE: ThreeNamespace, rgb: [number, number, number], isCommerce: boolean): ThreeTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, 256, 256);
    const [r, g, b] = rgb;
    // Outer colored radial glow pool
    const grad = ctx.createRadialGradient(128, 128, 10, 128, 128, 122);
    const peakAlpha = isCommerce ? 0.76 : 0.58;
    grad.addColorStop(0.0, `rgba(${r}, ${g}, ${b}, ${peakAlpha})`);
    grad.addColorStop(0.38, `rgba(${r}, ${g}, ${b}, ${peakAlpha * 0.62})`);
    grad.addColorStop(0.72, `rgba(${r}, ${g}, ${b}, ${peakAlpha * 0.22})`);
    grad.addColorStop(1.0, `rgba(${r}, ${g}, ${b}, 0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);

    // Subtle dark contact core directly under the cube base
    const core = ctx.createRadialGradient(128, 128, 4, 128, 128, 54);
    core.addColorStop(0.0, 'rgba(3, 5, 9, 0.56)');
    core.addColorStop(0.65, 'rgba(3, 5, 9, 0.20)');
    core.addColorStop(1.0, 'rgba(3, 5, 9, 0)');
    ctx.fillStyle = core;
    ctx.fillRect(0, 0, 256, 256);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.encoding = THREE.sRGBEncoding;
  return tex;
}

/**
 * Upgrades GLTFLoader MeshStandardMaterial to MacBook-grade MeshPhysicalMaterial
 * with clearcoat, anisotropic normal maps, and rich saturated emissive glow.
 */
function upgradeCubeMaterials(
  THREE: ThreeNamespace,
  root: ThreeObject3D,
  maxAniso: number,
  glowList: GlowMaterialEntry[],
): void {
  root.traverse((node: ThreeObject3D) => {
    if (!node.isMesh || !node.material) return;
    node.castShadow = true;
    node.receiveShadow = true;

    const orig = node.material;
    const matName = orig.name ?? '';
    const em = orig.emissive;
    const emSum = em ? em.r + em.g + em.b : 0;

    if (orig.normalMap) {
      orig.normalMap.anisotropy = maxAniso;
    }
    if (orig.map) {
      orig.map.anisotropy = maxAniso;
    }
    if (orig.emissiveMap) {
      orig.emissiveMap.anisotropy = maxAniso;
    }

    const hasTexMap = Boolean(orig.map || orig.emissiveMap);
    const isKraft = matName.includes('kraft') || matName.includes('tape');
    const isCore = matName.includes('core') || matName.includes('filament');
    const isCollar = matName.includes('collar') || matName.includes('chip') || matName.includes('lip');
    const isGlow = emSum > 0.08 && !isKraft;

    if (matName === 'commerce_emerald_glass' || matName === 'commerce_asterisk_floor') {
      // Textured storefront glass & recessed Dinkus * asterisk floor with emerald-to-mint gradient
      node.castShadow = false;
      node.receiveShadow = false;
      const isAsterisk = matName === 'commerce_asterisk_floor';
      const baseEm = em ? em.clone() : new THREE.Color(isAsterisk ? 0.42 : 0.78, 0.94, isAsterisk ? 0.64 : 0.84);
      const baseInt = isAsterisk ? 1.12 : 1.15;
      const phys = new THREE.MeshPhysicalMaterial({
        name: matName,
        color: orig.color ? orig.color.clone() : new THREE.Color(1, 1, 1),
        map: orig.map ?? null,
        emissive: baseEm.clone(),
        emissiveMap: orig.emissiveMap ?? orig.map ?? null,
        emissiveIntensity: baseInt,
        metalness: isAsterisk ? 0.04 : 0.08,
        roughness: isAsterisk ? 0.16 : 0.14,
        clearcoat: isAsterisk ? 0.20 : 0.45,
        clearcoatRoughness: 0.12,
        envMapIntensity: isAsterisk ? 0.12 : 0.35,
        side: orig.side,
      });
      node.material = phys;
      glowList.push({ mat: phys, baseEmissive: baseEm, baseIntensity: baseInt, pulseScale: isAsterisk ? 0.35 : 0.45 });
    } else if (matName === 'payments_card_top') {
      // Textured EMV card top face with flush cyan perimeter border, 6-spoke * emblem, and chip pad
      const baseEm = em ? em.clone() : new THREE.Color(0.78, 0.86, 0.96);
      const phys = new THREE.MeshPhysicalMaterial({
        name: matName,
        color: orig.color ? orig.color.clone() : new THREE.Color(1, 1, 1),
        map: orig.map ?? null,
        emissive: baseEm.clone(),
        emissiveMap: orig.emissiveMap ?? orig.map ?? null,
        emissiveIntensity: 1.10,
        metalness: 0.42,
        roughness: 0.22,
        normalMap: orig.normalMap ?? null,
        normalScale: new THREE.Vector2(0.06, 0.06),
        clearcoat: 0.32,
        clearcoatRoughness: 0.16,
        envMapIntensity: 0.55,
        side: orig.side,
      });
      node.material = phys;
      glowList.push({ mat: phys, baseEmissive: baseEm, baseIntensity: 1.10, pulseScale: 0.65 });
    } else if (matName === 'payments_face_panel') {
      // Payments cube face panel with soft cyan radial bevel falloff
      const baseEm = em ? em.clone() : new THREE.Color(0.30, 0.36, 0.42);
      const phys = new THREE.MeshPhysicalMaterial({
        name: matName,
        color: orig.color ? orig.color.clone() : new THREE.Color(1, 1, 1),
        map: orig.map ?? null,
        emissive: baseEm.clone(),
        emissiveMap: orig.emissiveMap ?? orig.map ?? null,
        emissiveIntensity: 0.95,
        metalness: 0.52,
        roughness: 0.24,
        normalMap: orig.normalMap ?? null,
        normalScale: new THREE.Vector2(0.07, 0.07),
        clearcoat: 0.24,
        clearcoatRoughness: 0.18,
        envMapIntensity: 0.65,
        side: orig.side,
      });
      node.material = phys;
      glowList.push({ mat: phys, baseEmissive: baseEm, baseIntensity: 0.95, pulseScale: 0.40 });
    } else if (matName === 'inventory_chamber_back') {
      // Textured multi-louver gill chamber interior
      const baseEm = em ? em.clone() : new THREE.Color(0.62, 0.48, 0.28);
      const phys = new THREE.MeshPhysicalMaterial({
        name: matName,
        color: orig.color ? orig.color.clone() : new THREE.Color(1, 1, 1),
        map: orig.map ?? null,
        emissive: baseEm.clone(),
        emissiveMap: orig.emissiveMap ?? orig.map ?? null,
        emissiveIntensity: 1.10,
        metalness: 0.16,
        roughness: 0.26,
        clearcoat: 0.0,
        envMapIntensity: 0.12,
        side: orig.side,
      });
      node.material = phys;
      glowList.push({ mat: phys, baseEmissive: baseEm, baseIntensity: 0.85, pulseScale: 0.95 });
    } else if (isKraft) {
      const isTape = matName.includes('tape');
      const baseEm = em ? em.clone() : new THREE.Color(0, 0, 0);
      const phys = new THREE.MeshPhysicalMaterial({
        name: matName,
        color: orig.color ? orig.color.clone() : new THREE.Color(0.08, 0.045, 0.026),
        map: orig.map ?? null,
        emissive: baseEm.clone(),
        emissiveMap: orig.emissiveMap ?? (hasTexMap ? orig.map : null),
        emissiveIntensity: hasTexMap ? (isTape ? 1.05 : 0.95) : 0.0,
        metalness: 0.06,
        roughness: isTape ? 0.30 : 0.42,
        normalMap: orig.normalMap ?? null,
        normalScale: new THREE.Vector2(isTape ? 0.06 : 0.08, isTape ? 0.06 : 0.08),
        clearcoat: isTape ? 0.24 : 0.08,
        clearcoatRoughness: isTape ? 0.20 : 0.38,
        envMapIntensity: isTape ? 0.55 : 0.42,
        side: orig.side,
      });
      node.material = phys;
      if (hasTexMap) {
        glowList.push({
          mat: phys,
          baseEmissive: baseEm,
          baseIntensity: isTape ? 1.02 : 0.92,
          pulseScale: 0.25,
        });
      }
    } else if (isGlow && !isCollar) {
      // Saturated neon core filaments (emerald star floor, cyan bevel pipe, orange bevel pipe, white-gold gill core)
      const baseEm = em ? em.clone() : new THREE.Color(0.1, 0.8, 0.5);
      const baseInt = isCore ? 1.45 : 1.20;
      const phys = new THREE.MeshPhysicalMaterial({
        name: matName,
        color: orig.color ? orig.color.clone() : new THREE.Color(0.02, 0.03, 0.04),
        map: orig.map ?? null,
        emissive: baseEm.clone(),
        emissiveMap: orig.emissiveMap ?? null,
        emissiveIntensity: baseInt,
        metalness: 0.06,
        roughness: 0.20,
        clearcoat: 0.0,
        envMapIntensity: 0.05,
        side: orig.side,
      });
      node.material = phys;
      glowList.push({
        mat: phys,
        baseEmissive: baseEm,
        baseIntensity: baseInt,
        pulseScale: isCore ? 0.85 : 0.65,
      });
    } else if (isCollar) {
      const baseEm = em ? em.clone() : new THREE.Color(0.3, 0.2, 0.05);
      const phys = new THREE.MeshPhysicalMaterial({
        name: matName,
        color: orig.color ? orig.color.clone() : new THREE.Color(0.08, 0.05, 0.02),
        map: orig.map ?? null,
        emissive: baseEm.clone(),
        emissiveMap: orig.emissiveMap ?? null,
        emissiveIntensity: 1.05,
        metalness: orig.metalness ?? 0.48,
        roughness: orig.roughness ?? 0.20,
        normalMap: orig.normalMap ?? null,
        normalScale: new THREE.Vector2(0.07, 0.07),
        clearcoat: 0.14,
        clearcoatRoughness: 0.18,
        envMapIntensity: 0.30,
        side: orig.side,
      });
      node.material = phys;
      glowList.push({ mat: phys, baseEmissive: baseEm, baseIntensity: 1.0, pulseScale: 0.55 });
    } else {
      // Deep Anodized CNC Titanium / Obsidian / Slate
      const phys = new THREE.MeshPhysicalMaterial({
        name: matName,
        color: orig.color ? orig.color.clone() : new THREE.Color(0.020, 0.026, 0.040),
        map: orig.map ?? null,
        emissive: em ? em.clone() : new THREE.Color(0, 0, 0),
        emissiveMap: orig.emissiveMap ?? null,
        emissiveIntensity: 1.0,
        metalness: orig.metalness ?? 0.58,
        roughness: orig.roughness ?? 0.25,
        normalMap: orig.normalMap ?? null,
        normalScale: new THREE.Vector2(0.08, 0.08),
        clearcoat: 0.22,
        clearcoatRoughness: 0.18,
        envMapIntensity: 0.72,
        side: orig.side,
      });
      node.material = phys;
    }
  });
}

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let initialized = false;

async function initPluginCubes(): Promise<void> {
  if (initialized || reduceMotion.matches) return;
  const stages = Array.from(document.querySelectorAll<HTMLElement>('[data-plugin-cube]'));
  if (stages.length === 0) return;
  initialized = true;

  const win = window as WindowWithThree;
  if (!win.THREE) {
    await loadScript('/vendor/three.min.js');
  }
  if (!win.THREE?.GLTFLoader) {
    await loadScript('/vendor/GLTFLoader.js');
  }
  if (window.location.protocol === 'file:' && !win.DINKUS_PLUGIN_CUBES_GLB_B64) {
    try {
      await loadScript('/vendor/plugin-cubes-glb.js');
    } catch {
      // Fallback to direct .glb network loading via GLTFLoader.load.
    }
  }

  const THREE = win.THREE;
  if (!THREE || !THREE.GLTFLoader) return;
  const GLTFLoaderCtor = THREE.GLTFLoader;
  const b64Map = win.DINKUS_PLUGIN_CUBES_GLB_B64 ?? {};

  const instances: CubeInstance[] = [];

  stages.forEach((stage, idx) => {
    const name = stage.getAttribute('data-plugin-cube') ?? 'Commerce';
    const modelUrl = stage.getAttribute('data-plugin-model') ?? `/models/plugins/${name.toLowerCase()}.glb`;

    let renderer: ThreeWebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance',
      });
    } catch {
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.physicallyCorrectLights = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    renderer.outputEncoding = THREE.sRGBEncoding;
    stage.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.environment = createStudioEnvironment(THREE, renderer);

    const camera = new THREE.PerspectiveCamera(33, 1, 0.1, 50);
    camera.position.set(0, 2.35, 5.85);
    camera.lookAt(0, -0.06, 0.04);

    const hemiLight = new THREE.HemisphereLight(0x94a3b8, 0x030509, 0.18);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff7ed, 1.15);
    keyLight.position.set(-4.8, 6.2, 4.2);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.camera.near = 1.0;
    keyLight.shadow.camera.far = 20.0;
    const d = 2.6;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0008;
    scene.add(keyLight);

    const accent = ACCENT_COLORS[name] ?? 0x10b981;
    const rimLight = new THREE.PointLight(accent, name === 'Commerce' ? 4.4 : 3.4, 11);
    rimLight.position.set(-2.5, 2.2, -2.2);
    scene.add(rimLight);

    const fillLight = new THREE.PointLight(accent, name === 'Commerce' ? 3.8 : 2.6, 9);
    fillLight.position.set(2.1, -1.2, 2.9);
    scene.add(fillLight);

    // Radial ground glow + contact shadow halo beneath the cube
    const haloRgb = HALO_RGBA[name] ?? [16, 185, 129];
    const haloMat = new THREE.MeshBasicMaterial({
      map: createGlowHaloTexture(THREE, haloRgb, name === 'Commerce'),
      transparent: true,
      opacity: name === 'Commerce' ? 0.95 : 0.82,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const haloMesh = new THREE.Mesh(new THREE.PlaneGeometry(3.55, 3.55), haloMat);
    haloMesh.rotation.x = -Math.PI / 2;
    haloMesh.position.set(0, -1.06, 0);
    scene.add(haloMesh);

    const baseYaw = INITIAL_YAW[name] ?? -0.64;
    const pivot = new THREE.Group();
    pivot.rotation.x = 0.18;
    pivot.rotation.y = baseYaw;
    scene.add(pivot);

    const resize = () => {
      const rect = stage.getBoundingClientRect();
      const w = Math.max(48, rect.width || 76);
      const h = Math.max(48, rect.height || 76);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener('resize', resize);

    const inst: CubeInstance = {
      name,
      stage,
      renderer,
      scene,
      camera,
      pivot,
      rimLight,
      fillLight,
      haloMat,
      cardRig: null,
      slotGlowNode: null,
      strataBot: null,
      strataMid: null,
      strataTop: null,
      seamLower: null,
      seamUpper: null,
      flapLeft: null,
      flapRight: null,
      tapeBack: null,
      tapeTop: null,
      tapeFront: null,
      glowMaterials: [],
      loaded: false,
      resize,
      dragging: false,
      userOrbited: false,
      lastX: 0,
      lastY: 0,
      velY: 0,
      baseYaw,
      targetX: 0.18,
      phaseOffset: idx * 1.35,
    };

    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const loader = new GLTFLoaderCtor();
    const onModelLoaded = (gltf: { scene: ThreeObject3D }) => {
      const root = gltf.scene;
      upgradeCubeMaterials(THREE, root, maxAniso, inst.glowMaterials);
      root.traverse((node: ThreeObject3D) => {
        if (node.name === 'card_assembly' || node.name === 'CreditCardRig') inst.cardRig = node;
        if (node.name === 'slot_glow') inst.slotGlowNode = node;
        if (node.name === 'stratum_bottom') inst.strataBot = node;
        if (node.name === 'stratum_middle' || node.name === 'StrataMiddle') inst.strataMid = node;
        if (node.name === 'stratum_top' || node.name === 'StrataTop') inst.strataTop = node;
        if (node.name === 'seam_lower') inst.seamLower = node;
        if (node.name === 'seam_upper') inst.seamUpper = node;
        if (node.name === 'flap_left') inst.flapLeft = node;
        if (node.name === 'flap_right') inst.flapRight = node;
        if (node.name === 'tape_back') inst.tapeBack = node;
        if (node.name === 'tape_top') inst.tapeTop = node;
        if (node.name === 'tape_front') inst.tapeFront = node;
      });
      pivot.add(root);
      inst.loaded = true;
      if (reduceMotion.matches) {
        stage.hidden = true;
        stage.parentElement?.classList.remove('has-3d-cube');
        return;
      }
      stage.hidden = false;
      const host = stage.parentElement;
      if (host) {
        host.classList.add('has-3d-cube');
      }
      resize();
      renderer.render(scene, camera);
    };

    const onModelError = () => {
      inst.loaded = false;
      stage.hidden = true;
      const host = stage.parentElement;
      if (host) {
        host.classList.remove('has-3d-cube');
      }
      window.removeEventListener('resize', resize);
      renderer.domElement.remove();
      renderer.dispose();
      const idxInList = instances.indexOf(inst);
      if (idxInList !== -1) {
        instances.splice(idxInList, 1);
      }
    };

    const b64 = b64Map[name] ?? b64Map[name.toLowerCase()];
    if (b64) {
      loader.parse(decodeBase64GLB(b64), '', onModelLoaded, onModelError);
    } else {
      loader.load(modelUrl, onModelLoaded, undefined, onModelError);
    }

    stage.addEventListener('pointerdown', (e: PointerEvent) => {
      inst.dragging = true;
      inst.userOrbited = true;
      inst.lastX = e.clientX;
      inst.lastY = e.clientY;
      inst.velY = 0;
      stage.setPointerCapture(e.pointerId);
    });
    stage.addEventListener('pointermove', (e: PointerEvent) => {
      if (!inst.dragging) return;
      const dx = e.clientX - inst.lastX;
      const dy = e.clientY - inst.lastY;
      inst.lastX = e.clientX;
      inst.lastY = e.clientY;
      inst.pivot.rotation.y += dx * 0.012;
      inst.velY = dx * 0.004;
      inst.targetX = Math.max(-0.45, Math.min(0.65, inst.targetX + dy * 0.008));
    });
    const endDrag = () => {
      inst.dragging = false;
    };
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);

    instances.push(inst);
  });

  if (instances.length === 0) return;

  const SLOT_COS = Math.cos((15 * Math.PI) / 180);
  const SLOT_SIN = Math.sin((15 * Math.PI) / 180);

  const clock = new THREE.Clock();
  let rafId = 0;
  const animate = () => {
    if (reduceMotion.matches) {
      rafId = 0;
      return;
    }
    rafId = requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    const elapsed = clock.getElapsedTime();

    for (const inst of instances) {
      if (inst.stage.hidden) continue;
      const t = elapsed + inst.phaseOffset;

      if (inst.name === 'Payments') {
        // Payments: hero three-quarter isometric sway (-39 deg +/- 8.6 deg) so the left side wall,
        // top face, front POS slot, and emerging EMV card are always simultaneously visible.
        if (!inst.dragging) {
          const heroTargetYaw = inst.baseYaw + Math.sin(t * 1.15) * 0.15;
          const yawDiff = Math.atan2(
            Math.sin(heroTargetYaw - inst.pivot.rotation.y),
            Math.cos(heroTargetYaw - inst.pivot.rotation.y),
          );
          inst.pivot.rotation.y += yawDiff * 0.08 + inst.velY;
          inst.velY *= 0.88;
          inst.targetX = 0.20 + Math.cos(t * 1.15) * 0.035;
        }
        inst.pivot.rotation.x += (inst.targetX - inst.pivot.rotation.x) * 0.14;
        inst.pivot.position.y = Math.sin(t * 1.8) * 0.028;

        // Expressive Card Dip -> Reader Cyan Approval Pulse -> Eject Presentation Cycle
        // Slides strictly along the 15-degree slot axis through (0, -0.06, 0.965) with zero clipping.
        const cardWave = Math.sin(t * 2.35);
        const dip = cardWave < 0 ? cardWave * 0.18 : cardWave * 0.08;
        if (inst.cardRig) {
          inst.cardRig.position.z = 0.965 + dip * SLOT_COS;
          inst.cardRig.position.y = -0.06 - dip * SLOT_SIN;
          inst.cardRig.rotation.z = Math.sin(t * 1.15) * 0.018;
        }
        // Reader approval glow spikes as card seats into the POS slot
        const approvalPulse = Math.pow(Math.max(0, -cardWave), 1.5);
        for (const gm of inst.glowMaterials) {
          gm.mat.emissiveIntensity = gm.baseIntensity + approvalPulse * gm.pulseScale;
        }
        inst.rimLight.intensity = 3.2 + approvalPulse * 2.4;
        inst.fillLight.intensity = 2.4 + approvalPulse * 2.0;
        inst.haloMat.opacity = 0.74 + approvalPulse * 0.26;

      } else if (inst.name === 'Inventory') {
        // Inventory: 360 turntable + living "breathing gills" pulsation & stratum articulation
        if (!inst.dragging) {
          inst.pivot.rotation.y += dt * 0.46 + inst.velY;
          inst.velY *= 0.92;
          inst.targetX += (0.19 - inst.targetX) * 0.06;
        }
        inst.pivot.rotation.x += (inst.targetX - inst.pivot.rotation.x) * 0.14;

        // Organic two-gill phase wave (bottom gill leads slightly, upper gill follows like real gills)
        const gillLower = Math.pow(Math.sin(t * 2.5) * 0.5 + 0.5, 1.3);
        const gillUpper = Math.pow(Math.sin(t * 2.5 - 0.42) * 0.5 + 0.5, 1.3);
        const gillAvg = (gillLower + gillUpper) * 0.5;

        inst.pivot.position.y = (gillAvg - 0.5) * 0.042;

        if (inst.strataBot && inst.strataMid && inst.strataTop) {
          inst.strataBot.position.y = -0.67 - gillLower * 0.095;
          inst.strataMid.position.y = (gillUpper - gillLower) * 0.032;
          inst.strataTop.position.y = 0.67 + gillUpper * 0.105;
          // Subtle gill louver flare tilt on inhale
          inst.strataTop.rotation.x = gillUpper * 0.032;
          inst.strataBot.rotation.x = -gillLower * 0.028;
        }
        if (inst.seamLower) {
          const sxL = 0.98 + gillLower * 0.045;
          const syL = 0.82 + gillLower * 0.42;
          inst.seamLower.scale.set(sxL, syL, sxL);
          inst.seamLower.position.y = -0.34 - gillLower * 0.028;
        }
        if (inst.seamUpper) {
          const sxU = 0.98 + gillUpper * 0.045;
          const syU = 0.82 + gillUpper * 0.42;
          inst.seamUpper.scale.set(sxU, syU, sxU);
          inst.seamUpper.position.y = 0.34 + gillUpper * 0.032;
        }

        // Dramatic gill glow pulsation from smoldering amber on exhale to rich golden-amber on inhale
        for (const gm of inst.glowMaterials) {
          gm.mat.emissiveIntensity = gm.baseIntensity * 0.68 + gillAvg * gm.pulseScale;
        }
        inst.rimLight.intensity = 2.0 + gillAvg * 3.6;
        inst.fillLight.intensity = 1.6 + gillAvg * 3.0;
        inst.haloMat.opacity = 0.48 + gillAvg * 0.52;

      } else if (inst.name === 'Commerce') {
        // Commerce: 360 turntable + lush emerald storefront & roof Dinkus * green glow
        if (!inst.dragging) {
          inst.pivot.rotation.y += dt * 0.48 + inst.velY;
          inst.velY *= 0.92;
          inst.targetX += (0.20 - inst.targetX) * 0.06;
        }
        inst.pivot.rotation.x += (inst.targetX - inst.pivot.rotation.x) * 0.14;
        inst.pivot.position.y = Math.sin(t * 1.7) * 0.030;

        const greenPulse = Math.sin(t * 2.2) * 0.5 + 0.5;
        for (const gm of inst.glowMaterials) {
          gm.mat.emissiveIntensity = gm.baseIntensity + greenPulse * gm.pulseScale;
        }
        inst.rimLight.intensity = 4.0 + greenPulse * 1.6;
        inst.fillLight.intensity = 3.2 + greenPulse * 1.4;
        inst.haloMat.opacity = 0.84 + greenPulse * 0.16;

      } else {
        // Ship: 360 turntable + articulated carton flaps closing + dual-side kraft tape application
        if (!inst.dragging) {
          inst.pivot.rotation.y += dt * 0.48 + inst.velY;
          inst.velY *= 0.92;
          inst.targetX += (0.19 - inst.targetX) * 0.06;
        }
        inst.pivot.rotation.x += (inst.targetX - inst.pivot.rotation.x) * 0.14;
        inst.pivot.position.y = Math.sin(t * 1.7) * 0.030;

        // 4.8-second parcel packing cycle:
        //   0.72..1.00 & 0.00..0.24: Sealed hero hold showing tape wrapped down BOTH opposite sides (-Z and +Z)
        //   0.24..0.34: Tape cleanly retracts before top flaps begin opening
        //   0.35..0.48: Top flaps hinge open revealing dark carton interior & dust flaps
        //   0.48..0.59: Left flap then right flap fold shut with crisp staggered ease-out
        //   0.60..0.72: Kraft tape anchors on -Z back wall, wipes across top seam, and folds down +Z front wall
        const period = 4.8;
        const shipT = t - inst.phaseOffset;
        const cyc = (((shipT % period) + period) % period) / period;

        const leftClose = 1.0 - smoothstep(0.37, 0.45, cyc) + smoothstep(0.48, 0.56, cyc);
        const rightClose = 1.0 - smoothstep(0.35, 0.43, cyc) + smoothstep(0.51, 0.59, cyc);

        const tapeBackP = 1.0 - smoothstep(0.30, 0.34, cyc) + smoothstep(0.60, 0.64, cyc);
        const tapeTopP = 1.0 - smoothstep(0.27, 0.31, cyc) + smoothstep(0.63, 0.68, cyc);
        const tapeFrontP = 1.0 - smoothstep(0.24, 0.28, cyc) + smoothstep(0.67, 0.72, cyc);

        const maxFlapAngle = 1.05;
        if (inst.flapLeft) {
          inst.flapLeft.rotation.z = (1.0 - leftClose) * maxFlapAngle;
        }
        if (inst.flapRight) {
          inst.flapRight.rotation.z = -(1.0 - rightClose) * maxFlapAngle;
        }

        if (inst.tapeBack) {
          inst.tapeBack.visible = tapeBackP > 0.004;
          inst.tapeBack.scale.set(1.0, Math.max(0.001, tapeBackP), 1.0);
          inst.tapeBack.rotation.x = (1.0 - tapeBackP) * 0.48;
        }
        if (inst.tapeTop) {
          inst.tapeTop.visible = tapeTopP > 0.004;
          inst.tapeTop.scale.set(1.0, 1.0, Math.max(0.001, tapeTopP));
        }
        if (inst.tapeFront) {
          inst.tapeFront.visible = tapeFrontP > 0.004;
          inst.tapeFront.scale.set(1.0, Math.max(0.001, tapeFrontP), 1.0);
          inst.tapeFront.rotation.x = -(1.0 - tapeFrontP) * 0.55;
        }

        const sealBoost = 1.0 - smoothstep(0.24, 0.34, cyc) + smoothstep(0.66, 0.73, cyc);
        const shipPulse = (Math.sin(t * 2.1) * 0.5 + 0.5) * 0.65 + sealBoost * 0.55;
        for (const gm of inst.glowMaterials) {
          gm.mat.emissiveIntensity = gm.baseIntensity + shipPulse * gm.pulseScale;
        }
        inst.rimLight.intensity = 3.0 + shipPulse * 1.4;
        inst.fillLight.intensity = 2.4 + shipPulse * 1.1;
        inst.haloMat.opacity = 0.70 + shipPulse * 0.22;
      }

      inst.renderer.render(inst.scene, inst.camera);
    }
  };

  const syncReducedMotion = () => {
    if (reduceMotion.matches) {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      for (const inst of instances) {
        inst.stage.hidden = true;
        inst.stage.parentElement?.classList.remove('has-3d-cube');
      }
      return;
    }
    for (const inst of instances) {
      if (!inst.loaded) continue;
      inst.stage.hidden = false;
      inst.stage.parentElement?.classList.add('has-3d-cube');
      inst.resize();
      inst.renderer.render(inst.scene, inst.camera);
    }
    if (!rafId && instances.length > 0) {
      clock.getDelta();
      rafId = requestAnimationFrame(animate);
    }
  };
  reduceMotion.addEventListener('change', syncReducedMotion);
  syncReducedMotion();
}

reduceMotion.addEventListener('change', () => {
  if (!initialized && !reduceMotion.matches) {
    void initPluginCubes();
  }
});
void initPluginCubes();
