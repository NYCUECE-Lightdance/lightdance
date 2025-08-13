#### Stage 1. Build the application with dependencies ####
FROM python:3.11-alpine AS builder

RUN apk update && apk add --no-cache \
    curl \
    wget \
    git \
    && rm -rf /var/cache/apk/*
# alpine-sdk

RUN pip install --no-cache-dir uv

WORKDIR /app
COPY ./pyproject.toml .

RUN uv venv /opt/venv && \
    . /opt/venv/bin/activate && \
    uv pip install --no-cache -r pyproject.toml


#### Stage 2. Create a minimal image with the application ####
FROM python:3.11-alpine AS runtime

COPY --from=builder /opt/venv /opt/venv

# 設定環境變數
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/opt/venv/bin:$PATH" \
    PYTHONPATH="/app"

WORKDIR /app

RUN addgroup -S appgroup && adduser -S appuser -G appgroup
COPY --chown=appuser:appgroup ./ .
# RUN mkdir -p /app/logs && \
#     chown -R appuser:appgroup /app/logs

USER appuser
EXPOSE 8000

#### Stage 3. Run the application ####
# CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port 8000 $([ \"$APP_RELOAD\" = true ] && echo '--reload')"]