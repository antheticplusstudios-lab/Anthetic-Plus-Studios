import { Canvas, useFrame } from "@react-three/fiber";
import { Float } from "@react-three/drei";
import { useMemo, useRef } from "react";
import * as THREE from "three";

/** Luxe Glass palette: primary violet, electric blue, restrained cyan. */
const VIOLET = "#7357F6";
const ELECTRIC = "#4D8DFF";
const CYAN = "#55DDE0";

function GlassShapes() {
  const group = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (document.hidden || !group.current) return;
    const dt = Math.min(delta, 0.05);
    group.current.rotation.y += dt * 0.06;
  });
  return (
    <group ref={group}>
      <Float speed={1.1} rotationIntensity={0.5} floatIntensity={1.4}>
        <mesh position={[-3.4, 0.7, -1.5]}>
          <icosahedronGeometry args={[1.15, 0]} />
          <meshPhysicalMaterial
            color={VIOLET}
            transparent
            opacity={0.32}
            roughness={0.15}
            metalness={0.1}
          />
        </mesh>
      </Float>
      <Float speed={1.4} rotationIntensity={0.7} floatIntensity={1.1}>
        <mesh position={[3.6, -0.4, -2]}>
          <torusGeometry args={[0.9, 0.32, 24, 48]} />
          <meshPhysicalMaterial
            color={ELECTRIC}
            transparent
            opacity={0.28}
            roughness={0.2}
            metalness={0.1}
          />
        </mesh>
      </Float>
      <Float speed={0.9} rotationIntensity={0.3} floatIntensity={1.6}>
        <mesh position={[1.4, 1.6, -3]}>
          <sphereGeometry args={[0.55, 32, 32]} />
          <meshPhysicalMaterial
            color={CYAN}
            transparent
            opacity={0.3}
            roughness={0.1}
            metalness={0.05}
          />
        </mesh>
      </Float>
    </group>
  );
}

function Particles() {
  const points = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const count = 90;
    const arr = new Float32Array(count * 3);
    let seed = 42;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (rand() - 0.5) * 14;
      arr[i * 3 + 1] = (rand() - 0.5) * 7;
      arr[i * 3 + 2] = -1 - rand() * 5;
    }
    return arr;
  }, []);
  useFrame((_, delta) => {
    if (document.hidden || !points.current) return;
    points.current.rotation.y += Math.min(delta, 0.05) * 0.02;
  });
  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color={ELECTRIC} size={0.045} transparent opacity={0.5} sizeAttenuation />
    </points>
  );
}

export default function Hero3DScene() {
  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ position: [0, 0, 8], fov: 45 }}
      gl={{ antialias: true, alpha: true }}
      style={{ background: "transparent" }}
    >
      <ambientLight intensity={0.7} />
      <directionalLight position={[6, 8, 4]} intensity={1.1} color="#cfc4ff" />
      <pointLight position={[-5, -2, 2]} intensity={0.8} color={ELECTRIC} />
      <GlassShapes />
      <Particles />
    </Canvas>
  );
}
