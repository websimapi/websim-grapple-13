import * as THREE from 'three';

export function createCarBody() {
    const mesh = new THREE.Group();

    // Car Dimensions
    const width = 1.8;
    const length = 4.2;
    const height = 0.8;

    // Materials
    const bodyMat = new THREE.MeshStandardMaterial({ 
        color: 0x111111, 
        metalness: 0.9, 
        roughness: 0.2,
    });  
    
    const cabinMat = new THREE.MeshPhysicalMaterial({ 
        color: 0x000000,
        metalness: 1.0,
        roughness: 0.0,
        transmission: 0.2, // Looks like dark glass
        reflectivity: 1.0
    });

    const neonCyan = new THREE.MeshBasicMaterial({ color: 0x00ffff });
    const neonMagenta = new THREE.MeshBasicMaterial({ color: 0xff00ff });
    const tailLightMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const headLightMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

    // 1. Main Chassis
    const chassisGeo = new THREE.BoxGeometry(width, height, length);
    const chassis = new THREE.Mesh(chassisGeo, bodyMat);
    chassis.position.y = height / 2 + 0.3; // Lift off ground
    chassis.castShadow = true;
    mesh.add(chassis);

    // 2. Cabin / Cockpit
    const cabinGeo = new THREE.BoxGeometry(width * 0.7, height * 0.6, length * 0.4);
    const cabin = new THREE.Mesh(cabinGeo, cabinMat);
    cabin.position.set(0, height + 0.3 + (height * 0.3), -0.2);
    mesh.add(cabin);

    // 3. Side Pontoons / Fenders (Wider lower body)
    const fenderGeo = new THREE.BoxGeometry(width + 0.4, height * 0.6, length);
    const fender = new THREE.Mesh(fenderGeo, bodyMat);
    fender.position.set(0, 0.5, 0);
    mesh.add(fender);

    // 4. Wheels
    const wheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.4, 16);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });  
    
    const wheelPositions = [
        [-0.9, 0.4, 1.2], // FL
        [0.9, 0.4, 1.2],  // FR
        [-0.9, 0.4, -1.2], // RL
        [0.9, 0.4, -1.2]   // RR
    ];

    wheelPositions.forEach(pos => {
        const wheel = new THREE.Mesh(wheelGeo, wheelMat);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(...pos);
        mesh.add(wheel);
    });

    // 5. Neon Strips
    const stripGeo = new THREE.BoxGeometry(0.1, 0.1, length * 0.9);
    
    const leftStrip = new THREE.Mesh(stripGeo, neonCyan);
    leftStrip.position.set(-width/2 - 0.2, 0.8, 0);
    mesh.add(leftStrip);

    const rightStrip = new THREE.Mesh(stripGeo, neonMagenta);
    rightStrip.position.set(width/2 + 0.2, 0.8, 0);
    mesh.add(rightStrip);

    // 6. Lights
    const headLightGeo = new THREE.BoxGeometry(0.4, 0.2, 0.1);
    const hlLeft = new THREE.Mesh(headLightGeo, headLightMat);
    hlLeft.position.set(-0.5, 0.7, length/2);
    mesh.add(hlLeft);

    const hlRight = new THREE.Mesh(headLightGeo, headLightMat);
    hlRight.position.set(0.5, 0.7, length/2);
    mesh.add(hlRight);

    const tailLightGeo = new THREE.BoxGeometry(0.3, 0.2, 0.1);
    const tlLeft = new THREE.Mesh(tailLightGeo, tailLightMat);
    tlLeft.position.set(-0.6, 0.8, -length/2);
    mesh.add(tlLeft);

    const tlRight = new THREE.Mesh(tailLightGeo, tailLightMat);
    tlRight.position.set(0.6, 0.8, -length/2);
    mesh.add(tlRight);

    // Spoiler
    const spoilerGeo = new THREE.BoxGeometry(width + 0.4, 0.1, 0.8);
    const spoiler = new THREE.Mesh(spoilerGeo, bodyMat);
    spoiler.position.set(0, 1.2, -length/2 + 0.2);
    mesh.add(spoiler);

    const spoilerPostGeo = new THREE.BoxGeometry(0.1, 0.4, 0.4);
    const spLeft = new THREE.Mesh(spoilerPostGeo, bodyMat);
    spLeft.position.set(-0.6, 1.0, -length/2 + 0.4);
    mesh.add(spLeft);
    
    const spRight = new THREE.Mesh(spoilerPostGeo, bodyMat);
    spRight.position.set(0.6, 1.0, -length/2 + 0.4);
    mesh.add(spRight);


    // Real Lights
    const light = new THREE.SpotLight(0xffffff, 20, 80, 0.6, 0.5, 1);
    light.position.set(0, 2, 0);
    light.target.position.set(0, 0, 15);
    mesh.add(light);
    mesh.add(light.target);

    // Engine Glow
    const engineLight = new THREE.PointLight(0x00ffff, 2, 5);
    engineLight.position.set(0, 0.5, -1.5);
    mesh.add(engineLight);

    return mesh;
}

export function createHookMesh() {
    const hookMesh = new THREE.Group();
    
    // Shaft
    const shaftGeo = new THREE.CylinderGeometry(0.15, 0.15, 1.0, 8);
    shaftGeo.rotateX(-Math.PI / 2); // Align with Z
    const shaftMat = new THREE.MeshStandardMaterial({ 
        color: 0x222222, 
        metalness: 0.9, 
        roughness: 0.1 
    });
    const shaft = new THREE.Mesh(shaftGeo, shaftMat);
    hookMesh.add(shaft);

    // Claws
    const clawMat = new THREE.MeshStandardMaterial({ 
        color: 0x00ffff, 
        emissive: 0x004444,
        metalness: 0.8, 
        roughness: 0.2 
    });
    
    // Create 3 Claws
    for(let i=0; i<3; i++) {
        const pivot = new THREE.Group();
        pivot.rotation.z = (i / 3) * Math.PI * 2;
        
        const clawGeo = new THREE.BoxGeometry(0.12, 0.6, 0.12);
        // Bend/Angle the claw
        clawGeo.translate(0, 0.3, 0); // Pivot at base
        
        const claw = new THREE.Mesh(clawGeo, clawMat);
        claw.rotation.x = Math.PI / 3; // Open angle
        claw.position.z = 0.2; // Offset from shaft center
        
        pivot.add(claw);
        hookMesh.add(pivot);
    }
    
    // Glowing Core / Magnet
    const coreGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.3, 16);
    coreGeo.rotateX(-Math.PI / 2);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
    const core = new THREE.Mesh(coreGeo, coreMat);
    hookMesh.add(core);

    return hookMesh;
}

export function createGrappleRope() {
    // 2. Thick Grapple Rope (Tube/Cylinder)
    // Geometry designed to be scaled along Z axis
    const ropeGeo = new THREE.CylinderGeometry(0.06, 0.06, 1, 8);
    ropeGeo.translate(0, 0.5, 0); // Pivot at bottom
    ropeGeo.rotateX(Math.PI / 2); // Align Y to Z
    
    const ropeMat = new THREE.MeshStandardMaterial({ 
        color: 0x00ffff,
        emissive: 0x00aaaa,
        emissiveIntensity: 1.0,
        roughness: 0.4,
        metalness: 0.5
    });

    const grappleRope = new THREE.Mesh(ropeGeo, ropeMat);
    grappleRope.frustumCulled = false; // Important: prevent disappearing when stretching
    return grappleRope;
}