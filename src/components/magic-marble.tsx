"use client";

import * as React from "react";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";

const SPHERE_R = 1;
const SPHERE_SEGMENTS: [number, number] = [64, 32];
const CAMERA_DIST = 2;
const FIT_MARGIN = 1.18;
const BASE_SPAN = SPHERE_R * 2 * FIT_MARGIN;
const CAMERA_TILT = 0.22;
const HDRI_URL =
  "https://cdn.jsdelivr.net/gh/pmndrs/drei-assets@master/hdri/empty_warehouse_01_1k.hdr";
const HEIGHT_MAP_URL =
  "https://cdn.jsdelivr.net/gh/mattrossman/magic-marble-tutorial@master/public/noise.jpg";
const DISPLACEMENT_MAP_URL =
  "https://cdn.jsdelivr.net/gh/mattrossman/magic-marble-tutorial@master/public/noise3D.jpg";
const PRESS_SCALE = 0.95;
const PRESS_RATE = 14;
const STEP_RATE = 2;
const STEP_ADVANCE = 0.2;
const DRAG_SLOP = 5;
const DRAG_DECAY = 3;
const PITCH_LIMIT = 1.0;

const DEFAULTS = {
  palette: ["#FF0000", "#FFFF00", "#00FF80", "#5252E0", "#CCCCCC"],
  core: "#000000",
  depth: 12,
  grain: 5,
  softness: 4,
  detail: 12,
  polish: 10,
  speed: 8,
  spin: 8,
  direction: "right" as const,
  drag: 8,
  sizePercent: 64,
};

type Config = {
  palette: string[];
  core: string;
  depth: number;
  grain: number;
  softness: number;
  detail: number;
  polish: number;
  speed: number;
  spin: number;
  direction: "right" | "left";
  drag: number;
  sizePercent: number;
};

function clamp(v: number, lo: number, hi: number, fallback: number) {
  const n = typeof v === "number" && Number.isFinite(v) ? v : fallback;
  return Math.max(lo, Math.min(hi, n));
}

function settingsFor(cfg: Config) {
  return {
    depth: clamp(cfg.depth, 1, 20, DEFAULTS.depth) * 0.05,
    displacement: clamp(cfg.grain, 0, 20, DEFAULTS.grain) * 0.02,
    smoothing: clamp(cfg.softness, 1, 20, DEFAULTS.softness) * 0.05,
    iterations: clamp(cfg.detail, 1, 20, DEFAULTS.detail) * 4,
    roughness: 1 - clamp(cfg.polish, 1, 10, DEFAULTS.polish) * 0.06,
    speed: clamp(cfg.speed, 0, 20, DEFAULTS.speed) * 0.00625,
    spin: clamp(cfg.spin, 0, 20, DEFAULTS.spin) * 0.06,
    heading: cfg.direction === "left" ? -1 : 1,
    drag: clamp(cfg.drag, 0, 20, DEFAULTS.drag) * 0.0025,
    zoom: 100 / clamp(cfg.sizePercent, 20, 100, DEFAULTS.sizePercent),
  };
}

const textureCache = new Map<string, THREE.Texture>();
const texturePending = new Map<string, Promise<THREE.Texture | null>>();

type TextureLoadStarter = (onLoad: (texture: THREE.Texture) => void, onError: () => void) => void;

function loadTexture(
  url: string,
  startLoad: TextureLoadStarter = (onLoad, onError) => {
    new THREE.TextureLoader().load(url, onLoad, undefined, onError);
  },
) {
  const cached = textureCache.get(url);
  if (cached) return Promise.resolve(cached);
  const pending = texturePending.get(url);
  if (pending) return pending;
  const request = new Promise<THREE.Texture | null>((resolve) => {
    startLoad(
      (texture) => {
        textureCache.set(url, texture);
        resolve(texture);
      },
      () => resolve(null),
    );
  });
  texturePending.set(url, request);
  return request;
}

function patchMarbleShader(
  shader: {
    vertexShader: string;
    fragmentShader: string;
    uniforms: Record<string, THREE.IUniform>;
  },
  uniforms: Record<string, THREE.IUniform>,
) {
  shader.uniforms = { ...shader.uniforms, ...uniforms };
  shader.vertexShader = `varying vec3 v_pos; varying vec3 v_dir;${shader.vertexShader}`;
  shader.vertexShader = shader.vertexShader.replace(
    /void main\(\) \{/,
    (match) => `${match}\n v_dir = position - cameraPosition;\n v_pos = position;`,
  );
  shader.fragmentShader = `
    #define FLIP vec2(1., -1.)
    uniform vec3 colorA;
    uniform vec3 colorB;
    uniform sampler2D heightMap;
    uniform sampler2D displacementMap;
    uniform int iterations;
    uniform float depth;
    uniform float smoothing;
    uniform float displacement;
    uniform float time;
    varying vec3 v_pos;
    varying vec3 v_dir;
  ${shader.fragmentShader}`;
  shader.fragmentShader = shader.fragmentShader.replace(
    /void main\(\) \{/,
    `
      vec3 displacePoint(vec3 p, float strength) {
        vec2 uv = equirectUv(normalize(p));
        vec2 scroll = vec2(time, 0.);
        vec3 displacementA = texture(displacementMap, uv + scroll).rgb;
        vec3 displacementB = texture(displacementMap, uv * FLIP - scroll).rgb;
        displacementA -= 0.5;
        displacementB -= 0.5;
        return p + strength * (displacementA + displacementB);
      }
      vec3 marchMarble(vec3 rayOrigin, vec3 rayDir) {
        float perIteration = 1. / float(iterations);
        vec3 deltaRay = rayDir * perIteration * depth;
        vec3 p = rayOrigin;
        float totalVolume = 0.;
        for (int i = 0; i < iterations; ++i) {
          vec3 displaced = displacePoint(p, displacement);
          vec2 uv = equirectUv(normalize(displaced));
          float heightMapVal = texture(heightMap, uv).r;
          float height = length(p);
          float cutoff = 1. - float(i) * perIteration;
          float slice = smoothstep(cutoff, cutoff + smoothing, heightMapVal);
          totalVolume += slice * perIteration;
          p += deltaRay;
        }
        return mix(colorA, colorB, totalVolume);
      }
    void main() {`,
  );
  shader.fragmentShader = shader.fragmentShader.replace(
    /vec4 diffuseColor.*;/,
    `
    vec3 rayDir = normalize(v_dir);
    vec3 rayOrigin = v_pos;
    vec3 rgb = marchMarble(rayOrigin, rayDir);
    vec4 diffuseColor = vec4(rgb, 1.);
  `,
  );
}

class MagicMarbleScene {
  private container: HTMLElement;
  private cfg: Config;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  private group = new THREE.Group();
  private geometry: THREE.SphereGeometry;
  private material: THREE.MeshStandardMaterial;
  private pmrem: THREE.PMREMGenerator | null = null;
  private envTarget: THREE.WebGLRenderTarget | null = null;
  private width = 1;
  private height = 1;
  private frameId = 0;
  private lastT = 0;
  private disposed = false;
  private flow = 0;
  private timeOffset = 0;
  private targetOffset = 0;
  private azimuth = 0;
  private elevation = 0;
  private velAz = 0;
  private velEl = 0;
  private step = 0;
  private hovering = false;
  private pressed = false;
  private dragging = false;
  private scale = 1;
  private downX = 0;
  private downY = 0;
  private lastX = 0;
  private lastY = 0;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private targetColor = new THREE.Color();
  private uniforms: Record<
    | "time"
    | "colorA"
    | "colorB"
    | "heightMap"
    | "displacementMap"
    | "iterations"
    | "depth"
    | "smoothing"
    | "displacement",
    THREE.IUniform
  > = {
    time: { value: 0 },
    colorA: { value: new THREE.Color(0, 0, 0) },
    colorB: { value: new THREE.Color(1, 0, 0) },
    heightMap: { value: null },
    displacementMap: { value: null },
    iterations: { value: 48 },
    depth: { value: 0.6 },
    smoothing: { value: 0.2 },
    displacement: { value: 0.1 },
  };

  constructor(container: HTMLElement, cfg: Config) {
    this.container = container;
    this.cfg = cfg;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));

    const canvas = this.renderer.domElement;
    canvas.style.position = "absolute";
    canvas.style.inset = "0";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.cursor = "grab";
    canvas.setAttribute("aria-hidden", "true");
    container.appendChild(canvas);

    this.geometry = new THREE.SphereGeometry(SPHERE_R, SPHERE_SEGMENTS[0], SPHERE_SEGMENTS[1]);
    this.material = new THREE.MeshStandardMaterial({ roughness: 0.1 });
    this.material.onBeforeCompile = (shader) => patchMarbleShader(shader, this.uniforms);
    this.material.customProgramCacheKey = () => "antheticplus-magic-marble";

    const mesh = new THREE.Mesh(this.geometry, this.material);
    this.group.add(mesh);
    this.scene.add(this.group);
    this.applyPalette(true);
    void this.loadAssets();

    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointerleave", this.onPointerLeave);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
  }

  private async loadAssets() {
    const [heightMap, displacementMap, hdri] = await Promise.all([
      loadTexture(HEIGHT_MAP_URL),
      loadTexture(DISPLACEMENT_MAP_URL),
      loadTexture(HDRI_URL, (onLoad, onError) => {
        new RGBELoader().load(HDRI_URL, onLoad, undefined, onError);
      }),
    ]);
    if (this.disposed) return;
    if (heightMap) {
      heightMap.minFilter = THREE.NearestFilter;
      this.uniforms.heightMap.value = heightMap;
    }
    if (displacementMap) {
      displacementMap.minFilter = THREE.NearestFilter;
      displacementMap.wrapS = displacementMap.wrapT = THREE.RepeatWrapping;
      this.uniforms.displacementMap.value = displacementMap;
    }
    if (hdri) {
      hdri.mapping = THREE.EquirectangularReflectionMapping;
      this.pmrem = new THREE.PMREMGenerator(this.renderer);
      this.envTarget = this.pmrem.fromEquirectangular(hdri);
      this.scene.environment = this.envTarget.texture;
      hdri.dispose();
    }
  }

  private applyPalette(immediate: boolean) {
    const palette =
      Array.isArray(this.cfg.palette) && this.cfg.palette.length
        ? this.cfg.palette
        : DEFAULTS.palette;
    const next = palette[this.step % palette.length] || DEFAULTS.palette[0];
    try {
      this.targetColor.set(next as string);
    } catch {
      this.targetColor.set(DEFAULTS.palette[0] as string);
    }
    try {
      (this.uniforms.colorA.value as THREE.Color).set(this.cfg.core || DEFAULTS.core);
    } catch {
      (this.uniforms.colorA.value as THREE.Color).set(DEFAULTS.core);
    }
    if (immediate) (this.uniforms.colorB.value as THREE.Color).copy(this.targetColor);
  }

  private hitsMarble(e: PointerEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    this.pointer.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return this.raycaster.intersectObject(this.group, true).length > 0;
  }

  private clampElevation(v: number) {
    return Math.max(-PITCH_LIMIT - CAMERA_TILT, Math.min(PITCH_LIMIT - CAMERA_TILT, v));
  }

  private onPointerMove = (e: PointerEvent) => {
    if (this.disposed) return;
    if (!this.dragging) {
      this.hovering = this.hitsMarble(e);
      return;
    }
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    const s = settingsFor(this.cfg).drag;
    this.azimuth -= dx * s;
    this.elevation = this.clampElevation(this.elevation + dy * s);
    this.velAz = -dx * s;
    this.velEl = dy * s;
  };

  private onPointerLeave = () => {
    if (this.dragging) return;
    this.hovering = false;
    this.pressed = false;
  };

  private onPointerDown = (e: PointerEvent) => {
    if (this.disposed) return;
    this.hovering = this.hitsMarble(e);
    if (!this.hovering) return;
    this.pressed = true;
    this.dragging = true;
    this.downX = this.lastX = e.clientX;
    this.downY = this.lastY = e.clientY;
    this.velAz = 0;
    this.velEl = 0;
    this.renderer.domElement.style.cursor = "grabbing";
  };

  private onPointerUp = (e: PointerEvent) => {
    if (this.disposed) return;
    const wasPressed = this.pressed;
    this.dragging = false;
    this.pressed = false;
    this.renderer.domElement.style.cursor = "grab";
    if (!wasPressed) return;
    const travel = Math.hypot(e.clientX - this.downX, e.clientY - this.downY);
    if (travel > DRAG_SLOP || !this.hitsMarble(e)) return;
    this.step += 1;
    this.targetOffset = this.step * STEP_ADVANCE;
    this.applyPalette(false);
  };

  start() {
    this.lastT = performance.now();
    const loop = () => {
      if (this.disposed) return;
      this.frameId = requestAnimationFrame(loop);
      this.tick();
    };
    this.frameId = requestAnimationFrame(loop);
  }

  setSize(width: number, height: number) {
    if (this.disposed) return;
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.renderer.setSize(this.width, this.height, false);
    this.updateCamera();
  }

  updateConfig(cfg: Config) {
    if (this.disposed) return;
    this.cfg = cfg;
    this.applyPalette(false);
    this.updateCamera();
  }

  private updateCamera() {
    const aspect = this.width / this.height;
    const S = settingsFor(this.cfg);
    const span = (aspect < 1 ? BASE_SPAN / aspect : BASE_SPAN) * S.zoom;
    this.camera.aspect = aspect;
    this.camera.fov = 2 * Math.atan(span / 2 / CAMERA_DIST) * (180 / Math.PI);
    this.camera.updateProjectionMatrix();
  }

  private tick() {
    const now = performance.now();
    let dt = (now - this.lastT) / 1000;
    this.lastT = now;
    if (!Number.isFinite(dt) || dt < 0) dt = 0;
    if (dt > 0.05) dt = 0.05;
    const S = settingsFor(this.cfg);
    this.flow += dt * S.speed;
    this.timeOffset += (this.targetOffset - this.timeOffset) * (1 - Math.exp(-dt * STEP_RATE));
    this.uniforms.time.value = this.timeOffset + this.flow;
    const colorB = this.uniforms.colorB.value as THREE.Color;
    colorB.lerpHSL(this.targetColor, 1 - Math.exp(-dt * STEP_RATE));
    this.uniforms.depth.value = S.depth;
    this.uniforms.smoothing.value = S.smoothing;
    this.uniforms.displacement.value = S.displacement;
    this.uniforms.iterations.value = S.iterations;
    this.material.roughness = S.roughness;
    const targetScale = this.pressed && this.hovering ? PRESS_SCALE : 1;
    this.scale += (targetScale - this.scale) * (1 - Math.exp(-dt * PRESS_RATE));
    this.group.scale.setScalar(this.scale);

    if (!this.dragging) {
      const decay = Math.exp(-dt * DRAG_DECAY);
      this.azimuth += this.velAz;
      this.elevation = this.clampElevation(this.elevation + this.velEl);
      this.velAz *= decay;
      this.velEl *= decay;
      this.azimuth += dt * S.spin * S.heading;
    }

    const pitch = CAMERA_TILT + this.elevation;
    const ringR = Math.cos(pitch) * CAMERA_DIST;
    this.camera.position.set(
      Math.sin(this.azimuth) * ringR,
      Math.sin(pitch) * CAMERA_DIST,
      Math.cos(this.azimuth) * ringR,
    );
    this.camera.lookAt(0, 0, 0);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    const canvas = this.renderer.domElement;
    canvas.removeEventListener("pointerdown", this.onPointerDown);
    canvas.removeEventListener("pointerleave", this.onPointerLeave);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    this.geometry.dispose();
    this.material.dispose();
    this.envTarget?.dispose();
    this.pmrem?.dispose();
    this.scene.environment = null;
    this.renderer.dispose();
    if (canvas.parentNode === this.container) this.container.removeChild(canvas);
  }
}

export interface MagicMarbleProps {
  palette?: string[];
  core?: string;
  depth?: number;
  grain?: number;
  softness?: number;
  detail?: number;
  polish?: number;
  speed?: number;
  spin?: number;
  direction?: "right" | "left";
  drag?: number;
  sizePercent?: number;
  style?: React.CSSProperties;
}

export default function MagicMarble({
  palette = DEFAULTS.palette,
  core = DEFAULTS.core,
  depth = DEFAULTS.depth,
  grain = DEFAULTS.grain,
  softness = DEFAULTS.softness,
  detail = DEFAULTS.detail,
  polish = DEFAULTS.polish,
  speed = DEFAULTS.speed,
  spin = DEFAULTS.spin,
  direction = DEFAULTS.direction,
  drag = DEFAULTS.drag,
  sizePercent = DEFAULTS.sizePercent,
  style,
}: MagicMarbleProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<MagicMarbleScene | null>(null);
  const cfgRef = useRef<Config | null>(null);
  cfgRef.current = {
    palette,
    core,
    depth,
    grain,
    softness,
    detail,
    polish,
    speed,
    spin,
    direction,
    drag,
    sizePercent,
  };

  // When WebGL/Three.js cannot start (no WebGL, blocked GPU, lost context) we render a pure CSS/DOM orb instead
  // of leaving the voice-assistant area blank.
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let scene: MagicMarbleScene | null = null;
    let ro: ResizeObserver | null = null;
    let canvas: HTMLCanvasElement | null = null;
    const teardown = () => {
      ro?.disconnect();
      ro = null;
      if (canvas) canvas.removeEventListener("webglcontextlost", onLost);
      scene?.dispose();
      scene = null;
      sceneRef.current = null;
    };
    function onLost(e: Event) {
      e.preventDefault();
      teardown();
      setFailed(true);
    }
    try {
      const initialConfig = cfgRef.current;
      if (!initialConfig) return;
      scene = new MagicMarbleScene(container, initialConfig);
      scene.setSize(container.clientWidth, container.clientHeight);
      scene.start();
    } catch (err) {
      console.warn(
        "MagicMarble: WebGL unavailable, using CSS fallback",
        err instanceof Error ? err.message : err,
      );
      try {
        scene?.dispose();
      } catch {
        /* partially constructed scene */
      }
      scene = null;
      setFailed(true);
      return;
    }
    sceneRef.current = scene;
    canvas = container.querySelector("canvas");
    canvas?.addEventListener("webglcontextlost", onLost);
    ro = new ResizeObserver(() => scene?.setSize(container.clientWidth, container.clientHeight));
    ro.observe(container);
    return teardown;
  }, []);

  useEffect(() => {
    const config = cfgRef.current;
    if (config) sceneRef.current?.updateConfig(config);
  }, [
    palette,
    core,
    depth,
    grain,
    softness,
    detail,
    polish,
    speed,
    spin,
    direction,
    drag,
    sizePercent,
  ]);

  const colors = (Array.isArray(palette) && palette.length ? palette : DEFAULTS.palette).slice(
    0,
    5,
  );
  const c0 = colors[0] ?? "#5252E0";
  const c1 = colors[1] ?? c0;
  const duration = `${Math.max(3, 24 / Math.max(1, speed))}s`;

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label="Animated glass marble voice assistant"
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minWidth: 120,
        minHeight: 120,
        overflow: "hidden",
        ...style,
      }}
    >
      {failed && (
        <>
          <style>{`
            @keyframes mm-spin { to { transform: rotate(360deg); } }
            @keyframes mm-breathe { 0%,100% { transform: scale(0.94); } 50% { transform: scale(1); } }
            @media (prefers-reduced-motion: reduce) { .mm-orb, .mm-orb::before { animation: none !important; } }
          `}</style>
          <div
            className="mm-orb"
            style={{
              position: "absolute",
              inset: "6%",
              borderRadius: "9999px",
              background: `radial-gradient(circle at 32% 28%, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0) 22%), radial-gradient(circle at 50% 50%, ${c0} 0%, ${c1} 55%, #000 100%)`,
              boxShadow: `inset 0 0 28px rgba(255,255,255,0.25), 0 0 24px ${c0}66`,
              transition: "background 400ms ease, box-shadow 400ms ease",
              animation: `mm-breathe ${duration} ease-in-out infinite`,
              overflow: "hidden",
            }}
          >
            <div
              className="mm-orb"
              style={{
                position: "absolute",
                inset: "-20%",
                borderRadius: "9999px",
                opacity: 0.55,
                mixBlendMode: "screen",
                background: `conic-gradient(from 0deg, transparent 0deg, ${c1} 90deg, transparent 180deg, ${c0} 270deg, transparent 360deg)`,
                animation: `mm-spin ${duration} linear infinite`,
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}
