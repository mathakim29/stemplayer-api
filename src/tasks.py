import os
import logging
from audio_separator.separator import Separator
import time

logger = logging.getLogger("hypercorn")

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
    start_time = time.perf_counter()

    try:
        # Initialize the Python Separator object
        separator = Separator(
            output_dir=export_path,
            model_file_dir=MODEL_DIR,
            output_format="WAV",
            log_level=logging.INFO,
        )

        # Load the specified model (or default if 'default' is requested)
        if modelname and modelname != "default":
            separator.load_model(modelname)
        else:
            separator.load_model("htdemucs.yaml")  # Uses the library's built-in default model

        # Run the separation process synchronously
        output_files = separator.separate(filepath)

        # Sort files and build exposure URLs
        output_files = sorted(output_files)
        file_urls = [f"/export/{code}/{name}" for name in output_files]

        logger.info(f"[{code}] audio-separator succeeded, {len(output_files)} file(s) produced")
        # Stop the stopwatch
        end_time = time.perf_counter()
        elapsed_time = end_time - start_time
        
        return {
            "elapsed_time": elapsed_time,
            "files": file_urls,
        }

    except Exception as e:
        logger.error(f"[{code}] audio-separator raised an exception: {e}")
        return {"error": str(e)}

    finally:
        try:
            if os.path.exists(filepath):
                os.remove(filepath)
                logger.info(f"[{code}] Removed processed upload: {filepath}")
        except OSError as cleanup_err:
            logger.warning(f"[{code}] Failed to remove upload {filepath}: {cleanup_err}")
