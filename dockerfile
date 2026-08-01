FROM docker.io/pytorch/pytorch:2.13.0-cuda13.0-cudnn9-runtime

WORKDIR /app

copy ./src /app

# 1. Install system utilities first to build cache layers that rarely change
RUN apt-get update && apt-get install -y --no-install-recommends \
    redis \
    ffmpeg libmagic1 \
    && rm -rf /var/lib/apt/lists/*

# 2. Configure Python path markers to locate underlying CUDA libraries
ENV LD_LIBRARY_PATH=/usr/local/cuda/lib64:${LD_LIBRARY_PATH:-}

# 3. Batch pip layers and clear pip cache to minimize image footprint
RUN pip install --no-cache-dir --break-system-packages \
    fastapi \
    uvicorn \
    python-multipart \
    redis \
    rq \
    audio-separator \
    python-dotenv \
    onnxruntime-gpu \
    python-magic 


# 4. Configure system paths and direct ALL __pycache__ files to a system cache folder
ENV LD_LIBRARY_PATH=/usr/local/cuda/lib64:${LD_LIBRARY_PATH:-} \
    PYTHONPYCACHEPREFIX=/tmp/pycache

CMD ["bash","run.sh"]
