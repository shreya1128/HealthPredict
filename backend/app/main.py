"""
FastAPI Application Main Entry Point
Initializes the HealthPredict API with all configurations, middleware, and routes
"""

import logging
from datetime import datetime, timezone
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError

from app.config.settings import settings
from app.config.database import check_db_connection

# Configure logging
logging.basicConfig(
    level=settings.LOG_LEVEL,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Lifespan context manager
@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Startup and shutdown events
    """
    # Startup
    logger.info("=" * 60)
    logger.info(f"Starting {settings.APP_NAME} v{settings.APP_VERSION}")
    logger.info(f"Environment: {settings.ENVIRONMENT}")
    logger.info(f"Debug: {settings.DEBUG}")
    
    # Connectivity check and automated migration runner
    if not check_db_connection():
        raise RuntimeError("Database connection failed - is MySQL running and DATABASE_URL correct?")
    logger.info("Database connection OK")

    try:
        from app.utils.migration_runner import run_migrations
        from app.config.database import engine
        count, applied = run_migrations(engine)
        if count > 0:
            logger.info(f"Applied {count} database migrations: {applied}")
    except Exception as exc:
        logger.error(f"Database migration check failed: {exc}", exc_info=True)

    # ML model status
    try:
        from app.services.prediction_service import is_model_loaded
        ml_loaded = is_model_loaded()
        logger.info(f"ML Model loaded: {ml_loaded}")
    except Exception as exc:
        logger.warning(f"ML Model status check skipped: {exc}")

    # Start 1-minute Reminder Scheduler Background Worker
    import asyncio
    import os
    scheduler_task = None
    if not os.environ.get("PYTEST_CURRENT_TEST") and settings.ENABLE_BACKGROUND_SCHEDULER:
        from app.config.database import SessionLocal
        from app.services import reminder_scheduler

        _interval = max(5, int(settings.REMINDER_INTERVAL_SECONDS))
        scheduler_task = asyncio.create_task(
            reminder_scheduler.scheduler_loop(SessionLocal, interval_seconds=_interval)
        )
        logger.info("Background Reminder Scheduler running (%ds interval).", _interval)
    else:
        logger.info("Background Reminder Scheduler is disabled.")

    logger.info("=" * 60)

    yield

    # Shutdown
    if scheduler_task:
        scheduler_task.cancel()
        try:
            await scheduler_task
        except asyncio.CancelledError:
            pass
    logger.info("Shutting down application...")

# Create FastAPI application
app = FastAPI(
    title=settings.APP_NAME,
    description="Healthcare Prediction (rule-based screening), Wellness Tracking & Medication Management",
    version=settings.APP_VERSION,
    docs_url="/api/docs" if settings.ENABLE_API_DOCS else None,
    redoc_url="/api/redoc" if settings.ENABLE_API_DOCS else None,
    openapi_url="/api/openapi.json" if settings.ENABLE_API_DOCS else None,
    lifespan=lifespan
)

# ============================================================================
# MIDDLEWARE CONFIGURATION
# ============================================================================

# Security Headers Middleware
@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if settings.COOKIE_SECURE or settings.ENVIRONMENT == "production":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response

# CSRF Double-Submit Cookie Middleware
@app.middleware("http")
async def csrf_protect_middleware(request, call_next):
    # Only enforce for state-changing HTTP methods
    if request.method in ("POST", "PUT", "PATCH", "DELETE"):
        # Public auth endpoints like login, forgot-password, reset-password, register, refresh do not require CSRF
        public_auth_paths = (
            "/api/auth/login",
            "/api/auth/register",
            "/api/auth/forgot-password",
            "/api/auth/reset-password",
            "/api/auth/verify-email",
            "/api/auth/refresh",
            "/api/auth/logout",
            "/api/auth/login/totp",
            "/api/auth/confirm-email-change",
        )
        is_public_token_route = (
            request.url.path.startswith("/api/reports/doctor-summary/public/") or
            request.url.path.startswith("/api/health/emergency-card/public/")
        )
        is_internal_api = bool(request.headers.get("X-Internal-Api-Key"))
        if request.url.path not in public_auth_paths and not is_public_token_route and not is_internal_api:
            auth_header = request.headers.get("Authorization")
            has_bearer = auth_header and auth_header.startswith("Bearer ")
            has_cookie_auth = "access_token" in request.cookies or "refresh_token" in request.cookies

            # Bearer token auth (mobile apps, test clients, external services) bypasses CSRF
            if has_cookie_auth and not has_bearer:
                csrf_cookie = request.cookies.get("csrf_token")
                csrf_header = request.headers.get("X-CSRF-Token")
                if not csrf_cookie or not csrf_header or csrf_cookie != csrf_header:
                    return JSONResponse(
                        status_code=403,
                        content={"detail": "CSRF validation failed: missing or invalid X-CSRF-Token header"}
                    )

    return await call_next(request)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=[
        "Authorization",
        "Content-Type",
        "X-Internal-Api-Key",
        "X-CSRF-Token",
        "X-Profile-Id",
    ],
)


# ============================================================================
# EXCEPTION HANDLERS
# ============================================================================

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc):
    """Return friendly, JSON-safe validation errors (never raw exception objects)."""
    errors = []
    for err in exc.errors():
        field = ".".join(str(p) for p in err.get("loc", []) if p not in ("body", "query", "path"))
        message = str(err.get("msg", "Invalid value")).removeprefix("Value error, ")
        errors.append({"field": field, "message": message})
    summary = errors[0]["message"] if errors else "Validation error"
    return JSONResponse(status_code=422, content={"detail": summary, "errors": errors})

@app.exception_handler(Exception)
async def general_exception_handler(request, exc):
    """Handle general exceptions"""
    logger.error(f"Unhandled exception: {str(exc)}", exc_info=True)
    
    if settings.DEBUG:
        # Sanitize: never expose raw SQL or database errors to client
        err_msg = str(exc)
        # Strip SQL statements from error messages
        if any(kw in err_msg.upper() for kw in ("SELECT ", "INSERT ", "UPDATE ", "DELETE ", "CREATE ", "DROP ", "ALTER ")):
            err_msg = "A database error occurred. Check server logs for details."
        return JSONResponse(
            status_code=500,
            content={
                "detail": f"Internal server error: {err_msg}"
            }
        )
    else:
        return JSONResponse(
            status_code=500,
            content={
                "detail": "Internal server error"
            }
        )

# ============================================================================
# HEALTH CHECK ENDPOINT
# ============================================================================

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    from app.services.prediction_service import is_model_loaded
    return {
        "status": "ok",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "environment": settings.ENVIRONMENT,
        "ml_model_loaded": is_model_loaded()
    }

@app.get("/api/health")
async def api_health_check():
    """API health check endpoint"""
    from app.services.prediction_service import is_model_loaded
    return {
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "ml_model_loaded": is_model_loaded()
    }


# ============================================================================
# ROOT ENDPOINTS
# ============================================================================

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": f"Welcome to {settings.APP_NAME}",
        "version": settings.APP_VERSION,
        "docs": "/api/docs",
        "endpoints": {
            "health": "/health",
            "api_health": "/api/health"
        }
    }

@app.get("/api")
async def api_root():
    """API root endpoint"""
    return {
        "message": "HealthPredict API",
        "version": settings.APP_VERSION,
        "documentation": "/api/docs"
    }

# ============================================================================
# ROUTES
# ============================================================================

from app.routes import admin, auth, care_profiles, dashboard, diabetes, emergency, fatty_liver, goals, health, medicines, menstrual, notifications, nutrition_plan, profile, reports, timeline, tracking, voice  # noqa: E402

app.include_router(auth.router, prefix=f"{settings.API_PREFIX}/auth", tags=["Authentication"])
app.include_router(profile.router, prefix=f"{settings.API_PREFIX}/profile", tags=["Profile"])
app.include_router(care_profiles.router, prefix=f"{settings.API_PREFIX}/care-profiles", tags=["Care Profiles"])
app.include_router(health.router, prefix=f"{settings.API_PREFIX}/health", tags=["Health"])
app.include_router(emergency.router, prefix=f"{settings.API_PREFIX}/health", tags=["Emergency & Symptoms"])
app.include_router(voice.router, prefix=f"{settings.API_PREFIX}", tags=["Voice Entry"])
app.include_router(timeline.router, prefix=f"{settings.API_PREFIX}", tags=["Timeline"])
app.include_router(nutrition_plan.router, prefix=f"{settings.API_PREFIX}", tags=["Nutrition Planning"])
app.include_router(diabetes.router, prefix=f"{settings.API_PREFIX}", tags=["Diabetes Risk Assessment"])
app.include_router(menstrual.router, prefix=f"{settings.API_PREFIX}", tags=["Menstrual Tracking & PCOS Support"])
app.include_router(fatty_liver.router, prefix=f"{settings.API_PREFIX}", tags=["Fatty Liver Risk Awareness"])
app.include_router(medicines.router, prefix=f"{settings.API_PREFIX}/medicines", tags=["Medicines"])
app.include_router(tracking.router, prefix=f"{settings.API_PREFIX}", tags=["Wellness Tracking"])
app.include_router(goals.router, prefix=f"{settings.API_PREFIX}/goals", tags=["Goals"])
app.include_router(dashboard.router, prefix=f"{settings.API_PREFIX}/dashboard", tags=["Dashboard"])
app.include_router(reports.router, prefix=f"{settings.API_PREFIX}/reports", tags=["Reports"])
app.include_router(notifications.router, prefix=f"{settings.API_PREFIX}/notifications", tags=["Notifications"])
app.include_router(admin.router, prefix=f"{settings.API_PREFIX}/admin", tags=["Admin"])

# ============================================================================
# APPLICATION INFO ENDPOINT
# ============================================================================

@app.get("/api/info")
async def app_info():
    """Get application information"""
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "environment": settings.ENVIRONMENT,
        "debug": settings.DEBUG,
        "endpoints": {
            "health": "/health",
            "docs": "/api/docs",
            "redoc": "/api/redoc",
            "openapi": "/api/openapi.json"
        }
    }

if __name__ == "__main__":
    import uvicorn
    
    logger.info(f"Starting Uvicorn server on {settings.HOST}:{settings.PORT}")
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        log_level=settings.LOG_LEVEL.lower()
    )
