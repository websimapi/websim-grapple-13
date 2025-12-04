import * as THREE from 'three';

export class TrackGenerator {
    constructor(manager) {
        this.manager = manager;
    }

    generate() {
        // Helper to check a candidate segment for collision
        const checkCandidate = (candidate) => {
            const tempHorizLen = candidate.length * Math.cos(candidate.slope);
            const centerOffset = this.manager.currentDir.clone().multiplyScalar(tempHorizLen / 2);
            const projectedCenter = this.manager.currentPos.clone().add(centerOffset);
            
            return !this.manager.checkCollision({
                center: projectedCenter,
                width: this.manager.width,
                length: tempHorizLen,
                angle: 0
            }, this.manager.currentPos.y);
        };

        const rand = Math.random();
        let primary = {};

        // 1. Generate Primary Wish
        if (rand > 0.6) { // Turn
            primary = {
                type: 'turn',
                turnDir: Math.random() > 0.5 ? 1 : -1,
                length: 50 + Math.random() * 30,
                slope: 0
            };
        } else { // Straight
            const slopeRand = Math.random();
            let s = 0;
            if (slopeRand < 0.3) s = 0.2;
            else if (slopeRand < 0.6) s = -0.2;
            
            primary = {
                type: 'straight',
                length: 80 + Math.random() * 60,
                turnDir: 0,
                slope: s
            };
        }

        // 2. List Candidates (Primary + Evasive maneuvers)
        const candidates = [
            primary,
            // Try simple straight if primary was turn (or just as backup)
            { type: 'straight', length: 60, slope: 0 },
            // Try opposite turn if primary was turn
            (primary.type === 'turn') ? { ...primary, turnDir: -primary.turnDir } : null,
            // Try Turn Left with short approach
            { type: 'turn', length: 30, turnDir: 1, slope: 0 },
            // Try Turn Right with short approach
            { type: 'turn', length: 30, turnDir: -1, slope: 0 }
        ];

        let selectedParams = null;
        for(let c of candidates) {
            if (c && checkCandidate(c)) {
                selectedParams = c;
                break;
            }
        }

        // 3. Last Resort
        if (!selectedParams) {
             // If boxed in, force a very steep climb to try and clear it
             selectedParams = { type: 'straight', length: 60, slope: 0.4 };
        }

        return selectedParams;
    }
}