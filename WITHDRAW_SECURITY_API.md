# 提现安全与审核系统 API 文档

## 概述

提现安全系统提供了多层次的安全防护机制，包括：
- API 限流
- 提现冷却时间
- 每日提现限额
- 异常检测与人工审核
- 改进的并发锁机制

## 用户提现流程

### 1. 正常提现

**请求**
```http
POST /api/game-balance?action=withdraw
Content-Type: application/json

{
  "address": "0x...",
  "amount": 100
}
```

**成功响应** (200)
```json
{
  "success": true,
  "data": {
    "newBalance": 900,
    "txHash": "0x...",
    "transaction": {
      "id": "...",
      "type": "withdraw",
      "amount": 100,
      "status": "completed"
    }
  }
}
```

### 2. 需要人工审核

当检测到异常情况时（如提现/充值比例过高），提现会进入待审核状态。

**响应** (202)
```json
{
  "success": false,
  "pending_review": true,
  "reviewId": "review_1234567890_abc123",
  "reason": "提现/充值比例异常（5.00倍），今日充值: 100 DP, 今日提现: 500 DP",
  "message": "您的提现申请需要人工审核，请耐心等待",
  "data": {
    "id": "...",
    "type": "withdraw",
    "status": "pending_review",
    "reviewId": "review_1234567890_abc123"
  }
}
```

### 3. 触发限流

**响应** (429)
```json
{
  "success": false,
  "error": "请求过于频繁，请稍后再试"
}
```

### 4. 触发冷却时间

**响应** (400)
```json
{
  "success": false,
  "error": "提现冷却中，请等待 180 秒后重试"
}
```

### 5. 超过每日限额

**响应** (400)
```json
{
  "success": false,
  "error": "今日提现次数已达上限（10次）"
}
```

或

```json
{
  "success": false,
  "error": "今日提现金额已达上限（10000 DP）"
}
```

---

## 管理员审核 API

所有管理员 API 都需要在请求头或参数中提供管理员密码：

```
X-Admin-Password: your_admin_password
```

### 1. 获取待审核提现列表

**请求**
```http
GET /api/admin/withdraw-reviews?status=pending
X-Admin-Password: your_admin_password
```

**参数**
- `status` (可选): `pending`（待审核）, `approved`（已通过）, `rejected`（已拒绝）, `all`（全部）

**响应**
```json
{
  "success": true,
  "data": {
    "reviews": [
      {
        "id": "review_1234567890_abc123",
        "address": "0x...",
        "amount": 500,
        "reason": "提现/充值比例异常（5.00倍）",
        "timestamp": 1234567890000,
        "createdAt": "2025-12-01T12:00:00.000Z",
        "status": "pending",
        "userInfo": {
          "uid": "12345678",
          "username": "玩家123",
          "address": "0x..."
        },
        "currentBalance": 600
      }
    ],
    "count": 1
  }
}
```

### 2. 查看审核详情

**请求**
```http
GET /api/admin/withdraw-reviews/{reviewId}
X-Admin-Password: your_admin_password
```

**响应**
```json
{
  "success": true,
  "data": {
    "review": {
      "id": "review_1234567890_abc123",
      "address": "0x...",
      "amount": 500,
      "reason": "提现/充值比例异常（5.00倍）",
      "status": "pending",
      "currentBalance": 600
    },
    "userInfo": {
      "uid": "12345678",
      "username": "玩家123",
      "address": "0x...",
      "createdAt": "2025-11-01T00:00:00.000Z"
    },
    "currentBalance": 600,
    "recentTransactions": [...],
    "withdrawStats": {
      "today": {
        "date": "2025-12-01",
        "withdrawCount": 2,
        "withdrawAmount": 500,
        "depositAmount": 100
      },
      "lastWithdrawTime": "2025-12-01T11:00:00.000Z",
      "limits": {
        "dailyCountLimit": 10,
        "dailyAmountLimit": 10000,
        "cooldownMs": 300000
      }
    }
  }
}
```

### 3. 审核通过

**请求**
```http
POST /api/admin/withdraw-reviews/{reviewId}/approve
X-Admin-Password: your_admin_password
Content-Type: application/json

{
  "note": "经核实，用户充值来源正常，审核通过"
}
```

**响应**
```json
{
  "success": true,
  "message": "审核通过，提现已执行",
  "data": {
    "review": {
      "id": "review_1234567890_abc123",
      "status": "approved",
      "reviewedAt": "2025-12-01T12:30:00.000Z",
      "reviewedBy": "admin",
      "reviewNote": "经核实，用户充值来源正常，审核通过"
    },
    "withdraw": {
      "success": true,
      "newBalance": 100,
      "txHash": "0x..."
    }
  }
}
```

### 4. 审核拒绝

**请求**
```http
POST /api/admin/withdraw-reviews/{reviewId}/reject
X-Admin-Password: your_admin_password
Content-Type: application/json

{
  "note": "检测到异常行为，拒绝提现"
}
```

**注意**: `note` 字段必填，需要提供拒绝原因。

**响应**
```json
{
  "success": true,
  "message": "审核拒绝，已通知用户",
  "data": {
    "review": {
      "id": "review_1234567890_abc123",
      "status": "rejected",
      "reviewedAt": "2025-12-01T12:30:00.000Z",
      "reviewedBy": "admin",
      "reviewNote": "检测到异常行为，拒绝提现"
    }
  }
}
```

### 5. 获取提现安全统计

**请求**
```http
GET /api/admin/withdraw-security/stats
X-Admin-Password: your_admin_password
```

**响应**
```json
{
  "success": true,
  "data": {
    "config": {
      "WITHDRAW_COOLDOWN": 300000,
      "DAILY_WITHDRAW_LIMIT": 10,
      "DAILY_WITHDRAW_AMOUNT_LIMIT": 10000,
      "WITHDRAW_REVIEW_RATIO": 4,
      "LOCK_TIMEOUT": 30000
    },
    "totalUsers": 150,
    "pendingReviewsCount": 3,
    "userStats": {
      "0x...": {
        "date": "2025-12-01",
        "withdrawCount": 2,
        "withdrawAmount": 500,
        "depositAmount": 100
      }
    }
  }
}
```

### 6. 获取用户提现统计

**请求**
```http
GET /api/admin/withdraw-security/user-stats/{address}
X-Admin-Password: your_admin_password
```

**响应**
```json
{
  "success": true,
  "data": {
    "today": {
      "date": "2025-12-01",
      "withdrawCount": 2,
      "withdrawAmount": 500,
      "depositAmount": 100
    },
    "lastWithdrawTime": "2025-12-01T11:00:00.000Z",
    "limits": {
      "dailyCountLimit": 10,
      "dailyAmountLimit": 10000,
      "cooldownMs": 300000
    }
  }
}
```

---

## 安全配置参数

可以通过环境变量配置安全参数：

```env
# 提现冷却时间（毫秒）- 默认5分钟
WITHDRAW_COOLDOWN=300000

# 每日提现金额上限 - 默认10000 DP
DAILY_WITHDRAW_AMOUNT_LIMIT=10000

# 触发人工审核的提现/充值比例 - 默认4倍
WITHDRAW_REVIEW_RATIO=4

# 单次提现大额审核阀值 - 默认5000 DP
LARGE_WITHDRAW_THRESHOLD=5000

# 锁超时时间（毫秒）- 默认30秒
LOCK_TIMEOUT=30000
```

---

## 触发审核的条件

系统会在以下情况下自动将提现标记为待审核：

1. **单次大额提现** ⭐
   - 单次提现金额 >= 5000 DP（可配置）

2. **提现/充值比例异常**
   - 今日无充值但有提现
   - 今日提现金额 >= 今日充值金额 × 4（可配置）

3. **频繁失败**
   - 1小时内5次以上

---

## 最佳实践

### 用户端
1. 提现前检查冷却时间和每日限额
2. 如收到"待审核"状态，耐心等待管理员处理
3. 避免频繁尝试提现，会触发限流

### 管理员端
1. 定期检查待审核提现列表
2. 查看用户的完整信息和交易历史再做决策
3. 拒绝时务必提供明确的原因
4. 根据实际情况调整安全参数

---

## 错误代码

| HTTP 状态码 | 说明 |
|------------|------|
| 200 | 成功 |
| 202 | 接受但需要审核 |
| 400 | 请求参数错误或违反规则 |
| 401 | 未授权（管理员密码错误） |
| 404 | 资源不存在 |
| 429 | 请求过于频繁 |
| 500 | 服务器内部错误 |

---

## 监控建议

建议监控以下指标：

1. **待审核提现数量**
   - 正常值: < 5
   - 警告值: >= 10

2. **每日审核通过率**
   - 正常值: > 90%
   - 警告值: < 80%

3. **提现失败率**
   - 正常值: < 5%
   - 警告值: >= 10%

4. **平均审核处理时间**
   - 目标: < 1小时
   - 最大: < 24小时
