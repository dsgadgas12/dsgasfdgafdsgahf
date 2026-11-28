# Build the React/Vite Mini App, then run the Python bot/API.
FROM node:22-alpine AS frontend-build
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.13-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
# Replace any stale checked-in webapp with the freshly compiled LIVE frontend.
COPY --from=frontend-build /build/webapp ./webapp
EXPOSE 8000
CMD ["python", "bot_host.py"]
