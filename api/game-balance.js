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
            
            default:
                res.status(400).json({
                    success: false,
                    error: 'Invalid action. Use: getBalance, deposit, withdraw, getTransactions, spend, reward'
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

module.exports = router;
