import os
import logging
import subprocess
import getenv

logger = logging.getLogger("uvicorn")

if not logger.handlers:
    handler = logging.StreamHandler()
    formatter = logging.Formatter("%(levelname)s:     %(message)s")
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    logger.propagate = False

UPLOAD_DIR = "/tmp/asep/uploads"
EXPORT_DIR = "/tmp/asep/exports"
MODEL_DIR = "/tmp/asep/models"

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(EXPORT_DIR, exist_ok=True)
os.makedirs(MODEL_DIR, exist_ok=True)


def process_upload(filename: str, modelname: str):
    code = os.path.splitext(filename)[0]
    filepath = os.path.join(UPLOAD_DIR, filename)
    export_path = os.path.join(EXPORT_DIR, code)
    os.makedirs(export_path, exist_ok=True)


    logger.info(f"[{code}] Starting processing for file: {filename}")

    output_lines = []
    command = ["audio-separator", "--model_file_dir", MODEL_DIR, "--output_format=WAV"]

    if (modelname != 'default'):
        command += ["-m", modelname]

    command += [ "--output_dir",export_path, filepath]

    try:
        process = subprocess.Popen(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )

        for line in process.stdout:
            line = line.rstrip()
            if line:
                logger.info(f"[{code}] {line}")
                output_lines.append(line)

        process.wait()

        if process.returncode != 0:
            error_output = "\n".join(output_lines)
            logger.error(f"[{code}] audio-separator failed with exit code {process.returncode}")
            return {"error": error_output}

        # Build the list of files audio-separator actually produced,
        # exposed as URLs under the /files static mount
        output_files = sorted(os.listdir(export_path))
        file_urls = [f"/files/{code}/{name}" for name in output_files]

        logger.info(f"[{code}] audio-separator succeeded, {len(output_files)} file(s) produced")
        return {
            "stdout": "\n".join(output_lines) if DEBUG_MODE else 0,
            "output_path": export_path,
            "files": file_urls,
        }

    except Exception as e:
        logger.error(f"[{code}] audio-separator raised an exception: {e}")
        return {"error": str(e)}

    finally:
        try:
            os.remove(filepath)
            logger.info(f"[{code}] Removed processed upload: {filepath}")
        except OSError as cleanup_err:
            logger.warning(f"[{code}] Failed to remove upload {filepath}: {cleanup_err}")