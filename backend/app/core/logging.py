import logging
import sys

from app.core.config import settings


def setup_logging() -> None:
    level = getattr(logging, settings.log_level.upper(), logging.INFO)
    fmt = "%(asctime)s %(levelname)s %(name)s - %(message)s"
    logging.basicConfig(level=level, format=fmt, stream=sys.stdout, force=True)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
