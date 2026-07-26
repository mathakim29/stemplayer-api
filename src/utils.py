import uuid
from datetime import datetime, timezone
from fastapi import UploadFile, HTTPException, status

def check_filetype(file: UploadFile) -> bool:
    is_valid = file.content_type in {"audio/wav", "audio/x-wav", "audio/mpeg"}
    
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file type. Only WAV and MP3 are allowed."
        )
        
    return True


def generate_code() -> str:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    random_part = uuid.uuid4().hex[:8]  # 8 random hex chars
    return f"{timestamp}-{random_part}"


