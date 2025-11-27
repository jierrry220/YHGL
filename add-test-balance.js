/**
 * 添加测试余额脚本
 * 用于给指定地址添加游戏余额以便测试
 */

const fs = require('fs').promises;
const path = require('path');

const BALANCE_DB_PATH = path.join(__dirname, 'data', 'game-balances.json');

async function addTestBalance(address, amount) {
    try {
        // 读取现有数据
        const data = await fs.readFile(BALANCE_DB_PATH, 'utf-8');
        const balanceData = JSON.parse(data);
        
        const normalizedAddr = address.toLowerCase();
        
        // 添加余额
        balanceData.balances[normalizedAddr] = amount;
        
        // 如果用户不存在，创建用户
        if (!balanceData.users[normalizedAddr]) {
            balanceData.users[normalizedAddr] = {
                uid: Math.floor(10000000 + Math.random() * 90000000).toString(),
                address: normalizedAddr,
                username: 'TestPlayer',
                createdAt: new Date().toISOString(),
                firstDepositAt: new Date().toISOString()
            };
        }
        
        // 添加充值记录
        balanceData.transactions.push({
            id: `tx_${Date.now()}`,
            address: normalizedAddr,
            type: 'deposit',
            amount: amount,
            timestamp: new Date().toISOString(),
            description: '测试充值',
            txHash: `0xtest${Date.now()}`
        });
        
        balanceData.lastUpdate = new Date().toISOString();
        
        // 保存
        await fs.writeFile(BALANCE_DB_PATH, JSON.stringify(balanceData, null, 2));
        
        console.log(`✅ 成功添加余额:`);
        console.log(`   地址: ${normalizedAddr}`);
        console.log(`   余额: ${amount} DP`);
        console.log(`   用户信息:`, balanceData.users[normalizedAddr]);
        
    } catch (error) {
        console.error('❌ 添加余额失败:', error);
    }
}

// 从命令行参数读取地址和金额
const address = process.argv[2];
const amount = parseFloat(process.argv[3] || '1000');

if (!address) {
    console.log('用法: node add-test-balance.js <钱包地址> [金额]');
    console.log('示例: node add-test-balance.js 0x1234... 500');
    process.exit(1);
}

addTestBalance(address, amount);
