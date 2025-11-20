/**
 * 用户系统功能测试脚本
 * 测试 UID 生成、用户名设置、验证等功能
 */

const { gameBalanceManager } = require('./game-balance');

async function testUserSystem() {
    console.log('\n========== 用户系统功能测试 ==========\n');
    
    try {
        // 初始化
        await gameBalanceManager.init();
        console.log('✅ 游戏余额管理器初始化成功\n');
        
        // 测试地址
        const testAddress1 = '0x1234567890123456789012345678901234567890';
        const testAddress2 = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
        
        // ========== 测试 1: 创建用户 ==========
        console.log('📝 测试 1: 创建用户');
        const user1 = await gameBalanceManager.createUser(testAddress1);
        console.log('✅ 用户创建成功:');
        console.log('   - UID:', user1.uid);
        console.log('   - 地址:', user1.address);
        console.log('   - 用户名:', user1.username || '未设置');
        console.log('   - 创建时间:', user1.createdAt);
        
        // ========== 测试 2: 验证用户名格式 ==========
        console.log('\n📝 测试 2: 验证用户名格式');
        
        const testUsernames = [
            { name: 'Player123', shouldPass: true },
            { name: '游戏玩家', shouldPass: true },
            { name: 'test_user', shouldPass: true },
            { name: 'AB', shouldPass: false, reason: '太短' },
            { name: '这是一个非常非常长的用户名1234567890', shouldPass: false, reason: '太长' },
            { name: 'user@123', shouldPass: false, reason: '包含特殊字符' },
            { name: 'hello world', shouldPass: false, reason: '包含空格' },
        ];
        
        for (const test of testUsernames) {
            const result = gameBalanceManager.validateUsername(test.name);
            const status = result.valid ? '✅' : '❌';
            const expected = test.shouldPass ? '应通过' : '应拒绝';
            console.log(`   ${status} "${test.name}" - ${expected}${result.valid ? '' : ': ' + result.error}`);
        }
        
        // ========== 测试 3: 设置用户名 ==========
        console.log('\n📝 测试 3: 设置用户名');
        const updatedUser1 = await gameBalanceManager.setUsername(testAddress1, 'Player123');
        console.log('✅ 用户名设置成功:');
        console.log('   - UID:', updatedUser1.uid);
        console.log('   - 用户名:', updatedUser1.username);
        console.log('   - 设置时间:', updatedUser1.usernameSetAt);
        
        // ========== 测试 4: 尝试重复设置用户名（应该失败）==========
        console.log('\n📝 测试 4: 尝试重复设置用户名（应该失败）');
        try {
            await gameBalanceManager.setUsername(testAddress1, 'NewName');
            console.log('❌ 测试失败: 应该抛出错误');
        } catch (error) {
            console.log('✅ 正确拒绝:', error.message);
        }
        
        // ========== 测试 5: 创建第二个用户并检查用户名唯一性 ==========
        console.log('\n📝 测试 5: 用户名唯一性验证');
        const user2 = await gameBalanceManager.createUser(testAddress2);
        console.log('✅ 创建第二个用户, UID:', user2.uid);
        
        try {
            await gameBalanceManager.setUsername(testAddress2, 'Player123'); // 尝试使用已存在的用户名
            console.log('❌ 测试失败: 应该检测到重复用户名');
        } catch (error) {
            console.log('✅ 正确检测到重复用户名:', error.message);
        }
        
        // 使用不同的用户名
        const updatedUser2 = await gameBalanceManager.setUsername(testAddress2, '游戏高手');
        console.log('✅ 第二个用户设置成功, 用户名:', updatedUser2.username);
        
        // ========== 测试 6: 查询功能 ==========
        console.log('\n📝 测试 6: 用户查询功能');
        
        // 通过地址查询
        const foundByAddress = gameBalanceManager.getUserInfo(testAddress1);
        console.log('✅ 通过地址查询:', foundByAddress ? foundByAddress.username : '未找到');
        
        // 通过 UID 查询
        const foundByUID = gameBalanceManager.getUserByUID(user1.uid);
        console.log('✅ 通过 UID 查询:', foundByUID ? foundByUID.username : '未找到');
        
        // 通过用户名查询
        const foundByUsername = gameBalanceManager.getUserByUsername('Player123');
        console.log('✅ 通过用户名查询:', foundByUsername ? foundByUsername.address : '未找到');
        
        // 大小写不敏感测试
        const foundByUsernameLower = gameBalanceManager.getUserByUsername('player123');
        console.log('✅ 用户名不区分大小写:', foundByUsernameLower ? '正确' : '错误');
        
        // ========== 测试 7: 检查用户名是否被占用 ==========
        console.log('\n📝 测试 7: 检查用户名占用情况');
        console.log('   Player123 是否可用:', gameBalanceManager.isUsernameTaken('Player123') ? '❌ 已被占用' : '✅ 可用');
        console.log('   NewPlayer 是否可用:', gameBalanceManager.isUsernameTaken('NewPlayer') ? '❌ 已被占用' : '✅ 可用');
        
        console.log('\n========== 所有测试完成 ==========\n');
        
    } catch (error) {
        console.error('\n❌ 测试过程中发生错误:', error);
        console.error('错误详情:', error.stack);
    }
}

// 运行测试
if (require.main === module) {
    testUserSystem().catch(console.error);
}

module.exports = { testUserSystem };
