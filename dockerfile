FROM beveradb/audio-separator:gpu-0.27.1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    redis \
    ffmpeg libmagic1 \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir --break-system-packages \
    fastapi \
    hypercorn \
    python-multipart \
    redis \
    rq \
    python-dotenv \
    python-magic audioread

ENTRYPOINT ["bash", "-c", "chmod +x /app/0.sh && bash /app/0.sh"]

# docker compose --env-file .env up --build 