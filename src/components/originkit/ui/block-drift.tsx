"use client";

import * as React from "react";
import { useEffect, useRef } from "react";
import * as THREE from "three";

const DEFAULTS = {
  near: "#0012FF",
  far: "#FFFFFF",
  edge: "#FCFF00",
  grid: 9,
  blockSize: 10,
  gap: 20,
  layers: 15,
  density: 11,
  cluster: 1,
  edgeWidth: 1,
  fade: 1,
  shade: 20,
  clearCentre: 3,
  speed: 12,
  direction: "front",
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

function clamp(v: number, lo: number, hi: number, fallback: number): number {
  const n = typeof v === "number" && isFinite(v) ? v : fallback;
  return Math.max(lo, Math.min(hi, n));
}

function settingsFor(cfg: Config) {
  const grid = Math.round(clamp(cfg.grid, 3, 31, DEFAULTS.grid));

  const block = 0.12 + clamp(cfg.blockSize, 1, 20, DEFAULTS.blockSize) * 0.05;
  return {
    grid: grid % 2 === 0 ? grid + 1 : grid,
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
  const cells = grid * grid;
  const count = cells * layers;
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const cell = new Float32Array(count);
  const layer = new Float32Array(count);

  let i = 0;
  for (let l = 0; l < layers; l++) {
    for (let c = 0; c < cells; c++) {
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

        vec3 col = mix(uNear, uFar, pow(vDepth, 1.0 - uFade * 8.0 + 0.9));

        vec3 n = normalize(vNormal);
        float face = 0.5 + 0.5 * dot(n, normalize(vec3(-0.4, 0.55, 0.75)));
        col *= 1.0 - uShade + uShade * face * 2.0;

        if (uEdgeWidth > 0.0001) {
            float e = min(min(vFace.x, 1.0 - vFace.x), min(vFace.y, 1.0 - vFace.y));
            float aa = max(fwidth(e), 0.0001);
            float border = 1.0 - smoothstep(uEdgeWidth - aa, uEdgeWidth + aa, e);

            col = mix(col, uEdge, border * (1.0 - vDepth * 0.65));
        }

        gl_FragColor = vec4(max(col, 0.0), 1.0);
    }
`;

class BlockScene {
  private container: HTMLElement;
  private cfg: Config;

  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(60, 1, 0.02, 400);

  private geometry: THREE.BufferGeometry;
  private material: THREE.ShaderMaterial;
  private mesh: THREE.InstancedMesh;

  private gridUsed = 0;
  private layersUsed = 0;
  private time = 0;
  private width = 0;
  private height = 0;
  private frameId = 0;
  private lastT = 0;
  private disposed = false;

  constructor(container: HTMLElement, cfg: Config) {
    this.container = container;
    this.cfg = cfg;
    const S = settingsFor(cfg);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);
    const el = this.renderer.domElement;
    el.style.position = "absolute";
    el.style.inset = "0";
    el.style.width = "100%";
    el.style.height = "100%";
    container.appendChild(el);

    this.material = new THREE.ShaderMaterial({
      vertexShader: BLOCK_VERTEX,
      fragmentShader: BLOCK_FRAGMENT,
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
    if (this.disposed || this.frameId) return;
    this.lastT = performance.now();
    const loop = () => {
      this.frameId = requestAnimationFrame(loop);
      this.step();
    };
    this.frameId = requestAnimationFrame(loop);
  }

  pause() {
    cancelAnimationFrame(this.frameId);
    this.frameId = 0;
  }

  private setUniform(name: string, value: unknown) {
    const uniform = this.material.uniforms[name];
    if (!uniform) return;
    if (uniform.value instanceof THREE.Color && typeof value === "string") uniform.value.set(value);
    else uniform.value = value;
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
    for (const [name, value] of Object.entries({
      uGrid: S.grid,
      uBlock: S.block,
      uSpacing: S.spacing,
      uGap: S.gap,
      uDensity: S.density,
      uCluster: S.cluster,
      uClearCentre: S.clearCentre,
      uHeading: S.heading,
      uLayers: S.layers,
      uFade: S.fade,
      uShade: S.shade,
      uEdgeWidth: S.edgeWidth,
      uNear: cfg.near,
      uFar: cfg.far,
      uEdge: cfg.edge,
    }))
      this.setUniform(name, value);

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
      this.mesh.dispose();
      this.geometry.dispose();
      this.geometry = buildBlocks(grid, S.layers);
      this.mesh = this.makeMesh(grid * grid * S.layers);
      this.scene.add(this.mesh);
    }

    this.setUniform("uGrid", grid);

    this.camera.aspect = aspect;
    this.camera.fov = fov;
    this.camera.position.set(0, 0, 0);
    this.camera.lookAt(0, 0, -1);
    this.camera.near = 0.02;
    this.camera.far = S.gap * (S.layers + 2);
    this.camera.updateProjectionMatrix();
  }

  private step() {
    if (this.disposed) return;
    const now = performance.now();
    let dt = (now - this.lastT) / 1000;
    this.lastT = now;
    if (!isFinite(dt) || dt < 0) dt = 0;
    if (dt > 0.05) dt = 0.05;

    this.time += dt * settingsFor(this.cfg).speed;
    this.setUniform("uTime", this.time);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    this.mesh.dispose();
    this.geometry.dispose();
    this.material.dispose();
    this.renderer.dispose();
    const el = this.renderer.domElement;
    if (el.parentNode === this.container) this.container.removeChild(el);
  }
}

interface BlockDriftProps {
  near?: string;
  far?: string;
  edge?: string;
  grid?: number;
  blockSize?: number;
  gap?: number;
  layers?: number;
  density?: number;
  cluster?: number;
  edgeWidth?: number;
  fade?: number;
  shade?: number;
  clearCentre?: number;
  speed?: number;
  direction?: "front" | "back";
  style?: React.CSSProperties;
}

export default function BlockDrift(props: BlockDriftProps) {
  const {
    near = DEFAULTS.near,
    far = DEFAULTS.far,
    edge = DEFAULTS.edge,
    grid = DEFAULTS.grid,
    blockSize = DEFAULTS.blockSize,
    gap = DEFAULTS.gap,
    layers = DEFAULTS.layers,
    density = DEFAULTS.density,
    cluster = DEFAULTS.cluster,
    edgeWidth = DEFAULTS.edgeWidth,
    fade = DEFAULTS.fade,
    shade = DEFAULTS.shade,
    clearCentre = DEFAULTS.clearCentre,
    speed = DEFAULTS.speed,
    direction = DEFAULTS.direction as "front" | "back",
    style,
  } = props;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<BlockScene | null>(null);
  const themeColors = useRef<Pick<Config, "near" | "far" | "edge"> | null>(null);

  const cfgRef = useRef<Config>({
    near,
    far,
    edge,
    grid,
    blockSize,
    gap,
    layers,
    density,
    cluster,
    edgeWidth,
    fade,
    shade,
    clearCentre,
    speed,
    direction,
  });
  cfgRef.current = {
    near,
    far,
    edge,
    grid,
    blockSize,
    gap,
    layers,
    density,
    cluster,
    edgeWidth,
    fade,
    shade,
    clearCentre,
    speed,
    direction,
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let scene: BlockScene;
    try {
      const tokens = getComputedStyle(container);
      const resolveColor = (token: string, fallback: string) => {
        const value = tokens.getPropertyValue(token).trim();
        const probe = document.createElement("span");
        probe.style.color = value || fallback;
        container.appendChild(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();
        // Three's color parser expects sRGB, rather than CSS oklch.
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 1;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return fallback;
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 1, 1);
        const pixel = ctx.getImageData(0, 0, 1, 1).data;
        return `rgb(${pixel[0]},${pixel[1]},${pixel[2]})`;
      };
      cfgRef.current = {
        ...cfgRef.current,
        near: resolveColor("--drift-near", cfgRef.current.near),
        far: resolveColor("--background", cfgRef.current.far),
        edge: resolveColor("--drift-edge", cfgRef.current.edge),
      };
      themeColors.current = {
        near: cfgRef.current.near,
        far: cfgRef.current.far,
        edge: cfgRef.current.edge,
      };
      scene = new BlockScene(container, cfgRef.current);
    } catch {
      return;
    }
    sceneRef.current = scene;
    scene.setSize(container.clientWidth, container.clientHeight);
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = false;
    const sync = () => {
      if (visible && !document.hidden && !preference.matches) scene.start();
      else scene.pause();
    };
    const io = new IntersectionObserver(([entry]) => {
      visible = Boolean(entry?.isIntersecting);
      sync();
    });
    io.observe(container);
    document.addEventListener("visibilitychange", sync);
    preference.addEventListener("change", sync);

    const ro = new ResizeObserver(() => {
      scene.setSize(container.clientWidth, container.clientHeight);
    });
    ro.observe(container);
    return () => {
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
      preference.removeEventListener("change", sync);
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.updateConfig({ ...cfgRef.current, ...themeColors.current });
  }, [
    near,
    far,
    edge,
    grid,
    blockSize,
    gap,
    layers,
    density,
    cluster,
    edgeWidth,
    fade,
    shade,
    clearCentre,
    speed,
    direction,
  ]);

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label="Block drift"
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minWidth: 120,
        minHeight: 120,
        overflow: "hidden",
        ...style,
      }}
    />
  );
}

BlockDrift.displayName = "Block Drift";
BlockDrift.defaultProps = { ...DEFAULTS };
