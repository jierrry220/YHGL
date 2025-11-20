/**
 * 游戏余额管理 API - Express Router
 * 提供充值、提现、查询等接口
 */

const express = require('express');
const router = express.Router();
const { gameBalanceManager } = require('../game-balance');

// 初始化余额管理器
gameBalanceManager.init().catch(console.error);

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

    const balance = gameBalanceManager.getBalance(address);

    res.json({
        success: true,
        data: {
            address: address.toLowerCase(),
            balance: balance
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

        // 成功时正常返回
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

    try {
        const { address, amount } = req.body;

        if (!address || !amount) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters'
            });
        }

        const result = await gameBalanceManager.withdraw(address, amount);

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
