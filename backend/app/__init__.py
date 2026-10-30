"""
HealthPredict Backend Application Package
"""

__version__ = "1.0.0"
__author__ = "HealthPredict Team"

from app.config.database import Base, get_db

__all__ = ["Base", "get_db"]
