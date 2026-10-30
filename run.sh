#!/usr/bin/env bash
set -euo pipefail

# Colors
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

echo ""
echo -e "${CYAN} ╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN} ║         HealthPredict — Starting Up                 ║${NC}"
echo -e "${CYAN} ╚══════════════════════════════════════════════════════╝${NC}"
echo ""

# Check Docker
if ! command -v docker &>/dev/null; then
    echo -e "${RED} ERROR: Docker not found. Install Docker Desktop from:${NC}"
    echo "  https://www.docker.com/products/docker-desktop"
    exit 1
fi

if ! docker info &>/dev/null; then
    echo -e "${RED} ERROR: Docker daemon not running. Start Docker Desktop first.${NC}"
    exit 1
fi

echo " [1/4] Pulling images and building..."
docker compose pull --quiet || true
if ! docker compose build; then
    echo -e "${RED} ERROR: Docker build failed. Review output above.${NC}"
    exit 1
fi


echo " [2/4] Starting database..."
docker compose up -d db mailhog
sleep 15

echo " [3/4] Starting API and web app..."
docker compose up -d api web

echo " [4/4] Waiting for services to be ready..."
echo " (This may take up to 60 seconds on first run)"

counter=0
while true; do
    sleep 3
    counter=$((counter + 3))
    if curl -sf http://localhost:8000/api/health &>/dev/null; then
        echo ""
        echo -e "${GREEN} ✓ All services are up!${NC}"
        break
    fi
    if [ $counter -ge 90 ]; then
        echo -e "${YELLOW} WARNING: Services taking longer than expected.${NC}"
        echo " Check status with: docker compose logs"
        break
    fi
    echo " Still starting... (${counter}s)"
done

echo ""
echo -e "${GREEN} ╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN} ║                 HealthPredict is Ready              ║${NC}"
echo -e "${GREEN} ╠══════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN} ║  Web App:    http://localhost:3000                  ║${NC}"
echo -e "${GREEN} ║  API Docs:   http://localhost:8000/api/docs         ║${NC}"
echo -e "${GREEN} ║  Email UI:   http://localhost:8025  (MailHog)       ║${NC}"
echo -e "${GREEN} ╠══════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN} ║  Demo login:                                        ║${NC}"
echo -e "${GREEN} ║    Email:    demo@healthpredict.local               ║${NC}"
echo -e "${GREEN} ║    Password: Demo@123456                            ║${NC}"
echo -e "${GREEN} ╠══════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN} ║  Admin login:                                       ║${NC}"
echo -e "${GREEN} ║    Email:    admin@healthpredict.local              ║${NC}"
echo -e "${GREEN} ║    Password: Admin@123456                           ║${NC}"
echo -e "${GREEN} ╚══════════════════════════════════════════════════════╝${NC}"
echo ""
echo " To stop:  docker compose down"
echo " Logs:     docker compose logs -f"
echo ""

# Try to open browser
if command -v xdg-open &>/dev/null; then
    xdg-open http://localhost:3000 &>/dev/null || true
elif command -v open &>/dev/null; then
    open http://localhost:3000 || true
fi
