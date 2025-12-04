import * as THREE from 'three';

export class TrackFactory {
    constructor() {
        const loader = new THREE.TextureLoader();
        
        // Road Texture
        this.roadTexture = loader.load('./asphalt_tile.png');
        this.roadTexture.wrapS = THREE.RepeatWrapping;
        this.roadTexture.wrapT = THREE.RepeatWrapping;
        this.roadTexture.repeat.set(1, 4);
        
        // Texture Filtering for smoother look
        this.roadTexture.minFilter = THREE.LinearMipmapLinearFilter;
        this.roadTexture.magFilter = THREE.LinearFilter;
        this.roadTexture.anisotropy = 16; 

        this.roadMat = new THREE.MeshStandardMaterial({ 
            map: this.roadTexture,
            roughness: 0.4, 
            metalness: 0.1, 
            color: 0x666666
        });

        // Post Assets
        const postTexture = loader.load('./post_texture.png');
        this.postGeo = new THREE.CylinderGeometry(0.8, 0.8, 6, 16);
        this.postMat = new THREE.MeshStandardMaterial({ 
            map: postTexture,
            color: 0xffffff, 
            emissive: 0xff4400,
            emissiveIntensity: 1.5,
            metalness: 0.8,
            roughness: 0.2
        });
    }

    createRoadMesh(width, length) {
        const geo = new THREE.PlaneGeometry(width, length);

        // Fix texture tiling based on length to prevent stretching
        const uvs = geo.attributes.uv;
        const tileFactor = length / 20; // 20 units per tile repeat
        for (let i = 0; i < uvs.count; i++) {
            uvs.setY(i, uvs.getY(i) * tileFactor);
        }
        geo.attributes.uv.needsUpdate = true;

        return new THREE.Mesh(geo, this.roadMat);
    }

    createCornerMesh(width) {
        const cornerGeo = new THREE.PlaneGeometry(width, width);
        return new THREE.Mesh(cornerGeo, this.roadMat);
    }

    createPostMesh() {
        return new THREE.Mesh(this.postGeo, this.postMat);
    }
}