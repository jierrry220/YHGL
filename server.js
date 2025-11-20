require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS 配置 - 必须在所有路由之前
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// 初始化状态
let isReady = false;
let initError = null;

// 健康检查 - 总是返回 200
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        service: 'Debear Party GameFi Backend',
        ready: isReady,
        error: initError ? initError.message : null
    });
});

app.get('/healthz', (req, res) => {
    res.json({ status: 'ok' });
});

app.get('/', (req, res) => {
    res.json({
        name: 'Debear Party GameFi Backend',
        version: '1.0.0',
        ready: isReady,
        endpoints: {
            health: '/health',
            api: '/api/game-balance'
        }
    });
});

// 503 临时响应 - 服务初始化中
app.all('/api/game-balance*', (req, res, next) => {
    if (!isReady) {
        return res.status(503).json({
            success: false,
            error: 'Service is starting up, please wait...',
            details: initError ? initError.message : 'Initializing...'
        });
    }
    next();
});

// 错误处理
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ 
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
});

// 启动服务器
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log('='.repeat(50));
    console.log('🚀 Debear Party GameFi Backend');
    console.log('📍 Port:', PORT);
    console.log('🌍 Environment:', process.env.NODE_ENV || 'production');
    console.log('⏰ Started:', new Date().toISOString());
    console.log('='.repeat(50));
    
    // 后台初始化
    setTimeout(initializeApp, 100);
});

// 异步初始化应用
async function initializeApp() {
    try {
        console.log('🔧 Initializing application...');
        
        // 加载游戏余额 API
        const gameBalanceAPI = require('./api/game-balance');
        console.log('✓ Game balance API loaded');
        
        // 初始化余额管理器
        const { gameBalanceManager } = require('./game-balance');
        await gameBalanceManager.init();
        console.log('✓ Balance manager initialized');
        
        // 注册路由
        app.use('/api/game-balance', gameBalanceAPI);
        console.log('✓ Routes registered');
        
        // 404 处理 - 必须在路由注册之后
        app.use((req, res) => {
            res.status(404).json({ error: 'Not Found', path: req.url });
        });
        
        isReady = true;
        console.log('='.repeat(50));
        console.log('✅ APPLICATION READY');
        console.log('🎮 Game balance API is now available');
        console.log('='.repeat(50));
        
    } catch (error) {
        initError = error;
        console.error('='.repeat(50));
        console.error('❌ INITIALIZATION FAILED');
        console.error('Error:', error.message);
        console.error('Stack:', error.stack);
        console.error('='.repeat(50));
        console.error('⚠️  Server continues in degraded mode');
        console.error('⚠️  API will return 503 until manually fixed');
    }
}

// 优雅关闭
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

function shutdown() {
    console.log('\n📴 Shutting down gracefully...');
    server.close(() => {
        console.log('✓ Server closed');
        process.exit(0);
    });
    
    // 强制退出超时
    setTimeout(() => {
        console.error('⚠️  Forced shutdown');
        process.exit(1);
    }, 10000);
}

// 错误捕获
process.on('uncaughtException', (err) => {
    console.error('💥 UNCAUGHT EXCEPTION:', err);
    console.error('Stack:', err.stack);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 UNHANDLED REJECTION:', reason);
    console.error('Promise:', promise);
});
