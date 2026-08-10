FROM docker.io/pytorch/pytorch:2.13.0-cuda13.0-cudnn9-runtime

WORKDIR /app

copy ./src /app

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
    audio-separator \
    python-dotenv \
    onnxruntime-gpu \
    python-magic 

# docker compose --env-file .env up --build 