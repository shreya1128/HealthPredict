#!/usr/bin/env python
"""
Backend Root Entry Point
Run this file to start the FastAPI server

Usage:
    python main.py
"""

import sys
import os
import logging

# Add the backend directory to the path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.main import app
from app.config.settings import settings
import uvicorn

if __name__ == "__main__":
    logging.info(f"Starting {settings.APP_NAME} on {settings.HOST}:{settings.PORT}")
    
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        log_level=settings.LOG_LEVEL.lower()
    )
