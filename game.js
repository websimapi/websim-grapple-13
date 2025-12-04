import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { TrackManager } from './track.js';
import { Car } from './car.js';
import { Explosion, SpaceEnvironment } from './effects.js';
import { ReplayRecorder } from './replay.js';
import { InputManager } from './input_manager.js';
import { AudioManager } from './audio_manager.js';
import { CameraManager } from './camera_manager.js';

export class Game {
    constructor() {
        this.container = document.getElementById('game-container');
        this.scoreEl = document.getElementById('score-display');
        this.grappleScoreEl = document.getElementById('grapple-display');
        this.gameOverScreen = document.getElementById('game-over-screen');
        this.finalScoreEl = document.getElementById('final-score');

        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.FogExp2(0x050505, 0.002);

        // removed camera setup logic
        this.cameraManager = new CameraManager();
        this.camera = this.cameraManager.camera;

        // Renderer
        this.renderer = new THREE.WebGLRenderer({ 
            antialias: false,
            preserveDrawingBuffer: true 
        }); 
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.container.appendChild(this.renderer.domElement);

        // Post Processing (Bloom)
        this.composer = new EffectComposer(this.renderer);
        this.composer.addPass(new RenderPass(this.scene, this.camera));

        const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
        bloomPass.threshold = 0.1;
        bloomPass.strength = 1.2; 
        bloomPass.radius = 0.5;
        this.composer.addPass(bloomPass);

        // Lights
        this.addLights();

        // Input
        // removed input event listeners
        this.inputManager = new InputManager(this.renderer.domElement);

        // Resize
        window.addEventListener('resize', () => this.onWindowResize());

        // Game State
        this.isRunning = false;
        this.isCrashing = false;
        this.distanceTraveled = 0;
        this.explosions = [];

        // Bindings
        document.getElementById('restart-btn').addEventListener('click', () => this.reset());

        // Audio
        // removed setupAudio() and local sound variables
        this.audioManager = new AudioManager(this.camera);

        // Multiplayer / User Info
        this.room = new WebsimSocket();
        this.room.initialize();

        // Replay System
        // Updated to use listener from AudioManager
        this.replayRecorder = new ReplayRecorder(this.renderer.domElement, this.audioManager.listener);

        // Explosion / crash state
        this.explosionTriggered = false;
        this.explosionTime = 0;
        this.interceptorSpawned = false;
    }

    // removed setupAudio() {}

    addLights() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 2.5);
        this.scene.add(ambientLight);

        const hemiLight = new THREE.HemisphereLight(0x88aaff, 0x222244, 1.2);
        this.scene.add(hemiLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
        dirLight.position.set(20, 40, 10);
        dirLight.castShadow = false;
        this.scene.add(dirLight);
    }

    start() {
        this.audioManager.resumeContext();
        this.reset();
        this.loop();
    }

    reset() {
        // Clear scene
        while(this.scene.children.length > 0){ 
            this.scene.remove(this.scene.children[0]); 
        }

        // Reset fog density
        if (this.scene.fog) this.scene.fog.density = 0.002;

        this.explosions = [];

        // Cleanup previous replay video
        const video = document.getElementById('replay-video');
        if (video) {
            video.pause();
            video.currentTime = 0;
            if (video.src && video.src.startsWith('blob:')) {
                URL.revokeObjectURL(video.src);
            }
            video.removeAttribute('src');
            video.load();
        }

        // Stop any previous recording just in case
        if (this.replayRecorder && this.replayRecorder.isRecording) {
            this.replayRecorder.stop().then(result => {
                if (result && result.url) URL.revokeObjectURL(result.url);
            });
        }

        // Re-add lights
        this.addLights();

        if (this.spaceEnvironment) {
             this.spaceEnvironment.reset();
             this.scene.add(this.spaceEnvironment.stars);
        } else {
             this.spaceEnvironment = new SpaceEnvironment(this.scene);
        }

        this.trackManager = new TrackManager(this.scene);
        this.car = new Car(this.scene);
        
        // Reset camera
        // removed local camera reset logic
        this.cameraManager.reset(this.car.position);

        this.isRunning = true;
        this.isCrashing = false;
        this.explosionTriggered = false;
        this.explosionTime = 0;
        this.interceptorSpawned = false;
        this.gameOverScreen.classList.add('hidden');
        this.distanceTraveled = 0;
        this.clock = new THREE.Clock();
        // removed this.zoomTarget and this.zoomTransition

        // Start new recording
        if (this.replayRecorder) {
            this.replayRecorder.start();
        }

        this.audioManager.playEngine();
    }

    gameOver() {
        this.isRunning = false;
        this.isCrashing = true;
        this.explosionTriggered = false;
        this.interceptorSpawned = false;
        
        // Initial fall velocity: Preserve some forward speed, add downward force
        this.fallVelocity = this.car.direction.clone().multiplyScalar(20);
        this.fallVelocity.y = -10;

        this.audioManager.stopEngine();
    }

    updateCrash(dt) {
        if (!this.explosionTriggered) {
            // Gravity
            this.fallVelocity.y -= 80 * dt; 
            
            // Apply velocity
            this.car.position.add(this.fallVelocity.clone().multiplyScalar(dt));
            this.car.mesh.position.copy(this.car.position);
            
            // Tumble rotation
            this.car.mesh.rotation.x += 5 * dt;
            this.car.mesh.rotation.z += 3 * dt;

            // Spawn Interceptor if falling deep enough
            if (!this.interceptorSpawned && this.car.position.y < -5) {
                this.spaceEnvironment.spawnInterceptor(this.car.position, this.fallVelocity);
                this.interceptorSpawned = true;
            }

            // Check Collision with Asteroids
            const hit = this.spaceEnvironment.checkCollisions(this.car.position);
            
            // Trigger explosion on hit OR failsafe depth
            if (hit || this.car.position.y < -200) {
                this.triggerExplosion();
            }
        }

        // Camera follow logic
        // removed inline camera crash zoom logic
        this.cameraManager.updateCrashZoom(
            dt, 
            this.car.position, 
            this.explosionTriggered, 
            this.explosionTime, 
            this.clock, 
            this.trackManager,
            this.scene
        );
    }

    triggerExplosion() {
        this.explosionTriggered = true;
        this.explosionTime = this.clock.getElapsedTime();

        // Spawn Explosion at current car position
        const explosion = new Explosion(this.scene, this.car.position.clone());
        this.explosions.push(explosion);
        
        // Hide car mesh as it exploded
        this.car.hide();

        // Play explosion sound (repurposed skidSound)
        this.audioManager.playSkid(true);

        // Delay showing game over overlay so explosion is visible
        setTimeout(() => {
            this.showGameOverScreen();
        }, 5500);
    }

    async showGameOverScreen() {
        this.gameOverScreen.classList.remove('hidden');
        this.finalScoreEl.innerText = `Distance: ${Math.floor(this.distanceTraveled)}m`;

        // Stop recording and load replay
        if (this.replayRecorder) {
            const recording = await this.replayRecorder.stop();
            if (recording) {
                const { blob, url } = recording;
                if (!this.gameOverScreen.classList.contains('hidden')) {
                    const video = document.getElementById('replay-video');
                    video.src = url;
                    video.play().catch(e => console.log('Replay autoplay blocked:', e));

                    this.postHighScore(blob, url);
                } else {
                    URL.revokeObjectURL(url);
                }
            }
        }
    }

    async postHighScore(blob, blobUrl) {
        try {
            let username = "Guest";
            let userid = "guest";
            
            if (this.room && this.room.clientId && this.room.peers) {
                const p = this.room.peers[this.room.clientId];
                if (p) {
                    username = p.username || "Guest";
                    userid = p.id || this.room.clientId;
                } else {
                    userid = this.room.clientId;
                }
            }

            let replayUrl = null;
            if (window.websim && window.websim.upload) {
                try {
                    const file = new File([blob], `grapple_replay_${Date.now()}.webm`, { type: 'video/webm' });
                    replayUrl = await window.websim.upload(file);
                } catch(e) {
                    console.error("Replay upload failed:", e);
                }
            }

            const message = {
                userid: userid,
                username: username,
                score: this.car.grappleCount,
                replay: replayUrl || ""
            };

            if (window.parent) {
                window.parent.postMessage(message, '*');
                console.log("High Score Posted:", message);
            }

        } catch (e) {
            console.error("Error posting high score:", e);
        }
    }

    onWindowResize() {
        this.cameraManager.resize(window.innerWidth, window.innerHeight);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.composer.setSize(window.innerWidth, window.innerHeight);
    }

    loop() {
        requestAnimationFrame(() => this.loop());

        const dt = Math.min(this.clock.getDelta(), 0.1); 

        // Update Explosions
        for (let i = this.explosions.length - 1; i >= 0; i--) {
            const exp = this.explosions[i];
            exp.update(dt);
            if (!exp.alive) {
                this.explosions.splice(i, 1);
            }
        }

        if (this.isRunning) {
            // Update Logic
            this.car.update(dt, this.inputManager, this.trackManager);

            // Check Track generation
            const distToHead = this.car.position.distanceTo(this.trackManager.currentPos);
            if (distToHead < 100) {
                this.trackManager.generateNextSegment();
            }

            // Check collision/Off-road
            if (!this.trackManager.isOnTrack(this.car.position)) {
                this.gameOver();
            }

            // Update Score
            this.distanceTraveled += this.car.speed * dt;
            this.scoreEl.innerText = `DISTANCE: ${Math.floor(this.distanceTraveled)}m`;
            this.grappleScoreEl.innerText = `GRAPPLES: ${this.car.grappleCount}`;

            // Camera Follow
            // removed inline camera follow logic
            this.cameraManager.updateFollow(this.car.position, dt);

            // SFX Logic
            if(this.car.grappleState === 'FIRING') {
                this.audioManager.playGrapple();
            }
        } else if (this.isCrashing) {
            this.updateCrash(dt);
        }

        if (this.spaceEnvironment) {
            this.spaceEnvironment.update(dt, this.camera.position);
        }

        this.composer.render();
    }
}