#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "ERROR: Для сборки Mini App нужны Node.js и npm." >&2
  exit 1
fi

echo "[1/3] Установка frontend-зависимостей..."
cd "$ROOT/frontend"
npm ci

echo "[2/3] Сборка Mini App..."
npm run build

echo "[3/3] Копирование сборки в каталог, который ожидает bot_host.py..."
cd "$ROOT"
rm -rf "$ROOT/webapp"
mkdir -p "$ROOT/webapp"
cp -a "$ROOT/frontend/dist/." "$ROOT/webapp/"

test -f "$ROOT/webapp/index.html"
test -d "$ROOT/webapp/assets"

echo "OK: webapp/index.html и webapp/assets созданы."
