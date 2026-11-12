const DECADE_CONFIGS = [
    {
        decade: 1, years: "1956 - 1966", name: "Khởi nguyên",
        friction: 0.85, massVariable: false, bohrLevelVariable: false,
        shockFreq: 0, hasCenterBlackHole: false, coordRotationSpeed: 0,
        noiseAmp: 110, color: "#38bdf8"
    },
    {
        decade: 2, years: "1966 - 1976", name: "Kháng chiến",
        friction: 0.85, massVariable: false, bohrLevelVariable: false,
        shockFreq: 0.015, shockForceMin: 1000, shockForceMax: 2500, shockDuration: 0.05,
        hasCenterBlackHole: false, coordRotationSpeed: 0, noiseAmp: 120, color: "#ff2a6d"
    },
    {
        decade: 3, years: "1976 - 1986", name: "Tái thiết",
        friction: 0.995, massVariable: false, bohrLevelVariable: false,
        shockFreq: 0, hasCenterBlackHole: false, coordRotationSpeed: 0,
        noiseAmp: 100, color: "#00f0ff"
    },
    {
        decade: 4, years: "1986 - 1996", name: "Đổi mới",
        friction: 0.85, massVariable: true, bohrLevelVariable: true,
        shockFreq: 0, hasCenterBlackHole: false, coordRotationSpeed: 0,
        noiseAmp: 110, color: "#ffe600"
    },
    {
        decade: 5, years: "1996 - 2006", name: "Hội nhập",
        friction: 0.85, massVariable: false, bohrLevelVariable: false,
        shockFreq: 0, hasCenterBlackHole: true, blackHoleRadius: 20 , blackHoleStrength: 150000,
        coordRotationSpeed: 0, noiseAmp: 110, color: "#a855f7"
    },
    {
        decade: 6, years: "2006 - 2016", name: "Vươn tầm",
        friction: 0.85, massVariable: false, bohrLevelVariable: false,
        shockFreq: 0, hasCenterBlackHole: false,
        coordRotationSpeed: 0.02, noiseAmp: 120, color: "#ec4899"
    },
    {
        decade: 7, years: "2016 - 2026", name: "Chuyển đổi số (Quantum Chaos)",
        friction: 0.95, massVariable: true, bohrLevelVariable: true,
        shockFreq: 0.05, shockForceMin: 2500, shockForceMax: 3900, shockDuration: 0.05,
        hasCenterBlackHole: true, blackHoleRadius: 30, blackHoleStrength: 300000,
        coordRotationSpeed: 0.045, noiseAmp: 160, isChaos: true, color: "#39ff14"
    }
];

class IonTrapPhysicsEngine {
    constructor(canvasWidth, canvasHeight) {
        this.width = canvasWidth;
        this.height = canvasHeight;
        this.center = { x: canvasWidth / 2, y: canvasHeight / 2 };
        this.trapRadius = Math.min(canvasWidth, canvasHeight) * 0.38;
        
        this.particle = {
            pos: { x: this.center.x, y: this.center.y },
            vel: { x: 0, y: 0 },
            acc: { x: 0, y: 0 },
            baseRadius: 12,
            mass: 1.0,
            bohrLevel: 1,
            trail: []
        };

        this.inputVector = { x: 0, y: 0 };
        this.smoothInput = { x: 0, y: 0 };

        this.afk = {
            epsilon: 0.018,
            timer: 0,
            warnings: 0,
            checkInterval: 3,
            lastInput: { x: 0, y: 0 }
        };

        this.bohrTimer = 0;
        this.stageTime = 0;
        this.coordRotation = 0;
        this.noiseTime = 0;
        this.shockVector = { x: 0, y: 0, duration: 0 };
    }

    spawnRandomSafe(stageConfig) {
        const minR = stageConfig.hasCenterBlackHole 
            ? (stageConfig.blackHoleRadius + 35) 
            : (this.trapRadius * 0.2);
        const maxR = this.trapRadius * 0.55;

        const r = minR + Math.random() * (maxR - minR);
        const theta = Math.random() * Math.PI * 2;

        this.particle.pos = {
            x: this.center.x + r * Math.cos(theta),
            y: this.center.y + r * Math.sin(theta)
        };
        this.particle.vel = { x: 0, y: 0 };
        this.particle.acc = { x: 0, y: 0 };
        this.particle.trail = [];

        this.bohrTimer = 0;
        this.stageTime = 0;
        this.coordRotation = 0;
        this.afk.timer = 0;
        this.afk.lastInput = { x: this.inputVector.x, y: this.inputVector.y };
    }

    handleSocketSyncData(beta, gamma) {
        const normX = Math.max(-1, Math.min(1, (gamma || 0) / 30));
        const normY = Math.max(-1, Math.min(1, (beta || 0) / 30));

        this.inputVector.x = normX;
        this.inputVector.y = normY;
    }

    getCurrentStageConfig(totalElapsedTimeSec) {
        const stageIndex = Math.min(6, Math.floor(totalElapsedTimeSec / 10));
        return DECADE_CONFIGS[stageIndex];
    }

    update(dt, stageConfig, globalTime, callbacks) {
        this.stageTime += dt;

        const inputDelta = Math.hypot(
            this.inputVector.x - this.afk.lastInput.x,
            this.inputVector.y - this.afk.lastInput.y
        );

        if (inputDelta < this.afk.epsilon) {
            this.afk.timer += dt;
            if (this.afk.timer >= this.afk.checkInterval) {
                this.afk.timer = 0;
                this.afk.warnings++;

                if (callbacks.onAFKWarning) {
                    callbacks.onAFKWarning(this.afk.warnings);
                }

                if (this.afk.warnings >= 3) {
                    if (callbacks.onDisqualify) {
                        callbacks.onDisqualify("LOẠI DO AFK: Giữ nguyên máy quá 3 lần cảnh báo!");
                    }
                    return;
                }
            }
        } else {
            this.afk.timer = 0;
            this.afk.lastInput = { x: this.inputVector.x, y: this.inputVector.y };
        }

        this.smoothInput.x += (this.inputVector.x - this.smoothInput.x) * 0.25;
        this.smoothInput.y += (this.inputVector.y - this.smoothInput.y) * 0.25;

        if (stageConfig.bohrLevelVariable) {
            this.bohrTimer += dt;
            if (this.bohrTimer >= 2.0 || !this.particle.bohrLevel) {
                this.bohrTimer = 0;
                this.particle.bohrLevel = Math.floor(Math.random() * 10) + 1;
            }
        } else {
            this.bohrTimer = 0;
            this.particle.bohrLevel = stageConfig.bohrLevel || 1;
        }

        if (stageConfig.massVariable) {
            this.particle.mass = 0.2 + (this.particle.bohrLevel / 10.0) * 1.8;
        } else {
            this.particle.mass = stageConfig.mass || 1.0;
        }

        let F_centrifugal_x = 0, F_centrifugal_y = 0;
        if (stageConfig.coordRotationSpeed > 0) {
            const currentRotSpeed = stageConfig.coordRotationSpeed + (this.stageTime * 0.0025);
            this.coordRotation += currentRotSpeed * dt * 60;

            const dx = this.particle.pos.x - this.center.x;
            const dy = this.particle.pos.y - this.center.y;
            const distFromCenter = Math.hypot(dx, dy);

            if (distFromCenter > 0) {
                const cfMagnitude = this.particle.mass * Math.pow(currentRotSpeed * 12, 2) * distFromCenter * 0.75;
                F_centrifugal_x = (dx / distFromCenter) * cfMagnitude;
                F_centrifugal_y = (dy / distFromCenter) * cfMagnitude;
            }
        } else {
            this.coordRotation = 0;
        }

        const cosR = Math.cos(this.coordRotation);
        const sinR = Math.sin(this.coordRotation);
        const F_player_x = (this.smoothInput.x * cosR - this.smoothInput.y * sinR) * 650;
        const F_player_y = (this.smoothInput.x * sinR + this.smoothInput.y * cosR) * 650;

        this.noiseTime += dt * 2;
        const F_noise_x = Math.sin(this.noiseTime) * stageConfig.noiseAmp + Math.cos(this.noiseTime * 1.7) * 50;
        const F_noise_y = Math.cos(this.noiseTime * 1.3) * stageConfig.noiseAmp + Math.sin(this.noiseTime * 2.1) * 50;

        let F_shock_x = 0, F_shock_y = 0;
        if (stageConfig.shockFreq > 0) {
            if (this.shockVector.duration <= 0 && Math.random() < stageConfig.shockFreq) {
                const angle = Math.random() * Math.PI * 2;
                const forceMag = (stageConfig.shockForceMin || 2200) + Math.random() * ((stageConfig.shockForceMax || 3600) - (stageConfig.shockForceMin || 2200));
                this.shockVector = {
                    x: Math.cos(angle) * forceMag,
                    y: Math.sin(angle) * forceMag,
                    duration: stageConfig.shockDuration || 0.15
                };
                if (callbacks.onShockWave) callbacks.onShockWave();
            }
        }

        if (this.shockVector.duration > 0) {
            this.shockVector.duration -= dt;
            F_shock_x = this.shockVector.x;
            F_shock_y = this.shockVector.y;
        }

        let F_bh_x = 0, F_bh_y = 0;
        if (stageConfig.hasCenterBlackHole) {
            const dx = this.center.x - this.particle.pos.x;
            const dy = this.center.y - this.particle.pos.y;
            const distToCenter = Math.hypot(dx, dy);

            if (distToCenter <= stageConfig.blackHoleRadius) {
                if (callbacks.onGameOver) {
                    callbacks.onGameOver("HẠT ĐÃ BỊ HÚT VÀO TÂM HỐ ĐEN TRUNG TÂM!");
                }
                return;
            }

            const forceMag = stageConfig.blackHoleStrength / (Math.pow(distToCenter, 1.5) + 30);
            F_bh_x = (dx / distToCenter) * forceMag;
            F_bh_y = (dy / distToCenter) * forceMag;
        }

        const F_net_x = F_player_x + F_noise_x + F_shock_x + F_bh_x + F_centrifugal_x;
        const F_net_y = F_player_y + F_noise_y + F_shock_y + F_bh_y + F_centrifugal_y;

        this.particle.acc.x = F_net_x / this.particle.mass;
        this.particle.acc.y = F_net_y / this.particle.mass;

        this.particle.vel.x += this.particle.acc.x * dt;
        this.particle.vel.y += this.particle.acc.y * dt;

        const drag = Math.pow(stageConfig.friction, dt * 60);
        this.particle.vel.x *= drag;
        this.particle.vel.y *= drag;

        this.particle.pos.x += this.particle.vel.x * dt;
        this.particle.pos.y += this.particle.vel.y * dt;

        this.particle.trail.unshift({ x: this.particle.pos.x, y: this.particle.pos.y });
        if (this.particle.trail.length > 22) this.particle.trail.pop();

        const currentRadius = this.particle.baseRadius * (stageConfig.massVariable ? Math.sqrt(this.particle.mass) : 1.0);
        const distFromCenter = Math.hypot(this.particle.pos.x - this.center.x, this.particle.pos.y - this.center.y);

        if (distFromCenter + currentRadius >= this.trapRadius) {
            if (callbacks.onGameOver) {
                callbacks.onGameOver("Hạt Electron đã va chạm mạnh vào viền bẫy từ trường!");
            }
            return;
        }
    }
}
