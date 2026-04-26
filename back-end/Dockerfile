# 多阶段构建：build 阶段做 TS 编译，runtime 阶段只装运行时依赖。
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
EXPOSE 3000
# 不设 NODE_ENV=production：保留 config.ts 里 dev 种子用户的逻辑，
# 一键启动后可直接用 root/123456 登录体验撮合。生产部署时应在 compose
# 或 K8s 显式覆盖 NODE_ENV 与 JWT_SECRET。
CMD ["node", "dist/index.js"]
