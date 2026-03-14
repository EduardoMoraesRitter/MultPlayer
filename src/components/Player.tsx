/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { RigidBody, RapierRigidBody, useRapier, CapsuleCollider } from '@react-three/rapier';
import { PointerLockControls } from '@react-three/drei';
import * as THREE from 'three';
import { useGameStore } from '../store';

const SPEED = 12;
const MAX_LASER_DIST = 100;

export function Player() {
  const body = useRef<RapierRigidBody>(null);
  const { camera, mouse } = useThree();
  const { rapier, world } = useRapier();
  
  const playerState = useGameStore(state => state.playerState);
  const gameState = useGameStore(state => state.gameState);
  const addDisc = useGameStore(state => state.addDisc);
  const discs = useGameStore(state => state.discs);
  const socket = useGameStore(state => state.socket);
  const hitEnemy = useGameStore(state => state.hitEnemy);
  const addParticles = useGameStore(state => state.addParticles);

  const keys = useRef({ 
    w: false, a: false, s: false, d: false,
    arrowup: false, arrowdown: false, arrowleft: false, arrowright: false 
  });
  const lastEmitTime = useRef(0);
  const lastShootTime = useRef(0);

  const gunGroupRef = useRef<THREE.Group>(null);
  const discVisualRef = useRef<THREE.Group>(null);
  const throwTimer = useRef(0);

  // More robust mobile detection (checks for touch support)
  const isTouchDevice = useRef(false);
  useEffect(() => {
    isTouchDevice.current = window.matchMedia('(pointer: coarse)').matches || 
                           'ontouchstart' in window || 
                           navigator.maxTouchPoints > 0;
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key in keys.current) {
        keys.current[key as keyof typeof keys.current] = true;
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key in keys.current) {
        keys.current[key as keyof typeof keys.current] = false;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const updatePlayerPosition = useGameStore(state => state.updatePlayerPosition);

  const hasActiveDisc = discs.some(d => d.ownerId === (socket?.id || 'local'));

  // Shooting logic function
  const shoot = () => {
    if (gameState !== 'playing' || playerState !== 'active') return;
    if (hasActiveDisc || throwTimer.current > 0) return; // Only 1 disc at a time
    
    // Rate limit shooting
    const now = Date.now();
    if (now - lastShootTime.current < 200) return;
    lastShootTime.current = now;

    // Start throw animation
    throwTimer.current = 0.15;
  };

  useFrame((state, delta) => {
    if (throwTimer.current > 0) {
      throwTimer.current -= delta;
      if (throwTimer.current <= 0) {
        // Spawn disc
        const raycaster = new THREE.Raycaster();
        if (document.pointerLockElement) {
          raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
        } else {
          raycaster.setFromCamera(mouse, camera);
        }

        const startPosVec = camera.position.clone().add(raycaster.ray.direction.clone().multiplyScalar(1.0));
        const startPos: [number, number, number] = [startPosVec.x, startPosVec.y, startPosVec.z];
        const direction: [number, number, number] = [raycaster.ray.direction.x, raycaster.ray.direction.y, raycaster.ray.direction.z];

        addDisc(startPos, direction, '#00ffff', socket?.id || 'local');
      }
    }
    if (!body.current || gameState !== 'playing') return;

    const mobileInput = useGameStore.getState().mobileInput;

    // Handle Mobile Shooting
    if (mobileInput.shooting) {
      shoot();
    }

    // Movement
    const velocity = body.current.linvel();
    
    const k = keys.current;
    
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();

    const right = new THREE.Vector3();
    right.crossVectors(forward, camera.up).normalize();

    // Combine keyboard and joystick input
    // Joystick Y is inverted (up is negative), so we negate it for forward movement
    // Actually, in Joystick component: Up is negative Y.
    // Forward movement should be positive.
    // Let's assume Joystick Up -> y < 0.
    // We want moveZ to be negative for forward.
    // So if joystick.y is -1, moveZ should be -1.
    // So we add joystick.y directly?
    // Wait, standard WASD: W -> moveZ = -1 (forward in Threejs is -Z usually? No, camera looks down -Z).
    // Yes, forward is -Z.
    // W key: moveZ = -1.
    // Joystick Up (y < 0): moveZ should be negative.
    // So we add mobileInput.move.y.
    
    const moveZ = (k.w ? 1 : 0) - (k.s ? 1 : 0) + (mobileInput.move.y * -1); // Invert joystick Y to match W/S logic (W is +1 in my logic below? No wait)
    
    // Original logic:
    // const moveZ = (k.w ? 1 : 0) - (k.s ? 1 : 0);
    // const direction = new THREE.Vector3();
    // direction.addScaledVector(forward, moveZ);
    
    // If I press W, moveZ is 1.
    // forward vector points in camera direction.
    // If I add scaled vector (forward * 1), I move forward.
    // So W -> 1 is correct.
    
    // Joystick Up -> y is negative (e.g. -1).
    // We want to move forward (1).
    // So we need -y.
    const joyMoveZ = -mobileInput.move.y;
    
    // Joystick Right -> x is positive.
    // D key -> moveX = 1.
    // We want moveX = 1.
    const joyMoveX = mobileInput.move.x;

    const combinedMoveZ = (k.w || k.arrowup ? 1 : 0) - (k.s || k.arrowdown ? 1 : 0) + joyMoveZ;
    const combinedMoveX = (k.d || k.arrowright ? 1 : 0) - (k.a || k.arrowleft ? 1 : 0) + joyMoveX;

    const direction = new THREE.Vector3();
    direction.addScaledVector(forward, combinedMoveZ);
    direction.addScaledVector(right, combinedMoveX);
    
    if (direction.lengthSq() > 0) {
      // Clamp length to 1 to prevent faster diagonal movement if both inputs active (though rare)
      if (direction.lengthSq() > 1) direction.normalize();
      direction.multiplyScalar(SPEED);
    }

    body.current.setLinvel({ x: direction.x, y: velocity.y, z: direction.z }, true);

    // Mobile Look Rotation
    if (Math.abs(mobileInput.look.x) > 0.01 || Math.abs(mobileInput.look.y) > 0.01) {
      const lookSpeed = 2.0 * delta;
      // Yaw (Left/Right) - Rotate around Y axis
      // Joystick Right (x > 0) -> Turn Right (negative rotation around Y in standard right-handed? No, usually -Y is right? Let's test)
      // PointerLockControls: moving mouse right -> camera rotates right.
      // Euler Y decreases?
      camera.rotation.y -= mobileInput.look.x * lookSpeed;
      
      // Pitch (Up/Down) - Rotate around X axis
      // Joystick Up (y < 0) -> Look Up.
      // Looking up means increasing X rotation? Or decreasing?
      // Usually looking up is positive X?
      // Let's try standard mapping.
      camera.rotation.x -= mobileInput.look.y * lookSpeed;
      
      // Clamp pitch to avoid flipping
      camera.rotation.x = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, camera.rotation.x));
    }

    // Update camera position to follow rigid body
    const pos = body.current.translation();
    camera.position.set(pos.x, pos.y + 1.6, pos.z); // Eye level (raised from 0.8)

    // Sync gun to camera
    if (gunGroupRef.current) {
      gunGroupRef.current.position.copy(camera.position);
      
      if (document.pointerLockElement) {
        gunGroupRef.current.quaternion.copy(camera.quaternion);
      } else {
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, camera);
        const target = camera.position.clone().add(raycaster.ray.direction.multiplyScalar(10));
        gunGroupRef.current.lookAt(target);
      }
    }
    
    // Edge panning if not pointer locked
    if (!document.pointerLockElement && !isTouchDevice.current) {
      const edgeThreshold = 0.15; // 15% of screen edge
      const panSpeed = 1.5 * delta;
      
      if (mouse.x > 1 - edgeThreshold * 2) {
        camera.rotation.y -= panSpeed * ((mouse.x - (1 - edgeThreshold * 2)) / (edgeThreshold * 2));
      } else if (mouse.x < -1 + edgeThreshold * 2) {
        camera.rotation.y += panSpeed * (((-1 + edgeThreshold * 2) - mouse.x) / (edgeThreshold * 2));
      }
      
      if (mouse.y > 1 - edgeThreshold * 2) {
        camera.rotation.x -= panSpeed * ((mouse.y - (1 - edgeThreshold * 2)) / (edgeThreshold * 2));
      } else if (mouse.y < -1 + edgeThreshold * 2) {
        camera.rotation.x += panSpeed * (((-1 + edgeThreshold * 2) - mouse.y) / (edgeThreshold * 2));
      }
      
      camera.rotation.x = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, camera.rotation.x));
    }

    // Throw animation and recoil recovery
    if (discVisualRef.current) {
      if (throwTimer.current > 0) {
        const t = 1 - (throwTimer.current / 0.15); // 0 to 1
        discVisualRef.current.position.z = -t * 0.8;
        discVisualRef.current.position.x = -t * 0.2;
        discVisualRef.current.rotation.z = -t * Math.PI / 2;
      } else {
        discVisualRef.current.position.z = THREE.MathUtils.lerp(discVisualRef.current.position.z, 0, delta * 10);
        discVisualRef.current.position.x = THREE.MathUtils.lerp(discVisualRef.current.position.x, 0, delta * 10);
        discVisualRef.current.rotation.z = THREE.MathUtils.lerp(discVisualRef.current.rotation.z, 0, delta * 10);
      }
      
      // Spin the disc
      discVisualRef.current.rotation.y += delta * 15;
    }

    // Emit position to server
    const now = Date.now();
    if (now - lastEmitTime.current > 50) {
      updatePlayerPosition([pos.x, pos.y, pos.z], camera.rotation.y);
      lastEmitTime.current = now;
    }
  });

  useEffect(() => {
    camera.rotation.order = 'YXZ';
  }, [camera]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      // Don't shoot if clicking UI elements
      if (e.target instanceof HTMLElement && e.target.tagName === 'BUTTON') return;
      
      if (gameState === 'playing' && playerState === 'active') {
        shoot();
      }
    };
    window.addEventListener('mousedown', handleClick);
    return () => window.removeEventListener('mousedown', handleClick);
  }, [gameState, playerState, camera, world, rapier, hitEnemy, addParticles, addDisc, hasActiveDisc]);



  return (
    <>
      <PointerLockControls />
      <RigidBody
        ref={body}
        colliders={false}
        mass={1}
        type="dynamic"
        position={[0, 2, 0]}
        enabledRotations={[false, false, false]}
        userData={{ name: 'player' }}
        friction={0}
      >
        <CapsuleCollider args={[0.5, 0.5]} position={[0, 1, 0]} friction={0} />
      </RigidBody>

      {/* First Person Disc */}
      <group ref={gunGroupRef}>
        <group position={[0.4, -0.3, -0.6]}>
          {!hasActiveDisc && (
            <group ref={discVisualRef} rotation={[0.1, 0, 0]}>
              <mesh>
                <cylinderGeometry args={[0.2, 0.2, 0.02, 32]} />
                <meshStandardMaterial color="#111" metalness={0.8} roughness={0.2} />
              </mesh>
              <mesh rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.2, 0.02, 16, 32]} />
                <meshStandardMaterial color="#00ffff" emissive="#00ffff" emissiveIntensity={2} toneMapped={false} />
              </mesh>
              <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0.011, 0]}>
                <ringGeometry args={[0.08, 0.1, 32]} />
                <meshStandardMaterial color="#00ffff" emissive="#00ffff" emissiveIntensity={2} toneMapped={false} side={THREE.DoubleSide} />
              </mesh>
            </group>
          )}
        </group>
      </group>
    </>
  );
}
