# 用户系统 API 文档

## 概述

用户系统已集成到游戏余额管理系统中，支持以下功能：
- ✅ 用户首次充值时自动生成唯一 UID
- ✅ 用户设置永久用户名（不可修改）
- ✅ 兼容老用户（在下次充值时自动补充创建用户记录）
- ✅ 用户名唯一性验证
- ✅ 通过地址、UID、用户名查询用户信息

---

## 数据结构

### 用户对象
```json
{
  "uid": "550e8400-e29b-41d4-a716-446655440000",
  "address": "0xabc...",
  "username": "玩家123",
  "createdAt": "2024-11-20T08:00:00.000Z",
  "firstDepositAt": "2024-11-20T08:00:00.000Z",
  "usernameSetAt": "2024-11-20T08:05:00.000Z"
}
```

### 字段说明
- `uid`: UUID 格式的唯一用户标识
- `address`: 用户钱包地址（小写）
- `username`: 用户名（3-20字符，支持字母、数字、下划线、中文）
- `createdAt`: 用户创建时间
- `firstDepositAt`: 首次充值时间
- `usernameSetAt`: 用户名设置时间（如果已设置）

---

## API 接口

### 1. 获取用户信息

**接口**: `GET /api/game-balance?action=getUserInfo&address=0x...`

**参数**:
- `address` (必填): 用户钱包地址

**响应示例**:

用户已注册：
```json
{
  "success": true,
  "data": {
    "exists": true,
    "uid": "550e8400-e29b-41d4-a716-446655440000",
    "address": "0xabc...",
    "username": "玩家123",
    "hasUsername": true,
    "balance": "100.5",
    "createdAt": "2024-11-20T08:00:00.000Z",
    "firstDepositAt": "2024-11-20T08:00:00.000Z",
    "usernameSetAt": "2024-11-20T08:05:00.000Z"
  }
}
```

用户未注册：
```json
{
  "success": true,
  "data": {
    "exists": false,
    "address": "0xabc...",
    "balance": "0",
    "message": "用户未注册，请先进行首次充值"
  }
}
```

---

### 2. 设置用户名

**接口**: `POST /api/game-balance?action=setUsername`

**请求体**:
```json
{
  "address": "0xabc...",
  "username": "玩家123"
}
```

**成功响应**:
```json
{
  "success": true,
  "data": {
    "uid": "550e8400-e29b-41d4-a716-446655440000",
    "address": "0xabc...",
    "username": "玩家123",
    "usernameSetAt": "2024-11-20T08:05:00.000Z"
  }
}
```

**错误响应**:
```json
{
  "success": false,
  "error": "用户名已设置，不可修改"
}
```

```json
{
  "success": false,
  "error": "该用户名已被使用"
}
```

```json
{
  "success": false,
  "error": "用户名长度必须在3-20个字符之间"
}
```

---

### 3. 检查用户名是否可用

**接口**: `GET /api/game-balance?action=checkUsername&username=玩家123`

**参数**:
- `username` (必填): 要检查的用户名

**响应示例**:

可用：
```json
{
  "success": true,
  "data": {
    "available": true,
    "reason": "available",
    "username": "玩家123"
  }
}
```

已被占用：
```json
{
  "success": true,
  "data": {
    "available": false,
    "reason": "already_taken"
  }
}
```

格式错误：
```json
{
  "success": true,
  "data": {
    "available": false,
    "reason": "invalid_format",
    "error": "用户名长度必须在3-20个字符之间"
  }
}
```

---

### 4. 充值（自动创建用户）

**接口**: `POST /api/game-balance?action=deposit`

**请求体**:
```json
{
  "address": "0xabc...",
  "amount": "10",
  "txHash": "0x123..."
}
```

**首次充值响应**:
```json
{
  "success": true,
  "isFirstDeposit": true,
  "isOldUserUpgrade": false,
  "user": {
    "uid": "550e8400-e29b-41d4-a716-446655440000",
    "address": "0xabc...",
    "username": null,
    "createdAt": "2024-11-20T08:00:00.000Z",
    "firstDepositAt": "2024-11-20T08:00:00.000Z"
  },
  "newBalance": "10",
  "transaction": { ... }
}
```

**老用户充值（补充创建 UID）**:
```json
{
  "success": true,
  "isFirstDeposit": false,
  "isOldUserUpgrade": true,
  "user": {
    "uid": "550e8400-e29b-41d4-a716-446655440000",
    "address": "0xabc...",
    "username": null,
    "createdAt": "2024-11-20T08:06:00.000Z",
    "firstDepositAt": "2024-11-20T08:06:00.000Z"
  },
  "newBalance": "110",
  "transaction": { ... }
}
```

---

## 用户名规则

### 格式要求
- **长度**: 3-20 个字符
- **字符集**: 字母（a-z, A-Z）、数字（0-9）、下划线（_）、中文
- **唯一性**: 不区分大小写，每个用户名全局唯一
- **永久性**: 一旦设置，永久不可修改

### 有效用户名示例
✅ `Player123`  
✅ `游戏玩家`  
✅ `test_user`  
✅ `玩家_2024`  
✅ `DefiMaster`

### 无效用户名示例
❌ `AB` (太短)  
❌ `这是一个非常非常长的用户名123456` (太长)  
❌ `user@123` (包含特殊字符 @)  
❌ `hello world` (包含空格)  
❌ `用户-名` (包含连字符)

---

## 使用流程

### 新用户流程
```
1. 用户首次充值
   ↓
2. 后端自动生成 UID 和用户记录
   ↓
3. 前端检测到 isFirstDeposit: true
   ↓
4. 提示用户设置用户名
   ↓
5. 调用 checkUsername 验证可用性
   ↓
6. 调用 setUsername 设置用户名
   ↓
7. 完成注册
```

### 老用户流程（兼容）
```
1. 老用户再次充值
   ↓
2. 后端检测到无用户记录，自动创建
   ↓
3. 返回 isOldUserUpgrade: true
   ↓
4. 前端提示用户设置用户名
   ↓
5. 完成升级
```

---

## 前端集成示例

### 充值后检查是否需要设置用户名
```javascript
// 充值成功后
const depositResponse = await fetch('/api/game-balance?action=deposit', {
  method: 'POST',
  body: JSON.stringify({ address, amount, txHash })
});

const result = await depositResponse.json();

if (result.success) {
  // 检查是否是首次充值或老用户升级
  if (result.isFirstDeposit || result.isOldUserUpgrade) {
    // 检查是否已设置用户名
    if (!result.user.username) {
      // 提示用户设置用户名
      showUsernameSetupDialog();
    }
  }
}
```

### 设置用户名（带验证）
```javascript
async function setUsername(address, username) {
  // 1. 先检查用户名是否可用
  const checkResponse = await fetch(
    `/api/game-balance?action=checkUsername&username=${encodeURIComponent(username)}`
  );
  const checkResult = await checkResponse.json();
  
  if (!checkResult.data.available) {
    alert(checkResult.data.error || '用户名不可用');
    return false;
  }
  
  // 2. 设置用户名
  const setResponse = await fetch('/api/game-balance?action=setUsername', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, username })
  });
  
  const setResult = await setResponse.json();
  
  if (setResult.success) {
    console.log('用户名设置成功:', setResult.data.username);
    return true;
  } else {
    alert(setResult.error);
    return false;
  }
}
```

### 获取用户信息
```javascript
async function getUserInfo(address) {
  const response = await fetch(
    `/api/game-balance?action=getUserInfo&address=${address}`
  );
  const result = await response.json();
  
  if (result.success && result.data.exists) {
    console.log('UID:', result.data.uid);
    console.log('用户名:', result.data.username || '未设置');
    console.log('余额:', result.data.balance);
    return result.data;
  }
  
  return null;
}
```

---

## 数据存储

用户数据存储在 `data/game-balances.json` 文件中：

```json
{
  "balances": {
    "0xabc...": "100.5"
  },
  "transactions": [ ... ],
  "users": {
    "0xabc...": {
      "uid": "550e8400-e29b-41d4-a716-446655440000",
      "address": "0xabc...",
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

## 注意事项

1. **UID 自动生成**: 用户首次充值时自动生成，无需前端处理
2. **用户名永久性**: 用户名一旦设置，永久不可修改，请在前端明确提示
3. **老用户兼容**: 已有充值记录但无 UID 的用户，在下次充值时会自动补充创建
4. **地址格式**: 所有地址都会转换为小写存储
5. **并发安全**: 文件操作是异步的，高并发场景建议升级到数据库

---

## 升级建议

当前使用 JSON 文件存储，适合小规模应用。如需支持更多用户，建议升级到：

- **MongoDB**: 适合文档型数据
- **PostgreSQL**: 适合关系型数据，支持复杂查询
- **Redis**: 适合高性能缓存

迁移时只需修改 `GameBalanceManager` 类的存储方法即可，API 接口无需改动。
