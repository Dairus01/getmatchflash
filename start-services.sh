#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# MatchFlash Service Startup Script
# Run after deploy-vps.sh and data transfer are complete.
# Usage: bash start-services.sh
# ============================================================

APP_DIR="/root/getmatchflash"
SERVER_DIR="$APP_DIR/server"
ENV_FILE="$SERVER_DIR/.env"

echo "============================================"
echo "  MatchFlash Service Startup"
echo "============================================"
echo ""

# ------ Check data files exist ------
echo "Checking data files..."
if [ ! -f "$SERVER_DIR/.data/matchflash.db" ]; then
  echo "ERROR: matchflash.db not found. Transfer your data first."
  echo "  scp ~/getmatchflash/server/.data/matchflash.db root@161.35.133.255:$SERVER_DIR/.data/"
  exit 1
fi
echo "  ✓ matchflash.db found"

if [ -f "$SERVER_DIR/.data/matchflash.sqlite" ]; then
  echo "  ✓ matchflash.sqlite found"
fi

ARCHIVE_COUNT=$(ls -1 "$SERVER_DIR/.data/world_cup_archives/"*.json 2>/dev/null | wc -l || echo 0)
echo "  ✓ $ARCHIVE_COUNT archive files found"

# ------ Create .env if missing ------
if [ ! -f "$ENV_FILE" ]; then
  echo ""
  echo "Creating server .env..."
  cat > "$ENV_FILE" <<'ENVEOF'
PORT=3001
TELEGRAM_BOT_TOKEN=8945253294:AAGJhplNOic2SHjaQs-JiLr-15MonGomYZ8
APP_BASE_URL=https://getmatchflash.vercel.app
FRONTEND_ORIGIN=https://getmatchflash.vercel.app
CORS_ORIGIN=https://getmatchflash.vercel.app
ENVEOF
  echo "  ✓ .env created"
else
  echo "  ✓ .env already exists"
fi

# ------ Load env vars ------
echo ""
echo "Loading environment variables..."
set -a
source "$ENV_FILE"
set +a
echo "  ✓ Loaded from .env"

# ------ Create PM2 ecosystem config ------
echo "Creating PM2 ecosystem config..."
cat > "$SERVER_DIR/ecosystem.config.cjs" <<ECOEOF
module.exports = {
  apps: [
    {
      name: "matchflash-api",
      script: "npx",
      args: "tsx src/api-server.ts",
      cwd: "$SERVER_DIR",
      env: {
        PORT: "$PORT",
        TELEGRAM_BOT_TOKEN: "$TELEGRAM_BOT_TOKEN",
        APP_BASE_URL: "$APP_BASE_URL",
        FRONTEND_ORIGIN: "${FRONTEND_ORIGIN:-$APP_BASE_URL}",
        CORS_ORIGIN: "${CORS_ORIGIN:-$FRONTEND_ORIGIN}",
      },
      max_restarts: 10,
      restart_delay: 3000,
    },
    {
      name: "matchflash-ingest",
      script: "npx",
      args: "tsx src/ingest-txline.ts --duration=21600",
      cwd: "$SERVER_DIR",
      autorestart: true,
      restart_delay: 5000,
      max_restarts: 999,
    },
    {
      name: "matchflash-bot",
      script: "npx",
      args: "tsx --env-file=.env src/bot.ts",
      cwd: "$SERVER_DIR",
      env: {
        TELEGRAM_BOT_TOKEN: "$TELEGRAM_BOT_TOKEN",
        APP_BASE_URL: "$APP_BASE_URL",
      },
      max_restarts: 10,
      restart_delay: 3000,
    },
    {
      name: "matchflash-archive",
      script: "npx",
      args: "tsx src/auto-archive.ts",
      cwd: "$SERVER_DIR",
      autorestart: true,
      restart_delay: 5000,
      max_restarts: 999,
    },
    {
      name: "cloudflare-tunnel",
      script: "cloudflared",
      args: "tunnel --url http://localhost:$PORT --no-autoupdate",
      max_restarts: 10,
      restart_delay: 5000,
    },
  ],
};
ECOEOF
echo "  ✓ ecosystem.config.cjs created"

# ------ Stop any existing services ------
echo ""
echo "Stopping existing services (if any)..."
pm2 delete all 2>/dev/null || true

# ------ Start all services ------
echo ""
echo "Starting all services..."
cd "$SERVER_DIR"
pm2 start ecosystem.config.cjs

# ------ Save PM2 config ------
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null || pm2 startup

# ------ Wait for API to be ready ------
echo ""
echo "Waiting for API server to be ready..."
for i in {1..15}; do
  if curl -s http://localhost:3001/api/matches > /dev/null 2>&1; then
    echo "  ✓ API server is responding on port 3001"
    break
  fi
  if [ "$i" -eq 15 ]; then
    echo "  ⚠ API server not responding yet. Check: pm2 logs matchflash-api"
  fi
  sleep 2
done

echo ""
echo "============================================"
echo "  All services started!"
echo "============================================"
echo ""
echo "Run the following to see your tunnel URL:"
echo ""
echo "  pm2 logs cloudflare-tunnel --lines 20"
echo ""
echo "Look for a line like:"
echo "  https://random-name-here.trycloudflare.com"
echo ""
echo "Useful commands:"
echo "  pm2 status            - check all services"
echo "  pm2 logs              - view all logs"
echo "  pm2 logs matchflash-api     - API server logs"
echo "  pm2 logs matchflash-ingest  - TxLINE live ingestion logs"
echo "  pm2 logs matchflash-bot     - Telegram bot logs"
echo "  pm2 logs cloudflare-tunnel  - Tunnel URL and logs"
echo "  pm2 restart all       - restart everything"
echo ""
