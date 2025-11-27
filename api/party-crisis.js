/**
 * 派对危机游戏 API
 * Party Crisis Game - Multiplayer betting game with killer mechanics
 */

const express = require('express');
const router = express.Router();
const { ethers } = require('ethers');
const { gameBalanceManager } = require('../game-balance');

// 游戏状态管理
const games = new Map(); // gameId -> GameState
const playerGames = new Map(); // address -> gameId
let gameIdCounter = 1;

// 全局历史记录（保存最近的刺杀记录）
const globalHistory = [];

// 游戏配置
const GAME_CONFIG = {
    BETTING_DURATION: 60, // 投注阶段60秒
    KILLER_DURATION: 15, // 杀手阶段15秒（9秒前往+1秒刺杀+4秒撤退+1秒缓冲）
    SETTLING_DURATION: 6, // 结算阶段6秒（显示结果）
    MIN_BET: 1,
    MAX_BET: 500,
    MIN_PLAYERS: 1, // 最少1人即可开始（包含bot）
    MAX_PLAYERS: 200,
    PLATFORM_FEE: 0.10, // 10%平台费
    // Bot配置 - 均衡投注策略
    BOT_COUNT_MIN: 70,
    BOT_COUNT_MAX: 90,
    ROOM_BET_MIN: 4200, // 每个房间最小投注（降低到80个Bot）
    ROOM_BET_MAX: 5800, // 每个房间最大投注（降低到80个Bot）
    TARGET_ODDS_MIN: 1.08, // 预期赔率下限
    TARGET_ODDS_MAX: 1.22, // 预期赔率上限
};

// 房间配置
const ROOMS = {
    1: { name: '办公区' },
    2: { name: '酒吧' },
    3: { name: '休息区' },
    4: { name: 'VIP包厢' },
    5: { name: '餐饮区' },
    6: { name: '包厢区' },
    7: { name: '餐厅' },
    8: { name: '舞池' }
};

// Bot名字池（150个多元化名字，无数字，已去重）
const BOT_NAMES = [
    // 动物系列 (30个)
    'Bear', 'Wolf', 'Tiger', 'Fox', 'Lion', 'Eagle', 'Shark', 'Hawk', 'Panda', 'Dragon',
    'Deer', 'Rabbit', 'Snake', 'Horse', 'Falcon', 'Leopard', 'Jaguar', 'Panther', 'Lynx', 'Cobra',
    'Raven', 'Crow', 'Owl', 'Rhino', 'Buffalo', 'Gorilla', 'Cheetah', 'Cougar', 'Vulture', 'Scorpion',
    
    // 神话/奇幻系列 (25个)
    'Phoenix', 'Griffin', 'Titan', 'Zeus', 'Thor', 'Odin', 'Athena', 'Apollo', 'Ares', 'Hades',
    'Poseidon', 'Hercules', 'Perseus', 'Achilles', 'Medusa', 'Hydra', 'Cerberus', 'Minotaur', 'Cyclops', 'Sphinx',
    'Valkyrie', 'Fenrir', 'Loki', 'Freya', 'Baldur',
    
    // 游戏风格系列 (30个)
    'Shadow', 'Ghost', 'Blade', 'Storm', 'Viper', 'Hunter', 'Warrior', 'Knight', 'Ranger', 'Mage',
    'Rogue', 'Ninja', 'Samurai', 'Wizard', 'Archer', 'Assassin', 'Paladin', 'Berserker', 'Sorcerer', 'Warlock',
    'Druid', 'Monk', 'Barbarian', 'Necromancer', 'Bard', 'Cleric', 'Templar', 'Gladiator', 'Reaper', 'Slayer',
    
    // 天空/自然系列 (25个)
    'Sky', 'Cloud', 'Thunder', 'Lightning', 'Frost', 'Blaze', 'Star', 'Moon', 'Nova', 'Solar',
    'Comet', 'Meteor', 'Aurora', 'Eclipse', 'Zenith', 'Horizon', 'Dawn', 'Dusk', 'Twilight', 'Midnight',
    'Solstice', 'Equinox', 'Nebula', 'Galaxy', 'Cosmos',
    
    // 颜色/元素系列 (20个)
    'Crimson', 'Azure', 'Emerald', 'Onyx', 'Silver', 'Golden', 'Ruby', 'Sapphire', 'Amber', 'Jade',
    'Pearl', 'Diamond', 'Obsidian', 'Ivory', 'Ebony', 'Scarlet', 'Violet', 'Indigo', 'Cyan', 'Magenta',
    
    // 特殊/抽象系列 (20个)
    'Phantom', 'Mystic', 'Legend', 'Champion', 'Master', 'Alpha', 'Omega', 'Prime', 'Apex', 'Nexus',
    'Vortex', 'Chaos', 'Fury', 'Wrath', 'Valor', 'Honor', 'Glory', 'Victory', 'Destiny', 'Infinity'
];

// 游戏状态类
class GameState {
    constructor(gameId) {
        this.gameId = gameId;
        this.phase = 'betting'; // betting, killer_moving, settling
        this.countdown = GAME_CONFIG.BETTING_DURATION;
        this.players = new Map(); // address -> PlayerBet
        this.bots = []; // Bot玩家（动态添加）
        this.botTargets = {}; // 每个房间的目标投注量
        this.targetRoom = null;
        this.startTime = Date.now();
        this.endTime = null;
        this.result = null; // 结算结果
        this.history = [];
        this.timer = null;
        this.botCounter = 0; // Bot计数器
    }

    addPlayer(address, roomId, amount, username) {
        const normalizedAddr = address.toLowerCase();
        
        if (this.players.has(normalizedAddr)) {
            // 追加投注
            const existing = this.players.get(normalizedAddr);
            if (existing.roomId !== roomId) {
                throw new Error('已下注，无法更换房间');
            }
            existing.amount += amount;
        } else {
            // 新投注
            this.players.set(normalizedAddr, {
                address: normalizedAddr,
                roomId,
                amount,
                username: username || `Player${this.players.size + 1}`,
                joinedAt: Date.now()
            });
        }
    }

    initializeBotTargets() {
        /**
         * 初始化Bot目标，不生成Bot
         * 目标：每个房间投注在 8600-11200 DP 之间
         */
        this.botTargets = {};
        for (let i = 1; i <= 8; i++) {
            const min = GAME_CONFIG.ROOM_BET_MIN;
            const max = GAME_CONFIG.ROOM_BET_MAX;
            this.botTargets[i] = Math.floor(min + Math.random() * (max - min));
        }
        
        console.log('[Bot目标] 房间投注目标:', this.botTargets);
    }

    getRoomStats() {
        const stats = {};
        for (let i = 1; i <= 8; i++) {
            stats[i] = {
                playerCount: 0,
                totalBet: 0
            };
        }

        // 统计真实玩家
        this.players.forEach(player => {
            stats[player.roomId].playerCount++;
            stats[player.roomId].totalBet += player.amount;
        });

        // 统计bot
        this.bots.forEach(bot => {
            stats[bot.roomId].playerCount++;
            stats[bot.roomId].totalBet += bot.amount;
        });

        return stats;
    }

    selectTargetRoom() {
        // 随机选择目标房间
        this.targetRoom = Math.floor(Math.random() * 8) + 1;
        console.log(`[杀手阶段] 目标房间: ${this.targetRoom} (${ROOMS[this.targetRoom]?.name})`);
        return this.targetRoom;
    }

    async settle() {
        this.phase = 'settling';
        this.countdown = GAME_CONFIG.SETTLING_DURATION;
        
        const survivors = [];
        const eliminated = [];
        let killedTotal = 0;

        // 分类玩家
        this.players.forEach(player => {
            if (player.roomId === this.targetRoom) {
                eliminated.push({
                    address: player.address,
                    username: player.username,
                    bet: player.amount,
                    roomId: player.roomId
                });
                killedTotal += player.amount;
            } else {
                survivors.push(player);
            }
        });
        
        // 计算Bot的总投注（被Bot的也要计入奖池）
        let botKilledTotal = 0;
        this.bots.forEach(bot => {
            if (bot.roomId === this.targetRoom) {
                botKilledTotal += bot.amount;
            }
        });

        // 计算奖池（扣除平台费）- 包含玩家和Bot的投注
        const totalKilled = killedTotal + botKilledTotal;
        const prizePool = totalKilled * (1 - GAME_CONFIG.PLATFORM_FEE);
        
        console.log(`[结算] 被杀房间${this.targetRoom}, 玩家损失:${killedTotal.toFixed(0)}, Bot损失:${botKilledTotal.toFixed(0)}, 奖池:${prizePool.toFixed(0)}`);
        
        // 计算幸存者权重
        let totalWeight = 0;
        survivors.forEach(player => {
            totalWeight += player.amount;
        });

        // 分配奖励
        const survivorResults = [];
        for (const player of survivors) {
            const weight = totalWeight > 0 ? player.amount / totalWeight : 0;
            const reward = prizePool * weight;
            
            // 更新玩家余额
            try {
                await gameBalanceManager.addBalance(
                    player.address,
                    reward,
                    'party_crisis_win',
                    {
                        gameId: this.gameId,
                        roomId: player.roomId,
                        bet: player.amount,
                        reward: reward,
                        killedRoom: this.targetRoom
                    }
                );

                survivorResults.push({
                    address: player.address,
                    username: player.username,
                    bet: player.amount,
                    reward: reward,
                    profit: reward - player.amount
                });
            } catch (error) {
                console.error(`[派对危机] 奖励分配失败 ${player.address}:`, error);
            }
        }

        // 记录历史到游戏对象
        this.history.push({
            killedRoom: this.targetRoom,
            timestamp: Date.now(),
            killedCount: eliminated.length,
            survivorCount: survivors.length,
            prizePool: prizePool
        });
        
        // 保存到全局历史记录
        globalHistory.push({
            gameId: this.gameId,
            killedRoom: this.targetRoom,
            timestamp: Date.now(),
            killedCount: eliminated.length,
            survivorCount: survivors.length,
            prizePool: prizePool
        });
        
        // 只保留最近20条记录
        if (globalHistory.length > 20) {
            globalHistory.shift();
        }

        this.endTime = Date.now();
        
        // 保存结算结果供前端读取
        this.result = {
            killedRoom: this.targetRoom,
            eliminated: eliminated,
            survivors: survivorResults,
            killedTotal,
            prizePool
        };

        return this.result;
    }

    toJSON() {
        return {
            gameId: this.gameId,
            phase: this.phase,
            countdown: this.countdown,
            players: Array.from(this.players.values()),
            bots: this.bots,
            targetRoom: this.targetRoom,
            roomStats: this.getRoomStats(),
            result: this.result, // 结算结果
            startTime: this.startTime,
            endTime: this.endTime,
            history: globalHistory.slice(-10) // 返回全局历史记录的最近10条
        };
    }
}

// 添加一批Bot
function addBotBatch(game) {
    // 计算当前各房间投注
    const roomBets = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0 };
    game.bots.forEach(bot => {
        roomBets[bot.roomId] += bot.amount;
    });
    
    // 每次添加 3-8 个Bot
    const botsToAdd = Math.floor(3 + Math.random() * 6);
    
    for (let i = 0; i < botsToAdd; i++) {
        // 选择最需要Bot的房间（离目标最远的）
        let targetRoom = 1;
        let maxDeficit = 0;
        
        for (let r = 1; r <= 8; r++) {
            const deficit = game.botTargets[r] - roomBets[r];
            if (deficit > maxDeficit) {
                maxDeficit = deficit;
                targetRoom = r;
            }
        }
        
        // 如果所有房间都达标，随机选择
        if (maxDeficit <= 0) {
            targetRoom = Math.floor(Math.random() * 8) + 1;
        }
        
        // 计算此Bot的投注量（高度随机，每次都不同）
        const deficit = game.botTargets[targetRoom] - roomBets[targetRoom];
        let amount;
        
        // 使用多个随机因子增加变化
        const randomFactor1 = Math.random(); // 0-1
        const randomFactor2 = Math.random(); // 0-1
        const randomFactor3 = Math.random() * 2 - 1; // -1到1
        
        if (deficit > 0) {
            // 根据缺口计算，但加入多重随机性
            const avgNeeded = deficit / (2 + Math.random() * 3); // 2-5批次（减少批次，增加单次投注）
            const variability = 0.6 + randomFactor1 * 1.4; // 0.6-2.0倍波动（增加波动范围）
            const base = avgNeeded * variability;
            // 多层随机偏移
            const offset1 = randomFactor2 * 80 - 40; // -40刃40（增加偏移）
            const offset2 = randomFactor3 * 60; // -60刃60（增加偏移）
            amount = Math.floor(base + offset1 + offset2);
        } else {
            // 已达标，依然高度随机
            const range = 50 + Math.random() * 200; // 50-250的基础范围（增加）
            amount = Math.floor(range * (0.5 + randomFactor1));
        }
        
        // 最终投注量：50-600 DP（增加上限以减少Bot数量）
        // 再加一层随机扰动
        const finalNoise = Math.floor(Math.random() * 40 - 20); // -20刃20
        let finalAmount = Math.max(50, Math.min(600, amount + finalNoise));
        
        // 确保不是整十整百数（个位不为0）
        if (finalAmount % 10 === 0) {
            // 如果是10的倍数，加上1-9的随机数
            finalAmount += Math.floor(Math.random() * 9) + 1;
        }
        
        roomBets[targetRoom] += finalAmount;
        
        game.bots.push({
            id: `bot-${game.gameId}-${game.botCounter++}`,
            name: BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)],
            roomId: targetRoom,
            amount: finalAmount,
            isBot: true
        });
    }
    
    // 计算完成度
    let totalBets = 0;
    let totalTargets = 0;
    for (let r = 1; r <= 8; r++) {
        totalBets += roomBets[r];
        totalTargets += game.botTargets[r];
    }
    const completion = (totalBets / totalTargets * 100).toFixed(1);
    
    console.log(`[Bot添加] +${botsToAdd}个, 总计${game.bots.length}个, 完成度: ${completion}%`);
}

// 获取或创建当前游戏
function getCurrentGame() {
    // 查找正在进行的游戏（任何阶段）
    for (const [gameId, game] of games.entries()) {
        // 返回任何正在进行中的游戏（有timer的）
        if (game.timer) {
            return game;
        }
    }

    // 创建新游戏
    const newGame = new GameState(gameIdCounter++);
    games.set(newGame.gameId, newGame);
    
    // 初始化Bot目标（不生成Bot）
    newGame.initializeBotTargets();
    
    // 启动倒计时（Bot会在倒计时中动态添加）
    startGameTimer(newGame);
    
    console.log(`[派对危机] 新游戏开始: Game #${newGame.gameId}`);
    
    return newGame;
}

// 启动游戏计时器
function startGameTimer(game) {
    if (game.timer) {
        clearInterval(game.timer);
    }

    game.timer = setInterval(async () => {
        game.countdown--;
        
        // 投注阶段：动态添加Bot
        if (game.phase === 'betting' && game.countdown > 1) {
            // 根据剩余时间调整生成策略
            if (game.countdown > 30) {
                // 前30秒：每2秒添加一批，但不超过90个
                if (game.countdown % 2 === 0 && game.bots.length < GAME_CONFIG.BOT_COUNT_MAX) {
                    addBotBatch(game);
                }
            } else {
                // 后30秒：每3秒添加1-3个Bot，保持活跃度
                if (game.countdown % 3 === 0) {
                    const smallBatch = Math.floor(1 + Math.random() * 3); // 1-3个
                    for (let i = 0; i < smallBatch; i++) {
                        // 随机选择房间
                        const targetRoom = Math.floor(Math.random() * 8) + 1;
                        const amount = Math.floor(50 + Math.random() * 200);
                        const finalAmount = amount % 10 === 0 ? amount + Math.floor(Math.random() * 9) + 1 : amount;
                        
                        game.bots.push({
                            id: `bot-${game.gameId}-${game.botCounter++}`,
                            name: BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)],
                            roomId: targetRoom,
                            amount: finalAmount,
                            isBot: true
                        });
                    }
                    console.log(`[Bot添加-后期] +${smallBatch}个, 总计${game.bots.length}个`);
                }
            }
        }

        if (game.countdown <= 0) {
            
            if (game.phase === 'betting') {
                // 投注阶段结束，输出最终统计
                const roomBets = game.getRoomStats();
                const bets = Object.values(roomBets).map(s => s.totalBet);
                const maxBet = Math.max(...bets);
                const minBet = Math.min(...bets);
                const avgBet = bets.reduce((a, b) => a + b, 0) / 8;
                
                console.log(`[投注结束] 总计${game.bots.length}个Bot, 房间投注 最小:${minBet.toFixed(0)} 最大:${maxBet.toFixed(0)} 平均:${avgBet.toFixed(0)}`);
                
                // 进入杀手阶段
                game.phase = 'killer_moving';
                game.countdown = GAME_CONFIG.KILLER_DURATION;
                game.selectTargetRoom();
                console.log(`[派对危机] Game #${game.gameId} 杀手阶段开始，目标房间: ${game.targetRoom}`);
                
            } else if (game.phase === 'killer_moving') {
                // 杀手阶段结束，进入结算阶段
                const result = await game.settle();
                console.log(`[派对危机] Game #${game.gameId} 结算完成:`, result);
                
            } else if (game.phase === 'settling') {
                // 结算阶段结束，清理游戏
                clearInterval(game.timer);
                game.timer = null;
                
                const oldGameId = game.gameId;
                games.delete(game.gameId);
                // 清理玩家映射
                game.players.forEach((_, address) => {
                    if (playerGames.get(address) === game.gameId) {
                        playerGames.delete(address);
                    }
                });
                console.log(`[派对危机] Game #${oldGameId} 已清理`);
                console.log(`[历史记录] 当前历史:`, globalHistory.map(h => `Game${h.gameId}:Room${h.killedRoom}`).join(', '));
                
                // 立即创建新游戏，确保无缝衔接
                const newGame = new GameState(gameIdCounter++);
                games.set(newGame.gameId, newGame);
                newGame.initializeBotTargets();
                startGameTimer(newGame);
                console.log(`[派对危机] 新游戏开始: Game #${newGame.gameId}`);
            }
        }
    }, 1000);
}

// ==================== API 路由 ====================

/**
 * GET /api/party-crisis/status
 * 获取当前游戏状态
 */
router.get('/status', (req, res) => {
    try {
        const game = getCurrentGame();
        
        res.json({
            success: true,
            game: game.toJSON(),
            config: {
                bettingDuration: GAME_CONFIG.BETTING_DURATION,
                killerDuration: GAME_CONFIG.KILLER_DURATION,
                settlingDuration: GAME_CONFIG.SETTLING_DURATION,
                minBet: GAME_CONFIG.MIN_BET,
                maxBet: GAME_CONFIG.MAX_BET,
                platformFee: GAME_CONFIG.PLATFORM_FEE
            }
        });
    } catch (error) {
        console.error('[派对危机] 获取状态失败:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/party-crisis/bet
 * 下注
 * Body: { address, roomId, amount }
 */
router.post('/bet', async (req, res) => {
    try {
        const { address, roomId, amount } = req.body;

        // 验证参数
        if (!address || !ethers.utils.isAddress(address)) {
            return res.status(400).json({
                success: false,
                error: '无效的钱包地址'
            });
        }

        if (!roomId || roomId < 1 || roomId > 8) {
            return res.status(400).json({
                success: false,
                error: '无效的房间ID'
            });
        }

        if (!amount || amount < GAME_CONFIG.MIN_BET || amount > GAME_CONFIG.MAX_BET) {
            return res.status(400).json({
                success: false,
                error: `投注金额必须在 ${GAME_CONFIG.MIN_BET}-${GAME_CONFIG.MAX_BET} DP 之间`
            });
        }

        const normalizedAddr = address.toLowerCase();

        // 检查余额 - 重新加载以获取最新数据
        await gameBalanceManager.init();
        const balance = gameBalanceManager.getBalance(normalizedAddr);
        console.log(`[派对危机] 检查余额: ${normalizedAddr}, 当前余额: ${balance}, 需要: ${amount}`);
        
        if (balance < amount) {
            return res.status(400).json({
                success: false,
                error: `余额不足，当前余额: ${balance} DP，需要: ${amount} DP`
            });
        }

        // 获取用户信息
        const userInfo = gameBalanceManager.users[normalizedAddr];
        const username = userInfo?.username || null;

        // 扣除余额
        await gameBalanceManager.subtractBalance(
            normalizedAddr,
            amount,
            'party_crisis_bet',
            {
                roomId,
                amount
            }
        );

        // 添加到游戏
        const game = getCurrentGame();
        
        if (game.phase !== 'betting') {
            return res.status(400).json({
                success: false,
                error: '当前不在投注阶段'
            });
        }

        game.addPlayer(normalizedAddr, roomId, amount, username);
        playerGames.set(normalizedAddr, game.gameId);

        console.log(`[派对危机] 玩家下注: ${normalizedAddr}, 房间${roomId}, ${amount} DP`);

        res.json({
            success: true,
            message: '下注成功',
            game: game.toJSON(),
            balance: gameBalanceManager.getBalance(normalizedAddr)
        });

    } catch (error) {
        console.error('[派对危机] 下注失败:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/party-crisis/my-game/:address
 * 获取玩家当前游戏状态
 */
router.get('/my-game/:address', (req, res) => {
    try {
        const { address } = req.params;
        
        if (!address || !ethers.utils.isAddress(address)) {
            return res.status(400).json({
                success: false,
                error: '无效的钱包地址'
            });
        }

        const normalizedAddr = address.toLowerCase();
        const gameId = playerGames.get(normalizedAddr);
        
        if (!gameId) {
            return res.json({
                success: true,
                inGame: false,
                message: '未参与游戏'
            });
        }

        const game = games.get(gameId);
        if (!game) {
            playerGames.delete(normalizedAddr);
            return res.json({
                success: true,
                inGame: false,
                message: '游戏已结束'
            });
        }

        const playerBet = game.players.get(normalizedAddr);

        res.json({
            success: true,
            inGame: true,
            game: game.toJSON(),
            myBet: playerBet
        });

    } catch (error) {
        console.error('[派对危机] 获取玩家游戏失败:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/party-crisis/history
 * 获取游戏历史
 */
router.get('/history', (req, res) => {
    try {
        const allHistory = [];
        
        games.forEach(game => {
            if (game.history.length > 0) {
                allHistory.push(...game.history);
            }
        });

        // 按时间排序，最新的在前
        allHistory.sort((a, b) => b.timestamp - a.timestamp);

        res.json({
            success: true,
            history: allHistory.slice(0, 50) // 最多返回50条
        });

    } catch (error) {
        console.error('[派对危机] 获取历史失败:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 定期清理过期游戏（每5分钟）
setInterval(() => {
    const now = Date.now();
    const expireTime = 10 * 60 * 1000; // 10分钟

    games.forEach((game, gameId) => {
        if (game.endTime && (now - game.endTime > expireTime)) {
            games.delete(gameId);
            console.log(`[派对危机] 清理过期游戏: Game #${gameId}`);
        }
    });
}, 5 * 60 * 1000);

module.exports = router;
