import WaveSurfer from 'https://cdn.jsdelivr.net/npm/wavesurfer.js@7/dist/wavesurfer.esm.js'
import HoverPlugin from 'https://cdn.jsdelivr.net/npm/wavesurfer.js@7/dist/plugins/hover.esm.js'

const API_BASE_URL = 'http://localhost:8000';
let instances = [];
let currentTrackTimes = [];
let trackFiles = [];
let availableModels = [];

// jQuery shortcuts
const $ = jQuery;
const $contentBox = $('#content-box');
const $audioContainer = $('#audio-container');
const $globalControls = $('#global-controls');
const $modelInput = $('#model-input');
const $modelList = $('#model-list');
const $submitBtn = $('#submit-btn');

function setStatus(type, text) {
    $contentBox.attr('class', `content-box ${type}`).text(text);
}

function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '00:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function updateTimeDisplay(index, current, duration) {
    const $timeEl = currentTrackTimes[index]?.$element;
    if ($timeEl) $timeEl.text(`${formatTime(current)} / ${formatTime(duration)}`);
}

function updateButtons() {
    const playing = instances.some(w => w.isPlaying?.());
    const loaded = instances.length > 0;
    $('#play-all-btn').prop('disabled', !loaded).text(playing ? 'Playing...' : 'Play All');
    $('#pause-all-btn').prop('disabled', !loaded || !playing);
    $('#stop-all-btn').prop('disabled', !loaded);
    $('#download-all-btn').prop('disabled', !loaded);
}

// --- Models ---
function fetchModels() {
    const $btn = $('#refresh-models-btn');
    $btn.prop('disabled', true).addClass('spinning');
    
    $.get(`${API_BASE_URL}/list_models`)
        .done(data => {
            availableModels = data.models || [];
            $modelList.empty();
            if (availableModels.length) {
                availableModels.forEach(model => $modelList.append(`<option>${model}</option>`));
                if (!$modelInput.val() || $modelInput.val() === 'default') {
                    $modelInput.val(data.default || availableModels[0] || 'htdemucs.yaml');
                }
            }
            setStatus('info', `✓ Loaded ${availableModels.length} models.`);
        })
        .fail(() => {
            setStatus('error', '⚠ Failed to fetch models. Using fallback list.');
            ['htdemucs', 'htdemucs_ft', 'htdemucs_6s'].forEach(m => $modelList.append(`<option>${m}</option>`));
            if (!$modelInput.val()) $modelInput.val('htdemucs.yaml');
        })
        .always(() => $btn.prop('disabled', false).removeClass('spinning'));
}

$('#refresh-models-btn').on('click', fetchModels);

// --- Global controls ---
$('#play-all-btn').on('click', () => instances.forEach(w => w.play()));
$('#pause-all-btn').on('click', () => instances.forEach(w => w.pause()));
$('#stop-all-btn').on('click', () => instances.forEach(w => { w.stop(); w.seekTo(0); }));

// --- Volume slider ---
function createVolumeSlider(ws, index) {
    const $container = $('<div>').addClass('volume-container');
    const $icon = $('<span>').addClass('volume-icon').text('🔊');
    const $slider = $('<input>').attr({ type: 'range', min: 0, max: 1, step: 0.01, value: 1 }).addClass('volume-slider');
    const $waveContainer = $(`#wave-${index}`);

    $slider.on('input', function() {
        const volume = parseFloat(this.value);
        ws.setVolume(volume);
        $icon.text(volume === 0 ? '🔇' : volume < 0.3 ? '🔈' : volume < 0.7 ? '🔉' : '🔊');
        
        const canvas = $waveContainer.find('canvas');
        if (canvas.length) {
            canvas.css({
                filter: volume < 0.99 ? `drop-shadow(0 0 0 rgb(${Math.round(255*(1-volume))}, ${Math.round(255*(1-(1-volume)*0.7))}, ${Math.round(255*(1-(1-volume)*0.9))}))` : 'none',
                opacity: 0.3 + volume * 0.7
            });
        }
        $waveContainer.css('background', `rgba(255, 0, 0, ${(1 - volume) * 0.15})`);
    });

    $container.append($icon, $slider);
    if (currentTrackTimes[index]) currentTrackTimes[index].volumeSlider = $slider[0];
    return $container;
}

// --- Download all as ZIP ---
$('#download-all-btn').on('click', function() {
    const $btn = $(this);
    $btn.prop('disabled', true).text('Creating ZIP...');
    
    if (!trackFiles.length) {
        alert('No tracks to download');
        return $btn.prop('disabled', false).text('Download All (ZIP)');
    }

    const formData = new FormData();
    trackFiles.forEach(({ path, name }) => {
        formData.append('files[]', path);
        formData.append('names[]', name);
    });

    $.ajax({
        url: 'wrap.php',
        method: 'POST',
        data: formData,
        processData: false,
        contentType: false,
        xhrFields: { responseType: 'blob' }
    }).done(blob => {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'stems.zip';
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    }).fail(err => {
        console.error('Download error:', err);
        alert('Error downloading files');
    }).always(() => {
        $btn.prop('disabled', false).text('Download All (ZIP)');
    });
});

// --- Poll job status ---
function pollStatus(jobId) {
    const interval = setInterval(() => {
        $.get(`${API_BASE_URL}/status/${jobId}`)
            .done(data => {
                if (data.result?.status === 'success') {
                    clearInterval(interval);
                    const elapsed = data.result?.elapsed_time?.toFixed(2) || '?';
                    setStatus('success', `✓ Complete in ${elapsed}s (Model: ${data.result?.model_used || 'unknown'})`);
                    $submitBtn.prop('disabled', false);
                    if (data.result?.files) renderTracks(data.result.files);
                } else if (data.result?.status === 'error') {
                    clearInterval(interval);
                    setStatus('error', `✗ Failed: ${data.result?.message || 'Unknown error'}`);
                    $submitBtn.prop('disabled', false);
                }
            })
            .fail(err => {
                clearInterval(interval);
                console.error('Poll error:', err);
                setStatus('error', `✗ Polling error: ${err.responseText || err.statusText}`);
                $submitBtn.prop('disabled', false);
            });
    }, 3000);
}

// --- Render tracks ---
function renderTracks(filePaths) {
    instances = [];
    currentTrackTimes = [];
    trackFiles = [];
    $globalControls.addClass('visible');
    $audioContainer.empty();

    filePaths.forEach((path, i) => {
        const name = path.match(/\(([^)]+)\)/)?.[1] || `Track ${i + 1}`;
        const url = `${API_BASE_URL}${path}`;
        const fileName = `${name.toLowerCase().replace(/\s+/g, '_')}.wav`;
        trackFiles.push({ path, name: fileName });

        const $card = $('<div>').addClass('track-card');
        const $header = $('<div>').addClass('track-header');
        const $title = $('<div>').addClass('track-title').text(`Stem: ${name}`);
        const $time = $('<div>').addClass('track-time').attr('id', `time-${i}`).text('00:00 / 00:00');
        $header.append($title, $time);

        const $waveContainer = $('<div>').addClass('wave-container').attr('id', `wave-${i}`);
        const $controls = $('<div>').addClass('track-controls');
        
        const $playBtn = $('<button>').addClass('btn-track btn-track-play').text('Play');
        const $downloadBtn = $('<button>').addClass('btn-track btn-track-download').text('Download');
        $downloadBtn.on('click', () => {
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            a.click();
        });

        $controls.append($playBtn, $downloadBtn);
        $card.append($header, $waveContainer, $controls);
        $audioContainer.append($card);

        currentTrackTimes.push({ $element: $time, duration: 0 });

        let ws;
        try {
            ws = WaveSurfer.create({
                container: `#wave-${i}`,
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
            console.error(`WaveSurfer init failed:`, err);
            $waveContainer.text('Failed to load waveform');
            $playBtn.prop('disabled', true);
            return;
        }

        $controls.append(createVolumeSlider(ws, i));
        instances.push(ws);

        ws.on('ready', () => {
            currentTrackTimes[i].duration = ws.getDuration();
            updateTimeDisplay(i, 0, ws.getDuration());
            updateButtons();
        });

        ws.on('audioprocess', currentTime => updateTimeDisplay(i, currentTime, currentTrackTimes[i].duration));
        ws.on('seek', progress => updateTimeDisplay(i, progress * currentTrackTimes[i].duration, currentTrackTimes[i].duration));
        ws.on('interaction', progress => updateTimeDisplay(i, progress * currentTrackTimes[i].duration, currentTrackTimes[i].duration));
        ws.on('finish', () => {
            updateTimeDisplay(i, currentTrackTimes[i].duration, currentTrackTimes[i].duration);
            $playBtn.text('Play');
            updateButtons();
        });
        ws.on('play', () => { $playBtn.text('Pause'); updateButtons(); });
        ws.on('pause', () => { $playBtn.text('Play'); updateButtons(); });

        $playBtn.on('click', () => {
            ws.playPause();
            $playBtn.text(ws.isPlaying() ? 'Pause' : 'Play');
        });
    });
}

// --- Upload form ---
$('#upload-form').on('submit', function(e) {
    e.preventDefault();
    const fileInput = $('#file')[0];
    if (!fileInput.files.length) {
        setStatus('error', '✗ Please choose a file first.');
        return;
    }

    const modelValue = $modelInput.val().trim() || 'htdemucs.yaml';
    $submitBtn.prop('disabled', true);
    $audioContainer.empty();
    $globalControls.removeClass('visible');
    instances = [];
    currentTrackTimes = [];
    trackFiles = [];
    setStatus('info', 'Uploading file, please wait...');

    const fd = new FormData();
    fd.append('file', fileInput.files[0]);
    fd.append('vc_model', modelValue);

    $.ajax({
        url: `${API_BASE_URL}/upload/`,
        method: 'POST',
        data: fd,
        processData: false,
        contentType: false
    }).done(data => {
        if (!data.job_id) throw new Error('No job_id returned');
        setStatus('info', `✓ Job queued: ${data.job_id} (Model: ${modelValue})`);
        pollStatus(data.job_id);
    }).fail(err => {
        console.error('Upload error:', err);
        setStatus('error', `✗ Error: ${err.responseJSON?.detail || err.statusText || 'Unknown error'}`);
        $submitBtn.prop('disabled', false);
    });
});

// --- Init ---
fetchModels();
console.log('Stemplayer initialized with jQuery');