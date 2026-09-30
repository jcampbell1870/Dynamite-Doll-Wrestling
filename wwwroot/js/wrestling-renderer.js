// Dynamite Doll Wrestling - 2D canvas match renderer.
// Deliberately styled after the chunky sprite look of late-80s / early-90s NES
// wrestling games such as WWF WrestleMania Challenge (1990).
(function () {
    const RING_WIDTH = 800;
    const RING_HEIGHT = 460;
    const HUD_HEIGHT = 78;
    const MAT_TOP = 250;
    const MAT_BOTTOM = 410;
    const SPRITE_SCALE = 1.5;
    const MAX_HEALTH = 100;
    const FALLS_TO_WIN = 2;
    const PIN_THRESHOLD = 18;
    const PIN_COUNT_SECONDS = 3;
    const MOVE_RANGE = 70;
    const BASE_SPEED = 150;
    const RING_PADDING = 60;

    const sessions = new WeakMap();

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function difficultyAggression(difficulty) {
        switch (difficulty) {
            case 'Easy': return 0.7;
            case 'Hard': return 1.35;
            default: return 1;
        }
    }

    function requiredKickOutMashes(difficulty) {
        switch (difficulty) {
            case 'Easy': return 4;
            case 'Hard': return 8;
            default: return 6;
        }
    }

    function difficultyKickOut(difficulty) {
        switch (difficulty) {
            case 'Easy': return 0.25;
            case 'Hard': return 0.7;
            default: return 0.45;
        }
    }

    function createState(difficulty, playerWrestler, opponentWrestler) {
        return {
            difficulty: difficulty,
            player: playerWrestler,
            opponent: opponentWrestler,
            playerX: RING_WIDTH * 0.35,
            opponentX: RING_WIDTH * 0.65,
            playerHealth: MAX_HEALTH,
            opponentHealth: MAX_HEALTH,
            momentum: 0,
            playerFalls: 0,
            opponentFalls: 0,
            pinCount: 0,
            kickOutProgress: 0,
            playerIsPinning: false,
            opponentIsPinning: false,
            matchOver: false,
            winner: null,
            callout: 'Ring the bell!',
            playerCooldown: 0,
            opponentCooldown: 0,
            playerAnim: 'idle',
            opponentAnim: 'idle',
            animTimer: 0,
            elapsed: 0
        };
    }

    function resetForNextFall(state) {
        state.playerHealth = MAX_HEALTH;
        state.opponentHealth = MAX_HEALTH;
        state.playerX = RING_WIDTH * 0.35;
        state.opponentX = RING_WIDTH * 0.65;
        state.momentum = 0;
        state.pinCount = 0;
        state.kickOutProgress = 0;
        state.playerIsPinning = false;
        state.opponentIsPinning = false;
        state.playerAnim = 'idle';
        state.opponentAnim = 'idle';
    }

    function damageToOpponent(state, damage, momentumFactor, callout, anim) {
        const mitigated = damage * (1 - state.opponent.stamina * 0.02);
        state.opponentHealth = Math.max(0, state.opponentHealth - mitigated);
        state.momentum = Math.min(100, state.momentum + mitigated * momentumFactor * 2);
        state.callout = callout;
        state.playerAnim = anim;
        state.opponentAnim = 'hurt';
        state.animTimer = 0.25;
    }

    function damageToPlayer(state, damage, callout, anim) {
        const mitigated = damage * (1 - state.player.stamina * 0.02);
        state.playerHealth = Math.max(0, state.playerHealth - mitigated);
        state.callout = callout;
        state.opponentAnim = anim;
        state.playerAnim = 'hurt';
        state.animTimer = 0.25;
    }

    function scoreFall(session, playerScored) {
        const state = session.state;
        if (playerScored) {
            state.playerFalls++;
            state.callout = 'Three! ' + state.player.nickname + ' takes the fall.';
        } else {
            state.opponentFalls++;
            state.callout = 'Three! ' + state.opponent.nickname + ' takes the fall.';
        }

        state.playerIsPinning = false;
        state.opponentIsPinning = false;
        state.pinCount = 0;
        state.kickOutProgress = 0;
        notifyScore(session);

        if (state.playerFalls >= FALLS_TO_WIN) {
            state.matchOver = true;
            state.winner = 'Player';
            state.callout = state.player.name + ' wins the bout!';
            notifyCompleted(session);
            return;
        }

        if (state.opponentFalls >= FALLS_TO_WIN) {
            state.matchOver = true;
            state.winner = 'Opponent';
            state.callout = state.opponent.name + ' wins the bout!';
            notifyCompleted(session);
            return;
        }

        resetForNextFall(state);
    }

    function notifyScore(session) {
        if (!session.dotNetRef) {
            return;
        }

        session.dotNetRef
            .invokeMethodAsync('OnMatchScoreChanged', session.state.playerFalls, session.state.opponentFalls, session.token)
            .catch(function (error) { console.warn('Score callback failed:', error); });
    }

    function notifyCompleted(session) {
        if (!session.dotNetRef || session.completionSent) {
            return;
        }

        session.completionSent = true;
        session.running = false;
        session.dotNetRef
            .invokeMethodAsync('OnMatchCompleted', session.state.playerFalls, session.state.opponentFalls, session.token)
            .catch(function (error) { console.warn('Completion callback failed:', error); });
    }

    function performPlayerAction(session, action) {
        const state = session.state;
        if (state.matchOver || state.playerCooldown > 0 || !action) {
            return;
        }

        if (state.playerIsPinning) {
            // Already holding the cover - further input must not restart the count.
            state.playerCooldown = 0.12;
            return;
        }

        if (state.opponentIsPinning) {
            state.kickOutProgress += 1;
            state.pinCount = Math.max(0, state.pinCount - 0.25);
            state.playerCooldown = 0.12;

            if (state.kickOutProgress >= requiredKickOutMashes(state.difficulty)) {
                state.opponentIsPinning = false;
                state.pinCount = 0;
                state.kickOutProgress = 0;
                state.playerHealth = Math.min(MAX_HEALTH, state.playerHealth + 12);
                state.callout = state.player.nickname + ' kicks out at two!';
            } else {
                state.callout = 'Kick out! Keep mashing!';
            }

            return;
        }

        if (Math.abs(state.playerX - state.opponentX) > MOVE_RANGE) {
            state.callout = 'Too far away!';
            state.playerCooldown = 0.2;
            return;
        }

        switch (action) {
            case 'strike':
                damageToOpponent(
                    state,
                    3 + state.player.power * 0.4,
                    0.35,
                    state.player.nickname + ' lands a stiff forearm!',
                    'strike');
                state.playerCooldown = 0.3;
                break;

            case 'grapple':
                damageToOpponent(
                    state,
                    6 + state.player.technique * 0.8,
                    0.9,
                    state.player.nickname + ' snaps off a suplex!',
                    'grapple');
                state.playerCooldown = 0.7;
                break;

            case 'signature':
                if (state.momentum < 100) {
                    state.callout = 'Signature not ready.';
                    state.playerCooldown = 0.2;
                    break;
                }

                state.momentum = 0;
                damageToOpponent(
                    state,
                    14 + (state.player.power + state.player.technique) * 0.8,
                    0,
                    state.player.signatureMove + '! The crowd is on its feet!',
                    'signature');
                state.playerCooldown = 1.2;
                break;

            case 'pin':
                if (state.opponentHealth > PIN_THRESHOLD) {
                    state.callout = "She's still too fresh to pin!";
                    state.playerCooldown = 0.4;
                    break;
                }

                state.playerIsPinning = true;
                state.pinCount = 0;
                state.callout = 'The cover! One...';
                state.playerCooldown = 0.4;
                break;
        }
    }

    function updatePinfall(session, deltaTime) {
        const state = session.state;
        state.pinCount += deltaTime;

        if (state.opponentIsPinning) {
            if (state.pinCount >= PIN_COUNT_SECONDS) {
                scoreFall(session, false);
            }
            return;
        }

        if (state.pinCount >= PIN_COUNT_SECONDS) {
            scoreFall(session, true);
            return;
        }

        const kickOutChance = difficultyKickOut(state.difficulty)
            * (0.5 + state.opponent.stamina / 20)
            * deltaTime;

        if (Math.random() < kickOutChance) {
            state.playerIsPinning = false;
            state.pinCount = 0;
            state.opponentHealth = Math.min(MAX_HEALTH, state.opponentHealth + 12);
            state.callout = state.opponent.nickname + ' kicks out at two!';
        }
    }

    function updateOpponent(session, deltaTime) {
        const state = session.state;
        const distance = state.opponentX - state.playerX;
        const aggression = difficultyAggression(state.difficulty);

        if (Math.abs(distance) > MOVE_RANGE * 0.8) {
            const speed = BASE_SPEED * (0.6 + state.opponent.speed / 20) * aggression;
            state.opponentX = clamp(
                state.opponentX - Math.sign(distance) * speed * deltaTime,
                RING_PADDING,
                RING_WIDTH - RING_PADDING);
            state.opponentAnim = 'walk';
            return;
        }

        if (state.opponentCooldown > 0) {
            return;
        }

        if (state.playerHealth <= PIN_THRESHOLD && Math.random() < 0.5 * aggression) {
            state.opponentIsPinning = true;
            state.pinCount = 0;
            state.kickOutProgress = 0;
            state.callout = state.opponent.nickname + ' goes for the cover! Mash any action key to kick out!';
            state.opponentCooldown = 0.4;
            return;
        }

        if (Math.random() < 0.4 * aggression) {
            damageToPlayer(
                state,
                5 + state.opponent.technique * 0.7 * aggression,
                state.opponent.nickname + ' plants her with the ' + state.opponent.signatureMove + '!',
                'grapple');
            state.opponentCooldown = 0.9 / aggression;
        } else {
            damageToPlayer(
                state,
                2.5 + state.opponent.power * 0.35 * aggression,
                state.opponent.nickname + ' fires back with a chop!',
                'strike');
            state.opponentCooldown = 0.45 / aggression;
        }
    }

    function update(session, deltaTime) {
        const state = session.state;
        if (state.matchOver) {
            return;
        }

        state.elapsed += deltaTime;
        state.playerCooldown = Math.max(0, state.playerCooldown - deltaTime);
        state.opponentCooldown = Math.max(0, state.opponentCooldown - deltaTime);
        state.animTimer = Math.max(0, state.animTimer - deltaTime);

        if (state.animTimer === 0) {
            state.playerAnim = state.playerAnim === 'hurt' ? 'idle' : state.playerAnim;
            state.opponentAnim = state.opponentAnim === 'hurt' ? 'idle' : state.opponentAnim;
        }

        if (state.playerIsPinning || state.opponentIsPinning) {
            updatePinfall(session, deltaTime);
            return;
        }

        let moved = 0;
        if (session.keys.left) { moved -= 1; }
        if (session.keys.right) { moved += 1; }

        if (moved !== 0) {
            const speed = BASE_SPEED * (0.75 + state.player.speed / 20);
            state.playerX = clamp(
                state.playerX + moved * speed * deltaTime,
                RING_PADDING,
                RING_WIDTH - RING_PADDING);
            state.playerAnim = 'walk';
        } else if (state.playerAnim === 'walk') {
            state.playerAnim = 'idle';
        }

        updateOpponent(session, deltaTime);
    }

    // ---------------------------------------------------------------- drawing

    function drawCrowd(ctx, elapsed) {
        ctx.fillStyle = '#120a1f';
        ctx.fillRect(0, HUD_HEIGHT, RING_WIDTH, MAT_TOP - 60 - HUD_HEIGHT);

        for (let row = 0; row < 4; row++) {
            for (let column = 0; column < 40; column++) {
                const bob = Math.sin(elapsed * 2 + row + column) > 0.6 ? 2 : 0;
                ctx.fillStyle = (row + column) % 3 === 0 ? '#3b2d59' : '#2a2140';
                ctx.fillRect(column * 20 + 2, HUD_HEIGHT + row * 26 + 6 - bob, 14, 18);
            }
        }
    }

    function drawRing(ctx) {
        // Apron
        ctx.fillStyle = '#1b3b6f';
        ctx.fillRect(0, MAT_TOP - 60, RING_WIDTH, RING_HEIGHT - (MAT_TOP - 60));

        // Mat
        ctx.fillStyle = '#d8d2c2';
        ctx.fillRect(40, MAT_TOP - 20, RING_WIDTH - 80, MAT_BOTTOM - MAT_TOP + 40);

        // Mat logo
        ctx.fillStyle = '#c0392b';
        ctx.fillRect(RING_WIDTH / 2 - 90, MAT_TOP + 60, 180, 10);
        ctx.fillStyle = '#2c3e50';
        ctx.font = 'bold 16px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('DYNAMITE DOLL WRESTLING', RING_WIDTH / 2, MAT_TOP + 52);

        // Turnbuckles
        ctx.fillStyle = '#7f1d1d';
        ctx.fillRect(28, MAT_TOP - 70, 22, 130);
        ctx.fillRect(RING_WIDTH - 50, MAT_TOP - 70, 22, 130);

        // Ropes
        const ropeColors = ['#f4d35e', '#ee964b', '#f95738'];
        for (let i = 0; i < 3; i++) {
            ctx.fillStyle = ropeColors[i];
            ctx.fillRect(28, MAT_TOP - 62 + i * 28, RING_WIDTH - 56, 5);
        }
    }

    function drawWrestler(ctx, wrestler, x, baseY, facing, anim, isPinned) {
        const primary = wrestler.primaryColor || '#e01b24';
        const accent = wrestler.accentColor || '#ffd44d';
        const skin = '#f2c6a0';

        ctx.save();
        ctx.translate(x, baseY);
        ctx.scale(facing * SPRITE_SCALE, SPRITE_SCALE);

        if (isPinned) {
            // Lying flat on the mat.
            ctx.fillStyle = primary;
            ctx.fillRect(-30, -18, 60, 16);
            ctx.fillStyle = skin;
            ctx.fillRect(30, -18, 14, 14);
            ctx.fillStyle = accent;
            ctx.fillRect(-34, -18, 8, 16);
            ctx.restore();
            return;
        }

        const crouch = anim === 'grapple' || anim === 'signature' ? 6 : 0;
        const stride = anim === 'walk' ? 6 : 0;

        // Legs
        ctx.fillStyle = accent;
        ctx.fillRect(-14, -34 + crouch, 10, 34 - crouch);
        ctx.fillRect(4 + stride, -34 + crouch, 10, 34 - crouch);

        // Boots
        ctx.fillStyle = '#1b1b1b';
        ctx.fillRect(-16, -8, 14, 8);
        ctx.fillRect(2 + stride, -8, 14, 8);

        // Torso / singlet
        ctx.fillStyle = primary;
        ctx.fillRect(-16, -64 + crouch, 32, 32);
        ctx.fillStyle = accent;
        ctx.fillRect(-16, -50 + crouch, 32, 6);

        // Arms
        ctx.fillStyle = skin;
        if (anim === 'strike') {
            ctx.fillRect(16, -60 + crouch, 26, 9);
        } else if (anim === 'signature') {
            ctx.fillRect(14, -78 + crouch, 10, 22);
            ctx.fillRect(-24, -78 + crouch, 10, 22);
        } else if (anim === 'grapple') {
            ctx.fillRect(14, -58 + crouch, 22, 9);
            ctx.fillRect(-32, -58 + crouch, 18, 9);
        } else {
            ctx.fillRect(14, -62 + crouch, 9, 24);
            ctx.fillRect(-23, -62 + crouch, 9, 24);
        }

        // Head + hair
        ctx.fillStyle = skin;
        ctx.fillRect(-11, -86 + crouch, 22, 22);
        ctx.fillStyle = accent;
        ctx.fillRect(-13, -90 + crouch, 26, 8);
        ctx.fillRect(-16, -84 + crouch, 5, 18);

        // Eyes
        ctx.fillStyle = '#1b1b1b';
        ctx.fillRect(2, -78 + crouch, 4, 4);

        ctx.restore();
    }

    function drawHud(ctx, state) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, RING_WIDTH, HUD_HEIGHT);

        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(state.player.name.toUpperCase(), 22, 20);
        drawMeter(ctx, 22, 26, state.playerHealth / MAX_HEALTH, '#2ecc71', 230, 16);

        ctx.textAlign = 'right';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(state.opponent.name.toUpperCase(), RING_WIDTH - 22, 20);
        drawMeter(ctx, RING_WIDTH - 252, 26, state.opponentHealth / MAX_HEALTH, '#e74c3c', 230, 16);

        ctx.textAlign = 'center';
        ctx.fillStyle = state.momentum >= 100 ? '#f1c40f' : '#95a5a6';
        ctx.fillText(state.momentum >= 100 ? 'SIGNATURE READY!' : 'MOMENTUM', RING_WIDTH / 2, 20);
        drawMeter(ctx, RING_WIDTH / 2 - 85, 26, state.momentum / 100, '#f1c40f', 170, 10);

        ctx.fillStyle = '#ffffff';
        ctx.fillText(
            'FALLS  ' + state.playerFalls + ' - ' + state.opponentFalls + '   BEST OF 3',
            RING_WIDTH / 2,
            62);
    }

    function drawMeter(ctx, x, y, ratio, color, width, height) {
        const meterWidth = width || 250;
        const meterHeight = height || 18;
        ctx.fillStyle = '#000000';
        ctx.fillRect(x - 2, y - 2, meterWidth + 4, meterHeight + 4);
        ctx.fillStyle = '#34495e';
        ctx.fillRect(x, y, meterWidth, meterHeight);
        ctx.fillStyle = color;
        ctx.fillRect(x, y, meterWidth * clamp(ratio, 0, 1), meterHeight);
    }

    function drawCallout(ctx, state) {
        ctx.textAlign = 'center';
        ctx.font = 'bold 15px monospace';
        ctx.fillStyle = '#000000';
        ctx.fillRect(60, RING_HEIGHT - 38, RING_WIDTH - 120, 28);
        ctx.fillStyle = '#f7f7f7';

        let text = state.callout;
        if (state.playerIsPinning || state.opponentIsPinning) {
            const count = Math.min(3, Math.floor(state.pinCount) + 1);
            text = 'COUNT: ' + count;
        }

        ctx.fillText(text, RING_WIDTH / 2, RING_HEIGHT - 18);
    }

    function render(session) {
        const ctx = session.ctx;
        const state = session.state;

        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, RING_WIDTH, RING_HEIGHT);
        drawCrowd(ctx, state.elapsed);
        drawRing(ctx);

        const playerFacing = state.playerX <= state.opponentX ? 1 : -1;
        drawWrestler(ctx, state.player, state.playerX, MAT_BOTTOM, playerFacing, state.playerAnim, state.opponentIsPinning);
        drawWrestler(ctx, state.opponent, state.opponentX, MAT_BOTTOM, -playerFacing, state.opponentAnim, state.playerIsPinning);

        drawHud(ctx, state);
        drawCallout(ctx, state);

        if (!session.running && !state.matchOver) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
            ctx.fillRect(0, 0, RING_WIDTH, RING_HEIGHT);
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 26px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('PAUSED', RING_WIDTH / 2, RING_HEIGHT / 2);
        }

        if (state.matchOver) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
            ctx.fillRect(0, RING_HEIGHT / 2 - 40, RING_WIDTH, 80);
            ctx.fillStyle = state.winner === 'Player' ? '#f1c40f' : '#e74c3c';
            ctx.font = 'bold 24px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(
                state.winner === 'Player' ? 'WINNER: ' + state.player.name.toUpperCase() : 'YOU HAVE BEEN PINNED',
                RING_WIDTH / 2,
                RING_HEIGHT / 2 + 8);
        }
    }

    function loop(session, timestamp) {
        if (session.disposed) {
            return;
        }

        const last = session.lastTimestamp || timestamp;
        const deltaTime = Math.min(0.05, (timestamp - last) / 1000);
        session.lastTimestamp = timestamp;

        if (session.running) {
            update(session, deltaTime);
        }

        render(session);

        if (!session.state.matchOver) {
            session.frameHandle = requestAnimationFrame(function (next) { loop(session, next); });
        }
    }

    function keyToAction(key) {
        switch (key) {
            case 'a':
            case 'A':
            case ' ':
                return 'strike';
            case 's':
            case 'S':
                return 'grapple';
            case 'd':
            case 'D':
                return 'signature';
            case 'f':
            case 'F':
                return 'pin';
            default:
                return null;
        }
    }

    function attachInput(session) {
        session.keyDownHandler = function (event) {
            if (event.key === 'ArrowLeft') { session.keys.left = true; event.preventDefault(); return; }
            if (event.key === 'ArrowRight') { session.keys.right = true; event.preventDefault(); return; }

            const action = keyToAction(event.key);
            if (action) {
                event.preventDefault();
                if (session.running) {
                    performPlayerAction(session, action);
                }
            }
        };

        session.keyUpHandler = function (event) {
            if (event.key === 'ArrowLeft') { session.keys.left = false; }
            if (event.key === 'ArrowRight') { session.keys.right = false; }
        };

        window.addEventListener('keydown', session.keyDownHandler);
        window.addEventListener('keyup', session.keyUpHandler);
    }

    function detachInput(session) {
        if (session.keyDownHandler) {
            window.removeEventListener('keydown', session.keyDownHandler);
        }

        if (session.keyUpHandler) {
            window.removeEventListener('keyup', session.keyUpHandler);
        }
    }

    window.wrestlingRenderer = {
        startMatch: function (canvas, difficulty, playerWrestler, opponentWrestler, dotNetRef, token) {
            if (!canvas) {
                return;
            }

            this.disposeMatch(canvas);

            const session = {
                canvas: canvas,
                ctx: canvas.getContext('2d'),
                dotNetRef: dotNetRef,
                token: token,
                running: true,
                disposed: false,
                completionSent: false,
                lastTimestamp: 0,
                keys: { left: false, right: false },
                state: createState(difficulty, playerWrestler, opponentWrestler)
            };

            sessions.set(canvas, session);
            attachInput(session);
            session.frameHandle = requestAnimationFrame(function (timestamp) { loop(session, timestamp); });
        },

        performAction: function (canvas, action) {
            const session = sessions.get(canvas);
            if (session && session.running) {
                performPlayerAction(session, action);
            }
        },

        // Exposed for diagnostics and automated smoke tests.
        getState: function (canvas) {
            const session = sessions.get(canvas);
            return session ? session.state : null;
        },

        moveLeft: function (canvas, isDown) {
            const session = sessions.get(canvas);
            if (session) {
                session.keys.left = !!isDown;
            }
        },

        moveRight: function (canvas, isDown) {
            const session = sessions.get(canvas);
            if (session) {
                session.keys.right = !!isDown;
            }
        },

        pauseMatch: function (canvas) {
            const session = sessions.get(canvas);
            if (session) {
                session.running = false;
                render(session);
            }
        },

        resumeMatch: function (canvas) {
            const session = sessions.get(canvas);
            if (session && !session.state.matchOver) {
                session.running = true;
                session.lastTimestamp = 0;
                if (!session.frameHandle) {
                    session.frameHandle = requestAnimationFrame(function (timestamp) { loop(session, timestamp); });
                }
            }
        },

        resetMatch: function (canvas) {
            this.disposeMatch(canvas);
            if (canvas) {
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
        },

        disposeMatch: function (canvas) {
            if (!canvas) {
                return;
            }

            const session = sessions.get(canvas);
            if (!session) {
                return;
            }

            session.disposed = true;
            session.running = false;
            if (session.frameHandle) {
                cancelAnimationFrame(session.frameHandle);
                session.frameHandle = null;
            }

            detachInput(session);
            sessions.delete(canvas);
        }
    };
})();
