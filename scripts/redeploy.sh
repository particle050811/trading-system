#!/usr/bin/env bash
# 一键重新部署：关闭旧容器后重新构建并后台启动。
# 绕过 docker-compose v1 在新版 Docker 引擎上的 KeyError: 'ContainerConfig' 兼容问题。
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 关闭旧容器"
docker-compose down

echo "==> 构建并启动"
docker-compose up -d --build

echo "==> 当前状态"
docker-compose ps
