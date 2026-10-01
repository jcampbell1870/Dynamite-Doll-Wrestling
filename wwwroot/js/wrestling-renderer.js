// Dynamite Doll Wrestling - 2D canvas match renderer.
// Deliberately styled after the chunky sprite look of late-80s / early-90s NES
// wrestling games such as WWF WrestleMania Challenge (1990).
// An optional "ultra" graphics mode renders the same match at the display's
// native resolution (up to 4K) with arena lighting, shadows and particles.
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
    const ULTRA_MAX_BACKING_WIDTH = 3840;
    const ULTRA_MAX_PARTICLES = 400;

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

    function createState(difficulty, playerWrestler, opponentWrestler, ultra) {
        return {
            ultra: !!ultra,
            particles: [],
            shake: 0,
            flash: 0,
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
        emitImpact(state, state.opponentX, mitigated, anim === 'signature' ? state.player.accentColor : '#fff3b0');
    }

    function damageToPlayer(state, damage, callout, anim) {
        const mitigated = damage * (1 - state.player.stamina * 0.02);
        state.playerHealth = Math.max(0, state.playerHealth - mitigated);
        state.callout = callout;
        state.opponentAnim = anim;
        state.playerAnim = 'hurt';
        state.animTimer = 0.25;
        emitImpact(state, state.playerX, mitigated, '#ffd0d0');
    }

    // Ultra-mode visual effects. They never affect gameplay.
    function emitImpact(state, x, intensity, color) {
        if (!state.ultra) {
            return;
        }

        const count = Math.min(60, Math.round(6 + intensity * 1.5));
        for (let i = 0; i < count && state.particles.length < ULTRA_MAX_PARTICLES; i++) {
            const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.4;
            const speed = 120 + Math.random() * (180 + intensity * 12);
            state.particles.push({
                x: x + (Math.random() - 0.5) * 20,
                y: MAT_BOTTOM - 70 + (Math.random() - 0.5) * 30,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 0.35 + Math.random() * 0.4,
                maxLife: 0.75,
                size: 1.5 + Math.random() * 2.5,
                color: color || '#fff3b0'
            });
        }

        state.shake = Math.min(12, state.shake + intensity * 0.35);
        state.flash = Math.min(0.6, state.flash + intensity * 0.012);
    }

    function emitPyro(state) {
        if (!state.ultra) {
            return;
        }

        const colors = ['#ff537d', '#ffd44d', '#ffffff', '#ff8a3d'];
        [60, RING_WIDTH - 60].forEach(function (originX) {
            for (let i = 0; i < 70 && state.particles.length < ULTRA_MAX_PARTICLES; i++) {
                const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.7;
                const speed = 260 + Math.random() * 260;
                state.particles.push({
                    x: originX,
                    y: MAT_TOP - 70,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    life: 0.8 + Math.random() * 0.8,
                    maxLife: 1.6,
                    size: 2 + Math.random() * 2.5,
                    color: colors[i % colors.length]
                });
            }
        });

        state.flash = 0.8;
        state.shake = Math.min(12, state.shake + 6);
    }

    function updateEffects(state, deltaTime) {
        if (!state.ultra) {
            return;
        }

        state.shake = Math.max(0, state.shake - deltaTime * 30);
        state.flash = Math.max(0, state.flash - deltaTime * 1.8);

        const particles = state.particles;
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.life -= deltaTime;
            if (p.life <= 0) {
                particles.splice(i, 1);
                continue;
            }

            p.vy += 520 * deltaTime;
            p.x += p.vx * deltaTime;
            p.y += p.vy * deltaTime;
            if (p.y > MAT_BOTTOM + 10) {
                p.y = MAT_BOTTOM + 10;
                p.vy *= -0.35;
                p.vx *= 0.6;
            }
        }
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
        emitPyro(state);
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
        updateEffects(state, deltaTime);
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

    // ------------------------------------------------------- ultra drawing

    // Sizes the canvas backing store to the displayed size times the device
    // pixel ratio (capped at 4K width) and maps it onto the logical ring.
    function syncUltraResolution(session) {
        const canvas = session.canvas;
        const rect = canvas.getBoundingClientRect();
        const aspect = RING_WIDTH / RING_HEIGHT;
        let displayWidth = rect.width || RING_WIDTH;
        if (rect.height > 0 && displayWidth / rect.height > aspect) {
            displayWidth = rect.height * aspect;
        }

        const ratio = window.devicePixelRatio || 1;
        const backingWidth = Math.max(RING_WIDTH, Math.min(ULTRA_MAX_BACKING_WIDTH, Math.round(displayWidth * ratio)));
        const backingHeight = Math.round(backingWidth / aspect);
        if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
            canvas.width = backingWidth;
            canvas.height = backingHeight;
        }

        session.ctx.setTransform(backingWidth / RING_WIDTH, 0, 0, backingHeight / RING_HEIGHT, 0, 0);
    }

    function drawArenaUltra(ctx, state) {
        const t = state.elapsed;
        const top = HUD_HEIGHT;
        const bottom = MAT_TOP - 60;

        const sky = ctx.createLinearGradient(0, top, 0, bottom);
        sky.addColorStop(0, '#05030a');
        sky.addColorStop(1, '#1d1030');
        ctx.fillStyle = sky;
        ctx.fillRect(0, top, RING_WIDTH, bottom - top);

        // Crowd silhouettes, lit from the ring.
        for (let row = 0; row < 5; row++) {
            const y = top + 14 + row * 20;
            const shade = 22 + row * 9;
            for (let column = 0; column < 46; column++) {
                const x = column * 17.6 + (row % 2) * 8;
                const bob = Math.max(0, Math.sin(t * 3 + row * 1.7 + column * 0.9)) * 3;
                ctx.fillStyle = 'rgb(' + (shade + 8) + ',' + shade + ',' + (shade + 22) + ')';
                ctx.beginPath();
                ctx.arc(x + 7, y - bob, 5, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillRect(x + 1, y + 4 - bob, 12, 14);
            }
        }

        // Camera flashes in the stands.
        for (let i = 0; i < 6; i++) {
            const phase = Math.sin(t * 1.3 + i * 12.9898) * 43758.5453;
            const seed = phase - Math.floor(phase);
            if (seed > 0.93) {
                const fx = (i * 137 + Math.floor(t * 2) * 53) % RING_WIDTH;
                const fy = top + 10 + ((i * 29 + Math.floor(t * 2) * 17) % (bottom - top - 20));
                const glow = ctx.createRadialGradient(fx, fy, 0, fx, fy, 14);
                glow.addColorStop(0, 'rgba(255,255,255,0.95)');
                glow.addColorStop(1, 'rgba(255,255,255,0)');
                ctx.fillStyle = glow;
                ctx.fillRect(fx - 14, fy - 14, 28, 28);
            }
        }

        // Sweeping light beams from the lighting truss.
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const beams = [
            { x: 140, color: '255,83,125' },
            { x: RING_WIDTH / 2, color: '255,240,210' },
            { x: RING_WIDTH - 140, color: '90,160,255' }
        ];
        beams.forEach(function (beam, index) {
            const sway = Math.sin(t * 0.6 + index * 2.1) * 120;
            const beamGradient = ctx.createLinearGradient(beam.x, top, beam.x + sway, MAT_BOTTOM);
            beamGradient.addColorStop(0, 'rgba(' + beam.color + ',0.28)');
            beamGradient.addColorStop(1, 'rgba(' + beam.color + ',0)');
            ctx.fillStyle = beamGradient;
            ctx.beginPath();
            ctx.moveTo(beam.x - 8, top);
            ctx.lineTo(beam.x + 8, top);
            ctx.lineTo(beam.x + sway + 90, MAT_BOTTOM);
            ctx.lineTo(beam.x + sway - 90, MAT_BOTTOM);
            ctx.closePath();
            ctx.fill();
        });
        ctx.restore();
    }

    function drawRingUltra(ctx, state) {
        const apron = ctx.createLinearGradient(0, MAT_TOP - 60, 0, RING_HEIGHT);
        apron.addColorStop(0, '#24508f');
        apron.addColorStop(1, '#0b1a33');
        ctx.fillStyle = apron;
        ctx.fillRect(0, MAT_TOP - 60, RING_WIDTH, RING_HEIGHT - (MAT_TOP - 60));

        const matX = 40;
        const matY = MAT_TOP - 20;
        const matW = RING_WIDTH - 80;
        const matH = MAT_BOTTOM - MAT_TOP + 40;
        const mat = ctx.createLinearGradient(0, matY, 0, matY + matH);
        mat.addColorStop(0, '#bdb7a8');
        mat.addColorStop(1, '#e9e3d4');
        ctx.fillStyle = mat;
        ctx.fillRect(matX, matY, matW, matH);

        // Overhead key light pooling on the canvas.
        const pool = ctx.createRadialGradient(RING_WIDTH / 2, MAT_TOP + 70, 20, RING_WIDTH / 2, MAT_TOP + 70, matW * 0.6);
        pool.addColorStop(0, 'rgba(255,250,235,0.45)');
        pool.addColorStop(1, 'rgba(0,0,0,0.25)');
        ctx.fillStyle = pool;
        ctx.fillRect(matX, matY, matW, matH);

        ctx.fillStyle = 'rgba(192,57,43,0.9)';
        ctx.fillRect(RING_WIDTH / 2 - 90, MAT_TOP + 60, 180, 10);
        ctx.fillStyle = 'rgba(44,62,80,0.85)';
        ctx.font = 'bold 16px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('DYNAMITE DOLL WRESTLING', RING_WIDTH / 2, MAT_TOP + 52);

        // Steel ring posts with padded turnbuckles.
        [28, RING_WIDTH - 50].forEach(function (postX) {
            const steel = ctx.createLinearGradient(postX, 0, postX + 22, 0);
            steel.addColorStop(0, '#5d6670');
            steel.addColorStop(0.45, '#e3e8ee');
            steel.addColorStop(1, '#3a4048');
            ctx.fillStyle = steel;
            ctx.fillRect(postX + 4, MAT_TOP - 74, 14, 140);
            for (let i = 0; i < 3; i++) {
                const pad = ctx.createLinearGradient(postX, 0, postX + 22, 0);
                pad.addColorStop(0, '#5c1010');
                pad.addColorStop(0.5, '#c62828');
                pad.addColorStop(1, '#4a0c0c');
                ctx.fillStyle = pad;
                ctx.fillRect(postX, MAT_TOP - 68 + i * 28, 22, 16);
            }
        });

        // Ropes with a soft glow.
        const ropeColors = ['#f4d35e', '#ee964b', '#f95738'];
        ctx.save();
        for (let i = 0; i < 3; i++) {
            const y = MAT_TOP - 62 + i * 28 + 2.5 + Math.sin(state.elapsed * 4 + i) * state.shake * 0.15;
            ctx.strokeStyle = ropeColors[i];
            ctx.lineWidth = 5;
            ctx.lineCap = 'round';
            ctx.shadowColor = ropeColors[i];
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.moveTo(40, y);
            ctx.quadraticCurveTo(RING_WIDTH / 2, y + 3, RING_WIDTH - 40, y);
            ctx.stroke();
        }
        ctx.restore();
    }

    function drawShadowUltra(ctx, x, isPinned) {
        const width = isPinned ? 70 : 40;
        const shadow = ctx.createRadialGradient(x, MAT_BOTTOM, 2, x, MAT_BOTTOM, width);
        shadow.addColorStop(0, 'rgba(0,0,0,0.55)');
        shadow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.save();
        ctx.translate(x, MAT_BOTTOM);
        ctx.scale(1, 0.22);
        ctx.translate(-x, -MAT_BOTTOM);
        ctx.fillStyle = shadow;
        ctx.beginPath();
        ctx.arc(x, MAT_BOTTOM, width, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    function drawWrestlerUltra(ctx, wrestler, x, facing, anim, isPinned) {
        drawShadowUltra(ctx, x, isPinned);
        ctx.save();
        if (anim === 'signature') {
            ctx.shadowColor = wrestler.accentColor || '#ffd44d';
            ctx.shadowBlur = 24;
        } else {
            ctx.shadowColor = 'rgba(255,240,220,0.35)';
            ctx.shadowBlur = 6;
        }

        drawWrestler(ctx, wrestler, x, MAT_BOTTOM, facing, anim, isPinned);
        ctx.restore();
    }

    function drawParticlesUltra(ctx, state) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        state.particles.forEach(function (p) {
            ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
            ctx.strokeStyle = p.color;
            ctx.lineWidth = p.size;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x - p.vx * 0.025, p.y - p.vy * 0.025);
            ctx.stroke();
        });
        ctx.restore();
    }

    function drawPostUltra(ctx, state, session) {
        const vignette = ctx.createRadialGradient(
            RING_WIDTH / 2, RING_HEIGHT * 0.6, RING_HEIGHT * 0.35,
            RING_WIDTH / 2, RING_HEIGHT * 0.6, RING_WIDTH * 0.75);
        vignette.addColorStop(0, 'rgba(0,0,0,0)');
        vignette.addColorStop(1, 'rgba(0,0,0,0.55)');
        ctx.fillStyle = vignette;
        ctx.fillRect(0, HUD_HEIGHT, RING_WIDTH, RING_HEIGHT - HUD_HEIGHT);

        if (state.flash > 0) {
            ctx.fillStyle = 'rgba(255,245,230,' + (state.flash * 0.35) + ')';
            ctx.fillRect(0, HUD_HEIGHT, RING_WIDTH, RING_HEIGHT - HUD_HEIGHT);
        }

        if (session.fps) {
            ctx.font = 'bold 10px monospace';
            ctx.textAlign = 'right';
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.fillText('ULTRA  ' + session.canvas.width + 'x' + session.canvas.height + '  ' + Math.round(session.fps) + ' FPS',
                RING_WIDTH - 8, HUD_HEIGHT + 14);
        }
    }

    function renderUltraScene(session) {
        const ctx = session.ctx;
        const state = session.state;

        ctx.imageSmoothingEnabled = true;
        ctx.save();
        if (state.shake > 0) {
            ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
        }

        drawArenaUltra(ctx, state);
        drawRingUltra(ctx, state);

        const playerFacing = state.playerX <= state.opponentX ? 1 : -1;
        drawWrestlerUltra(ctx, state.player, state.playerX, playerFacing, state.playerAnim, state.opponentIsPinning);
        drawWrestlerUltra(ctx, state.opponent, state.opponentX, -playerFacing, state.opponentAnim, state.playerIsPinning);
        drawParticlesUltra(ctx, state);
        ctx.restore();

        drawPostUltra(ctx, state, session);
    }

    function render(session) {
        const ctx = session.ctx;
        const state = session.state;

        if (state.ultra) {
            syncUltraResolution(session);
            ctx.clearRect(0, 0, RING_WIDTH, RING_HEIGHT);
            renderUltraScene(session);
        } else {
            ctx.imageSmoothingEnabled = false;
            ctx.clearRect(0, 0, RING_WIDTH, RING_HEIGHT);
            drawCrowd(ctx, state.elapsed);
            drawRing(ctx);

            const playerFacing = state.playerX <= state.opponentX ? 1 : -1;
            drawWrestler(ctx, state.player, state.playerX, MAT_BOTTOM, playerFacing, state.playerAnim, state.opponentIsPinning);
            drawWrestler(ctx, state.opponent, state.opponentX, MAT_BOTTOM, -playerFacing, state.opponentAnim, state.playerIsPinning);
        }

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

        const state = session.state;
        if (state.ultra && timestamp > last) {
            const instant = 1000 / (timestamp - last);
            session.fps = session.fps ? session.fps * 0.9 + instant * 0.1 : instant;
        }

        if (session.running) {
            update(session, deltaTime);
        } else if (state.matchOver) {
            // Let the final pyro finish after the bout is decided.
            updateEffects(state, deltaTime);
        }

        render(session);

        const effectsActive = state.ultra && (state.particles.length > 0 || state.flash > 0 || state.shake > 0);
        if (!state.matchOver || effectsActive) {
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
        // options.quality: 'classic' (default) or 'ultra'.
        startMatch: function (canvas, difficulty, playerWrestler, opponentWrestler, dotNetRef, token, options) {
            if (!canvas) {
                return;
            }

            this.disposeMatch(canvas);

            const ultra = !!options && options.quality === 'ultra';
            const ctx = canvas.getContext('2d');
            if (!ultra && (canvas.width !== RING_WIDTH || canvas.height !== RING_HEIGHT)) {
                canvas.width = RING_WIDTH;
                canvas.height = RING_HEIGHT;
            }

            ctx.setTransform(1, 0, 0, 1, 0, 0);

            const session = {
                canvas: canvas,
                ctx: ctx,
                dotNetRef: dotNetRef,
                token: token,
                running: true,
                disposed: false,
                completionSent: false,
                lastTimestamp: 0,
                keys: { left: false, right: false },
                fps: 0,
                state: createState(difficulty, playerWrestler, opponentWrestler, ultra)
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
                ctx.setTransform(1, 0, 0, 1, 0, 0);
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
