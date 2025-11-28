/**
 * 管理员控制面板 API
 * 提供完整的平台管理功能
 */

const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const { gameBalanceManager } = require('../game-balance');

// 管理员密码（应该从环境变量读取）
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123456';

// 获取游戏状态（从party-crisis.js导入）
let partyCrisisGames = null;
let partyCrisisPlayerGames = null;
let partyCrisisGlobalHistory = null;

// 初始化时导入party-crisis的游戏状态
function initPartyCrisisRef(games, playerGames, globalHistory) {
    partyCrisisGames = games;
    partyCrisisPlayerGames = playerGames;
    partyCrisisGlobalHistory = globalHistory;
}

// 验证管理员密码中间件
function verifyAdmin(req, res, next) {
    const password = req.headers['x-admin-password'] || req.body.password || req.query.password;
    
    if (password !== ADMIN_PASSWORD) {
        return res.status(401).json({
            success: false,
            error: '管理员密码错误'
        });
    }
    
    next();
}

// ==================== 1. 数据监控 ====================

/**
 * GET /api/admin/dashboard
 * 获取仪表盘数据
 */
router.get('/dashboard', verifyAdmin, async (req, res) => {
    try {
        await gameBalanceManager.init();
        
        // 统计用户和余额
        const userCount = Object.keys(gameBalanceManager.users).length;
        const activeUserCount = Object.keys(gameBalanceManager.balances).filter(addr => {
            return gameBalanceManager.getBalance(addr) > 0;
        }).length;
        
        // 计算平台总余额
        let totalBalance = 0;
        Object.keys(gameBalanceManager.balances).forEach(addr => {
            totalBalance += gameBalanceManager.getBalance(addr);
        });
        
        // 当前在线玩家（Party Crisis）
        let onlinePlayers = 0;
        let currentGame = null;
        if (partyCrisisGames && partyCrisisGames.size > 0) {
            const game = Array.from(partyCrisisGames.values())[0];
            onlinePlayers = game.players.size;
            currentGame = {
                gameId: game.gameId,
                phase: game.phase,
                countdown: game.countdown,
                playerCount: game.players.size,
                botCount: game.bots.length,
                roomStats: game.getRoomStats()
            };
        }
        
        // 交易统计
        const now = Date.now();
        const oneDayAgo = now - 24 * 60 * 60 * 1000;
        const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
        const oneMonthAgo = now - 30 * 24 * 60 * 60 * 1000;
        
        const stats = {
            today: { deposit: 0, withdraw: 0, spend: 0, reward: 0, count: 0 },
            week: { deposit: 0, withdraw: 0, spend: 0, reward: 0, count: 0 },
            month: { deposit: 0, withdraw: 0, spend: 0, reward: 0, count: 0 }
        };
        
        gameBalanceManager.transactions.forEach(tx => {
            const txTime = tx.timestamp * 1000;
            const amount = parseFloat(tx.amount);
            
            if (txTime >= oneDayAgo) {
                stats.today[tx.type] += amount;
                stats.today.count++;
            }
            if (txTime >= oneWeekAgo) {
                stats.week[tx.type] += amount;
                stats.week.count++;
            }
            if (txTime >= oneMonthAgo) {
                stats.month[tx.type] += amount;
                stats.month.count++;
            }
        });
        
        res.json({
            success: true,
            data: {
                users: {
                    total: userCount,
                    active: activeUserCount,
                    online: onlinePlayers
                },
                balance: {
                    total: totalBalance
                },
                currentGame: currentGame,
                transactions: stats
            }
        });
        
    } catch (error) {
        console.error('[管理员] 获取仪表盘数据失败:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ==================== 2. 用户管理 ====================

/**
 * GET /api/admin/users
 * 获取用户列表
 */
router.get('/users', verifyAdmin, async (req, res) => {
    try {
        await gameBalanceManager.init();
        
        const { search, page = 1, limit = 20 } = req.query;
        
        // 获取所有用户
        let users = Object.values(gameBalanceManager.users).map(user => ({
            uid: user.uid,
            username: user.username,
            address: user.address,
            balance: gameBalanceManager.getBalance(user.address),
            createdAt: user.createdAt,
            firstDepositAt: user.firstDepositAt
        }));
        
        // 搜索过滤
        if (search) {
            const searchLower = search.toLowerCase();
            users = users.filter(user => 
                (user.username && user.username.toLowerCase().includes(searchLower)) ||
                user.uid.includes(search) ||
                user.address.toLowerCase().includes(searchLower)
            );
        }
        
        // 排序（按余额降序）
        users.sort((a, b) => b.balance - a.balance);
        
        // 分页
        const total = users.length;
        const start = (page - 1) * limit;
        const paginatedUsers = users.slice(start, start + parseInt(limit));
        
        res.json({
            success: true,
            data: {
                users: paginatedUsers,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: total,
                    pages: Math.ceil(total / limit)
                }
            }
        });
        
    } catch (error) {
        console.error('[管理员] 获取用户列表失败:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/admin/users/:address
 * 获取用户详细信息
 */
router.get('/users/:address', verifyAdmin, async (req, res) => {
    try {
        await gameBalanceManager.init();
        
        const { address } = req.params;
        const normalizedAddr = address.toLowerCase();
        
        const user = gameBalanceManager.users[normalizedAddr];
        if (!user) {
            return res.status(404).json({
                success: false,
                error: '用户不存在'
            });
        }
        
        // 获取用户交易记录
        const transactions = gameBalanceManager.getTransactions(address, 100);
        
        // 统计
        let totalDeposit = 0, totalWithdraw = 0, totalSpend = 0, totalReward = 0;
        transactions.forEach(tx => {
            switch (tx.type) {
                case 'deposit': totalDeposit += tx.amount; break;
                case 'withdraw': totalWithdraw += tx.amount; break;
                case 'spend': totalSpend += tx.amount; break;
                case 'reward': totalReward += tx.amount; break;
            }
        });
        
        res.json({
            success: true,
            data: {
                user: {
                    ...user,
                    balance: gameBalanceManager.getBalance(address)
                },
                statistics: {
                    totalDeposit,
                    totalWithdraw,
                    totalSpend,
                    totalReward,
                    profit: totalReward - totalSpend
                },
                transactions: transactions
            }
        });
        
    } catch (error) {
        console.error('[管理员] 获取用户详情失败:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ==================== 3. 游戏管理（Party Crisis）====================

/**
 * GET /api/admin/party-crisis/current
 * 获取当前游戏状态和实时投注数据
 */
router.get('/party-crisis/current', verifyAdmin, (req, res) => {
    try {
        if (!partyCrisisGames || partyCrisisGames.size === 0) {
            return res.json({
                success: true,
                data: null
            });
        }
        
        const game = Array.from(partyCrisisGames.values())[0];
        const roomStats = game.getRoomStats();
        
        // 详细统计每个房间的玩家和Bot投注
        const roomDetails = {};
        for (let roomId = 1; roomId <= 8; roomId++) {
            const players = Array.from(game.players.values()).filter(p => p.roomId === roomId);
            const bots = game.bots.filter(b => b.roomId === roomId);
            
            roomDetails[roomId] = {
                name: require('./party-crisis').ROOMS[roomId]?.name || `房间${roomId}`,
                playerCount: players.length,
                playerBet: players.reduce((sum, p) => sum + p.amount, 0),
                botCount: bots.length,
                botBet: bots.reduce((sum, b) => sum + b.amount, 0),
                totalBet: roomStats[roomId].totalBet
            };
        }
        
        res.json({
            success: true,
            data: {
                gameId: game.gameId,
                phase: game.phase,
                countdown: game.countdown,
                targetRoom: game.targetRoom,
                canControlTarget: game.phase === 'betting' && game.countdown <= 2, // 倒计时2秒内可控制
                roomDetails: roomDetails,
                totalPlayers: game.players.size,
                totalBots: game.bots.length
            }
        });
        
    } catch (error) {
        console.error('[管理员] 获取当前游戏状态失败:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/admin/party-crisis/set-target
 * 手动设置杀手目标房间
 */
router.post('/party-crisis/set-target', verifyAdmin, (req, res) => {
    try {
        const { roomId } = req.body;
        
        if (!roomId || roomId < 1 || roomId > 8) {
            return res.status(400).json({
                success: false,
                error: '无效的房间ID'
            });
        }
        
        if (!partyCrisisGames || partyCrisisGames.size === 0) {
            return res.status(400).json({
                success: false,
                error: '当前没有进行中的游戏'
            });
        }
        
        const game = Array.from(partyCrisisGames.values())[0];
        
        // 只允许在投注阶段且倒计时2秒内设置
        if (game.phase !== 'betting' || game.countdown > 2) {
            return res.status(400).json({
                success: false,
                error: '只能在投注阶段倒计时2秒内设置目标房间'
            });
        }
        
        // 设置管理员指定的目标房间
        game.adminTargetRoom = roomId;
        
        console.log(`[管理员控制] 设置杀手目标房间: ${roomId}`);
        
        res.json({
            success: true,
            message: `已设置目标房间为: ${roomId}`,
            data: {
                roomId: roomId,
                countdown: game.countdown
            }
        });
        
    } catch (error) {
        console.error('[管理员] 设置目标房间失败:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/admin/party-crisis/history
 * 获取游戏历史记录
 */
router.get('/party-crisis/history', verifyAdmin, (req, res) => {
    try {
        const { limit = 50 } = req.query;
        
        if (!partyCrisisGlobalHistory) {
            return res.json({
                success: true,
                data: []
            });
        }
        
        const history = partyCrisisGlobalHistory.slice(-parseInt(limit));
        
        res.json({
            success: true,
            data: history
        });
        
    } catch (error) {
        console.error('[管理员] 获取游戏历史失败:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ==================== 4. 财务管理 ====================

/**
 * GET /api/admin/transactions
 * 获取交易记录
 */
router.get('/transactions', verifyAdmin, async (req, res) => {
    try {
        await gameBalanceManager.init();
        
        const { type, limit = 100, page = 1 } = req.query;
        
        let transactions = [...gameBalanceManager.transactions];
        
        // 类型过滤
        if (type) {
            transactions = transactions.filter(tx => tx.type === type);
        }
        
        // 排序（最新的在前）
        transactions.sort((a, b) => b.timestamp - a.timestamp);
        
        // 分页
        const total = transactions.length;
        const start = (page - 1) * limit;
        const paginatedTxs = transactions.slice(start, start + parseInt(limit));
        
        res.json({
            success: true,
            data: {
                transactions: paginatedTxs,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: total,
                    pages: Math.ceil(total / limit)
                }
            }
        });
        
    } catch (error) {
        console.error('[管理员] 获取交易记录失败:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/admin/revenue
 * 获取平台收入统计
 */
router.get('/revenue', verifyAdmin, async (req, res) => {
    try {
        await gameBalanceManager.init();
        
        // 计算平台收入（游戏消费 - 游戏奖励）
        let totalSpend = 0;
        let totalReward = 0;
        
        gameBalanceManager.transactions.forEach(tx => {
            if (tx.type === 'spend') totalSpend += tx.amount;
            if (tx.type === 'reward') totalReward += tx.amount;
        });
        
        const platformRevenue = totalSpend - totalReward;
        const platformFeeRate = 0.10; // 10% 平台费
        const estimatedFee = totalSpend * platformFeeRate;
        
        res.json({
            success: true,
            data: {
                totalSpend: totalSpend,
                totalReward: totalReward,
                platformRevenue: platformRevenue,
                estimatedFee: estimatedFee,
                feeRate: platformFeeRate
            }
        });
        
    } catch (error) {
        console.error('[管理员] 获取收入统计失败:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ==================== 5. 系统管理 ====================

/**
 * GET /api/admin/logs
 * 获取系统日志
 */
router.get('/logs', verifyAdmin, async (req, res) => {
    try {
        // 这里可以读取日志文件或返回内存中的日志
        // 暂时返回最近的控制台日志（如果有日志系统）
        res.json({
            success: true,
            data: {
                message: '日志功能待实现'
            }
        });
        
    } catch (error) {
        console.error('[管理员] 获取日志失败:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/admin/backup
 * 创建数据备份
 */
router.post('/backup', verifyAdmin, async (req, res) => {
    try {
        await gameBalanceManager.init();
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupDir = path.join(__dirname, '..', 'data', 'backups');
        const backupFile = path.join(backupDir, `backup-${timestamp}.json`);
        
        // 创建备份目录
        await fs.mkdir(backupDir, { recursive: true });
        
        // 备份数据
        const backupData = {
            timestamp: new Date().toISOString(),
            balances: gameBalanceManager.balances,
            transactions: gameBalanceManager.transactions,
            users: gameBalanceManager.users
        };
        
        await fs.writeFile(backupFile, JSON.stringify(backupData, null, 2));
        
        res.json({
            success: true,
            message: '备份创建成功',
            data: {
                filename: `backup-${timestamp}.json`,
                path: backupFile
            }
        });
        
    } catch (error) {
        console.error('[管理员] 创建备份失败:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/admin/config
 * 获取系统配置
 */
router.get('/config', verifyAdmin, (req, res) => {
    try {
        // 返回游戏配置（不包含敏感信息）
        const config = {
            partyCrisis: {
                bettingDuration: 60,
                killerDuration: 15,
                settlingDuration: 6,
                minBet: 1,
                platformFee: 0.10
            }
        };
        
        res.json({
            success: true,
            data: config
        });
        
    } catch (error) {
        console.error('[管理员] 获取配置失败:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = { router, initPartyCrisisRef };
