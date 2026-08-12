import os
import logging
import time
from audio_separator.separator import Separator

logger = logging.getLogger("rq.worker")

UPLOAD_DIR = "/tmp/asep/uploads"
EXPORT_DIR = "/tmp/asep/exports"
MODEL_DIR = "/tmp/asep/models"

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(EXPORT_DIR, exist_ok=True)
os.makedirs(MODEL_DIR, exist_ok=True)

if not logger.handlers:
    handler = logging.StreamHandler()
    formatter = logging.Formatter("%(levelname)s:     %(message)s")
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    logger.propagate = False



def process_upload(filename: str, modelname: str):
    code = os.path.splitext(filename)[0]
    filepath = os.path.join(UPLOAD_DIR, filename)
    export_path = os.path.join(EXPORT_DIR, code)
    os.makedirs(export_path, exist_ok=True)

    logger.info(f"[{code}] Starting processing for file: {filename}")
    
    return process_audio(filepath, export_path, code, modelname, MODEL_DIR)



def process_audio(filepath: str, export_path: str, code: str, modelname: str, model_dir: str):
    start_time = time.perf_counter()

    try:
        separator = Separator(
            output_dir=export_path,
            model_file_dir=model_dir,
            output_format="WAV",
            log_level=logging.INFO,
        )

        model_to_load = modelname if modelname and modelname != "default" else "htdemucs.yaml"
        separator.load_model(model_to_load)

        output_files = separator.separate(filepath)
        output_files = sorted(output_files)
        file_urls = [f"/export/{code}/{name}" for name in output_files]

        elapsed_time = time.perf_counter() - start_time
        logger.info(f"[{code}] Succeeded in {elapsed_time:.2f}s, {len(output_files)} file(s) produced")
        
        return {
            "status": "success",
            "elapsed_time": elapsed_time,
            "files": file_urls,
        }

    except Exception as e:
            error_type = type(e).__name__
            formatted_error = f"[{error_type}] {str(e)}"
            logger.error(f"[{code}] Task encountered error: {formatted_error}")
            
            return {
                "status": "error",
                "code": code,
                "error_type": error_type,
                "message": str(e)
            }

    finally:
        if os.path.exists(filepath):
            try:
                os.remove(filepath)
                logger.info(f"[{code}] Cleaned up input: {filepath}")
            except OSError as cleanup_err:
                logger.warning(f"[{code}] Cleanup failed: {cleanup_err}")