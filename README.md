# 🎮 Debear Party - GameFi Backend (HDGL)

后端服务器,为游戏平台提供充值、提现、余额管理等 API。

## 🚀 快速部署到 Zeabur

### 1️⃣ 推送代码到 GitHub

```bash
cd C:\Users\CDD\Desktop\HDGL
git init
git add .
git commit -m "feat: 初始化后端服务"
git branch -M main
git remote add origin https://github.com/jierrry220/YHGL.git
git push -u origin main --force
```

### 2️⃣ 在 Zeabur 创建服务

1. 访问 https://zeabur.com/dashboard
2. 选择项目或创建新项目
3. 点击 **"Add Service"** → **"Git"**
4. 选择仓库: **jierrry220/YHGL**
5. 点击 **"Deploy"**

### 3️⃣ 配置环境变量 ⚠️ 必须设置

在 Zeabur 服务的 **Variables** 标签中添加:

```
NODE_ENV=production
PORT=3000
RPC_URL=https://rpc.berachain.com
DP_TOKEN=0xf7C464c7832e59855aa245Ecc7677f54B3460e7d
BERACHAIN_API_KEY=1CCP7WAFGW4NS1GA9BRZQ6PXDCIHRWABCZ
PLATFORM_WALLET_ADDRESS=0xE3325A0CAABb3C677a89C5A72C2878Ef2E7470FB
PLATFORM_PRIVATE_KEY=0xf16963811af59b58278556c34a38024c31726421c9b50722fba74dafa7266087
GAME_PLATFORM_RECEIVER=0xE3325A0CAABb3C677a89C5A72C2878Ef2E7470FB
MIN_DEPOSIT=1
MIN_WITHDRAW=1

# 提现安全配置（可选）
WITHDRAW_COOLDOWN=300000              # 5分钟冷却
DAILY_WITHDRAW_AMOUNT_LIMIT=10000     # 每日10000 DP
WITHDRAW_REVIEW_RATIO=4               # 4倍触发审核
LARGE_WITHDRAW_THRESHOLD=5000         # 单次大额审核
LOCK_TIMEOUT=30000                    # 30秒锁超时
```

### 4️⃣ 挂载 Volume ⚠️ 必须配置

在 Zeabur 服务的 **Volumes** 标签:

1. 点击 **"Add Volume"**
2. **Mount Path**: `/app/data`
3. **Size**: 1 GB
4. 点击 **"Save"**
5. **重启服务**

### 5️⃣ 验证部署

访问: `https://你的域名.zeabur.app/health`

应该返回:
```json
{
  "status": "ok",
  "service": "Debear Party GameFi Backend",
  "ready": true
}
```

---

## 📂 文件结构

```
HDGL/
├── server.js              # 主服务器
├── game-balance.js        # 余额管理模块
├── deposit-verifier.js    # 充值验证模块
├── api/
│   └── game-balance.js    # API 路由
├── package.json           # 依赖配置
├── Dockerfile             # Docker 配置
├── .zeabur.json           # Zeabur 配置
├── .gitignore
├── .env.example
└── README.md
```

---

## 🔌 API 端点

### 健康检查
```
GET /health
```

### 余额管理

**查询余额**
```
GET /api/game-balance?action=getBalance&address=0x...
```

**充值**
```
POST /api/game-balance?action=deposit
Body: { address, amount, txHash }
```

**提现**
```
POST /api/game-balance?action=withdraw
Body: { address, amount }
```

**查询交易记录**
```
GET /api/game-balance?action=getTransactions&address=0x...&limit=50
```

### 用户系统 🆕

**获取用户信息**
```
GET /api/game-balance?action=getUserInfo&address=0x...
```

**设置用户名**
```
POST /api/game-balance?action=setUsername
Body: { address, username }
```

**检查用户名可用性**
```
GET /api/game-balance?action=checkUsername&username=玩家123
```

> 📖 详细 API 文档请查看: [USER_SYSTEM_API.md](./USER_SYSTEM_API.md)

---

## 🛠️ 本地开发

```bash
# 安装依赖
npm install

# 创建 .env 文件
cp .env.example .env
# 编辑 .env 填入实际配置

# 启动服务
npm start

# 或开发模式
npm run dev
```

---

## 📊 监控

- **日志**: Zeabur Dashboard → Logs
- **监控**: CPU、内存、网络使用情况
- **健康检查**: `/health` 端点

---

## 🔒 安全

- 私钥存储在环境变量中,不会提交到 Git
- CORS 已配置,允许前端域名访问
- 充值需要链上验证,防止伪造

### 提现安全机制 🛡️

系统已集成完整的提现安全防护：

1. **API 限流**
   - 提现接口：每分钟最多 3 次请求
   - 其他接口：每分钟最多 30 次请求

2. **提现冷却时间**
   - 默认 5 分钟间隔
   - 防止频繁提现

3. **每日金额限额**
   - 默认每日 10000 DP 金额上限
   - 无次数限制，用户体验更友好

4. **异常检测与人工审核**
   - 单次提现 >= 5000 DP 自动触发审核
   - 当日提现/充值比例 >= 4倍触发审核
   - 管理员手动审核通过/拒绝

5. **改进的锁机制**
   - 带超时的分布式锁
   - 防止并发操作导致的余额错误

6. **失败记录追踪**
   - 记录所有失败的提现尝试
   - 1小时内 5 次失败触发审核

---

## ✨ 新功能: 用户系统

已集成完整的用户管理系统:

- ✅ **自动 UID 生成**: 用户首次充值时自动生成唯一 UUID
- ✅ **永久用户名**: 用户可设置一次永久用户名，不可修改
- ✅ **老用户兼容**: 已充值用户在下次充值时自动创建用户记录
- ✅ **用户名验证**: 支持字母、数字、下划线、中文，3-20字符
- ✅ **多维度查询**: 支持通过地址、UID、用户名查询

详细文档: [USER_SYSTEM_API.md](./USER_SYSTEM_API.md)

---

## 📝 注意事项

1. **Volume 必须配置**,否则数据会在重新部署时丢失
2. **环境变量必须设置**,否则服务无法启动
3. 每次推送到 GitHub 会自动重新部署
4. Volume 中的数据会保留,不会丢失
5. **用户名一旦设置不可修改**,请在前端明确提示

---

**仓库**: https://github.com/jierrry220/YHGL.git
