// ============================================
// VECTOR VELOCITY RUN - GAME ENGINE V2
// ============================================

// Game Configuration
const CONFIG = {
    LANES: 3,
    LANE_WIDTH: window.innerWidth < 768 ? 120 : 200,
    INITIAL_SPEED: 5,
    SPEED_INCREMENT: 0.3,
    MAX_SPEED: 12,
    PLAYER_SIZE: 60,
    OBSTACLE_HEIGHT: 120,
    OBSTACLE_WIDTH: 80,
    POINTS_PER_CORRECT: 100,
    LANE_SWITCH_SPEED: 0.2,
    INITIAL_LIVES: 5,
    QUESTION_TIME: 18, // seconds
    OBSTACLE_PHASE_DURATION: 10, // seconds
    SPEED_INCREASE_INTERVAL: 5 // every 5 questions
};

// Game State
const GAME_STATE = {
    MENU: 'menu',
    PLAYING: 'playing',
    PAUSED_FEEDBACK: 'paused_feedback',
    GAME_OVER: 'gameover'
};

// Game Phase
const GAME_PHASE = {
    OBSTACLE: 'obstacle',
    QUESTION: 'question'
};

// ============================================
// GAME CLASS
// ============================================
class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.state = GAME_STATE.MENU;
        this.phase = GAME_PHASE.OBSTACLE;
        this.score = 0;
        this.speed = CONFIG.INITIAL_SPEED;
        this.lives = CONFIG.INITIAL_LIVES;
        this.highScore = this.loadHighScore();
        this.questions = [];
        this.currentQuestion = null;
        this.player = null;
        this.obstacles = [];
        this.distance = 0;
        this.keys = {};
        this.phaseTimer = 0;
        this.questionTimer = 0;
        this.answeredQuestions = [];
        this.correctAnswers = 0;
        this.incorrectAnswers = 0;
        this.totalQuestionsAnswered = 0;
        this.lastFrameTime = 0;
        this.selectedAnswer = null;
        this.answerLocked = false;
        this.showingPreview = false;
        this.previewSpawned = false;

        this.setupCanvas();
        this.setupEventListeners();
        this.loadQuestions();
        this.updateHighScoreDisplay();
    }

    setupCanvas() {
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    setupEventListeners() {
        // Keyboard controls
        document.addEventListener('keydown', (e) => {
            this.keys[e.key] = true;
            if (this.state === GAME_STATE.PLAYING) {
                if (e.key === 'ArrowLeft') this.player.moveLeft();
                if (e.key === 'ArrowRight') this.player.moveRight();
            }
        });

        document.addEventListener('keyup', (e) => {
            this.keys[e.key] = false;
        });

        // Swipe controls (Subway Surfers style) - prevent double tap acceleration
        let touchStartX = 0;
        let touchStartY = 0;
        let touchStartTime = 0;
        const SWIPE_THRESHOLD = 30; // min pixels to count as a swipe

        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault(); // prevent double-tap zoom
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            touchStartTime = Date.now();
        }, { passive: false });

        this.canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            if (this.state !== GAME_STATE.PLAYING || this.phase !== GAME_PHASE.OBSTACLE) return;
            const dx = e.changedTouches[0].clientX - touchStartX;
            const dy = e.changedTouches[0].clientY - touchStartY;
            const elapsed = Date.now() - touchStartTime;
            // Only count as swipe if horizontal movement dominates and fast enough
            if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy) && elapsed < 400) {
                if (dx < 0) {
                    this.player.moveLeft();
                } else {
                    this.player.moveRight();
                }
            }
        }, { passive: false });

        // UI Buttons
        document.getElementById('startButton').addEventListener('click', () => this.startGame());
        document.getElementById('restartButton').addEventListener('click', () => this.startGame());
        document.getElementById('menuButton').addEventListener('click', () => this.showMenu());
        document.getElementById('continueButton').addEventListener('click', () => this.continueAfterFeedback());

        // Answer buttons (will be set up when question appears)
        this.setupAnswerButtons();
    }

    setupAnswerButtons() {
        for (let i = 0; i < 3; i++) {
            const btn = document.getElementById(`lane${i}Answer`);
            if (btn) {
                btn.addEventListener('click', () => this.selectAnswer(i));
            }
        }
    }

    selectAnswer(answerIndex) {
        if (this.phase !== GAME_PHASE.QUESTION || this.answerLocked) return;

        this.selectedAnswer = answerIndex;
        this.answerLocked = true;

        // Visual feedback
        document.querySelectorAll('.lane-answer').forEach((el, idx) => {
            el.classList.remove('selected');
            if (idx === answerIndex) {
                el.classList.add('selected');
            }
        });

        // Evaluate immediately
        const isCorrect = this.selectedAnswer === this.currentQuestion.respuesta_correcta_index;
        if (isCorrect) {
            this.handleCorrectAnswer();
        } else {
            this.handleIncorrectAnswer();
        }
    }

    async loadQuestions() {
        try {
            const response = await fetch('questions.json');
            const data = await response.json();
            this.questions = data.banco_preguntas;
        } catch (error) {
            console.error('Error loading questions:', error);
            this.questions = [
                {
                    id: 1,
                    pregunta: "¿Cuál es la magnitud del vector u = (3, 4)?",
                    opciones: ["5", "7", "25"],
                    respuesta_correcta_index: 0,
                    feedback: "¡Correcto! Usaste el teorema de Pitágoras: √(3² + 4²) = 5."
                }
            ];
        }
    }

    loadHighScore() {
        return parseInt(localStorage.getItem('vectorVelocityHighScore') || '0');
    }

    saveHighScore() {
        localStorage.setItem('vectorVelocityHighScore', this.highScore.toString());
    }

    updateHighScoreDisplay() {
        document.getElementById('highScoreDisplay').textContent = this.highScore;
    }

    getRandomQuestion() {
        const randomIndex = Math.floor(Math.random() * this.questions.length);
        return JSON.parse(JSON.stringify(this.questions[randomIndex])); // Deep copy
    }

    startGame() {
        this.state = GAME_STATE.PLAYING;
        this.phase = GAME_PHASE.OBSTACLE;
        this.score = 0;
        this.speed = CONFIG.INITIAL_SPEED;
        this.lives = CONFIG.INITIAL_LIVES;
        this.distance = 0;
        this.obstacles = [];
        this.phaseTimer = 0;
        this.questionTimer = 0;
        this.answeredQuestions = [];
        this.correctAnswers = 0;
        this.incorrectAnswers = 0;
        this.totalQuestionsAnswered = 0;
        this.selectedAnswer = null;
        this.answerLocked = false;
        this.showingPreview = false;
        this.previewSpawned = false;
        this.player = new Player(this);
        this.currentQuestion = null;

        this.showScreen('gameScreen');
        this.hideQuestionPanel();
        this.hideFeedbackModal();
        this.updateUI();
        this.lastFrameTime = performance.now();
        this.gameLoop();
    }

    showMenu() {
        this.state = GAME_STATE.MENU;
        this.showScreen('startScreen');
        this.updateHighScoreDisplay();
    }

    showGameOver() {
        this.state = GAME_STATE.GAME_OVER;

        // Update high score
        if (this.score > this.highScore) {
            this.highScore = this.score;
            this.saveHighScore();
        }

        // Update UI
        document.getElementById('finalScore').textContent = this.score;
        document.getElementById('finalHighScore').textContent = this.highScore;
        document.getElementById('totalQuestionsAnswered').textContent = this.totalQuestionsAnswered;
        document.getElementById('correctAnswersCount').textContent = this.correctAnswers;
        document.getElementById('incorrectAnswersCount').textContent = this.incorrectAnswers;

        // Show all answered questions
        this.displayAnsweredQuestions();

        this.showScreen('gameOverScreen');
    }

    displayAnsweredQuestions() {
        const container = document.getElementById('answeredQuestionsList');
        container.innerHTML = '';

        this.answeredQuestions.forEach((qa, index) => {
            const div = document.createElement('div');
            div.className = `question-review ${qa.correct ? 'correct' : 'incorrect'}`;
            div.innerHTML = `
                <div class="review-number">${index + 1}</div>
                <div class="review-content">
                    <div class="review-question">${qa.question}</div>
                    <div class="review-answer">Tu respuesta: ${qa.userAnswer} ${qa.correct ? '✓' : '✗'}</div>
                    ${!qa.correct ? `<div class="review-correct">Correcta: ${qa.correctAnswer}</div>` : ''}
                    <div class="review-feedback">${qa.feedback}</div>
                </div>
            `;
            container.appendChild(div);
        });
    }

    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        document.getElementById(screenId).classList.add('active');
    }

    showQuestionPanel() {
        document.getElementById('questionDisplay').classList.add('visible');
    }

    hideQuestionPanel() {
        document.getElementById('questionDisplay').classList.remove('visible');
    }

    showFeedbackModal(correct, userAnswer, correctAnswer) {
        const modal = document.getElementById('feedbackModal');
        const title = document.getElementById('feedbackTitle');
        const message = document.getElementById('feedbackText');

        if (correct) {
            title.textContent = '¡CORRECTO! ✓';
            title.className = 'feedback-modal-title correct';
            message.innerHTML = `
                <p style="font-size: 1.3rem; margin-bottom: 1rem;">Tu respuesta: <strong>${userAnswer}</strong></p>
                <p>${this.currentQuestion.feedback}</p>
            `;
        } else {
            title.textContent = '¡INCORRECTO! ✗';
            title.className = 'feedback-modal-title incorrect';
            message.innerHTML = `
                <p style="font-size: 1.2rem; margin-bottom: 0.8rem;">❌ Tu respuesta: <strong style="color: var(--neon-orange);">${userAnswer}</strong></p>
                <p style="font-size: 1.2rem; margin-bottom: 1.2rem;">✅ Respuesta correcta: <strong style="color: var(--neon-green);">${correctAnswer}</strong></p>
                <div style="background: rgba(255, 255, 255, 0.05); padding: 1rem; border-radius: 10px; border-left: 3px solid var(--neon-cyan);">
                    <p style="font-size: 1.1rem; line-height: 1.6;"><strong>Explicación:</strong></p>
                    <p style="font-size: 1.05rem; line-height: 1.7; margin-top: 0.5rem;">${this.currentQuestion.feedback}</p>
                </div>
            `;
        }

        modal.classList.add('visible');
    }

    hideFeedbackModal() {
        document.getElementById('feedbackModal').classList.remove('visible');
    }

    continueAfterFeedback() {
        this.hideFeedbackModal();

        if (this.lives <= 0) {
            this.state = GAME_STATE.GAME_OVER;
            this.showGameOver();
        } else {
            // Continue to next obstacle phase
            this.state = GAME_STATE.PLAYING;
            this.switchToObstaclePhase();
            // Restart game loop
            this.lastFrameTime = performance.now();
            this.gameLoop();
        }
    }

    switchToObstaclePhase() {
        this.phase = GAME_PHASE.OBSTACLE;
        this.phaseTimer = 0;
        this.obstacles = [];
        this.hideQuestionPanel();
        this.currentQuestion = null;
        this.previewSpawned = false; // Reset for next cycle
    }

    switchToQuestionPhase() {
        this.phase = GAME_PHASE.QUESTION;
        this.phaseTimer = 0;
        this.questionTimer = CONFIG.QUESTION_TIME;
        this.obstacles = [];
        this.currentQuestion = this.getRandomQuestion();
        this.selectedAnswer = null;
        this.answerLocked = false;
        this.showQuestionPanel();
        this.updateUI();

        // Reset answer button styles
        document.querySelectorAll('.lane-answer').forEach(el => {
            el.classList.remove('selected', 'correct', 'incorrect');
        });
    }

    showQuestionPreview() {
        // Only spawn once per cycle
        if (this.previewSpawned) return;
        this.previewSpawned = true;

        // Spawn ??? obstacles in all lanes (one per lane)
        for (let i = 0; i < CONFIG.LANES; i++) {
            const preview = new QuestionPreview(this, i);
            this.obstacles.push(preview);
        }
    }

    spawnRandomObstacle() {
        // Get currently occupied lanes
        const occupiedLanes = new Set();
        this.obstacles.forEach(obs => {
            // Only check obstacles near the spawn area
            if (obs.y < 200) {
                occupiedLanes.add(obs.lane);
            }
        });

        // Get available lanes
        const availableLanes = [];
        for (let i = 0; i < CONFIG.LANES; i++) {
            if (!occupiedLanes.has(i)) {
                availableLanes.push(i);
            }
        }

        // Only spawn if there are at least 2 free lanes (always leave escape route)
        if (availableLanes.length >= 2) {
            const randomIndex = Math.floor(Math.random() * availableLanes.length);
            const lane = availableLanes[randomIndex];
            const obstacle = new RandomObstacle(this, lane);
            this.obstacles.push(obstacle);
        }
    }

    updateUI() {
        document.getElementById('scoreDisplay').textContent = this.score;

        // Update lives
        const livesContainer = document.getElementById('livesDisplay');
        livesContainer.innerHTML = '';
        for (let i = 0; i < CONFIG.INITIAL_LIVES; i++) {
            const heart = document.createElement('span');
            heart.className = 'heart';
            heart.textContent = i < this.lives ? '❤️' : '🖤';
            livesContainer.appendChild(heart);
        }

        // Update question and timer
        if (this.phase === GAME_PHASE.QUESTION && this.currentQuestion) {
            document.getElementById('questionText').textContent = this.currentQuestion.pregunta;
            document.getElementById('timerDisplay').textContent = Math.ceil(this.questionTimer);

            // Update lane answers
            this.currentQuestion.opciones.forEach((opcion, index) => {
                const laneAnswer = document.getElementById(`lane${index}Answer`);
                if (laneAnswer) {
                    laneAnswer.textContent = opcion;
                    laneAnswer.style.pointerEvents = this.answerLocked ? 'none' : 'auto';
                }
            });
        }

        // Update lane indicators
        document.querySelectorAll('.lane-indicator').forEach((indicator, index) => {
            indicator.classList.toggle('active', index === this.player.currentLane);
        });
    }

    handleCorrectAnswer() {
        this.score += CONFIG.POINTS_PER_CORRECT;
        this.correctAnswers++;
        this.totalQuestionsAnswered++;

        // Increase speed gradually on every correct answer
        this.speed = Math.min(this.speed + CONFIG.SPEED_INCREMENT, CONFIG.MAX_SPEED);

        const userAnswer = this.currentQuestion.opciones[this.selectedAnswer];
        const correctAnswer = this.currentQuestion.opciones[this.currentQuestion.respuesta_correcta_index];

        this.answeredQuestions.push({
            question: this.currentQuestion.pregunta,
            userAnswer: userAnswer,
            correctAnswer: correctAnswer,
            correct: true,
            feedback: this.currentQuestion.feedback
        });

        this.state = GAME_STATE.PAUSED_FEEDBACK;
        this.showFeedbackModal(true, userAnswer, correctAnswer);
        this.updateUI();
    }

    handleTimeoutAnswer() {
        if (navigator.vibrate) navigator.vibrate(500); // Vibrate 500ms on timeout
        this.lives--;
        this.incorrectAnswers++;
        this.totalQuestionsAnswered++;

        const correctAnswer = this.currentQuestion.opciones[this.currentQuestion.respuesta_correcta_index];

        this.answeredQuestions.push({
            question: this.currentQuestion.pregunta,
            userAnswer: "Tiempo agotado",
            correctAnswer: correctAnswer,
            correct: false,
            feedback: this.currentQuestion.feedback
        });

        this.state = GAME_STATE.PAUSED_FEEDBACK;
        this.showFeedbackModal(false, "Tiempo agotado", correctAnswer);
        this.updateUI();
    }

    handleIncorrectAnswer() {
        if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 100]); // Error pattern vibration
        this.lives--;
        this.incorrectAnswers++;
        this.totalQuestionsAnswered++;

        const userAnswer = this.selectedAnswer !== null ? this.currentQuestion.opciones[this.selectedAnswer] : "Sin respuesta";
        const correctAnswer = this.currentQuestion.opciones[this.currentQuestion.respuesta_correcta_index];

        this.answeredQuestions.push({
            question: this.currentQuestion.pregunta,
            userAnswer: userAnswer,
            correctAnswer: correctAnswer,
            correct: false,
            feedback: this.currentQuestion.feedback
        });

        this.state = GAME_STATE.PAUSED_FEEDBACK;
        this.showFeedbackModal(false, userAnswer, correctAnswer);
        this.updateUI();
    }

    handleObstacleCollision() {
        if (navigator.vibrate) navigator.vibrate(200); // Short vibration on impact
        this.lives--;
        this.updateUI();

        if (this.lives <= 0) {
            this.showGameOver();
        }
    }

    checkObstacleCollision(obstacle) {
        const playerX = this.player.x;
        const playerY = this.canvas.height - 200;
        const playerSize = CONFIG.PLAYER_SIZE;

        const obstacleX = obstacle.x;
        const obstacleY = obstacle.y;
        const obstacleWidth = obstacle.width;
        const obstacleHeight = obstacle.height;

        // AABB Collision Detection
        if (playerX < obstacleX + obstacleWidth &&
            playerX + playerSize > obstacleX &&
            playerY < obstacleY + obstacleHeight &&
            playerY + playerSize > obstacleY) {
            return true;
        }
        return false;
    }

    update(deltaTime) {
        if (this.state !== GAME_STATE.PLAYING) return;

        const dt = deltaTime / 1000; // Convert to seconds
        this.distance += this.speed;
        this.player.update();

        if (this.phase === GAME_PHASE.OBSTACLE) {
            // Obstacle phase
            this.phaseTimer += dt;

            // Spawn obstacles randomly (reduced frequency)
            if (Math.random() < 0.01) { // 1% chance per frame (half of before)
                this.spawnRandomObstacle();
            }

            // Update obstacles
            for (let i = this.obstacles.length - 1; i >= 0; i--) {
                const obstacle = this.obstacles[i];
                obstacle.update();

                // Check collision
                if (obstacle instanceof QuestionPreview) {
                    // Check if player touches the ??? obstacle
                    if (this.checkObstacleCollision(obstacle)) {
                        // Remove all ??? obstacles
                        this.obstacles = this.obstacles.filter(obs => !(obs instanceof QuestionPreview));
                        // Trigger question immediately
                        this.switchToQuestionPhase();
                        return;
                    }
                } else if (this.checkObstacleCollision(obstacle)) {
                    this.handleObstacleCollision();
                    this.obstacles.splice(i, 1);
                    continue;
                }

                // Remove obstacles that are off screen
                if (obstacle.y > this.canvas.height + 100) {
                    this.obstacles.splice(i, 1);
                }
            }

            // Switch to question phase after duration
            if (this.phaseTimer >= CONFIG.OBSTACLE_PHASE_DURATION) {
                this.showQuestionPreview();
            }

        } else if (this.phase === GAME_PHASE.QUESTION) {
            // Question phase
            this.questionTimer -= dt;
            this.updateUI();

            // Time's up - evaluate answer (only if not already answered)
            if (this.questionTimer <= 0 && !this.answerLocked) {
                // No answer selected - mark as incorrect with timeout message
                this.answerLocked = true;
                this.handleTimeoutAnswer();
            }
        }
    }

    draw() {
        // Clear canvas
        this.ctx.fillStyle = '#0a0a0f';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw road/lanes
        this.drawRoad();

        // Draw obstacles
        this.obstacles.forEach(obstacle => obstacle.draw());

        // Draw player
        if (this.player) {
            this.player.draw();
        }

        // Draw phase indicator
        this.drawPhaseIndicator();
    }

    drawPhaseIndicator() {
        // Removed - no longer showing phase indicator
    }

    drawRoad() {
        const centerX = this.canvas.width / 2;
        // Responsive lane width
        const laneWidth = window.innerWidth < 768 ? 120 : CONFIG.LANE_WIDTH;
        const roadWidth = laneWidth * CONFIG.LANES;

        // Road background
        this.ctx.fillStyle = 'rgba(20, 20, 40, 0.5)';
        this.ctx.fillRect(centerX - roadWidth / 2, 0, roadWidth, this.canvas.height);

        // Lane dividers
        this.ctx.strokeStyle = 'rgba(0, 243, 255, 0.3)';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([20, 20]);

        for (let i = 1; i < CONFIG.LANES; i++) {
            const x = centerX - roadWidth / 2 + i * CONFIG.LANE_WIDTH;
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.canvas.height);
            this.ctx.stroke();
        }

        this.ctx.setLineDash([]);

        // Road edges
        this.ctx.strokeStyle = '#00f3ff';
        this.ctx.lineWidth = 4;
        this.ctx.shadowBlur = 20;
        this.ctx.shadowColor = '#00f3ff';

        this.ctx.beginPath();
        this.ctx.moveTo(centerX - roadWidth / 2, 0);
        this.ctx.lineTo(centerX - roadWidth / 2, this.canvas.height);
        this.ctx.stroke();

        this.ctx.beginPath();
        this.ctx.moveTo(centerX + roadWidth / 2, 0);
        this.ctx.lineTo(centerX + roadWidth / 2, this.canvas.height);
        this.ctx.stroke();

        this.ctx.shadowBlur = 0;
    }

    gameLoop() {
        if (this.state === GAME_STATE.PLAYING) {
            const currentTime = performance.now();
            const deltaTime = currentTime - this.lastFrameTime;
            this.lastFrameTime = currentTime;

            this.update(deltaTime);
            this.draw();
            requestAnimationFrame(() => this.gameLoop());
        }
    }
}

// ============================================
// PLAYER CLASS
// ============================================
class Player {
    constructor(game) {
        this.game = game;
        this.currentLane = 1; // Start in middle lane
        this.targetLane = 1;
        this.size = CONFIG.PLAYER_SIZE;
        this.y = this.game.canvas.height - 200;
        this.x = this.getLaneX(this.currentLane);
        this.animationFrame = 0;
    }

    getLaneX(lane) {
        const centerX = this.game.canvas.width / 2;
        const laneWidth = window.innerWidth < 768 ? 120 : CONFIG.LANE_WIDTH;
        const roadWidth = laneWidth * CONFIG.LANES;
        const laneCenter = centerX - roadWidth / 2 + lane * laneWidth + laneWidth / 2;
        return laneCenter - this.size / 2;
    }

    moveLeft() {
        if (this.targetLane > 0) {
            this.targetLane--;
        }
    }

    moveRight() {
        if (this.targetLane < CONFIG.LANES - 1) {
            this.targetLane++;
        }
    }

    update() {
        // Smooth lane transition
        const targetX = this.getLaneX(this.targetLane);
        this.x += (targetX - this.x) * CONFIG.LANE_SWITCH_SPEED;

        // Update current lane when close enough
        if (Math.abs(this.x - targetX) < 5) {
            this.currentLane = this.targetLane;
            this.game.updateUI();
        }

        // Animation
        this.animationFrame += 0.2;
    }

    draw() {
        const ctx = this.game.ctx;

        // Player shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.beginPath();
        ctx.ellipse(this.x + this.size / 2, this.y + this.size + 10, this.size / 2, 10, 0, 0, Math.PI * 2);
        ctx.fill();

        // Running animation (simple bobbing)
        const bobOffset = Math.sin(this.animationFrame) * 5;

        // Player body (running character)
        ctx.fillStyle = '#00f3ff';
        ctx.shadowBlur = 30;
        ctx.shadowColor = '#00f3ff';

        // Body
        ctx.fillRect(this.x + this.size * 0.3, this.y + this.size * 0.3 + bobOffset, this.size * 0.4, this.size * 0.5);

        // Head
        ctx.beginPath();
        ctx.arc(this.x + this.size / 2, this.y + this.size * 0.2 + bobOffset, this.size * 0.2, 0, Math.PI * 2);
        ctx.fill();

        // Legs (alternating)
        const legOffset = Math.sin(this.animationFrame * 2) * 10;
        ctx.fillRect(this.x + this.size * 0.35, this.y + this.size * 0.8 + bobOffset, this.size * 0.15, this.size * 0.2 + legOffset);
        ctx.fillRect(this.x + this.size * 0.5, this.y + this.size * 0.8 + bobOffset, this.size * 0.15, this.size * 0.2 - legOffset);

        ctx.shadowBlur = 0;
    }
}

// ============================================
// RANDOM OBSTACLE CLASS
// ============================================
class RandomObstacle {
    constructor(game, lane) {
        this.game = game;
        this.lane = lane;
        this.y = -CONFIG.OBSTACLE_HEIGHT;
        this.height = CONFIG.OBSTACLE_HEIGHT;
        this.width = CONFIG.OBSTACLE_WIDTH;
        this.x = this.getLaneX(lane);
    }

    getLaneX(lane) {
        const centerX = this.game.canvas.width / 2;
        const roadWidth = CONFIG.LANE_WIDTH * CONFIG.LANES;
        const laneCenter = centerX - roadWidth / 2 + lane * CONFIG.LANE_WIDTH + CONFIG.LANE_WIDTH / 2;
        return laneCenter - this.width / 2;
    }

    update() {
        this.y += this.game.speed;
        this.x = this.getLaneX(this.lane);
    }

    draw() {
        const ctx = this.game.ctx;

        // Futuristic obstacle (neon cube)
        const gradient = ctx.createLinearGradient(this.x, this.y, this.x + this.width, this.y + this.height);
        gradient.addColorStop(0, '#ff0066');
        gradient.addColorStop(1, '#ff6600');

        ctx.fillStyle = gradient;
        ctx.strokeStyle = '#ff0066';
        ctx.lineWidth = 3;
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#ff0066';

        // Main cube
        ctx.fillRect(this.x, this.y, this.width, this.height);
        ctx.strokeRect(this.x, this.y, this.width, this.height);

        // 3D effect - top face
        ctx.fillStyle = 'rgba(255, 102, 0, 0.6)';
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x + 15, this.y - 15);
        ctx.lineTo(this.x + this.width + 15, this.y - 15);
        ctx.lineTo(this.x + this.width, this.y);
        ctx.closePath();
        ctx.fill();

        // 3D effect - side face
        ctx.fillStyle = 'rgba(255, 0, 102, 0.4)';
        ctx.beginPath();
        ctx.moveTo(this.x + this.width, this.y);
        ctx.lineTo(this.x + this.width + 15, this.y - 15);
        ctx.lineTo(this.x + this.width + 15, this.y + this.height - 15);
        ctx.lineTo(this.x + this.width, this.y + this.height);
        ctx.closePath();
        ctx.fill();

        ctx.shadowBlur = 0;
    }
}

// ============================================
// QUESTION PREVIEW CLASS
// ============================================
class QuestionPreview {
    constructor(game, lane) {
        this.game = game;
        this.lane = lane;
        this.y = -100;
        this.height = 100;
        this.width = CONFIG.OBSTACLE_WIDTH;
        this.x = this.getLaneX(lane);
    }

    getLaneX(lane) {
        const centerX = this.game.canvas.width / 2;
        const roadWidth = CONFIG.LANE_WIDTH * CONFIG.LANES;
        const laneCenter = centerX - roadWidth / 2 + lane * CONFIG.LANE_WIDTH + CONFIG.LANE_WIDTH / 2;
        return laneCenter - this.width / 2;
    }

    update() {
        this.y += this.game.speed;
        this.x = this.getLaneX(this.lane);
    }

    draw() {
        const ctx = this.game.ctx;

        // Question mark indicator
        ctx.fillStyle = '#ffff00';
        ctx.strokeStyle = '#ffff00';
        ctx.lineWidth = 3;
        ctx.shadowBlur = 30;
        ctx.shadowColor = '#ffff00';

        // Draw ?
        ctx.font = 'bold 80px Orbitron';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('?', this.x + this.width / 2, this.y + this.height / 2);

        ctx.shadowBlur = 0;
    }
}

// ============================================
// INITIALIZE GAME
// ============================================
let game;
window.addEventListener('load', () => {
    game = new Game();
});

