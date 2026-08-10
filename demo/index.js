import WaveSurfer from 'https://cdn.jsdelivr.net/npm/wavesurfer.js@7/dist/wavesurfer.esm.js'
import HoverPlugin from 'https://cdn.jsdelivr.net/npm/wavesurfer.js@7/dist/plugins/hover.esm.js'

const API_BASE_URL = 'http://127.0.0.1:8000';
let instances = [];
let currentTrackTimes = [];
let trackFiles = [];

// Get DOM elements
const playAll = document.getElementById('play-all-btn');
const pauseAll = document.getElementById('pause-all-btn');
const stopAll = document.getElementById('stop-all-btn');
const downloadAllBtn = document.getElementById('download-all-btn');
const uploadForm = document.getElementById('upload-form');
const fileInput = document.getElementById('file');
const submitBtn = document.getElementById('submit-btn');
const contentBox = document.getElementById('content-box');
const audioContainer = document.getElementById('audio-container');
const globalControls = document.getElementById('global-controls');

// Update global control buttons
function updateButtons() {
    const playing = instances.some(w => w.isPlaying());
    const loaded = instances.length > 0;
    playAll.disabled = !loaded;
    pauseAll.disabled = !loaded || !playing;
    stopAll.disabled = !loaded;
    downloadAllBtn.disabled = !loaded;
    playAll.textContent = playing ? 'Playing...' : 'Play All';
}

// Global control event listeners
playAll.addEventListener('click', () => instances.forEach(w => w.play()));
pauseAll.addEventListener('click', () => instances.forEach(w => w.pause()));
stopAll.addEventListener('click', () => {
    instances.forEach(w => { w.stop(); w.seekTo(0); });
});

// Format time helper
function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '00:00';
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Update individual track time display
function updateTimeDisplay(index, current, duration) {
    const timeElement = currentTrackTimes[index]?.element;
    if (timeElement) {
        timeElement.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
    }
}

// Download all tracks as ZIP
async function downloadAllAsZip() {
    try {
        downloadAllBtn.disabled = true;
        downloadAllBtn.textContent = 'Creating ZIP...';

        const filePaths = trackFiles.map(track => track.path);
        
        if (filePaths.length === 0) {
            alert('No tracks to download');
            downloadAllBtn.disabled = false;
            downloadAllBtn.textContent = 'Download All (ZIP)';
            return;
        }

        const formData = new FormData();
        filePaths.forEach((path, index) => {
            formData.append('files[]', path);
            formData.append(`names[]`, trackFiles[index].name);
        });

        const response = await fetch('wrap.php', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }

        const blob = await response.blob();
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'stems.zip';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);

        downloadAllBtn.disabled = false;
        downloadAllBtn.textContent = 'Download All (ZIP)';
    } catch (error) {
        console.error('Download error:', error);
        downloadAllBtn.disabled = false;
        downloadAllBtn.textContent = 'Download All (ZIP)';
        alert('Error downloading files: ' + error.message);
    }
}

downloadAllBtn.addEventListener('click', downloadAllAsZip);

// Poll status function
async function pollStatus(jobId) {
    const interval = setInterval(async () => {
        try {
            contentBox.className = 'content-box info';
            contentBox.textContent = `Processing... Job: ${jobId}`;

            const res = await fetch(`${API_BASE_URL}/status/${jobId}`);
            const data = await res.json();
            if (!res.ok) throw new Error('Status error');

            if (data.status === 'finished') {
                clearInterval(interval);
                contentBox.className = 'content-box success';
                contentBox.textContent = `Complete in ${data.result.elapsed_time.toFixed(2)}s`;
                submitBtn.disabled = false;
                renderTracks(data.result.files);
            } else if (data.status === 'failed') {
                clearInterval(interval);
                contentBox.className = 'content-box error';
                contentBox.textContent = 'Processing failed';
                submitBtn.disabled = false;
            }
        } catch (err) {
            clearInterval(interval);
            contentBox.className = 'content-box error';
            contentBox.textContent = `Polling error: ${err.message}`;
            submitBtn.disabled = false;
        }
    }, 3000);
}

// Render tracks function
function renderTracks(filePaths) {
    instances = [];
    currentTrackTimes = [];
    trackFiles = [];
    globalControls.classList.add('visible');
    audioContainer.innerHTML = '';

    filePaths.forEach((path, i) => {
        const name = path.match(/\(([^)]+)\)/)?.[1] || `Track ${i + 1}`;
        const url = `${API_BASE_URL}${path}`;

        trackFiles.push({
            path: path,
            name: `${name.toLowerCase().replace(/\s+/g, '_')}.wav`
        });

        // Create track card
        const card = document.createElement('div');
        card.className = 'track-card';

        // Header with title and time
        const header = document.createElement('div');
        header.className = 'track-header';

        const title = document.createElement('div');
        title.className = 'track-title';
        title.textContent = `Stem: ${name}`;

        const timeDisplay = document.createElement('div');
        timeDisplay.id = `time-${i}`;
        timeDisplay.className = 'track-time';
        timeDisplay.textContent = '00:00 / 00:00';

        header.appendChild(title);
        header.appendChild(timeDisplay);

        // Waveform container
        const waveId = `wave-${i}`;
        const waveContainer = document.createElement('div');
        waveContainer.id = waveId;
        waveContainer.className = 'wave-container';

        // Controls
        const controls = document.createElement('div');
        controls.className = 'track-controls';

        const playBtn = document.createElement('button');
        playBtn.id = `play-${i}`;
        playBtn.className = 'btn-track btn-track-play';
        playBtn.textContent = 'Play';

        const downloadBtn = document.createElement('button');
        downloadBtn.className = 'btn-track btn-track-download';
        downloadBtn.textContent = 'Download';
        downloadBtn.setAttribute('data-url', url);
        downloadBtn.onclick = () => {
            const a = document.createElement('a');
            a.href = url;
            a.download = `${name.toLowerCase().replace(/\s+/g, '_')}.wav`;
            a.click();
        };

        controls.appendChild(playBtn);
        controls.appendChild(downloadBtn);
        card.appendChild(header);
        card.appendChild(waveContainer);
        card.appendChild(controls);
        audioContainer.appendChild(card);

        // Create WaveSurfer instance
        const ws = WaveSurfer.create({
            container: `#${waveId}`,
            waveColor: '#4f46e5',
            progressColor: '#06b6d4',
            cursorColor: '#312e81',
            barWidth: 2,
            barRadius: 3,
            responsive: true,
            height: 80,
            url: url,
            plugins: [
                HoverPlugin.create({
                    lineColor: '#ff0000',
                    lineWidth: 2,
                    labelBackground: '#555',
                    labelColor: '#fff',
                    labelSize: '11px',
                    labelFont: 'monospace',
                    formatTimeCallback: (seconds) => formatTime(seconds)
                })
            ]
        });

        instances.push(ws);
        currentTrackTimes.push({
            element: timeDisplay,
            duration: 0
        });

        // WaveSurfer event listeners
        ws.on('ready', () => {
            const duration = ws.getDuration();
            currentTrackTimes[i].duration = duration;
            updateTimeDisplay(i, 0, duration);
            updateButtons();
        });

        ws.on('audioprocess', (currentTime) => {
            const duration = currentTrackTimes[i].duration;
            updateTimeDisplay(i, currentTime, duration);
        });

        ws.on('seek', (progress) => {
            const currentTime = progress * currentTrackTimes[i].duration;
            updateTimeDisplay(i, currentTime, currentTrackTimes[i].duration);
        });

        ws.on('finish', () => {
            const duration = currentTrackTimes[i].duration;
            updateTimeDisplay(i, duration, duration);
            playBtn.textContent = 'Play';
            updateButtons();
        });

        ws.on('play', () => {
            playBtn.textContent = 'Pause';
            updateButtons();
        });

        ws.on('pause', () => {
            playBtn.textContent = 'Play';
            updateButtons();
        });

        // Play button click handler
        playBtn.onclick = () => {
            ws.playPause();
            playBtn.textContent = ws.isPlaying() ? 'Pause' : 'Play';
        };
    });
}

// Upload form submission
uploadForm.addEventListener('submit', async function (e) {
    e.preventDefault();

    if (!fileInput.files.length) return;

    submitBtn.disabled = true;
    audioContainer.innerHTML = '';
    globalControls.classList.remove('visible');
    instances = [];
    currentTrackTimes = [];
    trackFiles = [];
    contentBox.className = 'content-box info';
    contentBox.textContent = 'Uploading file, please wait...';

    const fd = new FormData();
    fd.append('file', fileInput.files[0]);
    fd.append('model', 'default');

    try {
        const res = await fetch(`${API_BASE_URL}/upload/`, { method: 'POST', body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(`Upload Error ${res.status}`);
        pollStatus(data.job_id);
    } catch (err) {
        contentBox.className = 'content-box error';
        contentBox.textContent = `Error: ${err.message}`;
        submitBtn.disabled = false;
    }
});

console.log('Stemplayer initialized successfully');