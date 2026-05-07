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

if (-not $env:WT_SESSION) {
    Write-Host "Tip: For the best experience, use Windows Terminal." -ForegroundColor Yellow
    Write-Host "It has better font rendering, colors, and resizing support than legacy PowerShell." -ForegroundColor Yellow
    Write-Host ""
}

$Repo = "braxius-hq/cipher"
$InstallDir = Join-Path $env:LOCALAPPDATA "Programs\cipher"
$Target = Join-Path $InstallDir "cipher-cli.exe"
$CmdShim = Join-Path $InstallDir "cipher.cmd"
$TempFile = $null

function Remove-OldPowerShellShim {
    $profiles = @(
        Join-Path $HOME "Documents\WindowsPowerShell\Microsoft.PowerShell_profile.ps1"
        Join-Path $HOME "Documents\PowerShell\Microsoft.PowerShell_profile.ps1"
    )

    foreach ($profilePath in $profiles) {
        if (-not (Test-Path $profilePath)) {
            continue
        }

        try {
            $lines = Get-Content $profilePath
            $next = New-Object System.Collections.Generic.List[string]
            $skipping = $false
            $changed = $false

            foreach ($line in $lines) {
                if ($line.Trim() -eq "# Cipher CLI shim") {
                    $skipping = $true
                    $changed = $true
                    continue
                }

                if ($skipping) {
                    if ($line.Trim() -eq "}") {
                        $skipping = $false
                    }
                    continue
                }

                $next.Add($line)
            }

            if ($changed) {
                Set-Content -Path $profilePath -Value $next.ToArray() -Encoding UTF8
                Write-Host "Removed old PowerShell profile shim from $profilePath" -ForegroundColor Yellow
            }
        } catch {
            Write-Host "Could not clean old PowerShell profile shim at $profilePath" -ForegroundColor Yellow
            Write-Host "Delete this file manually or allow scripts with: Set-ExecutionPolicy RemoteSigned -Scope CurrentUser" -ForegroundColor Yellow
        }
    }
}

try {
    $arch = $env:PROCESSOR_ARCHITECTURE
    if ($env:PROCESSOR_ARCHITEW6432) {
        $arch = $env:PROCESSOR_ARCHITEW6432
    }

    if ($arch -and $arch -ne "AMD64") {
        return Fail "Unsupported architecture $arch. Only Windows x64 is currently supported."
    }

    Remove-OldPowerShellShim

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
    Remove-Item (Join-Path $InstallDir "cipher.exe") -Force -ErrorAction SilentlyContinue
    Move-Item -Path $TempFile -Destination $Target -Force
    Set-Content -Path $CmdShim -Value "@echo off`r`n`"%~dp0cipher-cli.exe`" %*`r`n" -Encoding ASCII
    $TempFile = $null

    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if ([string]::IsNullOrWhiteSpace($userPath)) {
        $userPath = ""
    }

    $pathItems = $userPath -split ";" | Where-Object { $_ }
    $normalizedInstallDir = $InstallDir.TrimEnd([char]92)
    $isOnPath = $pathItems | Where-Object { $_.TrimEnd([char]92) -ieq $normalizedInstallDir }

    if (-not $isOnPath) {
        $newPath = if ($userPath) { "$InstallDir;$userPath" } else { $InstallDir }
        [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
        $env:Path = "$env:Path;$InstallDir"
        Write-Host "Added $InstallDir to your user PATH." -ForegroundColor Yellow
        Write-Host "Open a new terminal before running cipher." -ForegroundColor Yellow
    } elseif ($pathItems[0].TrimEnd([char]92) -ine $normalizedInstallDir) {
        $remainingPath = $pathItems | Where-Object { $_.TrimEnd([char]92) -ine $normalizedInstallDir }
        $newPath = "$InstallDir;$($remainingPath -join ';')"
        [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
        $env:Path = "$InstallDir;$env:Path"
        Write-Host "Moved $InstallDir to the front of your user PATH." -ForegroundColor Yellow
        Write-Host "Open a new terminal before running cipher." -ForegroundColor Yellow
    }

    Set-Alias -Name cipher -Value $Target -Scope Global -Force

    Write-Host ""
    Write-Host "Cipher v$version installed to $Target" -ForegroundColor Green
    Write-Host "Run 'cipher' or 'cipher-cli' in a new terminal to get started."
    Read-Host "Press Enter to close"
} catch {
    if ($TempFile -and (Test-Path $TempFile)) {
        Remove-Item $TempFile -Force -ErrorAction SilentlyContinue
    }
    Fail $_.Exception.Message | Out-Null
}
