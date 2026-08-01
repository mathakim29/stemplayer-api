import uuid
from datetime import datetime, timezone
import magic
from fastapi import HTTPException, UploadFile, status


def check_filetype(file: UploadFile) -> bool:
    """Verifies that the uploaded file's binary content is exclusively an audio profile."""
    try:
        # 1. Read the initial bytes header to examine file signature properties
        header_bytes = file.file.read(2048)
        
        # Crucial: Rewind the tracking pointer back to zero so the stream file is completely intact
        file.file.seek(0)

        # 2. Extract the true MIME type signature string
        detected_mime = magic.from_buffer(header_bytes, mime=True)

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Content signature verification failed: {e}",
        )

    # 3. Dynamic Prefix Catching: This validates any profile layout matching "audio/*"
    if not detected_mime or not detected_mime.startswith("audio/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Access Denied. Target file type must be audio. Detected: '{detected_mime}'",
        )

    return True


def generate_code() -> str:
    """Generates a highly collision-resistant tracking string token."""
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    return f"{timestamp}-{uuid.uuid4().hex[:8]}"
