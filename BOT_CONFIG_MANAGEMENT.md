# Bot 配置管理功能实现总结

## 实现日期
2025年12月2日

## 功能描述
在管理员面板中添加了 Bot 配置管理功能，允许管理员动态调整 Party Crisis 游戏中的 Bot 数量和投注额范围。

## 后端实现

### 1. API 端点

#### GET `/api/admin/party-crisis/bot-config`
获取当前 Bot 配置

**请求参数：**
- `password`: 管理员密码（query参数）

**响应示例：**
```json
{
  "success": true,
  "data": {
    "botCountMin": 80,
    "botCountMax": 100,
    "roomBetMin": 5000,
    "roomBetMax": 6500
  }
}
```

#### POST `/api/admin/party-crisis/bot-config`
更新 Bot 配置

**请求参数：**
- `password`: 管理员密码（query参数）
- Body (JSON):
```json
{
  "botCountMin": 80,
  "botCountMax": 100,
  "roomBetMin": 5000,
  "roomBetMax": 6500
}
```

**响应示例：**
```json
{
  "success": true,
  "message": "Bot配置已更新，将在下局游戏生效",
  "data": {
    "botCountMin": 80,
    "botCountMax": 100,
    "roomBetMin": 5000,
    "roomBetMax": 6500
  }
}
```

### 2. 修改的文件

#### `api/admin.js`
- 添加了两个新的路由处理函数（第 808-872 行）
- GET 端点：获取 Bot 配置
- POST 端点：更新 Bot 配置并验证参数有效性

#### `api/party-crisis.js`
- 添加了 `getBotConfig()` 函数（第 742-749 行）
- 添加了 `updateBotConfig()` 函数（第 751-765 行）
- 导出这两个函数供 admin.js 调用（第 772-773 行）

## 前端实现

### 修改的文件：`C:\Users\CDD\Desktop\DBP-Owner-Panel\admin-panel.html`

### 1. UI 组件（第 630-664 行）
在"游戏控制"标签中添加了新的卡片：
- **标题**: 🤖 Bot 配置管理
- **输入字段**:
  - Bot 数量范围（最小值 至 最大值）
  - 每房间投注额范围（最小值 至 最大值）
- **按钮**:
  - 💾 保存配置
  - 🔄 重新加载
- **警告提示**: 配置修改将在下一局游戏开始时生效

### 2. JavaScript 函数

#### `loadBotConfig()` (第 1029-1047 行)
- 从后端获取当前 Bot 配置
- 填充表单字段
- 显示成功/失败提示

#### `saveBotConfig()` (第 1049-1100 行)
- 获取表单输入值
- 验证参数有效性：
  - 所有字段必须填写
  - 不能为负数
  - 最大值不能小于最小值
- 发送 POST 请求更新配置
- 显示成功/失败提示

#### `switchTab()` 修改（第 805-806 行）
- 切换到"游戏控制"标签时自动调用 `loadBotConfig()`

## 配置说明

### 默认配置值
```javascript
BOT_COUNT_MIN: 70    // 每局游戏最少Bot数量
BOT_COUNT_MAX: 90    // 每局游戏最多Bot数量
ROOM_BET_MIN: 4200   // 每个房间Bot总投注额最小值（DP）
ROOM_BET_MAX: 5800   // 每个房间Bot总投注额最大值（DP）
```

### 配置生效时间
- 配置更新后立即保存到内存
- 在下一局游戏开始时生效
- 不影响正在进行的游戏

## 参数验证规则

### 后端验证
1. `botCountMin >= 0`
2. `botCountMax >= botCountMin`
3. `roomBetMin >= 0`
4. `roomBetMax >= roomBetMin`

### 前端验证
1. 所有字段必须填写且为有效数字
2. 所有值不能为负数
3. Bot数量最大值不能小于最小值
4. 投注额最大值不能小于最小值
5. 保存前需要用户确认

## 测试结果

### API 测试
✅ GET 请求成功返回当前配置
✅ POST 请求成功更新配置
✅ 参数验证正常工作
✅ 配置持久化到游戏引擎

### 测试命令示例
```powershell
# 获取配置
Invoke-RestMethod -Uri "http://localhost:3000/api/admin/party-crisis/bot-config?password=Iagez220!"

# 更新配置
$body = @{botCountMin=80; botCountMax=100; roomBetMin=5000; roomBetMax=6500} | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/api/admin/party-crisis/bot-config?password=Iagez220!" -Method Post -Body $body -ContentType "application/json"
```

## 使用说明

### 管理员操作步骤
1. 登录管理员面板
2. 切换到"🎯 游戏控制"标签
3. 在"🤖 Bot 配置管理"卡片中查看当前配置
4. 修改需要调整的参数
5. 点击"💾 保存配置"按钮
6. 确认修改（将在下一局游戏生效）
7. 可点击"🔄 重新加载"恢复当前配置

### 注意事项
- 修改配置需要管理员权限
- 配置修改后立即生效，但仅影响新游戏
- 建议在游戏空闲时调整配置
- 调整前请评估对游戏平衡性的影响

## 前端服务器配置

### 修改的文件：`C:\Users\CDD\Desktop\DBP-Frontend-beta\game-platform.html`

#### API 地址更新（第 2471 行和第 3042 行）
从 Zeabur 部署地址改为本地服务器：
```javascript
// 游戏余额 API
API_BASE: 'http://localhost:3000/api/game-balance'

// 派对危机游戏 API
BASE_URL: 'http://localhost:3000/api/party-crisis'
```

## 未来改进建议
1. 添加配置历史记录功能
2. 实现配置预设模板（如：高活跃度、低活跃度等）
3. 添加实时预览功能，显示配置对游戏的影响
4. 支持定时自动调整配置
5. 添加配置审计日志

## 相关文件
- `/api/admin.js` - 管理员API路由
- `/api/party-crisis.js` - 游戏逻辑和Bot配置
- `C:\Users\CDD\Desktop\DBP-Owner-Panel\admin-panel.html` - 管理员面板
- `C:\Users\CDD\Desktop\DBP-Frontend-beta\game-platform.html` - 游戏前端
