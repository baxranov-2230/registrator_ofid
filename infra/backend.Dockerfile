FROM python:3.12-slim

# The virtualenv deliberately lives OUTSIDE /app: in dev the host's backend/
# directory is bind-mounted over /app, and a venv inside it would be clobbered
# by the mount and left root-owned on the host (see E-03 / A-03).
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    UV_LINK_MODE=copy \
    PATH="/opt/venv/bin:$PATH"

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential curl libmagic1 \
    && rm -rf /var/lib/apt/lists/*

RUN curl -LsSf https://astral.sh/uv/install.sh | sh && \
    ln -s /root/.local/bin/uv /usr/local/bin/uv && \
    ln -s /root/.local/bin/uvx /usr/local/bin/uvx

# Unprivileged runtime user (E-03)
RUN useradd --create-home --uid 10001 app

WORKDIR /app
COPY pyproject.toml uv.lock* ./
RUN uv sync --no-dev --no-install-project

COPY . .
RUN chmod +x /app/entrypoint.sh 2>/dev/null || true; \
    mkdir -p /app/storage/uploads && \
    chown -R app:app /opt/venv /app

USER app

EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/healthz', timeout=3).status==200 else 1)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
