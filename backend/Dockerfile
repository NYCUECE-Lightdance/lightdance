#### Stage 1. Build the application with dependencies ####
FROM python:3.11-alpine AS builder

# Install system dependencies
RUN apk update && apk add --no-cache curl wget git

# Install uv, a fast Python package installer
RUN pip install --no-cache-dir uv

WORKDIR /app

# --- Optimization: Cache dependencies ---
# Copy only the dependency definition files first.
# This layer will only be re-run if these files change.
COPY ./pyproject.toml .

# Install dependencies using uv.
# The venv is created in /opt/venv which will be copied to the runtime stage.
RUN uv venv /opt/venv && \
    . /opt/venv/bin/activate && \
    uv pip install --no-cache -r pyproject.toml


#### Stage 2. Create a minimal, secure runtime image ####
FROM python:3.11-alpine AS runtime

# Install curl for healthchecks
RUN apk update && apk add --no-cache curl

# Copy the virtual environment with all dependencies from the builder stage
COPY --from=builder /opt/venv /opt/venv

# Set environment variables for Python
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/opt/venv/bin:$PATH" \
    PYTHONPATH="/app"

WORKDIR /app

# Create a non-root user and group for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# --- Optimization: Copy source code last ---
# Copy the application source code. By copying dependencies first and code last,
# we ensure that changes to the code don't invalidate the dependency cache.
COPY --chown=appuser:appgroup ./ .

# Set the user to the non-root user
USER appuser

# Expose the port the application will run on
EXPOSE 8000

# The command to run the application.
# It supports hot-reloading in development via the APP_RELOAD environment variable.
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port 8000 $([ \"$APP_RELOAD\" = true ] && echo '--reload')"]
