const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const targetDir = __dirname;
const zipPaths = [
  path.join(targetDir, "favicon_io.zip"),
  path.join(process.env.USERPROFILE || "C:\\Users\\KiTE", "Downloads", "favicon_io.zip")
];

let found = false;
for (const zipPath of zipPaths) {
  if (fs.existsSync(zipPath)) {
    console.log(`Found favicon zip archive at: ${zipPath}`);
    try {
      const psPath = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
      execSync(`"${psPath}" -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${targetDir}' -Force"`);
      console.log(`Successfully extracted files to: ${targetDir}`);
      found = true;
      break;
    } catch (err) {
      console.error(`Failed to extract via PowerShell: ${err.message}`);
    }
  }
}

if (!found) {
  console.log("No favicon_io.zip found in project folder or Downloads.");
}
