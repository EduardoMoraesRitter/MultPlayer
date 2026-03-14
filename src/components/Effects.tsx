/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { useFrame, useThree } from '@react-three/fiber';
import { useGameStore, DiscData } from '../store';
import * as THREE from 'three';
import { useRef, useMemo } from 'react';
import { useRapier } from '@react-three/rapier';
import { useEffect } from 'react';
import { enemyPositions } from './Enemy';

export const activeDiscs: Record<string, { pos: THREE.Vector3, dir: THREE.Vector3, color: string }> = {};

export function Effects() {
  const discs = useGameStore(state => state.discs);
  const particles = useGameStore(state => state.particles);

  return (
    <>
      {discs.map(disc => (
        <Disc key={disc.id} data={disc} />
      ))}
      {particles.map(p => (
        <ParticleBurst key={p.id} position={p.position} color={p.color} />
      ))}
    </>
  );
}

function Disc({ data }: { data: DiscData }) {
  const pos = useRef(new THREE.Vector3(...data.start));
  const dir = useRef(new THREE.Vector3(...data.direction).normalize());
  const phase = useRef<'outward' | 'returning'>('outward');
  const bounces = useRef(0);
  const meshRef = useRef<THREE.Group>(null);
  
  const { world, rapier } = useRapier();
  const { camera } = useThree();
  const removeDisc = useGameStore(state => state.removeDisc);
  const hitEnemy = useGameStore(state => state.hitEnemy);
  const hitPlayer = useGameStore(state => state.hitPlayer);
  const addParticles = useGameStore(state => state.addParticles);
  const socket = useGameStore(state => state.socket);
  
  const isLocal = data.ownerId === (socket?.id || 'local');

  useEffect(() => {
    activeDiscs[data.id] = { pos: pos.current, dir: dir.current, color: data.color };
    return () => {
      delete activeDiscs[data.id];
    };
  }, [data.id, data.color]);

  useFrame((_, delta) => {
    const speed = 40;
    const moveDist = speed * delta;

    if (phase.current === 'returning') {
      let targetPos = camera.position.clone().add(new THREE.Vector3(0, -0.2, 0));
      if (!isLocal) {
        let ownerPos: THREE.Vector3 | null = null;
        
        // Check other players
        const otherPlayer = useGameStore.getState().otherPlayers[data.ownerId];
        if (otherPlayer) {
          ownerPos = new THREE.Vector3(...otherPlayer.position).add(new THREE.Vector3(0, 1.4, 0));
        } else {
          // Check enemies
          const enemyPos = enemyPositions[data.ownerId];
          if (enemyPos) {
            ownerPos = new THREE.Vector3(enemyPos.x, enemyPos.y + 1.0, enemyPos.z);
          } else {
            const enemy = useGameStore.getState().enemies.find(e => e.id === data.ownerId);
            if (enemy) {
              ownerPos = new THREE.Vector3(enemy.position[0], enemy.position[1] + 1.0, enemy.position[2]);
            }
          }
        }
        
        if (ownerPos) {
           targetPos = ownerPos;
        }
      }
      
      const toTarget = targetPos.clone().sub(pos.current);
      if (toTarget.length() < moveDist + 1) {
        removeDisc(data.id);
        return;
      }
      dir.current.copy(toTarget.normalize());
    }

    const ray = new rapier.Ray(pos.current, dir.current);
    const hit = world.castRayAndGetNormal(ray, moveDist, true);

    if (hit && phase.current === 'outward') {
      const hitPoint = ray.pointAt(hit.timeOfImpact);
      pos.current.copy(hitPoint);
      
      const collider = hit.collider;
      const rb = collider.parent();
      let hitCharacter = false;

      if (rb && rb.userData) {
         const name = rb.userData.name as string;
         if (name) {
           if (name === 'player' || name.startsWith('bot-') || useGameStore.getState().otherPlayers[name]) {
             hitCharacter = true;
           }
           
           if (isLocal) {
             if (name.startsWith('bot-') || (name !== 'player' && useGameStore.getState().otherPlayers[name])) {
               hitEnemy(name, true);
             }
           } else {
             // Enemy or other player's disc hitting local player
             if (name === 'player') {
               hitPlayer();
             } else if (name.startsWith('bot-') && name !== data.ownerId) {
               hitEnemy(name, true);
             }
           }
         }
      }

      addParticles([hitPoint.x, hitPoint.y, hitPoint.z], data.color);

      const normal = hit.normal;
      if (normal) {
        const n = new THREE.Vector3(normal.x, normal.y, normal.z);
        const dot = dir.current.dot(n); // Check angle of impact
        
        dir.current.reflect(n);
        // Add a little randomness to avoid infinite loops
        dir.current.x += (Math.random() - 0.5) * 0.1;
        dir.current.y += (Math.random() - 0.5) * 0.1;
        dir.current.z += (Math.random() - 0.5) * 0.1;
        dir.current.normalize();
        
        // Move slightly away from the wall to prevent immediate re-collision
        pos.current.addScaledVector(n, 0.2);
        
        bounces.current += 1;
        
        // If hitting almost head-on (dot < -0.95), return immediately instead of bouncing
        if (bounces.current >= 3 || hitCharacter || dot < -0.95) {
          phase.current = 'returning';
        }
      } else {
        phase.current = 'returning';
      }
    } else {
      pos.current.addScaledVector(dir.current, moveDist);
      
      // Check collision with other discs
      for (const [id, other] of Object.entries(activeDiscs)) {
        if (id < data.id) { // Only check once per pair
          const dist = pos.current.distanceTo(other.pos);
          if (dist < 0.8) { // 0.4 radius * 2
            const normal = pos.current.clone().sub(other.pos).normalize();
            
            // Reflect both discs
            dir.current.reflect(normal);
            other.dir.reflect(normal.clone().negate());
            
            // Add randomness
            dir.current.x += (Math.random() - 0.5) * 0.1;
            dir.current.z += (Math.random() - 0.5) * 0.1;
            dir.current.normalize();
            
            other.dir.x += (Math.random() - 0.5) * 0.1;
            other.dir.z += (Math.random() - 0.5) * 0.1;
            other.dir.normalize();
            
            // Move apart
            const overlap = 0.8 - dist + 0.01;
            pos.current.addScaledVector(normal, overlap / 2);
            other.pos.addScaledVector(normal.clone().negate(), overlap / 2);
            
            // Add particles
            addParticles([pos.current.x, pos.current.y, pos.current.z], '#ffffff');
          }
        }
      }
    }

    if (meshRef.current) {
      meshRef.current.position.copy(pos.current);
      // Spin the disc
      meshRef.current.rotation.y += delta * 20;
    }
  });

  return (
    <group ref={meshRef}>
      <mesh>
        <cylinderGeometry args={[0.4, 0.4, 0.04, 32]} />
        <meshStandardMaterial color="#111" metalness={0.8} roughness={0.2} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.4, 0.04, 16, 32]} />
        <meshStandardMaterial color={data.color} emissive={data.color} emissiveIntensity={3} toneMapped={false} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0.021, 0]}>
        <ringGeometry args={[0.16, 0.2, 32]} />
        <meshStandardMaterial color={data.color} emissive={data.color} emissiveIntensity={3} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -0.021, 0]}>
        <ringGeometry args={[0.16, 0.2, 32]} />
        <meshStandardMaterial color={data.color} emissive={data.color} emissiveIntensity={3} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      <pointLight color={data.color} intensity={2} distance={5} />
    </group>
  );
}

function ParticleBurst({ position, color }: { position: [number, number, number], color: string }) {
  const group = useRef<THREE.Group>(null);
  
  const particles = useMemo(() => {
    return Array.from({ length: 15 }).map(() => ({
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 8,
        (Math.random() - 0.5) * 8,
        (Math.random() - 0.5) * 8
      )
    }));
  }, []);

  useFrame((_, delta) => {
    if (group.current) {
      group.current.children.forEach((child, i) => {
        child.position.addScaledVector(particles[i].velocity, delta);
        const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
        mat.opacity = Math.max(0, mat.opacity - delta * 3);
        child.scale.setScalar(Math.max(0.001, child.scale.x - delta * 2));
      });
    }
  });

  return (
    <group ref={group} position={position}>
      {particles.map((_, i) => (
        <mesh key={i}>
          <boxGeometry args={[0.05, 0.05, 0.05]} />
          <meshBasicMaterial color={color} transparent opacity={1} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}
