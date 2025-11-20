# 使用轻量级 Alpine 镜像
FROM node:20-alpine

# 设置工作目录
WORKDIR /app

# 只复制 package.json 和 package-lock.json
COPY package*.json ./

# 安装生产依赖
RUN npm install --production --no-audit --no-fund

# 复制应用代码
COPY . .

# 创建数据目录并设置权限
# 注意: 不在这里创建 game-balances.json,让应用启动时自己创建
# 这样才不会覆盖 Volume 中已有的数据
RUN mkdir -p /app/data && \
    chmod 777 /app/data

# 暴露端口
EXPOSE 3000

# 健康检查 - 给更长的启动时间
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# 启动命令
CMD ["node", "server.js"]
