import * as THREE from 'three';

export class AudioManager {
    constructor(camera) {
        this.listener = new THREE.AudioListener();
        camera.add(this.listener);
        
        this.sounds = {
            engine: new THREE.Audio(this.listener),
            grapple: new THREE.Audio(this.listener),
            skid: new THREE.Audio(this.listener)
        };

        const loader = new THREE.AudioLoader();

        loader.load('./sfx_engine.mp3', (buffer) => {
            this.sounds.engine.setBuffer(buffer);
            this.sounds.engine.setLoop(true);
            this.sounds.engine.setVolume(0.012);
        });

        loader.load('./sfx_grapple_shoot.mp3', (buffer) => {
            this.sounds.grapple.setBuffer(buffer);
            this.sounds.grapple.setVolume(0.5);
        });

        loader.load('./sfx_skid.mp3', (buffer) => {
            this.sounds.skid.setBuffer(buffer);
            this.sounds.skid.setVolume(0.4);
        });
    }

    resumeContext() {
        if (this.listener.context.state === 'suspended') {
            this.listener.context.resume();
        }
    }

    playEngine() {
        if (this.sounds.engine.buffer && !this.sounds.engine.isPlaying) {
            this.sounds.engine.play();
        }
    }

    stopEngine() {
        if (this.sounds.engine.isPlaying) this.sounds.engine.stop();
    }

    playGrapple() {
        if (this.sounds.grapple.buffer && !this.sounds.grapple.isPlaying) {
            this.sounds.grapple.play();
        }
    }

    playSkid(isExplosion = false) {
        if (this.sounds.skid.buffer) {
            if (this.sounds.skid.isPlaying) this.sounds.skid.stop();
            this.sounds.skid.setVolume(isExplosion ? 1.0 : 0.4);
            this.sounds.skid.play();
        }
    }
}

