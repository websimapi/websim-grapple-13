import * as THREE from 'three';
import { isPointOnOBB } from './utils.js';
import { TrackFactory } from './track_factory.js';
import { TrackGenerator } from './track_generator.js';

export class TrackManager {
    constructor(scene) {
        this.scene = scene;
        this.segments = [];
        this.posts = [];
        this.width = 12; 

        // Refactoring: Use Factory and Generator
        this.factory = new TrackFactory();
        this.generator = new TrackGenerator(this);

        // Initial generation state
        this.currentPos = new THREE.Vector3(0, 0, 0);
        this.currentDir = new THREE.Vector3(0, 0, 1); // Moving +Z (Horizontal heading)
        this.segmentLength = 50;

        // Build initial straight
        this.addSegment({ type: 'straight', length: 80, slope: 0 });
        this.generateNextSegment();
        this.generateNextSegment();
        this.generateNextSegment();
        this.generateNextSegment(); // Add a few more for buffer
    }

    addSegment(params) {
        const { type, length = 50, turnDir = 1, angle = Math.PI / 2, slope = 0 } = params;

        // Calculate dimensions based on slope
        const horizLength = length * Math.cos(slope);
        const vertHeight = length * Math.sin(slope);

        const seg = {
            type: type,
            start: this.currentPos.clone(),
            dir: this.currentDir.clone(), // This is the horizontal heading
            length: length,
            horizLength: horizLength,
            width: this.width,
            mesh: null,
            angle: 0, // Yaw
            slope: slope // Pitch
        };

        // Visuals delegated to factory
        const mesh = this.factory.createRoadMesh(this.width, length);
        
        // Orient the mesh
        // 1. Position at midpoint
        const halfHoriz = this.currentDir.clone().multiplyScalar(horizLength / 2);
        const midpoint = this.currentPos.clone().add(halfHoriz);
        midpoint.y += vertHeight / 2;
        
        mesh.position.copy(midpoint);

        // 2. Rotate
        // Use YXZ order to prevent gimbal lock issues and ensure correct orientation
        // Yaw (Y) first to face direction, then Pitch (X) for slope
        mesh.rotation.order = 'YXZ';
        mesh.rotation.y = Math.atan2(this.currentDir.x, this.currentDir.z) + Math.PI;
        mesh.rotation.x = -Math.PI / 2 + slope;

        seg.angle = mesh.rotation.y; // Yaw

        this.scene.add(mesh);
        seg.mesh = mesh;
        this.segments.push(seg);

        // Update Head
        this.currentPos.add(this.currentDir.clone().multiplyScalar(horizLength));
        this.currentPos.y += vertHeight;

        // Turns and Corners
        if (type === 'turn') {
            // Corner implementation: delegated mesh creation
            const cornerMesh = this.factory.createCornerMesh(this.width);
            
            const cornerCenterOffset = this.currentDir.clone().multiplyScalar(this.width / 2);
            const cornerCenter = this.currentPos.clone().add(cornerCenterOffset);
            
            cornerMesh.rotation.order = 'YXZ';
            cornerMesh.rotation.y = Math.atan2(this.currentDir.x, this.currentDir.z) + Math.PI;
            cornerMesh.rotation.x = -Math.PI / 2; // Flat

            cornerMesh.position.copy(cornerCenter);
            cornerMesh.position.y = this.currentPos.y; // Flatten out at the joint
            
            this.scene.add(cornerMesh);

            this.segments.push({
                type: 'corner',
                mesh: cornerMesh,
                start: this.currentPos.clone(),
                dir: this.currentDir.clone(),
                length: this.width,
                width: this.width,
                angle: seg.angle,
                slope: 0
            });

            // Add Post
            this.addPost(cornerCenter, turnDir);

            // Update state for next segment
            this.currentPos.add(cornerCenterOffset); // Move to center of corner
            
            // Rotate direction
            const rotationAxis = new THREE.Vector3(0, 1, 0);
            this.currentDir.applyAxisAngle(rotationAxis, turnDir * angle); 
            
            // Move to edge of corner in new direction
            this.currentPos.add(this.currentDir.clone().multiplyScalar(this.width / 2));
        }
    }

    addPost(centerPos, turnDir) {
        // Perpendicular vector
        const perp = new THREE.Vector3(-this.currentDir.z, 0, this.currentDir.x);
        // Vector to inner corner
        const cornerVector = perp.clone().multiplyScalar(-turnDir).sub(this.currentDir).normalize();
        
        const postPos = centerPos.clone();
        postPos.add(cornerVector.multiplyScalar(12));
        
        // Adjust post height to match road
        postPos.y += 2; 

        // delegated post mesh creation
        const post = this.factory.createPostMesh();
        post.position.copy(postPos);
        this.scene.add(post);

        this.posts.push({
            mesh: post,
            position: postPos,
            active: true
        });
    }

    checkCollision(box, height) {
        // Simple collision check against existing segments
        // box: { center, width, length, angle } (XZ)
        // height: y level
        // We only care if we are overlapping in XZ AND close in Y.
        
        // Optimisation: only check last 50 segments
        const checkCount = Math.min(this.segments.length, 100);
        const start = Math.max(0, this.segments.length - checkCount);
        
        for (let i = start; i < this.segments.length - 2; i++) { // Don't check immediate neighbors
            const seg = this.segments[i];
            
            // STRICT COLLISION CHECK: Prevent any XZ overlap regardless of height
            // We removed the 'isOverpass' check to prevent visual obstruction/stacking

            // Check XZ overlap
            const dist = new THREE.Vector2(box.center.x, box.center.z).distanceTo(new THREE.Vector2(seg.mesh.position.x, seg.mesh.position.z));
            const maxRadius = Math.max(box.length, seg.length) / 2 + Math.max(box.width, seg.width) / 2;
            
            if (dist < maxRadius) {
                // Potential overlap, assume collision
                return true;
            }
        }
        return false;
    }

    generateNextSegment() {
        const selectedParams = this.generator.generate();
        this.addSegment(selectedParams);
    }

    getTrackState(position) {
        // Return { onTrack: bool, height: number, slope: number }
        // Iterate segments to find which one we are on.
        // We might be on multiple in XZ (overpass). Pick the closest Y.
        
        // Only check nearby segments
        const checkCount = Math.min(this.segments.length, 30);
        const startIndex = Math.max(0, this.segments.length - checkCount);

        let bestSeg = null;
        let bestY = -Infinity;
        let minDistY = Infinity;

        for (let i = startIndex; i < this.segments.length; i++) {
            const seg = this.segments[i];
            
            // 1. Broad Phase: Vertical Range
            // A segment spans from start.y to start.y + length*sin(slope)
            const y1 = seg.start.y;
            const y2 = y1 + seg.length * Math.sin(seg.slope);
            const minY = Math.min(y1, y2) - 5;
            const maxY = Math.max(y1, y2) + 5;
            
            if (position.y < minY || position.y > maxY) continue;

            // 2. Narrow Phase: OBB in XZ
            if (isPointOnOBB(position, seg.mesh.position, seg.width + 2, seg.horizLength || seg.length, seg.angle)) {
                
                // 3. Calculate exact height at this XZ
                // Project position onto the segment line/plane
                // Distance from start along dir
                const vecToPos = new THREE.Vector2(position.x - seg.start.x, position.z - seg.start.z);
                const dir2D = new THREE.Vector2(seg.dir.x, seg.dir.z); // Normalized horizontal dir
                const distAlong = vecToPos.dot(dir2D);
                
                // Height = startY + distAlong * tan(slope)
                // Use tan because slope is angle of pitch. 
                // However, we used mesh.rotation.x = slope. 
                // Vertical rise = horizontal_dist * tan(slope).
                const exactY = seg.start.y + distAlong * Math.tan(seg.slope);
                
                const distY = Math.abs(position.y - exactY);
                
                // Pick the segment closest to car vertically
                if (distY < minDistY) {
                    minDistY = distY;
                    bestY = exactY;
                    bestSeg = seg;
                }
            }
        }

        if (bestSeg && minDistY < 8) { // 8 units vertical snap tolerance
            return { 
                onTrack: true, 
                height: bestY, 
                slope: bestSeg.slope, 
                segment: bestSeg 
            };
        }

        // Check Posts (Collision spheres for cornering forgiveness)
        for(let p of this.posts) {
            if (position.distanceTo(p.position) < this.width * 1.5) {
                // If near post, maintain current height? Or post height?
                // Return 'onTrack' but no specific height control (free fly) or keep level
                return { onTrack: true, height: position.y, slope: 0 };
            }
        }

        return { onTrack: false };
    }

    // Deprecated but kept for compatibility if needed, aliased to getTrackState
    isOnTrack(position) {
        return this.getTrackState(position).onTrack;
    }
    
    getNearestPost(position) {
        let nearest = null;
        let minDist = Infinity;
        const checkCount = Math.min(this.posts.length, 20);
        const startIndex = this.posts.length - checkCount;
        for (let i = startIndex; i < this.posts.length; i++) {
            const post = this.posts[i];
            
            // Filter out posts that are on different height levels (overpasses/underpasses)
            if (Math.abs(post.position.y - position.y) > 15) continue;

            const dist = position.distanceTo(post.position);
            if (dist < minDist) {
                minDist = dist;
                nearest = post;
            }
        }
        return { post: nearest, distance: minDist };
    }

    getTrackBounds() {
        if (this.segments.length === 0) return null;
        
        let minX = Infinity, maxX = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;
        
        // Iterate all segments to find the full map extent
        for(const seg of this.segments) {
            const x = seg.mesh.position.x;
            const z = seg.mesh.position.z;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (z < minZ) minZ = z;
            if (z > maxZ) maxZ = z;
        }
        
        const center = new THREE.Vector3((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
        const maxDim = Math.max(maxX - minX, maxZ - minZ);
        
        return { center, maxDim };
    }
}