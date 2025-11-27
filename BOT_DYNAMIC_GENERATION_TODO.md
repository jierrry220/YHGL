# Bot动态生成方案 - 待实现

## 🎯 目标

让Bot在**60秒投注期内分批动态加入**，而非游戏开始时一次性全部生成。

---

## 📋 当前问题

**文件：** `api/party-crisis.js`

**当前逻辑（第92-184行）：**
```javascript
generateBots() {
    // 游戏开始时一次性生成100-150个Bot
    for (let i = 0; i < botCount; i++) {
        this.bots.push({ ... });
    }
}
```

**问题：**
1. 所有Bot在t=60秒时就已经存在
2. 前端虽然分批渲染，但房间投注额不会逐渐增加
3. 看起来很假

---

## ✅ 解决方案

### 方案1：后端定时添加Bot（推荐）

修改 `startGameTimer()` 函数，在投注阶段每隔1-3秒添加一批Bot：

```javascript
function startGameTimer(game) {
    game.timer = setInterval(async () => {
        game.countdown--;
        
        // 投注阶段：动态添加Bot
        if (game.phase === 'betting' && game.countdown > 5) {
            // 每2-4秒添加一批Bot
            if (game.countdown % 3 === 0) {
                addBotBatch(game);
            }
        }
        
        if (game.countdown <= 0) {
            // 阶段切换逻辑...
        }
    }, 1000);
}

function addBotBatch(game) {
    // 计算当前各房间投注情况
    const roomBets = calculateRoomBets(game);
    
    // 找出未达目标的房间
    const roomTargets = {};
    for (let i = 1; i <= 8; i++) {
        const target = Math.floor(
            GAME_CONFIG.ROOM_BET_MIN + 
            Math.random() * (GAME_CONFIG.ROOM_BET_MAX - GAME_CONFIG.ROOM_BET_MIN)
        );
        roomTargets[i] = target;
    }
    
    // 为未达标的房间添加2-5个Bot
    const botsToAdd = Math.floor(2 + Math.random() * 4);
    for (let i = 0; i < botsToAdd; i++) {
        // 选择当前投注最少的房间
        const targetRoom = findRoomNeedingBots(roomBets, roomTargets);
        if (!targetRoom) break;
        
        const amount = Math.floor(50 + Math.random() * 150); // 50-200 DP
        
        game.bots.push({
            id: `bot-${game.gameId}-${Date.now()}-${i}`,
            name: generateBotName(),
            roomId: targetRoom,
            amount: amount,
            isBot: true,
            joinedAt: Date.now()
        });
        
        roomBets[targetRoom] += amount;
    }
}
```

### 方案2：后端预生成，前端控制显示（次选）

后端依然一次性生成所有Bot，但给每个Bot分配一个 `joinTime`：

```javascript
generateBots() {
    const bots = [];
    const totalTime = GAME_CONFIG.BETTING_DURATION; // 60秒
    
    for (let i = 0; i < botCount; i++) {
        // 随机分配加入时间（0-55秒）
        const joinTime = Math.floor(Math.random() * (totalTime - 5));
        
        bots.push({
            id: `bot-${this.gameId}-${i}`,
            name: generateBotName(),
            roomId: selectRoom(),
            amount: Math.floor(50 + Math.random() * 150),
            isBot: true,
            joinTime: joinTime // 新增字段
        });
    }
    
    this.bots = bots;
}
```

前端根据 `joinTime` 和当前倒计时决定是否显示Bot：

```javascript
// 在 updateGameState() 中
if (game.phase === 'betting') {
    const elapsed = BETTING_DURATION - game.countdown;
    
    game.bots.forEach(bot => {
        if (bot.joinTime <= elapsed && !renderedBots.has(bot.id)) {
            // 该Bot应该出现了
            createPlayerCharacter(bot.id, bot.name, bot.roomId, false);
            renderedBots.add(bot.id);
        }
    });
}
```

---

## 🔧 推荐实现步骤

### 步骤1：修改 `generateBots()` 

改名为 `initializeBotTargets()`，只计算目标，不生成Bot：

```javascript
initializeBotTargets() {
    this.botTargets = {};
    for (let i = 1; i <= 8; i++) {
        this.botTargets[i] = Math.floor(
            GAME_CONFIG.ROOM_BET_MIN + 
            Math.random() * (GAME_CONFIG.ROOM_BET_MAX - GAME_CONFIG.ROOM_BET_MIN)
        );
    }
    this.botAddTimer = null;
    console.log('[Bot目标] 房间投注目标:', this.botTargets);
}
```

### 步骤2：在 `startGameTimer()` 中添加Bot生成逻辑

```javascript
function startGameTimer(game) {
    game.timer = setInterval(async () => {
        game.countdown--;
        
        // 投注阶段：动态添加Bot
        if (game.phase === 'betting') {
            // 每隔一定时间添加Bot
            const shouldAddBots = game.countdown % 2 === 0; // 每2秒
            if (shouldAddBots) {
                addBotBatch(game, 3, 7); // 每次添加3-7个
            }
        }
        
        // 阶段切换逻辑...
    }, 1000);
}
```

### 步骤3：实现 `addBotBatch()` 函数

```javascript
function addBotBatch(game, minBots = 2, maxBots = 5) {
    const roomBets = {};
    for (let i = 1; i <= 8; i++) {
        roomBets[i] = 0;
    }
    
    // 计算当前投注
    game.bots.forEach(bot => {
        roomBets[bot.roomId] += bot.amount;
    });
    
    const botsToAdd = Math.floor(minBots + Math.random() * (maxBots - minBots + 1));
    
    for (let i = 0; i < botsToAdd; i++) {
        // 选择最需要Bot的房间
        let targetRoom = 1;
        let maxDeficit = 0;
        
        for (let r = 1; r <= 8; r++) {
            const deficit = game.botTargets[r] - roomBets[r];
            if (deficit > maxDeficit) {
                maxDeficit = deficit;
                targetRoom = r;
            }
        }
        
        if (maxDeficit <= 0) {
            // 所有房间都达标了
            targetRoom = Math.floor(Math.random() * 8) + 1;
        }
        
        const amount = Math.floor(50 + Math.random() * 150);
        
        game.bots.push({
            id: `bot-${game.gameId}-${Date.now()}-${Math.random()}`,
            name: BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)] + Math.floor(Math.random() * 9999),
            roomId: targetRoom,
            amount: amount,
            isBot: true
        });
        
        roomBets[targetRoom] += amount;
    }
}
```

---

## 📊 预期效果

**投注阶段时间轴：**

```
t=60s: 游戏开始，0个Bot，房间投注全为0
t=58s: 添加5个Bot，部分房间有少量投注
t=56s: 添加4个Bot
t=54s: 添加6个Bot
...
t=5s:  总共120个Bot，每个房间约9000-10500 DP
t=0s:  投注结束，进入杀手阶段
```

**前端体验：**
- 玩家看到Bot陆续进入各个房间
- 房间投注额逐渐增加（实时更新）
- 看起来像真实玩家在下注

---

## 🚀 实施建议

1. **先实现方案1**（后端动态生成）- 更真实
2. 如果方案1有性能问题，再考虑方案2
3. 测试时观察：
   - 后端日志显示Bot逐批添加
   - 前端房间投注额逐渐增加
   - 最终每个房间达到8600-11200 DP

---

## ✅ 完成标准

- [ ] 游戏开始时 `game.bots` 为空数组
- [ ] 投注阶段每2秒增加3-7个Bot
- [ ] 后端日志显示 `[Bot添加] 新增X个Bot，房间投注: {...}`
- [ ] 前端看到房间投注额从0逐渐增加
- [ ] 投注期结束时，每个房间约8600-11200 DP
- [ ] 赔率保持在1.08-1.22倍范围内
