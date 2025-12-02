/**
 * 游戏余额管理 API - Express Router
 * 提供充值、提现、查询等接口
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { gameBalanceManager } = require('../game-balance');

// 配置 API 限流器
// 提现接口的严格限流：每个 IP 每分钟最多 3 次请求
const withdrawLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 分钟
    max: 3, // 最多 3 次请求
    message: {
        success: false,
        error: '请求过于频繁，请稍后再试'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// 其他接口的宽松限流：每个 IP 每分钟最多 30 次请求
const generalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    message: {
        success: false,
        error: '请求过于频繁，请稍后再试'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// 初始化余额管理器
gameBalanceManager.init().catch(console.error);

// 应用通用限流器到所有路由
router.use(generalLimiter);

// 主路由 - 根据 action 参数分发请求
router.all('/', async (req, res) => {
    try {
        const action = req.query.action;

        switch (action) {
            case 'getBalance':
                await handleGetBalance(req, res);
                break;
            
            case 'deposit':
                await handleDeposit(req, res);
                break;
            
            case 'withdraw':
                await handleWithdraw(req, res);
                break;
            
            case 'getTransactions':
                await handleGetTransactions(req, res);
                break;
            
            case 'spend':
                await handleSpend(req, res);
                break;
            
            case 'reward':
                await handleReward(req, res);
                break;
            
            case 'getUserInfo':
                await handleGetUserInfo(req, res);
                break;
            
            case 'setUsername':
                await handleSetUsername(req, res);
                break;
            
            case 'checkUsername':
                await handleCheckUsername(req, res);
                break;
            
            default:
                res.status(400).json({
                    success: false,
                    error: 'Invalid action. Use: getBalance, deposit, withdraw, getTransactions, spend, reward, getUserInfo, setUsername, checkUsername'
                });
        }
    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * 获取用户余额
 * GET ?action=getBalance&address=0x...
 */
async function handleGetBalance(req, res) {
    const address = req.query.address;
    
    if (!address) {
        return res.status(400).json({
            success: false,
            error: 'Missing address parameter'
        });
    }

    const totalBalance = gameBalanceManager.getBalance(address);
    const frozenBalance = gameBalanceManager.getFrozenBalance(address);
    const availableBalance = gameBalanceManager.getAvailableBalance(address);

    res.json({
        success: true,
        data: {
            address: address.toLowerCase(),
            balance: totalBalance,  // 总余额（包含冻结）
            frozenBalance: frozenBalance,  // 冻结余额
            availableBalance: availableBalance  // 可用余额（总余额 - 冻结）
        }
    });
}

/**
 * 充值
 * POST ?action=deposit
 * Body: { address, amount, txHash }
 */
async function handleDeposit(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({
            success: false,
            error: 'Method not allowed'
        });
    }

    try {
        const { address, amount, txHash } = req.body;

        if (!address || !amount || !txHash) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters'
            });
        }

        const result = await gameBalanceManager.deposit(address, amount, txHash);

        // 如果是pending状态,直接返回(不包装在data中)
        if (result.pending) {
            return res.json(result);
        }

        // 成功时返回 - 将关键字段提升到顶层以便前端访问
        res.json({
            success: true,
            isFirstDeposit: result.isFirstDeposit,
            isOldUserUpgrade: result.isOldUserUpgrade,
            user: result.user,
            data: result
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
}

/**
 * 提现
 * POST ?action=withdraw
 * Body: { address, amount }
 */
async function handleWithdraw(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({
            success: false,
            error: 'Method not allowed'
        });
    }

    // 应用严格的提现限流
    await new Promise((resolve, reject) => {
        withdrawLimiter(req, res, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });

    try {
        const { address, amount } = req.body;

        if (!address || !amount) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters'
            });
        }

        const result = await gameBalanceManager.withdraw(address, amount);

        // 如果需要人工审核，返回特殊状态
        if (result.pending_review) {
            return res.status(202).json({
                success: false,
                pending_review: true,
                reviewId: result.reviewId,
                reason: result.reason,
                message: result.message,
                data: result.transaction
            });
        }

        // 成功提现
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
}

/**
 * 获取交易记录
 * GET ?action=getTransactions&address=0x...&limit=50
 */
async function handleGetTransactions(req, res) {
    const address = req.query.address;
    const limit = parseInt(req.query.limit || '50');

    if (!address) {
        return res.status(400).json({
            success: false,
            error: 'Missing address parameter'
        });
    }

    const transactions = gameBalanceManager.getTransactions(address, limit);

    res.json({
        success: true,
        data: transactions
    });
}

/**
 * 消费余额（游戏内部调用）
 * POST ?action=spend
 * Body: { address, amount, gameId, description }
 */
async function handleSpend(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({
            success: false,
            error: 'Method not allowed'
        });
    }

    try {
        const { address, amount, gameId, description } = req.body;

        if (!address || !amount || !gameId) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters'
            });
        }

        const result = await gameBalanceManager.spend(address, amount, gameId, description);

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
}

/**
 * 奖励余额（游戏内部调用）
 * POST ?action=reward
 * Body: { address, amount, gameId, description }
 */
async function handleReward(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({
            success: false,
            error: 'Method not allowed'
        });
    }

    try {
        const { address, amount, gameId, description } = req.body;

        if (!address || !amount || !gameId) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters'
            });
        }

        const result = await gameBalanceManager.reward(address, amount, gameId, description);

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
}

/**
 * 获取用户信息
 * GET ?action=getUserInfo&address=0x...
 */
async function handleGetUserInfo(req, res) {
    const address = req.query.address;
    
    if (!address) {
        return res.status(400).json({
            success: false,
            error: 'Missing address parameter'
        });
    }

    const userInfo = gameBalanceManager.getUserInfo(address);
    const balance = gameBalanceManager.getBalance(address);

    if (!userInfo) {
        return res.json({
            success: true,
            data: {
                exists: false,
                address: address.toLowerCase(),
                balance: balance,
                message: '用户未注册，请先进行首次充值'
            }
        });
    }

    res.json({
        success: true,
        data: {
            exists: true,
            uid: userInfo.uid,
            address: userInfo.address,
            username: userInfo.username,
            hasUsername: !!userInfo.username,
            balance: balance,
            createdAt: userInfo.createdAt,
            firstDepositAt: userInfo.firstDepositAt,
            usernameSetAt: userInfo.usernameSetAt
        }
    });
}

/**
 * 设置用户名
 * POST ?action=setUsername
 * Body: { address, username }
 */
async function handleSetUsername(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({
            success: false,
            error: 'Method not allowed'
        });
    }

    try {
        const { address, username } = req.body;

        if (!address || !username) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters: address, username'
            });
        }

        const user = await gameBalanceManager.setUsername(address, username);

        res.json({
            success: true,
            data: {
                uid: user.uid,
                address: user.address,
                username: user.username,
                usernameSetAt: user.usernameSetAt
            }
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
}

/**
 * 检查用户名是否可用
 * GET ?action=checkUsername&username=xxx
 */
async function handleCheckUsername(req, res) {
    const username = req.query.username;
    
    if (!username) {
        return res.status(400).json({
            success: false,
            error: 'Missing username parameter'
        });
    }

    // 验证格式
    const validation = gameBalanceManager.validateUsername(username);
    if (!validation.valid) {
        return res.json({
            success: true,
            data: {
                available: false,
                reason: 'invalid_format',
                error: validation.error
            }
        });
    }

    // 检查是否已被使用
    const isTaken = gameBalanceManager.isUsernameTaken(validation.username);
    
    res.json({
        success: true,
        data: {
            available: !isTaken,
            reason: isTaken ? 'already_taken' : 'available',
            username: validation.username
        }
    });
}

module.exports = router;
