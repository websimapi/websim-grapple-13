export class InputManager {
    constructor(domElement) {
        this.domElement = domElement;
        this.mouseDown = false;
        
        this._initListeners();
    }

    _initListeners() {
        window.addEventListener('mousedown', () => this.mouseDown = true);
        window.addEventListener('mouseup', () => this.mouseDown = false);
        
        const touchHandler = (e, state) => {
            const target = e.target;
            if (target === this.domElement || target.closest('#game-container')) {
                e.preventDefault();
                this.mouseDown = state;
            }
        };

        window.addEventListener('touchstart', (e) => touchHandler(e, true), {passive: false});
        window.addEventListener('touchend', (e) => touchHandler(e, false), {passive: false});
    }
}

