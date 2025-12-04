import * as THREE from 'three';

export class CameraManager {
    constructor() {
        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.5, 12000);
        this.cameraLookAt = new THREE.Vector3(0, 0, 0);
        this.zoomTransition = null;
    }

    reset(targetPos) {
        this.cameraLookAt.copy(targetPos);
        this.camera.position.copy(targetPos).add(new THREE.Vector3(0, 30, 20));
        this.zoomTransition = null;
    }

    resize(width, height) {
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
    }

    updateFollow(targetPos, dt) {
        // Rigid X/Z, Smooth Y
        const targetCamY = targetPos.y + 30;

        this.camera.position.x = targetPos.x;
        this.camera.position.z = targetPos.z + 20; 
        this.camera.position.y = THREE.MathUtils.lerp(this.camera.position.y, targetCamY, dt * 5);

        // Look at target smooth Y
        this.cameraLookAt.x = targetPos.x;
        this.cameraLookAt.z = targetPos.z;
        this.cameraLookAt.y = THREE.MathUtils.lerp(this.cameraLookAt.y, targetPos.y, dt * 10);

        this.camera.lookAt(this.cameraLookAt);
    }

    updateCrashZoom(dt, carPos, explosionTriggered, explosionTime, clock, trackManager, scene) {
        const timeSinceExplosion = explosionTriggered ? (clock.getElapsedTime() - explosionTime) : 0;

        // Wait 1.0 second before zooming out
        const shouldZoomOut = explosionTriggered && timeSinceExplosion > 1.0;

        if (shouldZoomOut) {
            // Fade out fog for better visibility during zoom out
            if (scene.fog && scene.fog.density > 0.00001) {
                scene.fog.density = THREE.MathUtils.lerp(scene.fog.density, 0.0, dt * 2.0);
            }

            // Initialize smooth zoom transition
            if (!this.zoomTransition) {
                const bounds = trackManager.getTrackBounds();
                let targetPos, targetLookAt;

                if (bounds) {
                    // Calculate view direction but enforce a high angle for better map visibility
                    let viewDir = new THREE.Vector3().subVectors(this.camera.position, carPos).normalize();
                    // Ensure we are looking down from above (bird's eye view bias)
                    if (viewDir.y < 0.6) {
                        viewDir.y = 0.6;
                        viewDir.normalize();
                    }

                    // Determine distance needed to see the whole map
                    // Increased multiplier for safety on large maps
                    const dist = Math.max(bounds.maxDim * 2.5, 1000);

                    targetPos = bounds.center.clone().add(viewDir.multiplyScalar(dist));
                    targetLookAt = bounds.center;
                } else {
                    // Fallback
                    targetPos = carPos.clone().add(new THREE.Vector3(0, 600, 600));
                    targetLookAt = carPos;
                }

                this.zoomTransition = {
                    startPos: this.camera.position.clone(),
                    startLookAt: this.cameraLookAt.clone(),
                    targetPos: targetPos,
                    targetLookAt: targetLookAt,
                    startTime: clock.getElapsedTime(),
                    duration: 4.0 // 4 seconds for a fluid cinematic movement
                };
            }

            // Perform Interpolation
            const now = clock.getElapsedTime();
            const elapsed = now - this.zoomTransition.startTime;
            const progress = Math.min(elapsed / this.zoomTransition.duration, 1.0);

            // Smootherstep for "start slow, accelerate, decelerate"
            const t = THREE.MathUtils.smootherstep(progress, 0, 1);

            this.camera.position.lerpVectors(this.zoomTransition.startPos, this.zoomTransition.targetPos, t);
            this.cameraLookAt.lerpVectors(this.zoomTransition.startLookAt, this.zoomTransition.targetLookAt, t);
            this.camera.lookAt(this.cameraLookAt);

        } else {
            // Pre-zoom behavior (falling or waiting)
            const targetCamPos = carPos.clone().add(new THREE.Vector3(0, 60, 40));
            const targetLookAt = carPos;

            let posLerpFactor, lookLerpFactor;

            if (explosionTriggered) {
                // During wait: stabilize camera slowly
                posLerpFactor = dt * 0.5;
                lookLerpFactor = dt * 2.0;
            } else {
                // Falling: move fast
                posLerpFactor = dt * 3.0;
                lookLerpFactor = dt * 5.0;
            }

            this.camera.position.lerp(targetCamPos, posLerpFactor);
            this.cameraLookAt.lerp(targetLookAt, lookLerpFactor);
            this.camera.lookAt(this.cameraLookAt);
        }
    }
}