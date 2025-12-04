export class ReplayRecorder {
    constructor(canvas, audioListener) {
        this.canvas = canvas;
        this.audioListener = audioListener;
        this.mediaRecorder = null;
        this.chunks = [];
        this.isRecording = false;
        this.stream = null;
        this.audioDest = null;
    }

    start() {
        if (this.isRecording) return;
        
        if (!this.canvas.captureStream) {
            console.warn('Canvas captureStream not supported');
            return;
        }

        try {
            this.chunks = [];
            
            // 1. Audio Setup
            const ctx = this.audioListener.context;
            this.audioDest = ctx.createMediaStreamDestination();
            // Connect the listener's input (master) to our destination
            // Note: This connects in parallel to the default destination (speakers)
            this.audioListener.gain.connect(this.audioDest);

            // 2. Video Setup (30 FPS)
            const canvasStream = this.canvas.captureStream(30);
            
            // 3. Combine Tracks
            const tracks = [
                ...canvasStream.getVideoTracks(),
                ...this.audioDest.stream.getAudioTracks()
            ];
            
            // 4. Determine MimeType
            const mimeTypes = [
                'video/webm;codecs=vp9',
                'video/webm;codecs=vp8',
                'video/webm',
                'video/mp4'
            ];
            
            let mimeType = '';
            for (const type of mimeTypes) {
                if (MediaRecorder.isTypeSupported(type)) {
                    mimeType = type;
                    break;
                }
            }

            if (!mimeType) {
                console.warn('No supported MediaRecorder mimeType found.');
                return;
            }

            this.stream = new MediaStream(tracks);
            this.mediaRecorder = new MediaRecorder(this.stream, { mimeType, videoBitsPerSecond: 2500000 }); // 2.5Mbps
            
            this.mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    this.chunks.push(e.data);
                }
            };

            this.mediaRecorder.start();
            this.isRecording = true;
            console.log('Recording started', mimeType);

        } catch (e) {
            console.error('Failed to start recording:', e);
            this.isRecording = false;
        }
    }

    async stop() {
        if (!this.isRecording || !this.mediaRecorder) return null;

        return new Promise((resolve) => {
            this.mediaRecorder.onstop = () => {
                const blob = new Blob(this.chunks, { type: this.mediaRecorder.mimeType });
                const url = URL.createObjectURL(blob);
                
                // Cleanup
                this.isRecording = false;
                try {
                    this.audioListener.gain.disconnect(this.audioDest);
                    this.stream.getTracks().forEach(track => track.stop());
                } catch(e) { console.error(e); }
                
                resolve({ blob, url });
            };

            this.mediaRecorder.stop();
        });
    }
}