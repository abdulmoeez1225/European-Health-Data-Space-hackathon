# Gatekeeper: FastAPI backend serving the statically exported Next.js frontend.

FROM node:22-slim AS frontend
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    GATEKEEPER_STATE_DIR=/var/lib/gatekeeper/state \
    GATEKEEPER_CACHE_DIR=/var/lib/gatekeeper/cache
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY app/ app/
COPY data/ data/
COPY requests/ requests/
COPY --from=frontend /src/frontend/out frontend/out
RUN useradd --system --uid 10001 gatekeeper \
    && mkdir -p /var/lib/gatekeeper/state /var/lib/gatekeeper/cache \
    && chown -R gatekeeper /var/lib/gatekeeper
USER gatekeeper
VOLUME /var/lib/gatekeeper
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health')"
CMD ["uvicorn", "app.api:app", "--host", "0.0.0.0", "--port", "8000"]
