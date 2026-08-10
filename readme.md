<h1>
    <img src="https://watermelon.crd.co/assets/images/gallery05/1aee39ec.gif?v=14238bdb" width=30px>
    Stem-Player API
</h1>

A RESTful API for audio stem separation using the `audio-separator` library with Redis queue for asynchronous job processing. The API extracts individual stems (vocals, drums, bass, etc.) from uploaded audio files.

## Installation 
1. Install Docker Compose 
1. Clone the repository
2. Run this:

```bash
docker compose --env-file .env up --build 
```

## Technology Stack
- **Framework**: FastAPI
- **Queue**: Redis + RQ (Redis Queue)
- **Separation Engine**: audio-separator
- **Model**: htdemucs (default), see models.txt for more supported models

## Endpoints
### 1. Upload Audio
Submit an audio file for stem separation.

**Endpoint:** `POST /upload/`

**Content-Type:** `multipart/form-data`

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `file` | File | Yes | Audio file (WAV, MP3, FLAC, M4A, OGG) |
| `model` | String | No | Model to use (default: "htdemucs") |

**Response:** `200 OK`
```json
{
    "job_id": "string",
    "status": "Queued"
}
```

**Example:**
```bash
curl -X POST http://127.0.0.1:8000/upload/ \
  -F "file=@audio.wav" \
  -F "model=default"
```

**Error Responses:**
- `400 Bad Request`: Invalid file type
- `413 Payload Too Large`: File exceeds maximum size
- `500 Internal Server Error`: Server error


### 2. Check Job Status
Get the current status of a processing job.

**Endpoint:** `GET /status/{job_id}`

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `job_id` | String | Yes | Job ID returned from upload |

**Response (Queued):** `200 OK`
```json
{
    "status": "queued",
    "result": null
}
```

**Response (Started):** `200 OK`
```json
{
    "status": "started",
    "result": null
}
```

**Response (Finished):** `200 OK`
```json
{
    "status": "finished",
    "result": {
        "elapsed_time": 12.34,
        "files": [
            "/export/job_id/vocals.wav",
            "/export/job_id/drums.wav",
            "/export/job_id/bass.wav",
            "/export/job_id/other.wav"
        ]
    }
}
```

**Response (Failed):** `200 OK`
```json
{
    "status": "failed",
    "result": {
        "error": "Processing failed: Model error"
    }
}
```

**Error Response:**
- `404 Not Found`: Job ID not found

**Example:**
```bash
curl http://127.0.0.1:8000/status/job_123
```


### 3. Download Stem
Download an individual stem file.

**Endpoint:** `GET /export/{job_id}/{filename}`

**Example:**
```
GET /export/job_123/vocals.wav
```

**Response:**
- `200 OK`: Audio file stream (audio/wav)
- `404 Not Found`: File not found

**Example:**
```bash
curl -O http://127.0.0.1:8000/export/job_123/vocals.wav
```


### 4. Download All Stems as ZIP
Download all stems as a compressed ZIP file.

**Endpoint:** `POST /wrap.php`

**Note:** This is a separate PHP endpoint that packages files into a ZIP archive.

**Content-Type:** `multipart/form-data`

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `files[]` | String[] | Yes | Array of file paths to include |
| `names[]` | String[] | Yes | Array of filenames for the ZIP |

**Request Example:**
```javascript
const formData = new FormData();
formData.append('files[]', '/export/job_123/vocals.wav');
formData.append('files[]', '/export/job_123/drums.wav');
formData.append('names[]', 'vocals.wav');
formData.append('names[]', 'drums.wav');
```

**Response:**
- `200 OK`: ZIP file stream (application/zip)
- `400 Bad Request`: No files provided
- `500 Internal Server Error`: ZIP creation failed

## Workflow Examples

### Python (requests)
```python
import requests
import time

API_BASE = "http://127.0.0.1:8000"

# 1. Upload file
with open("audio.wav", "rb") as f:
    files = {"file": f}
    data = {"model": "default"}
    response = requests.post(f"{API_BASE}/upload/", files=files, data=data)
    job_id = response.json()["job_id"]
    print(f"Job ID: {job_id}")

# 2. Poll status
while True:
    response = requests.get(f"{API_BASE}/status/{job_id}")
    data = response.json()
    
    if data["status"] == "finished":
        stems = data["result"]["files"]
        elapsed = data["result"]["elapsed_time"]
        print(f"Processing complete in {elapsed:.2f}s")
        break
    elif data["status"] == "failed":
        error = data["result"].get("error", "Unknown error")
        raise Exception(f"Processing failed: {error}")
    
    print(f"Status: {data['status']}")
    time.sleep(3)

# 3. Download all stems
for stem_path in stems:
    response = requests.get(f"{API_BASE}{stem_path}")
    if response.status_code == 200:
        filename = stem_path.split("/")[-1]
        with open(filename, "wb") as f:
            f.write(response.content)
        print(f"Downloaded: {filename}")
```

### JavaScript (fetch)
```javascript
const API_BASE = "http://127.0.0.1:8000";

// 1. Upload file
async function uploadAudio(file) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('model', 'default');

    const response = await fetch(`${API_BASE}/upload/`, {
        method: 'POST',
        body: formData
    });
    const data = await response.json();
    return data.job_id;
}

// 2. Check status
async function checkStatus(jobId) {
    const response = await fetch(`${API_BASE}/status/${jobId}`);
    return await response.json();
}

// 3. Download stem
async function downloadStem(stemPath) {
    const response = await fetch(`${API_BASE}${stemPath}`);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = stemPath.split('/').pop();
    a.click();
    URL.revokeObjectURL(url);
}

// 4. Complete workflow
async function processAudio(file) {
    const jobId = await uploadAudio(file);
    console.log(`Job ID: ${jobId}`);
    
    let status = 'queued';
    while (status === 'queued' || status === 'started') {
        await new Promise(resolve => setTimeout(resolve, 3000));
        const data = await checkStatus(jobId);
        status = data.status;
        console.log(`Status: ${status}`);
        
        if (status === 'finished') {
            const stems = data.result.files;
            console.log(`Processing complete in ${data.result.elapsed_time.toFixed(2)}s`);
            // Download each stem
            for (const stem of stems) {
                await downloadStem(stem);
            }
        } else if (status === 'failed') {
            throw new Error(data.result.error || 'Processing failed');
        }
    }
}
```

### cURL
```bash
# 1. Upload file
JOB_ID=$(curl -X POST http://127.0.0.1:8000/upload/ \
  -F "file=@audio.wav" \
  -F "model=default" \
  | jq -r '.job_id')

echo "Job ID: $JOB_ID"

# 2. Check status
while true; do
  STATUS=$(curl -s http://127.0.0.1:8000/status/$JOB_ID | jq -r '.status')
  echo "Status: $STATUS"
  
  if [ "$STATUS" = "finished" ]; then
    # Download all stems
    curl -s http://127.0.0.1:8000/status/$JOB_ID | \
      jq -r '.result.files[]' | \
      while read -r file; do
        curl -O "http://127.0.0.1:8000$file"
      done
    break
  elif [ "$STATUS" = "failed" ]; then
    echo "Processing failed"
    break
  fi
  
  sleep 3
done
```

---

## System Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client    │────▶│   FastAPI   │────▶│  Redis RQ   │
│   (HTTP)    │     │  Endpoint   │     │   Queue     │
└─────────────┘     └─────────────┘     └─────────────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │   Worker    │
                                        │  Process    │
                                        └─────────────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │  audio-     │
                                        │  separator  │
                                        └─────────────┘
```



## Supported File Formats

| Format | Extension | Status |
|--------|-----------|--------|
| WAV | `.wav` | ✅ Fully supported |
| MP3 | `.mp3` | ✅ Supported |
| FLAC | `.flac` | ✅ Supported |
| M4A | `.m4a` | ✅ Supported |
| OGG | `.ogg` | ✅ Supported |




## Error Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 400 | Bad request - invalid parameters or file type |
| 404 | Resource not found |
| 413 | File too large (max 100MB) |
| 500 | Internal server error |
| 503 | Service unavailable (Redis/queue down) |


## Configuration

### Environment Variables
```bash
# Server
PORT=8000
HOST=127.0.0.1

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# File paths
UPLOAD_DIR=/tmp/asep/uploads
EXPORT_DIR=/tmp/asep/exports
MODEL_DIR=/tmp/asep/models

# Model
DEFAULT_MODEL=htdemucs
OUTPUT_FORMAT=WAV
```

## Performance Considerations

| Factor | Impact |
|--------|--------|
| **File Size** | Larger files = longer processing time |
| **Model Type** | htdemucs_ft is slower but higher quality |
| **Hardware** | GPU acceleration significantly speeds up processing |
| **Concurrent Jobs** | Limited by worker count and system resources |

**Typical Processing Times:**
- 3-minute song: ~10-15 seconds
- 5-minute song: ~15-25 seconds
- 10-minute song: ~30-45 seconds



## Limitations
- Maximum file size: 100MB
- Processing time: Up to 5 minutes per job
- Concurrent jobs: Configurable via worker count
- Input channels: Stereo only (mono will be upmixed)



## Security Considerations

1. **File Validation**: Only allowed audio file types are processed
2. **Path Traversal**: StaticFiles mount prevents directory traversal
3. **Cleanup**: Uploaded files are automatically removed after processing
4. **CORS**: Configured for cross-origin requests (adjustable)


## Monitoring

### Check Redis Queue Status
```bash
redis-cli
> QUEUES
> LLEN default
> LRANGE default 0 -1
```

### Check Worker Status
```bash
rq info
```

## License
MIT

