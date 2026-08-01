#!/bin/bash
# Define your absolute target location
REDIS_DIR="/tmp/asep/redis_data"
mkdir -p "$REDIS_DIR"
export PYTHONPYCACHEPREFIX="/tmp/pycache" 

# Force Redis to use this directory from the very millisecond it starts up
redis-server --dir "$REDIS_DIR" --dbfilename dump.rdb --enable-protected-configs yes &
uvicorn main:api --host 0.0.0.0 --port 8000 --reload & rq worker default 