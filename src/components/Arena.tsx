/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { RigidBody } from '@react-three/rapier';
import { Grid, Stars } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef, useState, useEffect } from 'react';
import * as THREE from 'three';

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    const uaMatch = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
    return uaMatch || coarsePointer || window.innerWidth < 768;
  });

  useEffect(() => {
    const check = () => {
      const uaMatch = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
      setIsMobile(uaMatch || coarsePointer || window.innerWidth < 768);
    };
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  return isMobile;
}

export function Arena() {
  const isMobile = useIsMobile();
  
  const obstacles = useMemo(() => {
    const obsList: any[] = [];
    
    // 1. Center Block
    obsList.push({
      type: 'box',
      position: [0, 10 / 2 - 0.5, 0],
      size: [8, 10, 8],
      rotation: [0, Math.PI / 4, 0],
      color: '#ff00ff'
    });

    // 2. Central structure (4 pillars)
    const centerDist = 18;
    const pillarSize = 4;
    const pillarHeight = 14;
    [
      [centerDist, centerDist],
      [-centerDist, centerDist],
      [centerDist, -centerDist],
      [-centerDist, -centerDist]
    ].forEach(([x, z]) => {
      obsList.push({
        type: 'box',
        position: [x, pillarHeight / 2 - 0.5, z],
        size: [pillarSize, pillarHeight, pillarSize],
        rotation: [0, 0, 0],
        color: '#00ffff'
      });
    });

    // 3. Diagonal barriers between pillars and center
    const diagDist = 12;
    [
      [diagDist, 0, 0],
      [-diagDist, 0, 0],
      [0, diagDist, Math.PI / 2],
      [0, -diagDist, Math.PI / 2]
    ].forEach(([x, z, rot]) => {
      obsList.push({
        type: 'box',
        position: [x, 4 / 2 - 0.5, z],
        size: [2, 4, 10],
        rotation: [0, rot, 0],
        color: '#00ffff'
      });
    });

    // 4. Inner ring walls (with gaps)
    const ringDist = 35;
    const wallLength = 30;
    const wallThickness = 2;
    const wallHeight = 8;
    [
      [0, ringDist, wallLength, wallThickness],
      [0, -ringDist, wallLength, wallThickness],
      [ringDist, 0, wallThickness, wallLength],
      [-ringDist, 0, wallThickness, wallLength]
    ].forEach(([x, z, w, d]) => {
      obsList.push({
        type: 'box',
        position: [x, wallHeight / 2 - 0.5, z],
        size: [w, wallHeight, d],
        rotation: [0, 0, 0],
        color: '#ff00ff'
      });
    });

    // 5. Mid-field Low Cover Walls (good for crouching/hiding)
    const lowCoverDist = 50;
    [
      [lowCoverDist, lowCoverDist, Math.PI / 4],
      [-lowCoverDist, lowCoverDist, -Math.PI / 4],
      [lowCoverDist, -lowCoverDist, -Math.PI / 4],
      [-lowCoverDist, -lowCoverDist, Math.PI / 4],
      [lowCoverDist, 0, 0],
      [-lowCoverDist, 0, 0],
      [0, lowCoverDist, Math.PI / 2],
      [0, -lowCoverDist, Math.PI / 2]
    ].forEach(([x, z, rot]) => {
      obsList.push({
        type: 'box',
        position: [x, 3 / 2 - 0.5, z],
        size: [2, 3, 16],
        rotation: [0, rot, 0],
        color: '#00ffff'
      });
    });

    // 6. Outer corner L-shapes
    const cornerDist = 70;
    const lLength = 35;
    [
      [cornerDist, cornerDist],
      [-cornerDist, cornerDist],
      [cornerDist, -cornerDist],
      [-cornerDist, -cornerDist]
    ].forEach(([x, z]) => {
      obsList.push({
        type: 'box',
        position: [x, wallHeight / 2 - 0.5, z - Math.sign(z) * (lLength/2)],
        size: [wallThickness, wallHeight, lLength],
        rotation: [0, 0, 0],
        color: '#ff00ff'
      });
      obsList.push({
        type: 'box',
        position: [x - Math.sign(x) * (lLength/2), wallHeight / 2 - 0.5, z],
        size: [lLength, wallHeight, wallThickness],
        rotation: [0, 0, 0],
        color: '#ff00ff'
      });
    });

    // 7. Scattered cover blocks (small boxes)
    const scatterDist = 60;
    [
      [scatterDist, 20],
      [scatterDist, -20],
      [-scatterDist, 20],
      [-scatterDist, -20],
      [20, scatterDist],
      [-20, scatterDist],
      [20, -scatterDist],
      [-20, -scatterDist]
    ].forEach(([x, z]) => {
      obsList.push({
        type: 'box',
        position: [x, 5 / 2 - 0.5, z],
        size: [5, 5, 5],
        rotation: [0, Math.PI / 4, 0],
        color: '#00ffff'
      });
    });

    // 8. Long side barriers
    const sideDist = 85;
    [
      [sideDist, 0, 2, 12, 40],
      [-sideDist, 0, 2, 12, 40],
      [0, sideDist, 40, 12, 2],
      [0, -sideDist, 40, 12, 2]
    ].forEach(([x, z, w, h, d]) => {
      obsList.push({
        type: 'box',
        position: [x, h / 2 - 0.5, z],
        size: [w, h, d],
        rotation: [0, 0, 0],
        color: '#ff00ff'
      });
    });

    return obsList;
  }, []);

  return (
    <group>
      {/* Floor */}
      <RigidBody type="fixed" name="floor" friction={0}>
        <mesh receiveShadow={!isMobile} position={[0, -0.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[200, 200]} />
          <meshStandardMaterial color="#050510" roughness={0.2} metalness={0.8} />
        </mesh>
      </RigidBody>
      <Grid position={[0, -0.49, 0]} args={[200, 200]} cellColor="#ff00ff" sectionColor="#00ffff" fadeDistance={100} cellThickness={0.5} sectionThickness={1.5} />

      {/* Ceiling */}
      <RigidBody type="fixed" name="ceiling">
        <mesh receiveShadow={!isMobile} position={[0, 20, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <planeGeometry args={[200, 200]} />
          <meshStandardMaterial color="#000000" roughness={1} />
        </mesh>
      </RigidBody>

      {/* Atmosphere */}
      {!isMobile && (
        <>
          <Stars radius={100} depth={50} count={5000} factor={4} saturation={1} fade speed={1} />
          <AmbientParticles />
        </>
      )}

      {/* Walls */}
      <Wall name="wall-n" position={[0, 5, -100]} rotation={[0, 0, 0]} isMobile={isMobile} />
      <Wall name="wall-s" position={[0, 5, 100]} rotation={[0, Math.PI, 0]} isMobile={isMobile} />
      <Wall name="wall-e" position={[100, 5, 0]} rotation={[0, -Math.PI / 2, 0]} isMobile={isMobile} />
      <Wall name="wall-w" position={[-100, 5, 0]} rotation={[0, Math.PI / 2, 0]} isMobile={isMobile} />

      {/* Obstacles */}
      {obstacles.map((obs, i) => {
        if (!obs) return null;
        return (
          <RigidBody 
            key={i} 
            type="fixed" 
            colliders="hull"
            name={`obstacle-${i}`}
            position={obs.position as [number, number, number]}
            rotation={obs.rotation as [number, number, number]}
          >
            <mesh receiveShadow={!isMobile} castShadow={!isMobile}>
              {obs.type === 'box' ? (
                <boxGeometry args={obs.size as [number, number, number]} />
              ) : (
                <cylinderGeometry args={[obs.size[0]/2, obs.size[0]/2, obs.size[1], 16]} />
              )}
              <meshStandardMaterial color="#1a1a2e" roughness={0.6} metalness={0.5} />
              
              {/* Neon accent on obstacles */}
              <mesh position={[0, obs.size[1]/2 - 0.5, 0]}>
                {obs.type === 'box' ? (
                  <boxGeometry args={[obs.size[0] + 0.1, 0.2, obs.size[2] + 0.1]} />
                ) : (
                  <cylinderGeometry args={[obs.size[0]/2 + 0.1, obs.size[0]/2 + 0.1, 0.2, 16]} />
                )}
                <meshBasicMaterial color={obs.color} toneMapped={false} />
              </mesh>
            </mesh>
          </RigidBody>
        );
      })}
    </group>
  );
}

function Wall({ name, position, rotation, isMobile }: { name: string, position: [number, number, number], rotation: [number, number, number], isMobile: boolean }) {
  return (
    <RigidBody type="fixed" name={name} position={position} rotation={rotation}>
      {/* Solid Wall */}
      <mesh>
        <boxGeometry args={[200, 10, 1]} />
        <meshStandardMaterial color="#0a0a1a" roughness={0.8} metalness={0.2} />
      </mesh>
      {/* Glowing Base Line */}
      <mesh position={[0, -4.5, 0.51]}>
        <planeGeometry args={[200, 1]} />
        <meshBasicMaterial color="#ff00ff" toneMapped={false} />
      </mesh>
      {/* Glowing Top Line */}
      <mesh position={[0, 4.5, 0.51]}>
        <planeGeometry args={[200, 1]} />
        <meshBasicMaterial color="#00ffff" toneMapped={false} />
      </mesh>
    </RigidBody>
  );
}

function AmbientParticles() {
  const count = 1500;
  const pointsRef = useRef<THREE.Points>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const [positions, sizes] = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 200;
      positions[i * 3 + 1] = Math.random() * 40;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 200;
      sizes[i] = Math.random() * 0.8 + 0.4; // Smaller particles
    }
    return [positions, sizes];
  }, []);

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uColor: { value: new THREE.Color('#ffffff') } // White color
  }), []);

  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-aSize"
          count={count}
          array={sizes}
          itemSize={1}
        />
      </bufferGeometry>
      <shaderMaterial
        ref={materialRef}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        uniforms={uniforms}
        vertexShader={`
          uniform float uTime;
          attribute float aSize;
          varying float vAlpha;
          void main() {
            vec3 pos = position;
            // Slow upward drift and wobble
            pos.y += uTime * 0.5;
            pos.x += sin(uTime * 0.2 + pos.y) * 2.0;
            pos.z += cos(uTime * 0.2 + pos.y) * 2.0;
            
            // Wrap around Y
            pos.y = mod(pos.y, 40.0);
            
            vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
            gl_Position = projectionMatrix * mvPosition;
            
            // Size attenuation
            gl_PointSize = aSize * (300.0 / -mvPosition.z);
            
            // Fade out near top and bottom
            vAlpha = smoothstep(0.0, 5.0, pos.y) * smoothstep(40.0, 35.0, pos.y);
          }
        `}
        fragmentShader={`
          uniform vec3 uColor;
          varying float vAlpha;
          void main() {
            // Distance from center of point
            float d = length(gl_PointCoord - vec2(0.5));
            // Soft circle using smoothstep
            float alpha = smoothstep(0.5, 0.1, d) * 0.5 * vAlpha;
            if (alpha < 0.01) discard;
            gl_FragColor = vec4(uColor, alpha);
          }
        `}
      />
    </points>
  );
}
