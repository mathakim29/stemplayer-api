<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Stemplayer API</title>
    <link rel="stylesheet" href="index.css">
    <script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>
</head>
<body>
    <div class="container">
        <h2 class="title">
            <img src="https://watermelon.crd.co/assets/images/gallery05/1aee39ec.gif?v=14238bdb" alt="Stemplayer Logo">
            Stemplayer API
        </h2>

        <form id="upload-form" class="upload-form">
            <input type="file" id="file" name="file" required class="file-input">
            <div class="model-input-group">
                <input type="text" id="model-input" class="model-input" placeholder="htdemucs" value="htdemucs">
                <datalist id="model-list"></datalist>
            </div>
            <button type="submit" id="submit-btn" class="btn-primary">Upload</button>
        </form>

        <div id="content-box" class="content-box info">
            Select a file and click upload.
        </div>
    </div>

    <div id="global-controls" class="global-controls">
        <button id="play-all-btn" class="btn-control btn-play-all" disabled>Play All</button>
        <button id="pause-all-btn" class="btn-control btn-pause-all" disabled>Pause All</button>
        <button id="stop-all-btn" class="btn-control btn-stop-all" disabled>Stop All</button>
        <button id="download-all-btn" class="btn-control btn-download-all" disabled>Download All (ZIP)</button>
    </div>

    <div id="audio-container" class="audio-container"></div>
    <script type="module" src="index.js"></script>
</body>
</html>