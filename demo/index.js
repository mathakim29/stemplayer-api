import WaveSurfer from 'https://cdn.jsdelivr.net/npm/wavesurfer.js@7/dist/wavesurfer.esm.js'
import HoverPlugin from 'https://cdn.jsdelivr.net/npm/wavesurfer.js@7/dist/plugins/hover.esm.js'

const API_BASE_URL = 'http://127.0.0.1:8000';
let instances = [];
let currentTrackTimes = [];
let trackFiles = [];
let availableModels = [];
let currentModelName = 'unknown';

const el = id => document.getElementById(id);
const playAll = el('play-all-btn');
const pauseAll = el('pause-all-btn');
const stopAll = el('stop-all-btn');
const downloadAllBtn = el('download-all-btn');
const uploadForm = el('upload-form');
const fileInput = el('file');
const submitBtn = el('submit-btn');
const contentBox = el('content-box');
const audioContainer = el('audio-container');
const globalControls = el('global-controls');
const modelInput = el('model-input');
const modelList = el('model-list');
const refreshBtn = el('refresh-models-btn');

// Sanity check required DOM nodes exist before wiring listeners
const requiredEls = { playAll, pauseAll, stopAll, downloadAllBtn, uploadForm, fileInput, submitBtn, contentBox, audioContainer, globalControls, modelInput, modelList, refreshBtn };
for (const [name, node] of Object.entries(requiredEls)) {
    if (!node) console.error(`stemplayer: missing required element "${name}"`);
}

function setStatus(type, text) {
    if (!contentBox) return;
    contentBox.className = `content-box ${type}`;
    contentBox.textContent = text;
}

function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '00:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function updateTimeDisplay(index, current, duration) {
    const timeElement = currentTrackTimes[index]?.element;
    if (timeElement) timeElement.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
}

function updateButtons() {
    const playing = instances.some(w => {
        try { return w.isPlaying(); } catch { return false; }
    });
    const loaded = instances.length > 0;
    if (playAll) { playAll.disabled = !loaded; playAll.textContent = playing ? 'Playing...' : 'Play All'; }
    if (pauseAll) pauseAll.disabled = !loaded || !playing;
    if (stopAll) stopAll.disabled = !loaded;
    if (downloadAllBtn) downloadAllBtn.disabled = !loaded;
}

// --- Models ---
async function fetchModels() {
    if (!refreshBtn) return;
    try {
        refreshBtn.disabled = true;
        refreshBtn.classList.add('spinning');

        const response = await fetch(`${API_BASE_URL}/list_models`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        availableModels = Array.isArray(data.models) ? data.models : [];

        modelList.innerHTML = '';
        if (availableModels.length > 0) {
            availableModels.forEach(model => modelList.appendChild(new Option(model)));
            if (!modelInput.value || modelInput.value === 'default') {
                modelInput.value = data.default || availableModels[0] || 'htdemucs.yaml';
            }
        }
        setStatus('info', `✓ Loaded ${availableModels.length} models. Type any model name or select from suggestions.`);
    } catch (error) {
        console.error('Error fetching models:', error);
        setStatus('error', '⚠ Failed to fetch models. You can still type any model name manually.');

        const fallbackModels = ['htdemucs', 'htdemucs_ft', 'htdemucs_6s', 'htdemucs_6s_ft', 'htdemucs_extra'];
        modelList.innerHTML = '';
        fallbackModels.forEach(model => modelList.appendChild(new Option(model)));
        if (!modelInput.value) modelInput.value = 'htdemucs.yaml';
    } finally {
        refreshBtn.disabled = false;
        refreshBtn.classList.remove('spinning');
    }
}
refreshBtn?.addEventListener('click', fetchModels);

// --- Global controls ---
playAll?.addEventListener('click', () => instances.forEach(w => w.play()));
pauseAll?.addEventListener('click', () => instances.forEach(w => w.pause()));
stopAll?.addEventListener('click', () => instances.forEach(w => { w.stop(); w.seekTo(0); }));

// --- Volume slider ---
function volumeColor(volume) {
    const redIntensity = 1 - volume;
    const red = Math.round(255 * redIntensity);
    const green = Math.round(255 * (1 - redIntensity * 0.7));
    const blue = Math.round(255 * (1 - redIntensity * 0.9));
    return `rgb(${red}, ${green}, ${blue})`;
}

function volumeIconFor(volume) {
    if (volume === 0) return '🔇';
    if (volume < 0.3) return '🔈';
    if (volume < 0.7) return '🔉';
    return '🔊';
}

function createVolumeSlider(ws, index) {
    const volumeContainer = document.createElement('div');
    volumeContainer.className = 'volume-container';

    const volumeIcon = document.createElement('span');
    volumeIcon.className = 'volume-icon';
    volumeIcon.textContent = '🔊';

    const volumeSlider = document.createElement('input');
    Object.assign(volumeSlider, { type: 'range', min: 0, max: 1, step: 0.01, value: 1, className: 'volume-slider' });

    const waveContainer = el(`wave-${index}`);

    volumeSlider.addEventListener('input', function () {
        const volume = parseFloat(this.value);
        try { ws.setVolume(volume); } catch (err) { console.error('setVolume failed:', err); }

        volumeIcon.textContent = volumeIconFor(volume);

        if (waveContainer) {
            const canvas = waveContainer.querySelector('canvas');
            if (canvas) {
                if (volume < 0.99) {
                    canvas.style.filter = `drop-shadow(0 0 0 ${volumeColor(volume)})`;
                    canvas.style.opacity = 0.3 + volume * 0.7;
                } else {
                    canvas.style.filter = 'none';
                    canvas.style.opacity = 1;
                }
            }
            waveContainer.style.background = `rgba(255, 0, 0, ${(1 - volume) * 0.15})`;
        }
    });

    volumeContainer.append(volumeIcon, volumeSlider);
    if (currentTrackTimes[index]) currentTrackTimes[index].volumeSlider = volumeSlider;
    return volumeContainer;
}

// --- Download all as ZIP ---
async function downloadAllAsZip() {
    if (!downloadAllBtn) return;
    try {
        downloadAllBtn.disabled = true;
        downloadAllBtn.textContent = 'Creating ZIP...';

        if (trackFiles.length === 0) {
            alert('No tracks to download');
            return;
        }

        const formData = new FormData();
        trackFiles.forEach(({ path, name }) => {
            formData.append('files[]', path);
            formData.append('names[]', name);
        });

        const response = await fetch('wrap.php', { method: 'POST', body: formData });
        if (!response.ok) throw new Error(`Server error: ${response.status}`);

        const blob = await response.blob();
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'stems.zip';
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    } catch (error) {
        console.error('Download error:', error);
        alert('Error downloading files: ' + error.message);
    } finally {
        downloadAllBtn.disabled = false;
        downloadAllBtn.textContent = 'Download All (ZIP)';
    }
}
downloadAllBtn?.addEventListener('click', downloadAllAsZip);

// --- Poll job status ---
async function pollStatus(jobId) {
    const interval = setInterval(async () => {
        try {
            setStatus('info', `Processing... Job: ${jobId}`);

            const res = await fetch(`${API_BASE_URL}/status/${jobId}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();

            if (data.status === 'finished') {
                clearInterval(interval);
                const elapsed = data.result?.elapsed_time;
                const timeStr = (elapsed !== undefined && elapsed !== null) ? elapsed.toFixed(2) : '?';
                const modelUsed = data.result?.model_used || currentModelName || 'unknown';

                setStatus('success', `✓ Complete in ${timeStr}s (Model: ${modelUsed})`);
                submitBtn.disabled = false;

                if (Array.isArray(data.result?.files)) {
                    renderTracks(data.result.files);
                } else {
                    console.error('pollStatus: missing result.files', data);
                    setStatus('error', '✗ Completed but no output files were returned.');
                }
            } else if (data.status === 'failed') {
                clearInterval(interval);
                setStatus('error', `✗ Processing failed: ${data.result?.error || 'Unknown error'}`);
                submitBtn.disabled = false;
            }
        } catch (err) {
            clearInterval(interval);
            console.error('pollStatus error:', err);
            setStatus('error', `✗ Polling error: ${err.message}`);
            submitBtn.disabled = false;
        }
    }, 3000);
}

// --- Render tracks ---
function renderTracks(filePaths) {
    instances = [];
    currentTrackTimes = [];
    trackFiles = [];
    globalControls.classList.add('visible');
    audioContainer.innerHTML = '';

    filePaths.forEach((path, i) => {
        const name = path.match(/\(([^)]+)\)/)?.[1] || `Track ${i + 1}`;
        const url = `${API_BASE_URL}${path}`;
        const fileName = `${name.toLowerCase().replace(/\s+/g, '_')}.wav`;
        trackFiles.push({ path, name: fileName });

        const card = document.createElement('div');
        card.className = 'track-card';

        const header = document.createElement('div');
        header.className = 'track-header';

        const title = document.createElement('div');
        title.className = 'track-title';
        title.textContent = `Stem: ${name}`;

        const timeDisplay = document.createElement('div');
        timeDisplay.id = `time-${i}`;
        timeDisplay.className = 'track-time';
        timeDisplay.textContent = '00:00 / 00:00';

        header.append(title, timeDisplay);

        const waveId = `wave-${i}`;
        const waveContainer = document.createElement('div');
        waveContainer.id = waveId;
        waveContainer.className = 'wave-container';

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
            a.download = fileName;
            a.click();
        };

        controls.append(playBtn, downloadBtn);
        card.append(header, waveContainer, controls);
        audioContainer.appendChild(card);

        currentTrackTimes.push({ element: timeDisplay, duration: 0 });

        let ws;
        try {
            ws = WaveSurfer.create({
                container: `#${waveId}`,
                waveColor: '#4a4a4a',
                progressColor: '#888',
                cursorColor: '#fff',
                barWidth: 2,
                barRadius: 3,
                responsive: true,
                height: 80,
                url: url,
                plugins: [
                    HoverPlugin.create({
                        lineColor: '#fff',
                        lineWidth: 2,
                        labelBackground: '#333',
                        labelColor: '#fff',
                        labelSize: '11px',
                        labelFont: 'monospace',
                        formatTimeCallback: formatTime
                    })
                ]
            });
        } catch (err) {
            console.error(`WaveSurfer init failed for track ${i} (${name}):`, err);
            waveContainer.textContent = 'Failed to load waveform';
            playBtn.disabled = true;
            return; // skip listeners/instance push for this broken track
        }

        controls.appendChild(createVolumeSlider(ws, i));
        instances.push(ws);

        ws.on('ready', () => {
            const duration = ws.getDuration();
            currentTrackTimes[i].duration = duration;
            updateTimeDisplay(i, 0, duration);
            updateButtons();
        });

        // Shared handler: audioprocess gives raw seconds, seek/interaction give 0-1 progress
        const onProgress = progress => updateTimeDisplay(i, progress * currentTrackTimes[i].duration, currentTrackTimes[i].duration);
        ws.on('audioprocess', currentTime => updateTimeDisplay(i, currentTime, currentTrackTimes[i].duration));
        ws.on('seek', onProgress);
        ws.on('interaction', onProgress);

        ws.on('finish', () => {
            updateTimeDisplay(i, currentTrackTimes[i].duration, currentTrackTimes[i].duration);
            playBtn.textContent = 'Play';
            updateButtons();
        });

        ws.on('play', () => { playBtn.textContent = 'Pause'; updateButtons(); });
        ws.on('pause', () => { playBtn.textContent = 'Play'; updateButtons(); });
        ws.on('error', err => console.error(`WaveSurfer error on track ${i} (${name}):`, err));

        playBtn.onclick = () => {
            try {
                ws.playPause();
                playBtn.textContent = ws.isPlaying() ? 'Pause' : 'Play';
            } catch (err) {
                console.error('playPause failed:', err);
            }
        };
    });
}

// --- Upload form ---
uploadForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!fileInput.files.length) {
        setStatus('error', '✗ Please choose a file first.');
        return;
    }

    const modelValue = modelInput.value.trim() || 'htdemucs.yaml';
    currentModelName = modelValue;

    submitBtn.disabled = true;
    audioContainer.innerHTML = '';
    globalControls.classList.remove('visible');
    instances = [];
    currentTrackTimes = [];
    trackFiles = [];
    setStatus('info', 'Uploading file, please wait...');

    const fd = new FormData();
    fd.append('file', fileInput.files[0]);
    fd.append('vc_model', modelValue);

    try {
        const res = await fetch(`${API_BASE_URL}/upload/`, { method: 'POST', body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.detail || `Upload Error ${res.status}`);
        if (!data.job_id) throw new Error('No job_id returned by server');

        setStatus('info', `✓ Job queued: ${data.job_id} (Model: ${modelValue})`);
        pollStatus(data.job_id);
    } catch (err) {
        console.error('Upload error:', err);
        setStatus('error', `✗ Error: ${err.message}`);
        submitBtn.disabled = false;
    }
});

console.log('Stemplayer initialized successfully');
console.log('Available models:', availableModels);
console.log('Type any model name or select from suggestions');