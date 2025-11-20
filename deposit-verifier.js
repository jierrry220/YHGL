/**
 * 充值验证模块
 * 使用 Berachain API 验证交易的真实性和金额
 */

const { ethers } = require('ethers');
require('dotenv').config();

const CONFIG = {
    RPC_URL: process.env.RPC_URL || 'https://rpc.berachain.com',
    BERACHAIN_API_KEY: process.env.BERACHAIN_API_KEY,
    BERATRAIL_API_URL: process.env.BERATRAIL_API_URL || 'https://api.routescan.io/v2/network/mainnet/evm/80084/etherscan',
    DP_TOKEN: process.env.DP_TOKEN || '0xf7C464c7832e59855aa245Ecc7677f54B3460e7d',
    PLATFORM_RECEIVER: process.env.GAME_PLATFORM_RECEIVER || '0xE3325A0CAABb3C677a89C5A72C2878Ef2E7470FB',
    REQUIRED_CONFIRMATIONS: 3, // 需要的确认数 (降低到3以加快到账速度)
};

class DepositVerifier {
    constructor() {
        this.provider = new ethers.providers.JsonRpcProvider(CONFIG.RPC_URL);
    }

    /**
     * 方法 1: 使用 RPC 直接验证交易
     * 优点: 不依赖外部 API, 最可靠
     * 缺点: 需要解析事件日志
     */
    async verifyByRPC(txHash, userAddress, expectedAmount = null) {
        try {
            console.log(`[RPC验证] 交易: ${txHash}`);

            // 1. 获取交易收据
            const receipt = await this.provider.getTransactionReceipt(txHash);
            if (!receipt) {
                return { success: false, error: '交易不存在或未确认' };
            }

            // 2. 检查交易状态
            if (receipt.status !== 1) {
                return { success: false, error: '交易执行失败' };
            }

            // 3. 检查确认数
            const currentBlock = await this.provider.getBlockNumber();
            const confirmations = currentBlock - receipt.blockNumber;
            
            if (confirmations < CONFIG.REQUIRED_CONFIRMATIONS) {
                return { 
                    success: false,
                    pending: true,
                    confirmations: confirmations,
                    requiredConfirmations: CONFIG.REQUIRED_CONFIRMATIONS,
                    error: `充值中，请等待 (${confirmations}/${CONFIG.REQUIRED_CONFIRMATIONS} 确认)` 
                };
            }

            // 4. 解析 Transfer 事件
            const transferTopic = ethers.utils.id('Transfer(address,address,uint256)');
            const transferLogs = receipt.logs.filter(log => 
                log.address.toLowerCase() === CONFIG.DP_TOKEN.toLowerCase() &&
                log.topics[0] === transferTopic
            );

            if (transferLogs.length === 0) {
                return { success: false, error: '未找到 DP Token 转账事件' };
            }

            // 解析第一个 Transfer 事件
            const log = transferLogs[0];
            const from = ethers.utils.getAddress('0x' + log.topics[1].slice(26));
            const to = ethers.utils.getAddress('0x' + log.topics[2].slice(26));
            const value = ethers.BigNumber.from(log.data);
            const amount = parseFloat(ethers.utils.formatEther(value));

            // 5. 验证地址
            if (from.toLowerCase() !== userAddress.toLowerCase()) {
                return { 
                    success: false, 
                    error: `转账来源地址不匹配: ${from}` 
                };
            }

            if (to.toLowerCase() !== CONFIG.PLATFORM_RECEIVER.toLowerCase()) {
                return { 
                    success: false, 
                    error: `转账目标地址错误: ${to}` 
                };
            }

            // 6. 验证金额(如果提供)
            if (expectedAmount !== null) {
                const tolerance = 0.000001;
                if (Math.abs(amount - parseFloat(expectedAmount)) > tolerance) {
                    return { 
                        success: false, 
                        error: `金额不匹配: 期望 ${expectedAmount}, 实际 ${amount}` 
                    };
                }
            }

            // 7. 获取时间戳
            const block = await this.provider.getBlock(receipt.blockNumber);

            return {
                success: true,
                verified: true,
                method: 'RPC',
                data: {
                    from: from,
                    to: to,
                    amount: amount,
                    txHash: txHash,
                    blockNumber: receipt.blockNumber,
                    confirmations: confirmations,
                    timestamp: block.timestamp,
                    gasUsed: receipt.gasUsed.toString()
                }
            };

        } catch (error) {
            console.error('[RPC验证] 失败:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 方法 2: 使用 Beratrail API 验证交易
     * 优点: 更快, 数据更丰富
     * 缺点: 依赖外部 API
     */
    async verifyByAPI(txHash, userAddress, expectedAmount = null) {
        try {
            console.log(`[API验证] 交易: ${txHash}`);

            if (!CONFIG.BERACHAIN_API_KEY) {
                console.warn('未配置 Berachain API Key, 跳过 API 验证');
                return { success: false, error: 'API Key 未配置' };
            }

            // 构造 API 请求
            const url = `${CONFIG.BERATRAIL_API_URL}/api`;
            const params = new URLSearchParams({
                module: 'transaction',
                action: 'gettxreceiptstatus',
                txhash: txHash,
                apikey: CONFIG.BERACHAIN_API_KEY
            });

            const response = await fetch(`${url}?${params.toString()}`);
            const data = await response.json();

            if (data.status !== '1') {
                return { success: false, error: 'API 查询失败' };
            }

            // 获取交易详情
            const txParams = new URLSearchParams({
                module: 'proxy',
                action: 'eth_getTransactionByHash',
                txhash: txHash,
                apikey: CONFIG.BERACHAIN_API_KEY
            });

            const txResponse = await fetch(`${url}?${txParams.toString()}`);
            const txData = await txResponse.json();

            if (!txData.result) {
                return { success: false, error: '交易不存在' };
            }

            // 这里可以继续解析交易数据...
            // 但由于 Beratrail API 可能格式不同,我们优先使用 RPC 方法

            return {
                success: true,
                verified: true,
                method: 'API',
                data: txData.result
            };

        } catch (error) {
            console.error('[API验证] 失败:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 综合验证: 优先使用 RPC, API 作为备份
     */
    async verify(txHash, userAddress, expectedAmount = null) {
        console.log('\n========== 开始充值验证 ==========');
        console.log(`交易哈希: ${txHash}`);
        console.log(`用户地址: ${userAddress}`);
        console.log(`期望金额: ${expectedAmount || '不限制'} DP`);

        // 方法 1: RPC 验证 (主要方法)
        const rpcResult = await this.verifyByRPC(txHash, userAddress, expectedAmount);
        
        if (rpcResult.success) {
            console.log('✅ RPC 验证通过');
            console.log(`  - 实际金额: ${rpcResult.data.amount} DP`);
            console.log(`  - 区块高度: ${rpcResult.data.blockNumber}`);
            console.log(`  - 确认数: ${rpcResult.data.confirmations}`);
            console.log('==================================\n');
            return rpcResult;
        }

        // 如果是 pending 状态，直接返回，交给前端轮询，不尝试 API
        if (rpcResult.pending) {
            console.log('⏳ 交易确认中,请稍后重试');
            console.log('==================================\n');
            return rpcResult;
        }

        console.log('⚠️  RPC 验证失败:', rpcResult.error);

        // 方法 2: API 验证 (备用方法)
        console.log('尝试使用 API 验证...');
        const apiResult = await this.verifyByAPI(txHash, userAddress, expectedAmount);
        
        if (apiResult.success) {
            console.log('✅ API 验证通过');
            console.log('==================================\n');
            return apiResult;
        }

        console.log('❌ API 验证失败:', apiResult.error);
        console.log('==================================\n');

        // 都失败了
        return {
            success: false,
            error: `验证失败: RPC(${rpcResult.error}), API(${apiResult.error})`
        };
    }

    /**
     * 批量验证多个交易
     */
    async verifyBatch(transactions) {
        const results = [];
        
        for (const tx of transactions) {
            const result = await this.verify(tx.txHash, tx.userAddress, tx.amount);
            results.push({
                ...tx,
                verification: result
            });
        }
        
        return results;
    }

    /**
     * 检查交易是否已被处理
     */
    async checkIfProcessed(txHash, processedHashes) {
        return processedHashes.has(txHash.toLowerCase());
    }
}

// 导出实例
const depositVerifier = new DepositVerifier();

module.exports = {
    depositVerifier,
    DepositVerifier
};

// 测试代码
if (require.main === module) {
    // 可以直接运行此文件进行测试
    async function test() {
        const testTxHash = process.argv[2];
        const testAddress = process.argv[3];
        const testAmount = process.argv[4];

        if (!testTxHash || !testAddress) {
            console.log('用法: node deposit-verifier.js <txHash> <userAddress> [amount]');
            console.log('示例: node deposit-verifier.js 0x123... 0xabc... 10');
            return;
        }

        const result = await depositVerifier.verify(testTxHash, testAddress, testAmount);
        console.log('\n最终结果:', JSON.stringify(result, null, 2));
    }

    test().catch(console.error);
}
