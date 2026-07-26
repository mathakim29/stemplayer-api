FROM pytorch/pytorch:2.13.0-cuda13.2-cudnn9-runtime

workdir /app

run pip install --break-system-packages \
                fastapi uvicorn python-multipart \
                redis rq \ 
                audio-separator \
                python-dotenv onnxruntime[gpu]

run apt-get update && apt install -y redis ffmpeg && rm -rf /var/lib/apt/lists/*

