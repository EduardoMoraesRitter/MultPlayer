/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { useRef, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { RigidBody, RapierRigidBody, useRapier, CapsuleCollider } from '@react-three/rapier';
import * as THREE from 'three';
import { useGameStore, EnemyData } from '../store';
import { Text } from '@react-three/drei';

export const enemyPositions: Record<string, THREE.Vector3> = {};

const ENEMY_SPEED = 3;
const CHASE_DIST = 15; // Reduced from 20
const SHOOT_DIST = 15;
const SHOOT_COOLDOWN = 3500; // Increased from 2000 for less aggressive shooting

export function Enemy({ data }: { data: EnemyData }) {
  const body = useRef<RapierRigidBody>(null);
  const { camera } = useThree();
  const { world, rapier } = useRapier();
  
  const gameState = useGameStore(state => state.gameState);
  const playerState = useGameStore(state => state.playerState);
  const hitPlayer = useGameStore(state => state.hitPlayer);
  const addDisc = useGameStore(state => state.addDisc);
  const addParticles = useGameStore(state => state.addParticles);

  const lastShootTime = useRef(0);
  const patrolTarget = useRef(new THREE.Vector3());
  const lastPatrolChange = useRef(0);
  const state = useRef<'patrol' | 'chase'>('patrol');

  const groupRef = useRef<THREE.Group>(null);

  // Initialize patrol target
  useMemo(() => {
    patrolTarget.current.set(
      data.position[0] + (Math.random() - 0.5) * 10,
      data.position[1],
      data.position[2] + (Math.random() - 0.5) * 10
    );
  }, [data.position]);

  useEffect(() => {
    return () => {
      delete enemyPositions[data.id];
    };
  }, [data.id]);

  useFrame((state_fiber) => {
    if (!body.current || gameState !== 'playing' || data.state === 'disabled') {
      if (body.current) {
        body.current.setLinvel({ x: 0, y: body.current.linvel().y, z: 0 }, true);
      }
      return;
    }

    const pos = body.current.translation();
    const currentPos = new THREE.Vector3(pos.x, pos.y, pos.z);
    
    // Update global position for returning discs
    enemyPositions[data.id] = currentPos;
    
    let closestTargetPos: THREE.Vector3 | null = null;
    let closestDist = CHASE_DIST;

    // Check player
    if (playerState === 'active') {
      const playerPos = camera.position.clone();
      playerPos.y = pos.y; // Ignore height difference for distance
      const distToPlayer = currentPos.distanceTo(playerPos);
      if (distToPlayer < closestDist) {
        closestDist = distToPlayer;
        closestTargetPos = playerPos;
      }
    }

    // Check other enemies
    const allEnemies = useGameStore.getState().enemies;
    allEnemies.forEach(e => {
      if (e.id !== data.id && e.state === 'active') {
        const ePos = new THREE.Vector3(e.position[0], pos.y, e.position[2]);
        const distToEnemy = currentPos.distanceTo(ePos);
        if (distToEnemy < closestDist) {
          closestDist = distToEnemy;
          closestTargetPos = ePos;
        }
      }
    });

    // AI Logic
    if (closestTargetPos) {
      state.current = 'chase';
    } else if (state.current === 'chase') {
      state.current = 'patrol';
      patrolTarget.current.set(
        currentPos.x + (Math.random() - 0.5) * 40,
        currentPos.y,
        currentPos.z + (Math.random() - 0.5) * 40
      );
      lastPatrolChange.current = Date.now();
    }

    const direction = new THREE.Vector3();

    if (state.current === 'chase' && closestTargetPos) {
      direction.subVectors(closestTargetPos, currentPos).normalize();
      
      // Shooting logic
      const now = Date.now();
      if (closestDist < SHOOT_DIST && now - lastShootTime.current > SHOOT_COOLDOWN) {
        // Raycast to check line of sight
        const rayDir = new THREE.Vector3().subVectors(closestTargetPos, currentPos).normalize();
        
        // Add random spread so they miss sometimes
        const spread = 0.15;
        rayDir.x += (Math.random() - 0.5) * spread;
        rayDir.y += (Math.random() - 0.5) * spread;
        rayDir.z += (Math.random() - 0.5) * spread;
        rayDir.normalize();
        
        // Offset start position to avoid hitting self
        // Enemy origin is at feet, so add 1.0 to shoot from chest height
        const startPos = new THREE.Vector3(currentPos.x, currentPos.y + 1.0, currentPos.z);
        
        // Only offset by 0.6 (just outside the 0.5 radius capsule)
        startPos.add(rayDir.clone().multiplyScalar(0.6));

        const ray = new rapier.Ray(startPos, rayDir);
        const hit = world.castRay(ray, SHOOT_DIST, true);

        if (hit) {
          const collider = hit.collider;
          const rb = collider.parent();
          if (rb && rb.userData) {
            const userData = rb.userData as { name?: string };
            if (userData.name === 'player') {
              // Shoot at player
              addDisc(
                [startPos.x, startPos.y, startPos.z],
                [rayDir.x, rayDir.y, rayDir.z],
                '#ff0000',
                data.id
              );
              lastShootTime.current = now;
            } else if (userData.name?.startsWith('bot-')) {
              // Shoot at another enemy
              addDisc(
                [startPos.x, startPos.y, startPos.z],
                [rayDir.x, rayDir.y, rayDir.z],
                '#ff0000',
                data.id
              );
              lastShootTime.current = now;
            }
          }
        }
      }
    } else {
      // Patrol
      const now = Date.now();
      // Change target if reached or if stuck for 4 seconds
      if (currentPos.distanceTo(patrolTarget.current) < 2 || now - lastPatrolChange.current > 4000) {
        patrolTarget.current.set(
          currentPos.x + (Math.random() - 0.5) * 60,
          currentPos.y,
          currentPos.z + (Math.random() - 0.5) * 60
        );
        lastPatrolChange.current = now;
      }
      direction.subVectors(patrolTarget.current, currentPos).normalize();
    }

    // Apply movement
    const velocity = body.current.linvel();
    body.current.setLinvel({
      x: direction.x * ENEMY_SPEED,
      y: velocity.y,
      z: direction.z * ENEMY_SPEED
    }, true);

    // Rotate to face direction
    if (groupRef.current && direction.lengthSq() > 0.1) {
      const targetRotation = Math.atan2(direction.x, direction.z);
      // Simple lerp for rotation
      const currentRotation = groupRef.current.rotation.y;
      // Handle angle wrap-around
      let diff = targetRotation - currentRotation;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      groupRef.current.rotation.y += diff * 0.1;
    }
  });

  const color = data.state === 'disabled' ? '#444' : '#ff0055';

  return (
    <RigidBody
      ref={body}
      colliders={false}
      mass={1}
      type="dynamic"
      position={data.position}
      enabledRotations={[false, false, false]}
      userData={{ name: data.id }}
    >
      <CapsuleCollider args={[0.5, 0.5]} position={[0, 1, 0]} />
      <group ref={groupRef} position={[0, 0, 0]}>
        {/* Body */}
        <mesh castShadow position={[0, 1, 0]}>
          <capsuleGeometry args={[0.5, 1]} />
          <meshStandardMaterial 
            color={color} 
            roughness={0.3} 
            metalness={0.8} 
            emissive={color}
            emissiveIntensity={data.state === 'disabled' ? 0 : 0.4}
          />
        </mesh>
        
        {/* Eye/Visor */}
        <mesh position={[0, 1.6, 0.45]}>
          <boxGeometry args={[0.6, 0.2, 0.2]} />
          <meshBasicMaterial color={data.state === 'disabled' ? '#111' : '#00ffff'} />
        </mesh>

        {/* Username Label */}
        <Text
          position={[0, 2.5, 0]}
          fontSize={0.3}
          color={data.state === 'active' ? '#ff0055' : '#666666'}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.02}
          outlineColor="#000000"
        >
          {data.id}
        </Text>
      </group>
    </RigidBody>
  );
}
