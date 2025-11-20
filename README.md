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

### 查询余额
```
GET /api/game-balance?action=getBalance&address=0x...
```

### 充值
```
POST /api/game-balance?action=deposit
Body: { address, amount, txHash }
```

### 提现
```
POST /api/game-balance?action=withdraw
Body: { address, amount }
```

### 查询交易记录
```
GET /api/game-balance?action=getTransactions&address=0x...&limit=50
```

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

---

## 📝 注意事项

1. **Volume 必须配置**,否则数据会在重新部署时丢失
2. **环境变量必须设置**,否则服务无法启动
3. 每次推送到 GitHub 会自动重新部署
4. Volume 中的数据会保留,不会丢失

---

**仓库**: https://github.com/jierrry220/YHGL.git
