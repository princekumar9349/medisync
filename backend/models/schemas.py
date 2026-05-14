"""
models/schemas.py — Compatibility layer.

All Pydantic models have been migrated to the new core/schemas/ domain structure.
This file temporarily re-exports them to prevent breaking existing routers during the modular migration.
"""

from core.schemas import *
