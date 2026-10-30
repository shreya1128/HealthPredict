@echo off
setlocal enabledelayedexpansion
color 0A

echo.
echo  ╔══════════════════════════════════════════════════════╗
echo  ║         HealthPredict — Starting Up                 ║
echo  ╚══════════════════════════════════════════════════════╝
echo.

REM Check Docker is available
where docker >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo  ERROR: Docker not found. Install Docker Desktop from:
    echo  https://www.docker.com/products/docker-desktop
    pause
    exit /b 1
)

REM Check Docker daemon is running
docker info >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo  ERROR: Docker Desktop is not running. Please start Docker Desktop first.
    pause
    exit /b 1
)

echo  [1/4] Pulling images and building...
docker compose pull --quiet
docker compose build --quiet

if %ERRORLEVEL% NEQ 0 (
    echo  ERROR: Build failed. Check the output above for details.
    pause
    exit /b 1
)

echo  [2/4] Starting database...
docker compose up -d db mailhog
timeout /t 15 /nobreak >nul

echo  [3/4] Starting API and web app...
docker compose up -d api web

echo  [4/4] Waiting for services to be ready...
echo  (This may take up to 60 seconds on first run)

set /a counter=0
:wait_loop
timeout /t 3 /nobreak >nul
set /a counter+=3

REM Check API health
curl -s -f http://localhost:8000/api/health >nul 2>&1
if %ERRORLEVEL% EQU 0 goto ready

if !counter! GEQ 90 (
    echo  WARNING: Services taking longer than expected.
    echo  Check status with: docker compose logs
    goto show_info
)
echo  Still starting... (!counter!s)
goto wait_loop

:ready
echo.
echo  ✓ All services are up!

:show_info
echo.
echo  ╔══════════════════════════════════════════════════════╗
echo  ║                 HealthPredict is Ready              ║
echo  ╠══════════════════════════════════════════════════════╣
echo  ║  Web App:    http://localhost:3000                  ║
echo  ║  API Docs:   http://localhost:8000/api/docs         ║
echo  ║  Email UI:   http://localhost:8025  (MailHog)       ║
echo  ╠══════════════════════════════════════════════════════╣
echo  ║  Demo login:                                        ║
echo  ║    Email:    demo@healthpredict.local               ║
echo  ║    Password: (set via DEMO_PASSWORD in .env)        ║
echo  ╠══════════════════════════════════════════════════════╣
echo  ║  Admin login:                                       ║
echo  ║    Email:    admin@healthpredict.local              ║
echo  ║    Password: (set via ADMIN_PASSWORD in .env)       ║
echo  ╚══════════════════════════════════════════════════════╝
echo.
echo  To stop:  docker compose down
echo  Logs:     docker compose logs -f
echo.

REM Try to open browser automatically
start "" "http://localhost:3000"

pause
