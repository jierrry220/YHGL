# 🚀 部署更新说明 - 用户系统

## 更新内容

本次更新为后端系统添加了完整的用户管理功能：

### ✨ 新增功能

1. **自动 UID 生成**
   - 用户首次充值时自动生成唯一 UUID
   - 无需前端干预，完全自动化

2. **永久用户名系统**
   - 用户可设置 3-20 字符的用户名
   - 支持字母、数字、下划线、中文
   - 一旦设置，永久不可修改
   - 全局唯一，不区分大小写

3. **老用户兼容**
   - 已有充值记录但无 UID 的用户
   - 在下次充值时自动补充创建用户记录

4. **多维度查询**
   - 通过钱包地址查询用户
   - 通过 UID 查询用户
   - 通过用户名查询用户

### 📦 新增文件

```
HDGL/
├── USER_SYSTEM_API.md        # 用户系统 API 完整文档
├── DEPLOYMENT_UPDATE.md       # 本文件
└── test-user-system.js        # 用户系统测试脚本
```

### 🔧 修改文件

```
HDGL/
├── game-balance.js            # 添加用户管理功能
├── api/game-balance.js        # 添加用户相关 API 接口
├── package.json               # 添加 uuid 依赖
└── README.md                  # 更新文档说明
```

---

## 部署步骤

### 1️⃣ 更新代码

```bash
cd C:\Users\CDD\Desktop\前后分开\HDGL
git add .
git commit -m "feat: 添加用户系统 - UID生成和永久用户名功能"
git push origin main
```

### 2️⃣ Zeabur 自动部署

- 代码推送后，Zeabur 会自动检测并重新部署
- 部署过程约 1-3 分钟
- Volume 中的数据会保留，不会丢失

### 3️⃣ 验证部署

访问健康检查端点：
```
GET https://你的域名.zeabur.app/health
```

应该返回：
```json
{
  "status": "ok",
  "service": "Debear Party GameFi Backend",
  "ready": true
}
```

### 4️⃣ 测试新功能

**获取用户信息**
```bash
curl "https://你的域名.zeabur.app/api/game-balance?action=getUserInfo&address=0x..."
```

**检查用户名可用性**
```bash
curl "https://你的域名.zeabur.app/api/game-balance?action=checkUsername&username=测试用户"
```

---

## 数据迁移

### 无需手动迁移

- 老用户数据会在下次充值时自动升级
- 系统会自动为老用户生成 UID
- 老用户仍可正常查询余额和交易记录

### 数据库结构变化

`data/game-balances.json` 新增 `users` 字段：

```json
{
  "balances": { ... },
  "transactions": [ ... ],
  "users": {
    "0x用户地址": {
      "uid": "550e8400-e29b-41d4-a716-446655440000",
      "address": "0x用户地址",
      "username": "玩家123",
      "createdAt": "2024-11-20T08:00:00.000Z",
      "firstDepositAt": "2024-11-20T08:00:00.000Z",
      "usernameSetAt": "2024-11-20T08:05:00.000Z"
    }
  },
  "lastUpdate": "2024-11-20T08:10:00.000Z"
}
```

---

## 前端集成建议

### 1. 充值后检查用户状态

```javascript
const result = await depositAPI({ address, amount, txHash });

if (result.success) {
  // 检查是否需要设置用户名
  if ((result.isFirstDeposit || result.isOldUserUpgrade) && !result.user.username) {
    showUsernameSetupDialog();
  }
}
```

### 2. 用户名设置流程

```javascript
// 1. 实时验证用户名
async function validateUsernameInput(username) {
  const result = await checkUsernameAPI(username);
  return result.data.available;
}

// 2. 提交用户名
async function submitUsername(address, username) {
  try {
    const result = await setUsernameAPI({ address, username });
    if (result.success) {
      alert('用户名设置成功！此用户名永久有效，不可修改');
      return true;
    }
  } catch (error) {
    alert(error.message);
    return false;
  }
}
```

### 3. 显示用户信息

```javascript
async function loadUserProfile(address) {
  const result = await getUserInfoAPI(address);
  
  if (result.data.exists) {
    displayUserInfo({
      uid: result.data.uid,
      username: result.data.username || '未设置',
      balance: result.data.balance,
      memberSince: result.data.createdAt
    });
  }
}
```

---

## API 变更

### 新增接口

1. `GET /api/game-balance?action=getUserInfo&address=0x...`
2. `POST /api/game-balance?action=setUsername` (Body: {address, username})
3. `GET /api/game-balance?action=checkUsername&username=xxx`

### 修改接口

**充值接口返回值增强**

`POST /api/game-balance?action=deposit`

新增返回字段：
```json
{
  "success": true,
  "isFirstDeposit": true,      // 是否首次充值
  "isOldUserUpgrade": false,   // 是否老用户升级
  "user": {                     // 用户信息
    "uid": "...",
    "username": null,
    "address": "...",
    "createdAt": "..."
  },
  "newBalance": "...",
  "transaction": { ... }
}
```

---

## 环境变量

**无需新增环境变量**，使用现有配置即可。

---

## 回滚方案

如果部署后发现问题，可以回滚到之前版本：

```bash
# 1. 回退代码
git revert HEAD
git push origin main

# 2. Zeabur 会自动重新部署
```

**注意**: Volume 中的数据不会回滚，已创建的用户记录会保留。

---

## 监控建议

部署后建议监控以下指标：

1. **用户创建率**: 每日新增用户数
2. **用户名设置率**: 有多少用户设置了用户名
3. **老用户升级数**: 有多少老用户被自动升级
4. **API 错误率**: 用户名验证失败率

可以通过以下方式查看：
- Zeabur Dashboard → Logs
- 在代码中添加统计日志

---

## 常见问题

### Q1: 老用户什么时候会获得 UID？
A: 老用户在下次充值时会自动创建用户记录并获得 UID。

### Q2: 用户名真的不能修改吗？
A: 是的，这是设计决定。如需修改，只能通过后端管理员手动操作数据库。

### Q3: 用户名区分大小写吗？
A: 不区分。存储时保留原始大小写，但验证唯一性时不区分。

### Q4: 如果用户不设置用户名会怎样？
A: 不影响使用，但某些功能可能需要用户名（如排行榜显示）。

### Q5: UID 和钱包地址的关系？
A: UID 是内部唯一标识，钱包地址是外部标识。一一对应，不可更改。

---

## 下一步优化建议

1. **数据库迁移**: 考虑从 JSON 文件迁移到 MongoDB/PostgreSQL
2. **用户头像**: 添加用户头像上传功能
3. **用户统计**: 添加用户活跃度、充值统计等
4. **管理后台**: 开发管理员查看用户列表的界面
5. **用户等级**: 基于充值金额设置用户等级

---

## 联系方式

如有问题，请查看：
- 详细 API 文档: [USER_SYSTEM_API.md](./USER_SYSTEM_API.md)
- 主文档: [README.md](./README.md)
- GitHub 仓库: https://github.com/jierrry220/YHGL.git
