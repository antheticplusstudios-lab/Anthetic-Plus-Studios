import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, Lightformer } from "@react-three/drei";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";
import { approach, stateEnergy, type OrbState } from "./pulse-orb";
import { advanceOrbit } from "./orb-motion";
import { AUTUMIC_MARK_PATH, AUTUMIC_MARK_VIEWBOX as VB } from "./autumic-mark-path";
import type { AiOrbState } from "./ai-orb";

/** Scene palette: royal / electric / icy blue with restrained cyan. Error tints warm. */
const PALETTE = {
  glass: new THREE.Color("#cfe3ff"),
  attenuation: new THREE.Color("#2f5bff"),
  core: new THREE.Color("#3d7bff"),
  coreHot: new THREE.Color("#9fe8ff"),
  ring: new THREE.Color("#7fd6ff"),
  error: new THREE.Color("#ff6a5c"),
  success: new THREE.Color("#8ff3ff"),
};

const toPulse = (s: AiOrbState): OrbState =>
  s === "processing" ? "thinking" : s === "success" ? "idle" : s;

function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.25, "rgba(200,230,255,0.55)");
  grd.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function markTexture() {
  const W = 512;
  const H = Math.round((W * VB.h) / VB.w);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  g.scale(W / VB.w, H / VB.h);
  g.translate(-VB.x, -VB.y);
  g.shadowColor = "rgba(140,220,255,0.9)";
  g.shadowBlur = 14;
  g.fillStyle = "#ffffff";
  g.fill(new Path2D(AUTUMIC_MARK_PATH), "evenodd");
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return { tex: t, aspect: VB.w / VB.h };
}

function Orb({
  stateRef,
  levelRef,
  onReady,
}: {
  stateRef: RefObject<AiOrbState>;
  levelRef?: RefObject<number> | undefined;
  onReady: () => void;
}) {
  const group = useRef<THREE.Group>(null);
  const core = useRef<THREE.Mesh>(null);
  const coreMat = useRef<THREE.MeshBasicMaterial>(null);
  const glow = useRef<THREE.Sprite>(null);
  const mark = useRef<THREE.Mesh>(null);
  const rings = useRef<THREE.Group>(null);
  const particles = useRef<THREE.Points>(null);
  const motion = useRef({ level: 0, angle: 0, velocity: 22.5, t: 0, ready: false });
  const tint = useMemo(() => new THREE.Color(), []);
  const glowTex = useMemo(glowTexture, []);
  const { tex: markTex, aspect } = useMemo(markTexture, []);

  const particlePositions = useMemo(() => {
    const n = 90;
    const a = new Float32Array(n * 3);
    let seed = 7;
    const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < n; i++) {
      const th = r() * Math.PI * 2;
      const ph = Math.acos(2 * r() - 1);
      const rad = 1.35 + r() * 0.55;
      a[i * 3] = rad * Math.sin(ph) * Math.cos(th);
      a[i * 3 + 1] = rad * Math.cos(ph) * 0.7;
      a[i * 3 + 2] = rad * Math.sin(ph) * Math.sin(th);
    }
    return a;
  }, []);

  useEffect(
    () => () => {
      glowTex.dispose();
      markTex.dispose();
    },
    [glowTex, markTex],
  );

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const m = motion.current;
    const s = stateRef.current ?? "idle";
    const now = performance.now() / 1000;
    const live = levelRef?.current ?? -1;
    const target =
      (s === "listening" || s === "speaking") && live >= 0 ? live : stateEnergy(toPulse(s), now);
    m.level = approach(m.level, target, 8, dt);
    ({ angle: m.angle, velocity: m.velocity } = advanceOrbit(m.angle, m.velocity, s, dt));
    m.t += dt;

    if (group.current) {
      group.current.position.y = Math.sin(m.t * 1.05) * 0.04;
      group.current.rotation.y = Math.sin(m.t * 0.3) * 0.18;
    }
    const target3 =
      s === "error" ? PALETTE.error : s === "success" ? PALETTE.success : PALETTE.core;
    tint.lerp(target3, 1 - Math.exp(-4 * dt));
    if (coreMat.current) coreMat.current.color.copy(tint).lerp(PALETTE.coreHot, m.level * 0.5);
    const pulse = 1 + m.level * 0.28;
    core.current?.scale.setScalar(0.26 * pulse);
    if (glow.current) {
      glow.current.scale.setScalar(1.9 + m.level * 0.9);
      (glow.current.material as THREE.SpriteMaterial).color.copy(tint);
      (glow.current.material as THREE.SpriteMaterial).opacity = 0.55 + m.level * 0.4;
    }
    if (mark.current) {
      (mark.current.material as THREE.MeshBasicMaterial).opacity = 0.78 + m.level * 0.22;
      mark.current.scale.setScalar(1 + m.level * 0.05);
    }
    if (rings.current) {
      const rad = THREE.MathUtils.degToRad(m.angle);
      const [r1, r2, r3] = rings.current.children;
      if (r1) r1.rotation.z = rad;
      if (r2) r2.rotation.z = -rad * 0.72 + 2;
      if (r3) r3.rotation.z = rad * 0.5 + 1;
    }
    if (particles.current) particles.current.rotation.y += dt * (0.05 + m.level * 0.25);
    if (!m.ready) {
      m.ready = true;
      onReady();
    }
  });

  return (
    <group ref={group}>
      {/* Crystal shell: inner back face for optical depth, then a clear reflective front face */}
      <mesh renderOrder={1}>
        <sphereGeometry args={[0.985, 64, 64]} />
        <meshPhysicalMaterial
          color={PALETTE.attenuation}
          side={THREE.BackSide}
          transparent
          opacity={0.38}
          roughness={0.2}
          metalness={0}
          envMapIntensity={0.6}
          depthWrite={false}
        />
      </mesh>
      <mesh renderOrder={3}>
        <sphereGeometry args={[1, 64, 64]} />
        <meshPhysicalMaterial
          color={PALETTE.glass}
          transparent
          opacity={0.22}
          roughness={0.04}
          metalness={0.1}
          clearcoat={1}
          clearcoatRoughness={0.03}
          iridescence={0.35}
          iridescenceIOR={1.3}
          envMapIntensity={2.2}
          specularIntensity={1}
          depthWrite={false}
        />
      </mesh>
      {/* Luminous core */}
      <mesh ref={core} renderOrder={2}>
        <sphereGeometry args={[1, 32, 32]} />
        <meshBasicMaterial
          ref={coreMat}
          color={PALETTE.core}
          transparent
          opacity={0.9}
          toneMapped={false}
          depthWrite={false}
        />
      </mesh>
      <sprite ref={glow} renderOrder={2}>
        <spriteMaterial
          map={glowTex}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          transparent
          toneMapped={false}
        />
      </sprite>
      {/* Illuminated Autumic symbol */}
      <mesh ref={mark} position={[0, 0, 0.5]} renderOrder={2}>
        <planeGeometry args={[1.05, 1.05 / aspect]} />
        <meshBasicMaterial
          map={markTex}
          color="#bfe6ff"
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
      {/* Orbital rings */}
      <group ref={rings}>
        {[
          { r: 1.32, tilt: [1.25, 0.1, 0], o: 0.55 },
          { r: 1.48, tilt: [1.1, -0.45, 0], o: 0.32 },
          { r: 1.62, tilt: [1.4, 0.5, 0], o: 0.18 },
        ].map((ring, i) => (
          <mesh key={i} rotation={ring.tilt as [number, number, number]}>
            <torusGeometry args={[ring.r, 0.006, 8, 160]} />
            <meshBasicMaterial
              color={PALETTE.ring}
              transparent
              opacity={ring.o}
              toneMapped={false}
            />
          </mesh>
        ))}
      </group>
      <points ref={particles}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[particlePositions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          color={PALETTE.ring}
          size={0.022}
          transparent
          opacity={0.7}
          sizeAttenuation
          depthWrite={false}
        />
      </points>
    </group>
  );
}

export default function AiOrbScene({
  stateRef,
  levelRef,
  active,
  onReady,
}: {
  stateRef: RefObject<AiOrbState>;
  levelRef?: RefObject<number> | undefined;
  active: boolean;
  onReady: () => void;
}) {
  return (
    <Canvas
      dpr={[1, 1.75]}
      frameloop={active ? "always" : "never"}
      camera={{ position: [0, 0, 4.6], fov: 40 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      style={{ background: "transparent" }}
    >
      <ambientLight intensity={0.35} />
      <pointLight position={[2.5, 3, 3]} intensity={18} color="#bfe0ff" />
      <pointLight position={[-3, -2, 1]} intensity={10} color="#3b6bff" />
      <Environment resolution={128}>
        <Lightformer intensity={2.4} position={[0, 4, 2]} scale={[6, 2, 1]} color="#e8f2ff" />
        <Lightformer
          intensity={1.6}
          position={[-4, 0, 1]}
          rotation-y={Math.PI / 2}
          scale={[8, 1, 1]}
          color="#4f7dff"
        />
        <Lightformer
          intensity={1.2}
          position={[4, -1, 1]}
          rotation-y={-Math.PI / 2}
          scale={[8, 1, 1]}
          color="#7fd6ff"
        />
        <Lightformer
          form="ring"
          intensity={1.5}
          position={[1.5, 1.5, 4]}
          scale={1.2}
          color="#ffffff"
        />
      </Environment>
      <Orb stateRef={stateRef} levelRef={levelRef} onReady={onReady} />
    </Canvas>
  );
}
