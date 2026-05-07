# Cipher Windows Installer
# SPDX-License-Identifier: AGPL-3.0-only

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Fail($Message) {
    Write-Host "Error: $Message" -ForegroundColor Red
    Write-Host "Installation did not complete."
    Read-Host "Press Enter to close"
    return $false
}

Write-Host "Cipher - Encrypted. Private. Yours." -ForegroundColor Cyan
Write-Host ""

$Repo = "braxius-hq/cipher"
$InstallDir = Join-Path $env:LOCALAPPDATA "Programs\cipher"
$Target = Join-Path $InstallDir "cipher.exe"
$TempFile = $null

try {
    $arch = $env:PROCESSOR_ARCHITECTURE
    if ($env:PROCESSOR_ARCHITEW6432) {
        $arch = $env:PROCESSOR_ARCHITEW6432
    }

    if ($arch -and $arch -ne "AMD64") {
        return Fail "Unsupported architecture $arch. Only Windows x64 is currently supported."
    }

    Write-Host "Fetching latest release..."
    $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest" -UseBasicParsing

    $asset = $release.assets | Where-Object { $_.name -match "^cipher-.*-windows-amd64\.exe$" } | Select-Object -First 1
    if (-not $asset) {
        return Fail "No Windows x64 binary found in release $($release.tag_name)."
    }

    $version = $release.tag_name -replace '^v', ''
    $TempFile = Join-Path $env:TEMP "cipher-$version.exe"

    Write-Host "Downloading Cipher v$version..."
    Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $TempFile -UseBasicParsing

    $file = [System.IO.File]::OpenRead($TempFile)
    try {
        $header = New-Object byte[] 2
        $read = $file.Read($header, 0, 2)
    } finally {
        $file.Dispose()
    }

    if ($read -ne 2 -or $header[0] -ne 0x4D -or $header[1] -ne 0x5A) {
        Remove-Item $TempFile -Force -ErrorAction SilentlyContinue
        return Fail "Downloaded file is not a valid Windows executable. Try again later."
    }

    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    Move-Item -Path $TempFile -Destination $Target -Force
    $TempFile = $null

    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if ([string]::IsNullOrWhiteSpace($userPath)) {
        $userPath = ""
    }

    $pathItems = $userPath -split ";" | Where-Object { $_ }
    $isOnPath = $pathItems | Where-Object { $_.TrimEnd("\") -ieq $InstallDir.TrimEnd("\") }

    if (-not $isOnPath) {
        $newPath = if ($userPath) { "$userPath;$InstallDir" } else { $InstallDir }
        [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
        $env:Path = "$env:Path;$InstallDir"
        Write-Host "Added $InstallDir to your user PATH." -ForegroundColor Yellow
        Write-Host "Open a new terminal before running cipher." -ForegroundColor Yellow
    }

    Write-Host ""
    Write-Host "Cipher v$version installed to $Target" -ForegroundColor Green
    Write-Host "Run 'cipher' in a new terminal to get started."
    Read-Host "Press Enter to close"
} catch {
    if ($TempFile -and (Test-Path $TempFile)) {
        Remove-Item $TempFile -Force -ErrorAction SilentlyContinue
    }
    Fail $_.Exception.Message | Out-Null
}
