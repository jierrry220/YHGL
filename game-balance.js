/**
 * 游戏平台余额管理系统
 * 负责管理用户在游戏平台内的余额
 */

const fs = require('fs').promises;
const path = require('path');
const { ethers } = require('ethers');
const { v4: uuidv4 } = require('uuid');
const { depositVerifier } = require('./deposit-verifier');

// 加载环境变量
require('dotenv').config();

// 配置
const CONFIG = {
    BALANCE_DB_PATH: path.join(__dirname, 'data', 'game-balances.json'),
    DP_TOKEN: process.env.DP_TOKEN || '0xf7C464c7832e59855aa245Ecc7677f54B3460e7d',
    RPC_URL: process.env.RPC_URL || 'https://rpc.berachain.com',
    // 提现地址（游戏平台的钱包地址）
    PLATFORM_WALLET: process.env.PLATFORM_WALLET_ADDRESS || '0xE3325A0CAABb3C677a89C5A72C2878Ef2E7470FB',
    PLATFORM_PRIVATE_KEY: process.env.PLATFORM_PRIVATE_KEY || '0xf16963811af59b58278556c34a38024c31726421c9b50722fba74dafa7266087',
    // 游戏平台接收地址（用户充值时转入这个地址）
    GAME_PLATFORM_RECEIVER: process.env.GAME_PLATFORM_RECEIVER || '0xE3325A0CAABb3C677a89C5A72C2878Ef2E7470FB',
    // 最小充值/提现金额
    MIN_DEPOSIT: parseFloat(process.env.MIN_DEPOSIT || '1'),
    MIN_WITHDRAW: parseFloat(process.env.MIN_WITHDRAW || '1'),
};

const DP_TOKEN_ABI = [
    'function transfer(address to, uint256 amount) returns (bool)',
    'function balanceOf(address) view returns (uint256)'
];

class GameBalanceManager {
    constructor() {
        this.balances = {};
        this.transactions = [];
        this.users = {}; // 用户信息: { address: { uid, username, createdAt, firstDepositAt } }
        this.provider = new ethers.providers.JsonRpcProvider(CONFIG.RPC_URL);
    }

    /**
     * 初始化 - 加载数据库
     */
    async init() {
        try {
            const data = await fs.readFile(CONFIG.BALANCE_DB_PATH, 'utf-8');
            const parsed = JSON.parse(data);
            this.balances = parsed.balances || {};
            this.transactions = parsed.transactions || [];
            this.users = parsed.users || {};
            
            const userCount = Object.keys(this.balances).length;
            const registeredUserCount = Object.keys(this.users).length;
            const txCount = this.transactions.length;
            console.log(`✅ 从 Volume 加载数据成功: ${registeredUserCount} 个注册用户, ${userCount} 个余额账户, ${txCount} 条交易记录`);
            console.log(`   文件: ${CONFIG.BALANCE_DB_PATH}`);
            console.log(`   最后更新: ${parsed.lastUpdate || '未知'}`);
        } catch (error) {
            // 文件不存在或读取失败，初始化空数据
            console.log('⚠️  初始化新的余额数据库 (首次部署或 Volume 未挂载)');
            console.log(`   文件: ${CONFIG.BALANCE_DB_PATH}`);
            await this.save();
        }
    }

    /**
     * 保存到数据库
     */
    async save() {
        const dir = path.dirname(CONFIG.BALANCE_DB_PATH);
        await fs.mkdir(dir, { recursive: true });
        
        const data = {
            balances: this.balances,
            transactions: this.transactions,
            users: this.users,
            lastUpdate: new Date().toISOString()
        };
        
        await fs.writeFile(CONFIG.BALANCE_DB_PATH, JSON.stringify(data, null, 2));
    }

    /**
     * 获取用户余额
     */
    getBalance(address) {
        const normalizedAddr = address.toLowerCase();
        return parseFloat(this.balances[normalizedAddr] || '0');
    }

    /**
     * 生成唯一 UID
     */
    generateUID() {
        return uuidv4();
    }

    /**
     * 验证用户名格式
     */
    validateUsername(username) {
        // 用户名规则: 3-20个字符，只允许字母、数字、下划线、中文
        if (!username || typeof username !== 'string') {
            return { valid: false, error: '用户名不能为空' };
        }

        const trimmed = username.trim();
        
        if (trimmed.length < 3 || trimmed.length > 20) {
            return { valid: false, error: '用户名长度必须在3-20个字符之间' };
        }

        // 允许字母、数字、下划线、中文
        const validPattern = /^[a-zA-Z0-9_\u4e00-\u9fa5]+$/;
        if (!validPattern.test(trimmed)) {
            return { valid: false, error: '用户名只能包含字母、数字、下划线和中文' };
        }

        return { valid: true, username: trimmed };
    }

    /**
     * 检查用户名是否已被使用
     */
    isUsernameTaken(username) {
        const normalizedUsername = username.toLowerCase();
        return Object.values(this.users).some(
            user => user.username && user.username.toLowerCase() === normalizedUsername
        );
    }

    /**
     * 创建用户（首次充值时调用）
     */
    async createUser(address) {
        const normalizedAddr = address.toLowerCase();
        
        // 检查用户是否已存在
        if (this.users[normalizedAddr]) {
            return this.users[normalizedAddr];
        }

        // 创建新用户
        const uid = this.generateUID();
        const user = {
            uid: uid,
            address: normalizedAddr,
            username: null, // 初始为null，等待用户设置
            createdAt: new Date().toISOString(),
            firstDepositAt: new Date().toISOString()
        };

        this.users[normalizedAddr] = user;
        await this.save();

        console.log(`👤 [用户创建] UID: ${uid}, 地址: ${normalizedAddr}`);
        return user;
    }

    /**
     * 设置用户名（只能设置一次）
     */
    async setUsername(address, username) {
        const normalizedAddr = address.toLowerCase();
        
        // 1. 检查用户是否存在
        const user = this.users[normalizedAddr];
        if (!user) {
            throw new Error('用户不存在，请先进行首次充值');
        }

        // 2. 检查是否已设置过用户名
        if (user.username) {
            throw new Error('用户名已设置，不可修改');
        }

        // 3. 验证用户名格式
        const validation = this.validateUsername(username);
        if (!validation.valid) {
            throw new Error(validation.error);
        }

        // 4. 检查用户名是否已被占用
        if (this.isUsernameTaken(validation.username)) {
            throw new Error('该用户名已被使用');
        }

        // 5. 设置用户名
        user.username = validation.username;
        user.usernameSetAt = new Date().toISOString();
        await this.save();

        console.log(`✅ [用户名设置] UID: ${user.uid}, 用户名: ${validation.username}`);
        return user;
    }

    /**
     * 获取用户信息
     */
    getUserInfo(address) {
        const normalizedAddr = address.toLowerCase();
        return this.users[normalizedAddr] || null;
    }

    /**
     * 通过 UID 获取用户信息
     */
    getUserByUID(uid) {
        return Object.values(this.users).find(user => user.uid === uid) || null;
    }

    /**
     * 通过用户名获取用户信息
     */
    getUserByUsername(username) {
        const normalizedUsername = username.toLowerCase();
        return Object.values(this.users).find(
            user => user.username && user.username.toLowerCase() === normalizedUsername
        ) || null;
    }

    /**
     * 充值 - 用户从钱包转DP到平台 (带链上验证)
     * @param {string} userAddress - 用户地址
     * @param {string} amount - 充值金额（DP）
     * @param {string} txHash - 链上交易哈希
     * @param {boolean} skipVerification - 是否跳过验证(仅用于管理员手动添加)
     */
    async deposit(userAddress, amount, txHash, skipVerification = false) {
        const normalizedAddr = userAddress.toLowerCase();
        const normalizedTxHash = txHash.toLowerCase();
        const depositAmount = parseFloat(amount);

        // 📝 记录充值请求
        const requestLog = {
            timestamp: new Date().toISOString(),
            userAddress: normalizedAddr,
            amount: depositAmount,
            txHash: normalizedTxHash,
            status: 'processing'
        };
        console.log('\n💰 [充值请求]', JSON.stringify(requestLog, null, 2));

        // 1. 验证金额
        if (depositAmount < CONFIG.MIN_DEPOSIT) {
            throw new Error(`充值金额不能小于 ${CONFIG.MIN_DEPOSIT} DP`);
        }

        // 2. 检查是否重复处理
        const alreadyProcessed = this.transactions.find(
            tx => tx.type === 'deposit' && tx.txHash && tx.txHash.toLowerCase() === normalizedTxHash
        );
        if (alreadyProcessed) {
            throw new Error('该交易已经处理过,不能重复充值');
        }

        let verificationResult = null;
        let actualAmount = depositAmount;

        // 3. 检查用户是否存在，不存在则创建（兼容老用户）
        let isFirstDeposit = false;
        let isOldUserUpgrade = false;
        
        if (!this.users[normalizedAddr]) {
            // 检查是否是老用户（有余额但没有用户记录）
            const hasBalance = this.balances[normalizedAddr] && parseFloat(this.balances[normalizedAddr]) > 0;
            const hasTransactions = this.transactions.some(tx => tx.address === normalizedAddr);
            
            if (hasBalance || hasTransactions) {
                // 老用户，补充创建用户记录
                await this.createUser(userAddress);
                isOldUserUpgrade = true;
                console.log('🔄 老用户升级，已补充创建用户账户');
            } else {
                // 真正的首次充值用户
                await this.createUser(userAddress);
                isFirstDeposit = true;
                console.log('🎉 首次充值，已创建用户账户');
            }
        }

        // 4. 链上验证(除非跳过)
        if (!skipVerification) {
            console.log('🔍 开始验证充值交易...');
            verificationResult = await depositVerifier.verify(txHash, userAddress, amount);
            
            if (!verificationResult.success) {
                // 如果是pending状态（确认数不足），返回特殊响应
                if (verificationResult.pending) {
                    // ⏳ 记录pending状态
                    console.log('\n⏳ [充值等待]', {
                        userAddress: normalizedAddr,
                        txHash: normalizedTxHash,
                        confirmations: verificationResult.confirmations,
                        required: verificationResult.requiredConfirmations
                    });
                    return {
                        success: false,
                        pending: true,
                        confirmations: verificationResult.confirmations,
                        requiredConfirmations: verificationResult.requiredConfirmations,
                        message: verificationResult.error
                    };
                }
                // 其他错误则抛出
                console.error('\n❌ [充值失败]', {
                    userAddress: normalizedAddr,
                    txHash: normalizedTxHash,
                    error: verificationResult.error
                });
                throw new Error(`充值验证失败: ${verificationResult.error}`);
            }

            // 使用链上实际金额(更准确)
            actualAmount = verificationResult.data.amount;
            
            console.log('✅ 充值验证通过:');
            console.log(`  - 用户: ${userAddress}`);
            console.log(`  - 金额: ${actualAmount} DP`);
            console.log(`  - 区块: ${verificationResult.data.blockNumber}`);
            console.log(`  - 确认数: ${verificationResult.data.confirmations}`);
        } else {
            console.warn('⚠️  跳过验证模式 (仅用于管理员)');
        }

        // 5. 更新余额
        const currentBalance = this.getBalance(userAddress);
        this.balances[normalizedAddr] = (currentBalance + actualAmount).toString();

        // 6. 记录交易
        const transaction = {
            id: Date.now().toString(),
            type: 'deposit',
            address: normalizedAddr,
            amount: actualAmount,
            txHash: normalizedTxHash,
            timestamp: verificationResult?.data?.timestamp || Math.floor(Date.now() / 1000),
            blockNumber: verificationResult?.data?.blockNumber,
            confirmations: verificationResult?.data?.confirmations,
            verified: !skipVerification,
            status: 'completed'
        };
        this.transactions.push(transaction);

        await this.save();

        // ✅ 记录成功
        console.log('\n✅ [充值成功]', {
            userAddress: normalizedAddr,
            amount: actualAmount,
            newBalance: this.getBalance(userAddress),
            txHash: normalizedTxHash,
            blockNumber: verificationResult?.data?.blockNumber
        });

        return {
            success: true,
            isFirstDeposit: isFirstDeposit,
            isOldUserUpgrade: isOldUserUpgrade,
            user: this.users[normalizedAddr],
            newBalance: this.getBalance(userAddress),
            transaction,
            verification: verificationResult
        };
    }

    /**
     * 消费 - 用户在游戏中使用余额
     */
    async spend(userAddress, amount, gameId, description = '') {
        const normalizedAddr = userAddress.toLowerCase();
        const spendAmount = parseFloat(amount);

        // 检查余额
        const currentBalance = this.getBalance(userAddress);
        if (currentBalance < spendAmount) {
            throw new Error('余额不足');
        }

        // 扣除余额
        this.balances[normalizedAddr] = (currentBalance - spendAmount).toString();

        // 记录交易
        const transaction = {
            id: Date.now().toString(),
            type: 'spend',
            address: normalizedAddr,
            amount: spendAmount,
            gameId: gameId,
            description: description,
            timestamp: Math.floor(Date.now() / 1000),
            status: 'completed'
        };
        this.transactions.push(transaction);

        await this.save();

        return {
            success: true,
            newBalance: this.getBalance(userAddress),
            transaction
        };
    }

    /**
     * 游戏奖励 - 增加用户余额
     */
    async reward(userAddress, amount, gameId, description = '') {
        const normalizedAddr = userAddress.toLowerCase();
        const rewardAmount = parseFloat(amount);

        // 增加余额
        const currentBalance = this.getBalance(userAddress);
        this.balances[normalizedAddr] = (currentBalance + rewardAmount).toString();

        // 记录交易
        const transaction = {
            id: Date.now().toString(),
            type: 'reward',
            address: normalizedAddr,
            amount: rewardAmount,
            gameId: gameId,
            description: description,
            timestamp: Math.floor(Date.now() / 1000),
            status: 'completed'
        };
        this.transactions.push(transaction);

        await this.save();

        return {
            success: true,
            newBalance: this.getBalance(userAddress),
            transaction
        };
    }

    /**
     * 提现 - 用户将游戏余额提现到钱包
     */
    async withdraw(userAddress, amount) {
        const normalizedAddr = userAddress.toLowerCase();
        const withdrawAmount = parseFloat(amount);

        // 验证金额
        if (withdrawAmount < CONFIG.MIN_WITHDRAW) {
            throw new Error(`提现金额不能小于 ${CONFIG.MIN_WITHDRAW} DP`);
        }

        // 检查余额
        const currentBalance = this.getBalance(userAddress);
        if (currentBalance < withdrawAmount) {
            throw new Error('余额不足');
        }

        // 检查平台钱包配置
        if (!CONFIG.PLATFORM_PRIVATE_KEY) {
            throw new Error('平台钱包未配置');
        }

        try {
            // 执行链上转账
            const wallet = new ethers.Wallet(CONFIG.PLATFORM_PRIVATE_KEY, this.provider);
            const dpToken = new ethers.Contract(CONFIG.DP_TOKEN, DP_TOKEN_ABI, wallet);
            
            const amountWei = ethers.utils.parseEther(withdrawAmount.toString());
            const tx = await dpToken.transfer(userAddress, amountWei);
            await tx.wait();

            // 扣除余额
            this.balances[normalizedAddr] = (currentBalance - withdrawAmount).toString();

            // 记录交易
            const transaction = {
                id: Date.now().toString(),
                type: 'withdraw',
                address: normalizedAddr,
                amount: withdrawAmount,
                txHash: tx.hash,
                timestamp: Math.floor(Date.now() / 1000),
                status: 'completed'
            };
            this.transactions.push(transaction);

            await this.save();

            return {
                success: true,
                newBalance: this.getBalance(userAddress),
                txHash: tx.hash,
                transaction
            };
        } catch (error) {
            console.error('提现失败:', error);
            throw new Error('提现失败: ' + error.message);
        }
    }

    /**
     * 获取用户交易记录
     */
    getTransactions(userAddress, limit = 50) {
        const normalizedAddr = userAddress.toLowerCase();
        return this.transactions
            .filter(tx => tx.address === normalizedAddr)
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, limit);
    }

    /**
     * 获取所有交易记录（管理员）
     */
    getAllTransactions(type = null, limit = 100) {
        let filtered = this.transactions;
        
        if (type) {
            filtered = filtered.filter(tx => tx.type === type);
        }
        
        return filtered
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, limit);
    }
}

// 导出单例
const gameBalanceManager = new GameBalanceManager();

module.exports = {
    gameBalanceManager,
    CONFIG
};
