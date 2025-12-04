import * as THREE from 'three';

const explosionVertexShader = `
uniform float uTime;
attribute float size;
attribute float life;
attribute vec3 color;
varying vec3 vColor;
varying float vLife;

void main() {
    vColor = color;
    vLife = life;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    // Adjusted scaling factor for better sizing across devices
    gl_PointSize = size * (1000.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
}
`;

const explosionFragmentShader = `
varying vec3 vColor;
varying float vLife;

float rand(vec2 co){
    return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
}

void main() {
    vec2 coord = gl_PointCoord - vec2(0.5);
    float dist = length(coord);
    if (dist > 0.5) discard;

    // More complex falloff for dispersed look
    float strength = 1.0 - (dist * 2.0);
    strength = pow(strength, 2.0); // Sharper falloff

    // Simple noise to break up the perfect circle shape of particles
    float noise = rand(gl_PointCoord + vLife);
    strength *= (0.8 + 0.2 * noise);

    vec3 finalColor = vColor;
    
    // Nuclear flash white-out at high life
    if (vLife > 0.8) {
        float flash = smoothstep(0.8, 1.0, vLife);
        finalColor = mix(finalColor, vec3(1.0, 1.0, 1.0), flash);
    }
    
    float alpha = strength;
    
    // Faster fade out
    alpha *= smoothstep(0.0, 0.4, vLife);

    gl_FragColor = vec4(finalColor, alpha);
}
`;

export class Explosion {
    constructor(scene, position) {
        this.scene = scene;
        this.particles = [];
        this.count = 200; // Increased count for detail
        this.alive = true;
        this.age = 0;
        this.duration = 1.5; // Quicker explosion

        const geometry = new THREE.BufferGeometry();
        const positions = [];
        const sizes = [];
        const lifes = [];
        const colors = [];
        
        // Initial Burst
        for (let i = 0; i < this.count; i++) {
            positions.push(position.x, position.y, position.z);
            
            // Physics init
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos((Math.random() * 2) - 1);
            
            // Reduced speed for tighter explosion (approx 2x car size max spread)
            const speed = 2 + Math.random() * 15;
            
            const vx = speed * Math.sin(phi) * Math.cos(theta);
            const vy = speed * Math.sin(phi) * Math.sin(theta);
            const vz = speed * Math.cos(phi);

            // Life variations
            const life = 0.5 + Math.random() * 0.5;
            lifes.push(life);
            
            // Much smaller particles relative to car (width 1.8)
            // Previous was 10-40, now 0.5 - 3.0
            sizes.push(0.5 + Math.random() * 2.5);

            // Initial color (Bright Orange)
            colors.push(1.0, 0.6, 0.1); 

            this.particles.push({
                vx, vy, vz,
                gravity: 2, // Less gravity for smoke suspension
                drag: 0.95, // High drag to stop expansion quickly
                isSmoke: true
            });
        }

        // Shockwave Ring - Smaller and tighter
        for(let i=0; i<20; i++) {
             positions.push(position.x, position.y + 0.5, position.z);
             const angle = (i / 20) * Math.PI * 2;
             const speed = 25; // Slower shockwave
             this.particles.push({
                 vx: Math.cos(angle) * speed,
                 vy: 0,
                 vz: Math.sin(angle) * speed,
                 gravity: 0,
                 drag: 0.9,
                 isShockwave: true
             });
             lifes.push(0.4); 
             sizes.push(2.0); // Smaller shockwave particles
             colors.push(1.0, 0.9, 0.6);
        }

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));
        geometry.setAttribute('life', new THREE.Float32BufferAttribute(lifes, 1));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

        this.material = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 }
            },
            vertexShader: explosionVertexShader,
            fragmentShader: explosionFragmentShader,
            transparent: true,
            depthWrite: false,
            // Normal blending allows for dark smoke against the sky
            blending: THREE.NormalBlending 
        });

        this.mesh = new THREE.Points(geometry, this.material);
        // Ensure bounds don't cull explosion early
        this.mesh.frustumCulled = false; 
        this.scene.add(this.mesh);
        
        // Intense Flash Light - Reduced range
        this.light = new THREE.PointLight(0xffaa00, 5, 20);
        this.light.position.copy(position);
        this.scene.add(this.light);
    }

    update(dt) {
        this.age += dt;
        this.material.uniforms.uTime.value = this.age;

        if (this.age > this.duration) {
            this.alive = false;
            this.scene.remove(this.mesh);
            this.scene.remove(this.light);
            this.mesh.geometry.dispose();
            this.material.dispose();
            return;
        }

        const positions = this.mesh.geometry.attributes.position.array;
        const lifes = this.mesh.geometry.attributes.life.array;
        const colors = this.mesh.geometry.attributes.color.array;
        const sizes = this.mesh.geometry.attributes.size.array;

        // Flash fade
        this.light.intensity = Math.max(0, 10 * (1 - this.age * 5));

        for (let i = 0; i < this.particles.length; i++) {
            const i3 = i * 3;
            const p = this.particles[i];
            
            // Life decay
            let decaySpeed = 1.0 / this.duration;
            if (p.isShockwave) decaySpeed = 2.0; // Shockwave fades fast
            
            lifes[i] -= decaySpeed * dt;
            if (lifes[i] < 0) lifes[i] = 0;
            
            const currentLife = lifes[i];

            // Movement
            positions[i3] += p.vx * dt;
            positions[i3+1] += p.vy * dt;
            positions[i3+2] += p.vz * dt;

            // Physics
            p.vx *= p.drag;
            p.vy *= p.drag;
            p.vz *= p.drag;
            p.vy += p.gravity * dt;

            // Color & Size Logic
            if (p.isShockwave) {
                sizes[i] += 15 * dt; // Slower expansion
                colors[i3] = 1.0; colors[i3+1] = 0.9; colors[i3+2] = 0.5; 
            } else {
                // Fire/Smoke
                sizes[i] += 2 * dt; // Slow smoke growth

                if (currentLife > 0.5) {
                    // Fire phase: Yellow -> Red
                    // Map 0.5-1.0 to Red-Yellow
                    const t = THREE.MathUtils.mapLinear(currentLife, 0.5, 1.0, 0.0, 1.0);
                    colors[i3] = 1.0; 
                    colors[i3+1] = t; 
                    colors[i3+2] = 0.0;
                } else {
                    // Smoke phase: Red -> Dark Grey
                    // Map 0.0-0.5 to Grey-Red
                    const t = THREE.MathUtils.mapLinear(currentLife, 0.0, 0.5, 0.0, 1.0);
                    const greyVal = 0.1;
                    colors[i3] = greyVal + t * (1.0 - greyVal);
                    colors[i3+1] = greyVal + t * (0.0 - greyVal); // Red component goes to 0
                    colors[i3+2] = greyVal;
                }
            }
        }

        this.mesh.geometry.attributes.position.needsUpdate = true;
        this.mesh.geometry.attributes.life.needsUpdate = true;
        this.mesh.geometry.attributes.color.needsUpdate = true;
        this.mesh.geometry.attributes.size.needsUpdate = true;
    }
}

export class SpaceEnvironment {
    constructor(scene) {
        this.scene = scene;
        this.asteroids = [];
        this.chunkSize = 100;
        this.lastChunkZ = -100; 
        
        this.initStars();
    }

    initStars() {
        const count = 4000;
        const geo = new THREE.BufferGeometry();
        const pos = [];
        
        // Create a deep starfield
        for(let i=0; i<count; i++) {
            const r = 4000 + Math.random() * 4000; 
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            pos.push(
                r * Math.sin(phi) * Math.cos(theta),
                r * Math.sin(phi) * Math.sin(theta),
                r * Math.cos(phi)
            );
        }
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        
        const mat = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 15.0, // Increased size for attenuation
            sizeAttenuation: true, // Enable perspective scaling to reduce pixel flicker
            fog: false // Stars remain bright
        });
        
        this.stars = new THREE.Points(geo, mat);
        this.stars.frustumCulled = false; 
        this.stars.renderOrder = -1; 
        this.scene.add(this.stars);
    }

    createAsteroid(zCenter, isInterceptor = false, targetPos = null, targetVel = null) {
        // More detailed mesh
        const radius = isInterceptor ? 3 + Math.random() * 2 : 4 + Math.random() * 8;
        const detail = 1; 
        const geo = new THREE.IcosahedronGeometry(radius, detail);
        
        // Vertex displacement for detailed rock shape
        const posAttribute = geo.attributes.position;
        const vector = new THREE.Vector3();
        
        for (let i = 0; i < posAttribute.count; i++) {
            vector.fromBufferAttribute(posAttribute, i);
            const noise = 1 + 0.3 * Math.sin(vector.x * 0.5 + vector.z * 0.3) 
                          + 0.2 * Math.cos(vector.y * 0.8) 
                          + 0.1 * Math.sin(vector.x * 2.5); // Multi-freq noise
            vector.multiplyScalar(noise);
            posAttribute.setXYZ(i, vector.x, vector.y, vector.z);
        }
        geo.computeVertexNormals();

        const mat = new THREE.MeshStandardMaterial({
            color: 0x665555,
            roughness: 0.8,
            metalness: 0.2,
            flatShading: true
        });

        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        
        const wrapper = {
            mesh: mesh,
            velocity: new THREE.Vector3(),
            rotSpeed: new THREE.Vector3(
                (Math.random()-0.5), (Math.random()-0.5), (Math.random()-0.5)
            ),
            radius: radius,
            isInterceptor: isInterceptor
        };

        if (isInterceptor && targetPos) {
            // Spawn relative to target to ensure hit
            const angle = Math.random() * Math.PI * 2;
            const dist = 70; // Spawn distance
            // Spawn from below/side
            const spawnOffset = new THREE.Vector3(
                Math.cos(angle) * dist,
                -30 - Math.random() * 20,
                Math.sin(angle) * dist
            );
            
            mesh.position.copy(targetPos).add(spawnOffset);
            
            // Calculate velocity to hit target in ~1.0 seconds
            // Predict target location (with gravity approx)
            const interceptTime = 1.0;
            const futurePos = targetPos.clone().add(targetVel.clone().multiplyScalar(interceptTime));
            futurePos.y -= 40; // Rough gravity approximation

            const dir = new THREE.Vector3().subVectors(futurePos, mesh.position).normalize();
            const speed = mesh.position.distanceTo(futurePos) / interceptTime;
            wrapper.velocity.copy(dir).multiplyScalar(speed);
            
        } else {
            // Background drift
            // Avoid center channel to prevent camera clipping
            let x = (Math.random() - 0.5) * 500; 
            if (Math.abs(x) < 50) x += (x > 0 ? 50 : -50);

            // Push background much deeper
            const y = -300 - Math.random() * 400; 
            const z = zCenter + (Math.random() - 0.5) * this.chunkSize;
            
            mesh.position.set(x, y, z);
            mesh.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI);
            const s = 1 + Math.random();
            mesh.scale.set(s, s, s);

            // Drift velocity
            wrapper.velocity.set(
                (Math.random()-0.5) * 8,
                (Math.random()-0.5) * 4,
                (Math.random()-0.5) * 8
            );
        }

        return wrapper;
    }

    generateChunk(z) {
        const count = 5 + Math.floor(Math.random() * 5);
        for(let i=0; i<count; i++) {
            const wrapper = this.createAsteroid(z);
            this.scene.add(wrapper.mesh);
            this.asteroids.push(wrapper);
        }
    }

    spawnInterceptor(targetPos, targetVel) {
        const wrapper = this.createAsteroid(0, true, targetPos, targetVel);
        this.scene.add(wrapper.mesh);
        this.asteroids.push(wrapper);
    }

    spawnAsteroidField(centerPos) {
        // Create a dense cluster below the track where the player is falling
        const count = 25;
        for(let i=0; i<count; i++) {
            const wrapper = this.createAsteroid(centerPos.z); 
            
            const angle = Math.random() * Math.PI * 2;
            const r = Math.random() * 60; 
            // Push spawn point lower to avoid camera clipping
            const yOffset = -60 - Math.random() * 150; 
            
            wrapper.mesh.position.set(
                centerPos.x + Math.cos(angle) * r,
                centerPos.y + yOffset,
                centerPos.z + Math.sin(angle) * r
            );
            
            // Minimal drift
            wrapper.velocity.set(
                (Math.random()-0.5) * 2, 
                (Math.random()-0.5) * 2, 
                (Math.random()-0.5) * 2
            );
            
            // Reduced scale to prevent massive asteroids
            const s = 1.0 + Math.random() * 1.0;
            wrapper.mesh.scale.set(s, s, s);
            wrapper.radius *= s;
            
            this.scene.add(wrapper.mesh);
            this.asteroids.push(wrapper);
        }
    }

    update(dt, cameraPos) {
        // Subtle star drift; keep starfield static in world space to avoid jitter tied to camera movement
        // We move the starfield container with the camera to simulate infinite distance (skybox effect)
        this.stars.position.copy(cameraPos);
        this.stars.rotation.y += dt * 0.01;

        // Generate Asteroids ahead
        const leadZ = cameraPos.z + 300;
        while (this.lastChunkZ < leadZ) {
            this.lastChunkZ += this.chunkSize;
            this.generateChunk(this.lastChunkZ);
        }

        // Cleanup and Physics
        const trailZ = cameraPos.z - 200;
        for (let i = this.asteroids.length - 1; i >= 0; i--) {
            const ast = this.asteroids[i];
            
            // Move
            ast.mesh.position.add(ast.velocity.clone().multiplyScalar(dt));
            
            // Rotate
            ast.mesh.rotation.x += ast.rotSpeed.x * dt;
            ast.mesh.rotation.y += ast.rotSpeed.y * dt;
            ast.mesh.rotation.z += ast.rotSpeed.z * dt;

            // Cleanup behind (ignore interceptors to ensure they hit)
            if (!ast.isInterceptor && ast.mesh.position.z < trailZ) {
                this.scene.remove(ast.mesh);
                ast.mesh.geometry.dispose();
                ast.mesh.material.dispose();
                this.asteroids.splice(i, 1);
            }
        }
    }
    
    checkCollisions(playerPos, playerRadius = 2.0) {
        for(const ast of this.asteroids) {
            const dist = ast.mesh.position.distanceTo(playerPos);
            // Generous hitbox for the asteroid (using its radius * scale)
            // Assuming scale is roughly 1.0-2.0, average 1.5
            const hitDist = (ast.radius * ast.mesh.scale.x * 0.9) + playerRadius;
            if (dist < hitDist) {
                return true;
            }
        }
        return false;
    }
    
    reset() {
        for(const ast of this.asteroids) {
            this.scene.remove(ast.mesh);
            ast.mesh.geometry.dispose();
            ast.mesh.material.dispose();
        }
        this.asteroids = [];
        this.lastChunkZ = -100;
    }
}