/**
 * 提现安全管理器
 * 负责提现的安全检查、限流、异常检测和人工审核
 */

const fs = require('fs').promises;
const path = require('path');

// 加载环境变量
require('dotenv').config();

// 配置
const SECURITY_CONFIG = {
    // 提现冷却时间（毫秒）- 默认5分钟
    WITHDRAW_COOLDOWN: parseInt(process.env.WITHDRAW_COOLDOWN || '300000'),
    
    // 每日提现金额上限 - 默认10000 DP
    DAILY_WITHDRAW_AMOUNT_LIMIT: parseFloat(process.env.DAILY_WITHDRAW_AMOUNT_LIMIT || '10000'),
    
    // 触发人工审核的提现/充值比例 - 默认4倍
    WITHDRAW_REVIEW_RATIO: parseFloat(process.env.WITHDRAW_REVIEW_RATIO || '4'),
    
    // 单次提现大额审核阀值 - 默认5000 DP
    LARGE_WITHDRAW_THRESHOLD: parseFloat(process.env.LARGE_WITHDRAW_THRESHOLD || '5000'),
    
    // 锁超时时间（毫秒）- 默认30秒
    LOCK_TIMEOUT: parseInt(process.env.LOCK_TIMEOUT || '30000'),
    
    // 数据文件路径
    SECURITY_DB_PATH: path.join(__dirname, 'data', 'withdraw-security.json')
};

class WithdrawSecurityManager {
    constructor() {
        // 用户最后一次提现时间记录
        this.lastWithdrawTime = {}; // { address: timestamp }
        
        // 每日提现统计
        this.dailyStats = {}; // { address: { date, withdrawCount, withdrawAmount, depositAmount } }
        
        // 待审核提现队列
        this.pendingReviews = []; // [{ id, address, amount, reason, timestamp, status }]
        
        // 改进的锁机制（带超时）
        this.locks = new Map(); // { address: { timestamp, timeout } }
    }

    /**
     * 初始化 - 加载数据
     */
    async init() {
        try {
            const data = await fs.readFile(SECURITY_CONFIG.SECURITY_DB_PATH, 'utf-8');
            const parsed = JSON.parse(data);
            
            this.lastWithdrawTime = parsed.lastWithdrawTime || {};
            this.dailyStats = parsed.dailyStats || {};
            this.pendingReviews = parsed.pendingReviews || [];
            
            console.log(`✅ 提现安全数据加载成功: ${this.pendingReviews.length} 个待审核提现`);
        } catch (error) {
            console.log('⚠️  初始化新的提现安全数据库');
            await this.save();
        }
    }

    /**
     * 保存数据
     */
    async save() {
        const dir = path.dirname(SECURITY_CONFIG.SECURITY_DB_PATH);
        await fs.mkdir(dir, { recursive: true });
        
        const data = {
            lastWithdrawTime: this.lastWithdrawTime,
            dailyStats: this.dailyStats,
            pendingReviews: this.pendingReviews,
            lastUpdate: new Date().toISOString()
        };
        
        await fs.writeFile(SECURITY_CONFIG.SECURITY_DB_PATH, JSON.stringify(data, null, 2));
    }

    /**
     * 获取改进的锁（带超时）
     */
    async acquireLock(address) {
        const normalizedAddr = address.toLowerCase();
        
        while (this.locks.has(normalizedAddr)) {
            const lock = this.locks.get(normalizedAddr);
            
            // 检查锁是否超时
            if (Date.now() - lock.timestamp > SECURITY_CONFIG.LOCK_TIMEOUT) {
                console.warn(`⚠️  锁超时自动释放: ${normalizedAddr}`);
                this.locks.delete(normalizedAddr);
                break;
            }
            
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        
        this.locks.set(normalizedAddr, {
            timestamp: Date.now(),
            timeout: SECURITY_CONFIG.LOCK_TIMEOUT
        });
    }

    /**
     * 释放锁
     */
    releaseLock(address) {
        const normalizedAddr = address.toLowerCase();
        this.locks.delete(normalizedAddr);
    }

    /**
     * 获取今日日期字符串
     */
    getTodayString() {
        return new Date().toISOString().split('T')[0];
    }

    /**
     * 获取用户今日统计数据
     */
    getTodayStats(address) {
        const normalizedAddr = address.toLowerCase();
        const today = this.getTodayString();
        
        if (!this.dailyStats[normalizedAddr] || this.dailyStats[normalizedAddr].date !== today) {
            // 新的一天，重置统计
            this.dailyStats[normalizedAddr] = {
                date: today,
                withdrawCount: 0,
                withdrawAmount: 0,
                depositAmount: 0
            };
        }
        
        return this.dailyStats[normalizedAddr];
    }

    /**
     * 记录充值（用于计算提现/充值比例）
     */
    async recordDeposit(address, amount) {
        const stats = this.getTodayStats(address);
        stats.depositAmount += parseFloat(amount);
        await this.save();
    }

    /**
     * 检查提现是否允许（核心检查方法）
     * @returns { allowed: boolean, reason: string, needsReview: boolean, reviewReason: string }
     */
    async checkWithdrawAllowed(address, amount, transactions = []) {
        const normalizedAddr = address.toLowerCase();
        const withdrawAmount = parseFloat(amount);
        const stats = this.getTodayStats(normalizedAddr);

        // 1. 检查冷却时间
        const lastTime = this.lastWithdrawTime[normalizedAddr];
        if (lastTime) {
            const timeSinceLastWithdraw = Date.now() - lastTime;
            if (timeSinceLastWithdraw < SECURITY_CONFIG.WITHDRAW_COOLDOWN) {
                const remainingSeconds = Math.ceil((SECURITY_CONFIG.WITHDRAW_COOLDOWN - timeSinceLastWithdraw) / 1000);
                return {
                    allowed: false,
                    // 文案交给前端通过 i18n 显示，这里只返回机器可读的代码
                    reason: `withdraw_cooldown:${remainingSeconds}`,
                    needsReview: false
                };
            }
        }

        // 2. 异常检测：多种触发条件
        const depositToday = stats.depositAmount;
        const withdrawTodayAfter = stats.withdrawAmount + withdrawAmount;
        
        let needsReview = false;
        let reviewReason = '';
        
        // 2.1 单次提现大额审核（5000 DP 及以上）
        if (withdrawAmount >= SECURITY_CONFIG.LARGE_WITHDRAW_THRESHOLD) {
            needsReview = true;
            reviewReason = `单次提现金额过大（${withdrawAmount} DP >= ${SECURITY_CONFIG.LARGE_WITHDRAW_THRESHOLD} DP），需要人工审核`;
        }
        
        // 2.2 提现/充值比例异常
        if (!needsReview) {
            if (depositToday === 0 && withdrawTodayAfter > 0) {
                needsReview = true;
                reviewReason = `今日无充值记录但申请提现 ${withdrawAmount} DP`;
            } else if (depositToday > 0 && withdrawTodayAfter >= depositToday * SECURITY_CONFIG.WITHDRAW_REVIEW_RATIO) {
                const ratio = (withdrawTodayAfter / depositToday).toFixed(2);
                needsReview = true;
                reviewReason = `提现/充值比例异常（${ratio}倍），今日充值: ${depositToday} DP, 今日提现: ${withdrawTodayAfter} DP`;
            }
        }
        
        // 2.3 频繁失败检测
        if (!needsReview) {
            const recentFailedWithdraws = transactions.filter(tx => 
                tx.type === 'withdraw' && 
                tx.status === 'failed' &&
                tx.timestamp > Math.floor(Date.now() / 1000) - 3600 // 最近1小时
            );
            
            if (recentFailedWithdraws.length >= 5) {
                needsReview = true;
                reviewReason = `检测到1小时内${recentFailedWithdraws.length}次失败提现尝试`;
            }
        }

        return {
            allowed: true,
            reason: 'ok',
            needsReview: needsReview,
            reviewReason: reviewReason
        };
    }

    /**
     * 创建待审核提现记录
     */
    async createPendingReview(address, amount, reason, additionalInfo = {}) {
        const review = {
            id: `review_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            address: address.toLowerCase(),
            amount: parseFloat(amount),
            reason: reason,
            timestamp: Date.now(),
            createdAt: new Date().toISOString(),
            status: 'pending', // pending, approved, rejected
            reviewedAt: null,
            reviewedBy: null,
            reviewNote: null,
            ...additionalInfo
        };

        this.pendingReviews.push(review);
        await this.save();

        console.log(`🔍 [待审核] 创建提现审核: ${review.id}`);
        console.log(`   地址: ${address}`);
        console.log(`   金额: ${amount} DP`);
        console.log(`   原因: ${reason}`);

        return review;
    }

    /**
     * 记录提现成功
     */
    async recordWithdrawSuccess(address, amount) {
        const normalizedAddr = address.toLowerCase();
        const stats = this.getTodayStats(normalizedAddr);
        
        stats.withdrawCount += 1;
        stats.withdrawAmount += parseFloat(amount);
        this.lastWithdrawTime[normalizedAddr] = Date.now();
        
        await this.save();
    }

    /**
     * 检查用户是否有待审核的提现（方案1）
     */
    async hasPendingWithdraw(address) {
        const normalizedAddr = address.toLowerCase();
        return this.pendingReviews.some(
            r => r.address === normalizedAddr && r.status === 'pending'
        );
    }
    
    /**
     * 获取待审核提现列表
     */
    getPendingReviews(status = 'pending') {
        if (status === 'all') {
            return this.pendingReviews.sort((a, b) => b.timestamp - a.timestamp);
        }
        return this.pendingReviews
            .filter(r => r.status === status)
            .sort((a, b) => b.timestamp - a.timestamp);
    }

    /**
     * 审核提现（通过或拒绝）
     */
    async reviewWithdraw(reviewId, approved, reviewNote = '', reviewedBy = 'admin') {
        const review = this.pendingReviews.find(r => r.id === reviewId);
        
        if (!review) {
            throw new Error('审核记录不存在');
        }

        if (review.status !== 'pending') {
            throw new Error(`该提现已被处理（状态: ${review.status}）`);
        }

        review.status = approved ? 'approved' : 'rejected';
        review.reviewedAt = new Date().toISOString();
        review.reviewedBy = reviewedBy;
        review.reviewNote = reviewNote;

        await this.save();

        console.log(`✅ [审核${approved ? '通过' : '拒绝'}] ${reviewId}`);
        console.log(`   地址: ${review.address}`);
        console.log(`   金额: ${review.amount} DP`);
        console.log(`   备注: ${reviewNote}`);

        return review;
    }

    /**
     * 获取用户提现统计
     */
    getUserStats(address) {
        const normalizedAddr = address.toLowerCase();
        const todayStats = this.getTodayStats(normalizedAddr);
        const lastWithdraw = this.lastWithdrawTime[normalizedAddr];
        
        return {
            today: todayStats,
            lastWithdrawTime: lastWithdraw ? new Date(lastWithdraw).toISOString() : null,
            limits: {
                dailyAmountLimit: SECURITY_CONFIG.DAILY_WITHDRAW_AMOUNT_LIMIT,
                cooldownMs: SECURITY_CONFIG.WITHDRAW_COOLDOWN,
                largeWithdrawThreshold: SECURITY_CONFIG.LARGE_WITHDRAW_THRESHOLD
            }
        };
    }

    /**
     * 获取所有用户统计（管理员）
     */
    getAllStats() {
        return {
            config: SECURITY_CONFIG,
            totalUsers: Object.keys(this.dailyStats).length,
            pendingReviewsCount: this.pendingReviews.filter(r => r.status === 'pending').length,
            userStats: this.dailyStats
        };
    }
}

// 导出单例
const withdrawSecurityManager = new WithdrawSecurityManager();

module.exports = {
    withdrawSecurityManager,
    SECURITY_CONFIG
};
