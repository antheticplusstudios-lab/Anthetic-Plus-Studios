import { useEffect, useRef } from "react";
import * as THREE from "three";

const DEFAULTS = {
  near: "#000000",
  far: "#FFFFFF",
  edge: "#000000",
  grid: 17,
  blockSize: 20,
  gap: 10,
  layers: 15,
  density: 9,
  cluster: 10,
  edgeWidth: 1,
  fade: 1,
  shade: 20,
  clearCentre: 3,
  speed: 8,
  direction: "front" as const,
};

const MAX_GRID = 41;

type Config = {
  near: string;
  far: string;
  edge: string;
  grid: number;
  blockSize: number;
  gap: number;
  layers: number;
  density: number;
  cluster: number;
  edgeWidth: number;
  fade: number;
  shade: number;
  clearCentre: number;
  speed: number;
  direction: "front" | "back";
};

function clamp(v: number, lo: number, hi: number, fallback: number) {
  const n = typeof v === "number" && Number.isFinite(v) ? v : fallback;
  return Math.max(lo, Math.min(hi, n));
}

function settingsFor(cfg: Config) {
  const requestedGrid = Math.round(clamp(cfg.grid, 3, 31, DEFAULTS.grid));
  const grid = requestedGrid % 2 === 0 ? requestedGrid + 1 : requestedGrid;
  const block = 0.12 + clamp(cfg.blockSize, 1, 20, DEFAULTS.blockSize) * 0.05;

  return {
    grid,
    layers: Math.round(clamp(cfg.layers, 5, 15, DEFAULTS.layers)),
    block,
    spacing: block,
    gap: 0.4 + clamp(cfg.gap, 1, 20, DEFAULTS.gap) * 0.11,
    density: clamp(cfg.density, 1, 20, DEFAULTS.density) / 20,
    cluster: 1.4 - clamp(cfg.cluster, 1, 20, DEFAULTS.cluster) * 0.055,
    edgeWidth: clamp(cfg.edgeWidth, 0, 20, DEFAULTS.edgeWidth) * 0.011,
    fade: clamp(cfg.fade, 1, 20, DEFAULTS.fade) * 0.011,
    shade: clamp(cfg.shade, 0, 20, DEFAULTS.shade) * 0.03,
    speed: clamp(cfg.speed, 0, 20, DEFAULTS.speed) * 0.09,
    heading: cfg.direction === "back" ? -1 : 1,
    clearCentre: Math.round(clamp(cfg.clearCentre, 0, 5, DEFAULTS.clearCentre)),
  };
}

function buildBlocks(grid: number, layers: number): THREE.BufferGeometry {
  const count = grid * grid * layers;
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const cell = new Float32Array(count);
  const layer = new Float32Array(count);

  let i = 0;
  for (let l = 0; l < layers; l++) {
    for (let c = 0; c < grid * grid; c++) {
      cell[i] = c;
      layer[i] = l;
      i++;
    }
  }

  geometry.setAttribute("aCell", new THREE.InstancedBufferAttribute(cell, 1));
  geometry.setAttribute("aLayer", new THREE.InstancedBufferAttribute(layer, 1));
  return geometry;
}

const BLOCK_VERTEX = `
attribute float aCell;
attribute float aLayer;

uniform float uTime;
uniform float uGrid;
uniform float uBlock;
uniform float uSpacing;
uniform float uGap;
uniform float uDensity;
uniform float uCluster;
uniform float uClearCentre;
uniform float uHeading;
uniform float uLayers;

varying float vDepth;
varying vec3 vNormal;
varying float vAlive;
varying vec2 vFace;

float hash(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 34.56);
  return fract(p.x * p.y * 95.43);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

void main() {
  float cx = mod(aCell, uGrid);
  float cy = floor(aCell / uGrid);
  float mid = (uGrid - 1.0) * 0.5;
  vec2 cell = vec2(cx, cy) - mid;
  vec2 xy = cell * uSpacing;

  float beat = floor(uTime);
  float f = fract(uTime);
  float slide = uHeading > 0.0 ? f : 1.0 - f;
  float depth = aLayer + 1.0 - slide;

  float seed = beat * uHeading + aLayer;
  float n = vnoise(vec2(cx, cy) * uCluster + seed * 19.3);
  float alive = step(n, uDensity);

  float ring = max(abs(cell.x), abs(cell.y));
  alive *= step(uClearCentre + 0.5, ring);

  float dn = depth / max(1.0, uLayers);
  float grow = smoothstep(1.0, 0.84, dn);

  vec3 p = position * uBlock * alive * grow;
  p.xy += xy;
  p.z += uGap - depth * uGap;

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vDepth = clamp(dn, 0.0, 1.0);
  vAlive = alive;
  vFace = uv;

  gl_Position = projectionMatrix * mv;
}
`;

const BLOCK_FRAGMENT = `
uniform vec3 uNear;
uniform vec3 uFar;
uniform vec3 uEdge;
uniform float uFade;
uniform float uShade;
uniform float uEdgeWidth;

varying float vDepth;
varying vec3 vNormal;
varying float vAlive;
varying vec2 vFace;

void main() {
  if (vAlive < 0.5) discard;

  vec3 col = mix(
    uNear,
    uFar,
    pow(vDepth, 1.0 - uFade * 8.0 + 0.9)
  );

  vec3 n = normalize(vNormal);
  float face = 0.5 + 0.5 * dot(
    n,
    normalize(vec3(-0.4, 0.55, 0.75))
  );
  col *= 1.0 - uShade + uShade * face * 2.0;

  if (uEdgeWidth > 0.0001) {
    float e = min(
      min(vFace.x, 1.0 - vFace.x),
      min(vFace.y, 1.0 - vFace.y)
    );
    float aa = max(fwidth(e), 0.0001);
    float border = 1.0 - smoothstep(
      uEdgeWidth - aa,
      uEdgeWidth + aa,
      e
    );
    col = mix(col, uEdge, border * (1.0 - vDepth * 0.65));
  }

  // Fade blocks out with depth so the field dissolves into the page instead of
  // reading as a separate rectangle of video.
  float alpha = pow(1.0 - clamp(vDepth, 0.0, 1.0), 1.4) * 0.62;
  gl_FragColor = vec4(max(col, 0.0) * alpha, alpha);
}
`;

type BlockUniforms = {
  uTime: THREE.IUniform<number>;
  uGrid: THREE.IUniform<number>;
  uBlock: THREE.IUniform<number>;
  uSpacing: THREE.IUniform<number>;
  uGap: THREE.IUniform<number>;
  uDensity: THREE.IUniform<number>;
  uCluster: THREE.IUniform<number>;
  uClearCentre: THREE.IUniform<number>;
  uHeading: THREE.IUniform<number>;
  uLayers: THREE.IUniform<number>;
  uNear: THREE.IUniform<THREE.Color>;
  uFar: THREE.IUniform<THREE.Color>;
  uEdge: THREE.IUniform<THREE.Color>;
  uFade: THREE.IUniform<number>;
  uShade: THREE.IUniform<number>;
  uEdgeWidth: THREE.IUniform<number>;
};

class BlockScene {
  private container: HTMLElement;
  private cfg: Config;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(60, 1, 0.02, 400);
  private geometry: THREE.BufferGeometry;
  private material: THREE.ShaderMaterial;
  private get uniforms(): BlockUniforms {
    return this.material.uniforms as BlockUniforms;
  }
  private mesh: THREE.InstancedMesh;
  private gridUsed = 0;
  private layersUsed = 0;
  private time = 0;
  private width = 0;
  private height = 0;
  private frameId = 0;
  private lastT = 0;
  private disposed = false;
  private visible = true;
  private reducedMotion: boolean;
  private resizeObserver?: ResizeObserver;
  private intersectionObserver?: IntersectionObserver;

  constructor(container: HTMLElement, cfg: Config, reducedMotion: boolean) {
    this.container = container;
    this.cfg = cfg;
    this.reducedMotion = reducedMotion;

    const S = settingsFor(cfg);
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "low-power",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);

    const el = this.renderer.domElement;
    el.style.position = "absolute";
    el.style.inset = "0";
    el.style.width = "100%";
    el.style.height = "100%";
    el.setAttribute("aria-hidden", "true");
    container.appendChild(el);

    this.material = new THREE.ShaderMaterial({
      vertexShader: BLOCK_VERTEX,
      fragmentShader: BLOCK_FRAGMENT,
      transparent: true,
      premultipliedAlpha: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uGrid: { value: S.grid },
        uBlock: { value: S.block },
        uSpacing: { value: S.spacing },
        uGap: { value: S.gap },
        uDensity: { value: S.density },
        uCluster: { value: S.cluster },
        uClearCentre: { value: S.clearCentre },
        uHeading: { value: S.heading },
        uLayers: { value: S.layers },
        uNear: { value: new THREE.Color(cfg.near) },
        uFar: { value: new THREE.Color(cfg.far) },
        uEdge: { value: new THREE.Color(cfg.edge) },
        uFade: { value: S.fade },
        uShade: { value: S.shade },
        uEdgeWidth: { value: S.edgeWidth },
      },
    });

    this.gridUsed = S.grid;
    this.layersUsed = S.layers;
    this.geometry = buildBlocks(S.grid, S.layers);
    this.mesh = this.makeMesh(S.grid * S.grid * S.layers);
    this.scene.add(this.mesh);
  }

  private makeMesh(count: number): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(this.geometry, this.material, count);
    const identity = new THREE.Matrix4();
    for (let i = 0; i < count; i++) mesh.setMatrixAt(i, identity);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    return mesh;
  }

  start() {
    this.lastT = performance.now();

    const loop = () => {
      if (this.disposed) return;
      this.frameId = requestAnimationFrame(loop);
      if (!this.visible || this.width <= 0 || this.height <= 0) return;

      const now = performance.now();
      let dt = (now - this.lastT) / 1000;
      this.lastT = now;
      if (!Number.isFinite(dt) || dt < 0) dt = 0;
      dt = Math.min(dt, 0.05);

      if (!this.reducedMotion) {
        this.time += dt * settingsFor(this.cfg).speed;
        this.uniforms.uTime.value = this.time;
      }

      this.renderer.render(this.scene, this.camera);
    };

    loop();
  }

  setSize(width: number, height: number) {
    if (this.disposed || width <= 0 || height <= 0) return;
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height, false);
    this.updateCamera();
  }

  updateConfig(cfg: Config) {
    if (this.disposed) return;
    this.cfg = cfg;
    const S = settingsFor(cfg);
    const u = this.uniforms;

    u.uBlock.value = S.block;
    u.uSpacing.value = S.spacing;
    u.uGap.value = S.gap;
    u.uDensity.value = S.density;
    u.uCluster.value = S.cluster;
    u.uClearCentre.value = S.clearCentre;
    u.uHeading.value = S.heading;
    u.uLayers.value = S.layers;
    u.uFade.value = S.fade;
    u.uShade.value = S.shade;
    u.uEdgeWidth.value = S.edgeWidth;
    u.uNear.value.set(cfg.near || "#ffffff");
    u.uFar.value.set(cfg.far || "#000000");
    u.uEdge.value.set(cfg.edge || "#000000");

    this.updateCamera();
  }

  private resolveGrid(S: ReturnType<typeof settingsFor>, aspect: number, fov: number) {
    const tanV = Math.tan((fov * Math.PI) / 360);
    const reach = tanV * S.gap * 1.25 * Math.max(1, aspect);
    const cells = 2 * Math.ceil(reach / S.block) + 1;
    return Math.min(MAX_GRID, Math.max(S.grid, cells));
  }

  private updateCamera() {
    const w = Math.max(1, this.width);
    const h = Math.max(1, this.height);
    const aspect = w / h;
    const S = settingsFor(this.cfg);
    const fov = aspect < 1 ? 78 : 62;
    const grid = this.resolveGrid(S, aspect, fov);

    if (grid !== this.gridUsed || S.layers !== this.layersUsed) {
      this.gridUsed = grid;
      this.layersUsed = S.layers;
      this.scene.remove(this.mesh);
      this.geometry.dispose();
      this.geometry = buildBlocks(grid, S.layers);
      this.mesh = this.makeMesh(grid * grid * S.layers);
      this.scene.add(this.mesh);
    }

    this.uniforms.uGrid.value = grid;
    this.camera.aspect = aspect;
    this.camera.fov = fov;
    this.camera.position.set(0, 0, 0);
    this.camera.lookAt(0, 0, -1);
    this.camera.near = 0.02;
    this.camera.far = S.gap * (S.layers + 2);
    this.camera.updateProjectionMatrix();
  }

  setColors(cfg: Config) {
    this.cfg = cfg;
    this.uniforms.uNear.value.set(cfg.near);
    this.uniforms.uFar.value.set(cfg.far);
    this.uniforms.uEdge.value.set(cfg.edge);
  }

  setVisible(visible: boolean) {
    this.visible = visible;
    this.lastT = performance.now();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    this.resizeObserver?.disconnect();
    this.intersectionObserver?.disconnect();
    this.scene.remove(this.mesh);
    this.mesh.dispose();
    this.geometry.dispose();
    this.material.dispose();
    this.renderer.dispose();

    const el = this.renderer.domElement;
    if (el.parentNode === this.container) this.container.removeChild(el);
  }

  observe() {
    this.resizeObserver = new ResizeObserver(() => {
      this.setSize(this.container.clientWidth, this.container.clientHeight);
    });
    this.resizeObserver.observe(this.container);

    this.intersectionObserver = new IntersectionObserver(([entry]) => {
      this.setVisible(Boolean(entry?.isIntersecting));
    });
    this.intersectionObserver.observe(this.container);
  }
}

/** Resolves a CSS colour token (oklch etc.) to hex via a 1px canvas. */
function tokenHex(name: string, fallback: string): string {
  try {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (!raw) return fallback;
    const c = document.createElement("canvas");
    c.width = c.height = 1;
    const ctx = c.getContext("2d");
    if (!ctx) return fallback;
    ctx.fillStyle = raw;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return `#${[r, g, b].map((v) => (v ?? 0).toString(16).padStart(2, "0")).join("")}`;
  } catch {
    return fallback;
  }
}

function themeConfig(): Config {
  return {
    ...DEFAULTS,
    near: tokenHex("--drift-near", DEFAULTS.near),
    far: tokenHex("--background", DEFAULTS.far),
    edge: tokenHex("--drift-edge", DEFAULTS.edge),
  };
}

export function BlockDrift() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<BlockScene | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let scene: BlockScene;
    try {
      scene = new BlockScene(container, themeConfig(), reducedMotion);
    } catch (error) {
      console.error("Block Drift WebGL initialization failed:", error);
      return;
    }

    sceneRef.current = scene;
    scene.setSize(container.clientWidth, container.clientHeight);
    scene.observe();
    scene.start();

    // Follow light/dark theme changes so the blocks always use the page palette.
    const themeObserver = new MutationObserver(() => scene.setColors(themeConfig()));
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });

    return () => {
      themeObserver.disconnect();
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className="block-drift pointer-events-none absolute inset-0 z-0 overflow-hidden"
      style={{ minWidth: 120, minHeight: 120 }}
    />
  );
}
