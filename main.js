import { Game } from './game.js';

window.onload = () => {
    const game = new Game();
    const startScreen = document.getElementById('start-screen');
    const startBtn = document.getElementById('start-btn');

    startBtn.addEventListener('click', () => {
        startScreen.classList.add('hidden');
        game.start();
    });
};

