<?php
header('Content-Type: application/zip');
header('Content-Disposition: attachment; filename="stems.zip"');
header('Content-Length: ' . filesize($zipFile));

// Check if files were sent
if (!isset($_POST['files']) || empty($_POST['files'])) {
    http_response_code(400);
    echo json_encode(['error' => 'No files specified']);
    exit;
}

$files = $_POST['files'];
$names = isset($_POST['names']) ? $_POST['names'] : [];

// Create a temporary zip file
$zip = new ZipArchive();
$tempFile = tempnam(sys_get_temp_dir(), 'stems_') . '.zip';

if ($zip->open($tempFile, ZipArchive::CREATE) !== TRUE) {
    http_response_code(500);
    echo json_encode(['error' => 'Could not create zip file']);
    exit;
}

// Add each file to the zip
foreach ($files as $index => $filePath) {
    // Get the base path where your audio files are stored
    // Adjust this based on your server configuration
    $basePath = '/path/to/your/audio/files/'; // CHANGE THIS
    $fullPath = $basePath . ltrim($filePath, '/');
    
    if (file_exists($fullPath)) {
        $fileName = isset($names[$index]) ? $names[$index] : basename($filePath);
        $zip->addFile($fullPath, $fileName);
    } else {
        // Try relative path from current directory
        $relativePath = __DIR__ . '/' . ltrim($filePath, '/');
        if (file_exists($relativePath)) {
            $fileName = isset($names[$index]) ? $names[$index] : basename($filePath);
            $zip->addFile($relativePath, $fileName);
        } else {
            // Log error but continue
            error_log("File not found: " . $filePath);
        }
    }
}

$zip->close();

// Output the zip file
readfile($tempFile);

// Clean up
unlink($tempFile);
?>