import * as THREE from 'three';
import { createCarBody, createHookMesh, createGrappleRope } from './car_mesh.js';

export class Car {
    constructor(scene) {
        this.scene = scene;
        this.mesh = createCarBody();
        this.scene.add(this.mesh);
        
        // Physics state
        this.position = new THREE.Vector3(0, 1, 0);
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.speed = 30; 
        this.direction = new THREE.Vector3(0, 0, 1); 
        this.verticalVelocity = 0; // Added for gravity
        
        // Grapple State
        this.grappleState = 'IDLE'; 
        this.grappleTarget = null;
        this.hookPosition = new THREE.Vector3();
        this.grappleCount = 0;
        
        // Visuals
        
        // --- GRAPPLE VISUALS ---
        
        // 1. Detailed Hook Mesh
        this.hookMesh = createHookMesh();
        this.scene.add(this.hookMesh);
        this.hookMesh.visible = false;

        // 2. Thick Grapple Rope (Tube/Cylinder)
        this.grappleRope = createGrappleRope();
        this.grappleRope.visible = false;
        this.scene.add(this.grappleRope);

        // Drift particles (Basic)
        this.smokeParticles = [];
    }

    hide() {
        this.mesh.visible = false;
        this.hookMesh.visible = false;
        this.grappleRope.visible = false;
    }

    update(dt, input, trackManager) {
        // 1. Input & State Management
        const grappleInfo = trackManager.getNearestPost(this.position);
        
        // Input Handling
        if (input.mouseDown) {
            // Attempt to fire if IDLE and valid target
            if (this.grappleState === 'IDLE' && grappleInfo.post && grappleInfo.distance < 45) { // Increased range slightly
                this.fireGrapple(grappleInfo.post);
            }
        } else {
            // Release if currently engaged
            if (this.grappleState === 'FIRING' || this.grappleState === 'ATTACHED') {
                this.releaseGrapple();
            }
        }

        // State Machine Logic
        this.updateGrapplePhysics(dt);

        // Variables for rotation
        const targetQuat = new THREE.Quaternion();
        
        // 3D Terrain Handling
        const trackState = trackManager.getTrackState(this.position);

        // 2. Car Movement
        if (this.grappleState === 'ATTACHED' && this.grappleTarget) {
            // Circular Motion Logic (Grappling)
            const postPos = this.grappleTarget.position;
            const radiusVector = new THREE.Vector3().subVectors(this.position, postPos);
            
            // Project logic to 2D for steering, but keep Y relative
            const radius2D = new THREE.Vector2(radiusVector.x, radiusVector.z).length();
            
            // Tangent Logic
            let tangent = new THREE.Vector3().crossVectors(radiusVector, new THREE.Vector3(0, 1, 0)).normalize();
            if (tangent.dot(this.direction) < 0) tangent.negate();

            // Move
            const arcLength = this.speed * dt;
            const angleChange = arcLength / radius2D; // Approx
            
            const toPost = new THREE.Vector3().subVectors(postPos, this.position);
            const crossY = new THREE.Vector3().crossVectors(this.direction, toPost).y;
            const rotDir = crossY > 0 ? -1 : 1; 

            // Calculate Roll
            const grappleRoll = rotDir * 0.35;

            const pos2D = new THREE.Vector2(this.position.x - postPos.x, this.position.z - postPos.z);
            pos2D.rotateAround(new THREE.Vector2(0,0), rotDir * angleChange);
            
            this.position.x = postPos.x + pos2D.x;
            this.position.z = postPos.z + pos2D.y;

            this.direction.copy(tangent).normalize();
            
            // While grappling, we might swing vertically? 
            // For now, let's keep gravity active to pull down, but rope holds? 
            // Simplifying: Grappling ignores track slope, maintains height or falls slowly?
            // Let's allow grappling to "swing" (gravity pulls down).
            this.verticalVelocity -= 20 * dt; // Gravity
            this.position.y += this.verticalVelocity * dt;

            // Simple floor check if we swing too low
            if (trackState.onTrack && this.position.y < trackState.height + 1) {
                this.position.y = trackState.height + 1;
                this.verticalVelocity = 0;
            }
            
            this.speed = Math.min(this.speed + 15 * dt, 55);

            // Set Target Rotation (Yaw + Roll)
            const yaw = Math.atan2(this.direction.x, this.direction.z);
            targetQuat.setFromEuler(new THREE.Euler(0, yaw, grappleRoll, 'XYZ'));

        } else {
            // Linear Motion
            this.speed = THREE.MathUtils.lerp(this.speed, 35, dt * 2);
            
            // Calculate horizontal movement
            const moveStep = this.direction.clone().multiplyScalar(this.speed * dt);
            this.position.x += moveStep.x;
            this.position.z += moveStep.z;
            
            // Vertical Physics (Gravity + Road Snap)
            if (trackState.onTrack) {
                // 2-Point Suspension Logic for smooth ramp transitions
                const lookAhead = 1.8;
                const fwd = this.direction.clone().normalize();
                
                // Sample points ahead and behind to look for slope changes
                const pFront = this.position.clone().add(fwd.clone().multiplyScalar(lookAhead));
                const pRear = this.position.clone().add(fwd.clone().multiplyScalar(-lookAhead));
                
                // Get track height at samples
                const sFront = trackManager.getTrackState(pFront);
                const sRear = trackManager.getTrackState(pRear);
                
                let targetY = trackState.height;
                let terrainNormal = new THREE.Vector3(0, 1, 0);
                let terrainForward = fwd;

                // If both samples are on track, calculate exact pitch from geometry
                if (sFront.onTrack && sRear.onTrack) {
                    const hFront = sFront.height;
                    const hRear = sRear.height;
                    targetY = (hFront + hRear) / 2;
                    
                    // Create slope vector
                    const pF = pFront.clone(); pF.y = hFront;
                    const pR = pRear.clone(); pR.y = hRear;
                    terrainForward = new THREE.Vector3().subVectors(pF, pR).normalize();
                    
                    // Derive Normal and Right from Forward + Global Up
                    const globalUp = new THREE.Vector3(0, 1, 0);
                    const tRight = new THREE.Vector3().crossVectors(globalUp, terrainForward).normalize();
                    // Recalculate normal to be orthogonal to new forward
                    terrainNormal = new THREE.Vector3().crossVectors(terrainForward, tRight).normalize();
                } 
                else if (trackState.segment) {
                    // Fallback to single segment orientation
                    const segQuat = new THREE.Quaternion().setFromEuler(trackState.segment.mesh.rotation);
                    terrainNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(segQuat);
                }

                // Snap to road with damping
                const diff = targetY - this.position.y;
                this.position.y += diff * 25 * dt;
                
                // Construct Rotation Basis
                // Right = Cross(Normal, Forward) -> Ensures no roll unless normal dictates it
                // Forward = Cross(Right, Normal) -> Aligns with slope
                const right = new THREE.Vector3().crossVectors(terrainNormal, terrainForward).normalize();
                const realForward = new THREE.Vector3().crossVectors(right, terrainNormal).normalize();
                
                const rotMat = new THREE.Matrix4().makeBasis(right, terrainNormal, realForward);
                targetQuat.setFromRotationMatrix(rotMat);
                
                this.verticalVelocity = 0;
            } else {
                // Falling
                this.verticalVelocity -= 40 * dt; // Gravity
                this.position.y += this.verticalVelocity * dt;
                
                // Nose dive when falling
                const yaw = Math.atan2(this.direction.x, this.direction.z);
                targetQuat.setFromEuler(new THREE.Euler(0.5, yaw, 0, 'XYZ'));
            }
        }

        // Apply Position
        this.mesh.position.copy(this.position);
        
        // Apply Rotation (Smooth Slerp)
        // Increased speed to reduce visual lag
        this.mesh.quaternion.slerp(targetQuat, dt * 20);
    }

    fireGrapple(target) {
        this.grappleState = 'FIRING';
        this.grappleTarget = target;
        this.hookPosition.copy(this.position); // Start at car
        this.hookMesh.visible = true;
        this.grappleRope.visible = true;
    }

    releaseGrapple() {
        if (this.grappleState === 'ATTACHED') {
            this.grappleCount++;
            this.autoStraighten();
        }
        this.grappleState = 'RETRACTING';
        // Keep target for retraction origin references if needed, but we use hookPosition
        this.grappleTarget = null;
    }

    updateGrapplePhysics(dt) {
        const hookSpeed = 200; // Speed of hook travel

        if (this.grappleState === 'FIRING') {
            const targetPos = this.grappleTarget.position;
            const dist = this.hookPosition.distanceTo(targetPos);
            const travelDist = hookSpeed * dt;

            if (dist <= travelDist) {
                // Reached target
                this.hookPosition.copy(targetPos);
                this.grappleState = 'ATTACHED';
            } else {
                // Move towards target
                const dir = new THREE.Vector3().subVectors(targetPos, this.hookPosition).normalize();
                this.hookPosition.add(dir.multiplyScalar(travelDist));
            }
        }
        else if (this.grappleState === 'ATTACHED') {
            // Lock hook to post (in case of floating point drift or moving posts)
            if (this.grappleTarget) {
                this.hookPosition.copy(this.grappleTarget.position);
            }
        }
        else if (this.grappleState === 'RETRACTING') {
            const targetPos = this.position; // Retract to car
            const dist = this.hookPosition.distanceTo(targetPos);
            const travelDist = hookSpeed * dt;

            if (dist <= travelDist) {
                // Reached car
                this.grappleState = 'IDLE';
                this.hookMesh.visible = false;
                this.grappleRope.visible = false;
            } else {
                // Move towards car
                const dir = new THREE.Vector3().subVectors(targetPos, this.hookPosition).normalize();
                this.hookPosition.add(dir.multiplyScalar(travelDist));
            }
        }

        // Update Visuals
        if (this.grappleState !== 'IDLE') {
            // Update Rope Transform
            // We want the rope to start at the car's roof/grapple point and end at the hook
            
            const startPos = this.position.clone();
            startPos.y += 0.8; // Car roof height
            
            const endPos = this.hookPosition.clone();
            const dist = startPos.distanceTo(endPos);
            
            // 1. Position at start
            this.grappleRope.position.copy(startPos);
            // 2. Look at end
            this.grappleRope.lookAt(endPos);
            // 3. Scale Z to match distance (since geo is rotated to Z)
            this.grappleRope.scale.set(1, 1, dist);

            // Update Hook Mesh orientation
            this.hookMesh.position.copy(this.hookPosition);
            
            // Orient hook
            if (this.grappleState === 'FIRING') {
                this.hookMesh.lookAt(this.grappleTarget.position);
            } else if (this.grappleState === 'RETRACTING') {
                this.hookMesh.lookAt(this.position);
            } else {
                 // Attached: look at car (tension)
                 this.hookMesh.lookAt(this.position);
            }
        }
    }

    autoStraighten() {
        const cardinals = [
            new THREE.Vector3(0, 0, 1),
            new THREE.Vector3(0, 0, -1),
            new THREE.Vector3(1, 0, 0),
            new THREE.Vector3(-1, 0, 0)
        ];

        let maxDot = -Infinity;
        let bestDir = null;

        for (const dir of cardinals) {
            const dot = this.direction.dot(dir);
            if (dot > maxDot) {
                maxDot = dot;
                bestDir = dir;
            }
        }

        // If reasonably aligned (within ~25 degrees, dot > 0.9), snap to cardinal direction
        if (maxDot > 0.9 && bestDir) {
            this.direction.copy(bestDir);
        }
    }
}