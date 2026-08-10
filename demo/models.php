<?php
// Open the target text file in write mode
$output_file = fopen("/etc/models.txt", "w");

if ($output_file) {
    // Run the audio-separator list command and pipe stdout straight into the file
    $process = proc_open(
        ["audio-separator", "-l"],
        [["pipe", "r"], $output_file, ["pipe", "w"]],
        $pipes
    );
    
    if (is_resource($process)) {
        proc_close($process);
    }
    
    fclose($output_file);
    
    // Echo the model list
    echo file_get_contents("/etc/models.txt");
}

echo "\nModel list written to /app/models.txt successfully!";
?>

