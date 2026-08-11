import os
import shutil
import subprocess
from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.staticfiles import StaticFiles
from redis import Redis
from rq import Queue
from tasks import process_upload, UPLOAD_DIR, EXPORT_DIR
from utils import generate_code, check_filetype
import asyncio
from fastapi.responses import HTMLResponse
import html
from pydantic import BaseModel
from typing import Optional


class UploadResponse(BaseModel):
    job_id: str
    status: str


class StatusResponse(BaseModel):
    status: Optional[str] = None
    result: Optional[str] = None
    error: Optional[str] = None


api = FastAPI()
redis_conn = Redis(host="localhost", port=6379)
task_queue = Queue("default", connection=redis_conn)

# Controlled static mount — only ever serves files under EXPORT_DIR,
# and FastAPI's StaticFiles resolves paths safely (no ../ escapes).
api.mount("/export", StaticFiles(directory=EXPORT_DIR), name="files")

from fastapi.middleware.cors import CORSMiddleware
api.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Or specify ["http://localhost:8080"]
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@api.post("/upload/", response_model=UploadResponse)
async def upload_file(file: UploadFile = File(...), vc_model: str = Form("default")) -> UploadResponse:
    code = generate_code()
    ext = os.path.splitext(file.filename)[1]
    filename = f"{code}{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    try:
        check_filetype(file)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    await file.seek(0)

    with open(filepath, "wb") as f:
        shutil.copyfileobj(file.file, f)

    job = task_queue.enqueue(process_upload, filename, vc_model, job_id=code, job_timeout=int(os.getenv("JOB_TIMEOUT", 3600)))  # Default timeout of 1 hour

    return UploadResponse(job_id=job.id, status="Queued")


@api.get("/status/{job_id}")
def check_status(job_id: str):
    job = task_queue.fetch_job(job_id)
    if not job:
        return {"error": "Invalid job ID"}
    return {"progress": job.get_status(), "result": job.result}

@api.get("/list-models", response_class=HTMLResponse)
async def list_models():
    proc = await asyncio.create_subprocess_exec(
        "audio-separator", "-l",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )

    stdout, stderr = await proc.communicate()

    if proc.returncode != 0:
        raise HTTPException(
            status_code=500, 
            detail=f"Command failed: {stderr.decode().strip()}"
        )

    escaped_output = html.escape(stdout.decode().strip())
    return f"<pre>{escaped_output}</pre>"