#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# MatchFlash VPS Setup Script
# Run this as root on the VPS: bash deploy-vps.sh
# ============================================================

APP_DIR="/root/getmatchflash"
REPO_URL="https://github.com/Dairus01/getmatchflash.git"

echo "============================================"
echo "  MatchFlash VPS Setup"
echo "============================================"
echo ""

# ------ Step 1: System update ------
echo "[1/6] Updating system packages..."
apt update -y && apt upgrade -y
apt install -y curl wget git unzip build-essential

# ------ Step 2: Install Node.js 20 ------
echo "[2/6] Installing Node.js 20..."
if command -v node &>/dev/null && [[ "$(node -v)" == v20* || "$(node -v)" == v22* ]]; then
  echo "  Node.js $(node -v) already installed, skipping."
else
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt install -y nodejs
fi
echo "  Node: $(node -v)  npm: $(npm -v)"

# ------ Step 3: Install PM2 ------
echo "[3/6] Installing PM2..."
npm install -g pm2
echo "  PM2: $(pm2 -v)"

# ------ Step 4: Install cloudflared ------
echo "[4/6] Installing cloudflared..."
if command -v cloudflared &>/dev/null; then
  echo "  cloudflared already installed, skipping."
else
  curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o /tmp/cloudflared.deb
  dpkg -i /tmp/cloudflared.deb
  rm -f /tmp/cloudflared.deb
fi
echo "  cloudflared: $(cloudflared version)"

# ------ Step 5: Clone repo ------
echo "[5/6] Cloning repository..."
if [ -d "$APP_DIR/.git" ]; then
  echo "  Repo already exists, pulling latest..."
  cd "$APP_DIR" && git pull origin main || git pull origin master
else
  git clone "$REPO_URL" "$APP_DIR"
fi

# ------ Step 6: Install dependencies ------
echo "[6/6] Installing npm dependencies..."
cd "$APP_DIR"
npm install

cd "$APP_DIR/server"
npm install

# ------ Create .data directory ------
mkdir -p "$APP_DIR/server/.data/world_cup_archives"

echo ""
echo "============================================"
echo "  Setup complete!"
echo "============================================"
echo ""
echo "NEXT STEPS:"
echo ""
echo "1. Transfer your data files from your LOCAL machine:"
echo "   Run these commands from your local terminal (not this VPS):"
echo ""
echo "   scp -r ~/getmatchflash/server/.data/matchflash.db root@161.35.133.255:$APP_DIR/server/.data/"
echo "   scp -r ~/getmatchflash/server/.data/matchflash.sqlite root@161.35.133.255:$APP_DIR/server/.data/"
echo "   scp -r ~/getmatchflash/server/.data/world_cup_archives/ root@161.35.133.255:$APP_DIR/server/.data/"
echo ""
echo "2. Then run: bash ~/getmatchflash/start-services.sh"
echo ""
