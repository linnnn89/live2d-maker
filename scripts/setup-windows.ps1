[CmdletBinding()]
param(
    [switch]$WithSeeThrough,
    [switch]$WithModels,
    [switch]$SkipPortable,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$SeeThrough = Join-Path $Root 'see-through'
$ToolsPython = Join-Path $Root 'python'
$Portable = Join-Path $Root 'portable\PSD2Live'
$Psd2LiveZip = 'https://github.com/tsunehimatoi/psd2live/releases/download/v0.7.1/PSD2Live-0.7.1-portable.zip'
$SeeThroughCommit = '7f139bb25c46a0c8ac720d95ddab185fcda5451c'

function Step([string]$Message) {
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Run([scriptblock]$Action, [string]$Preview) {
    if ($DryRun) {
        Write-Host "[dry-run] $Preview" -ForegroundColor DarkGray
        return
    }
    & $Action
    if ($LASTEXITCODE -ne 0 -and $null -ne $LASTEXITCODE) {
        throw "Command failed with exit code $LASTEXITCODE`: $Preview"
    }
}

function Require-Command([string]$Name, [string]$Hint) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        if ($DryRun) {
            Write-Warning "$Name is not installed. $Hint"
            return
        }
        throw "$Name is required. $Hint"
    }
}

Step 'Checking repository layout'
foreach ($Required in @('psd2live\build.gradle.kts', 'see-through\requirements.txt', 'requirements-tools.txt')) {
    if (-not (Test-Path (Join-Path $Root $Required))) {
        throw "Missing $Required. Use a complete git clone."
    }
}

Step 'Checking system tools'
Require-Command 'git' 'Install Git for Windows.'
Require-Command 'py' 'Install Python 3.10 from python.org with the py launcher.'
if (-not $DryRun) {
    & py -3.10 -c 'import sys; assert sys.version_info[:2] == (3, 10), sys.version'
    if ($LASTEXITCODE -ne 0) { throw 'Python 3.10 is required.' }
}
if (-not (Get-Command java -ErrorAction SilentlyContinue)) {
    Write-Warning 'Java was not found. Portable PSD2Live does not need system Java; source builds require JDK 21.'
}

Step 'Creating the Python 3.10 tools environment'
Run { & py -3.10 -m venv $ToolsPython } "py -3.10 -m venv $ToolsPython"
Run { & (Join-Path $ToolsPython 'Scripts\python.exe') -m pip install --upgrade pip } 'Upgrade pip in the tools environment'
Run { & (Join-Path $ToolsPython 'Scripts\python.exe') -m pip install -r (Join-Path $Root 'requirements-tools.txt') } 'Install requirements-tools.txt'

if (-not $SkipPortable) {
    Step 'Installing PSD2Live v0.7.1 portable'
    if (Test-Path (Join-Path $Portable 'PSD2Live.exe')) {
        Write-Host 'portable/PSD2Live already exists; skipping.' -ForegroundColor Green
    } else {
        $Cache = Join-Path $env:TEMP 'PSD2Live-0.7.1-portable.zip'
        Run { Invoke-WebRequest -Uri $Psd2LiveZip -OutFile $Cache } "Download $Psd2LiveZip"
        Run {
            $Parent = Split-Path -Parent $Portable
            New-Item -ItemType Directory -Force -Path $Parent | Out-Null
            $Extract = Join-Path $env:TEMP 'PSD2Live-0.7.1-extract'
            Remove-Item $Extract -Recurse -Force -ErrorAction SilentlyContinue
            Expand-Archive -Path $Cache -DestinationPath $Extract -Force
            $Exe = Get-ChildItem $Extract -Filter 'PSD2Live.exe' -Recurse | Select-Object -First 1
            if (-not $Exe) { throw 'PSD2Live.exe was not found in the release archive.' }
            if (Test-Path $Portable) { Remove-Item $Portable -Recurse -Force }
            Copy-Item $Exe.Directory.FullName $Portable -Recurse
        } 'Extract portable/PSD2Live'
    }
}

if ($WithSeeThrough -or $WithModels) {
    Step 'Creating the See-through Python 3.12 environment'
    Require-Command 'conda' 'Install Miniconda or Miniforge, then reopen the terminal.'
    if (-not $DryRun) {
        $Exists = (& conda env list --json | ConvertFrom-Json).envs | Where-Object { (Split-Path $_ -Leaf) -eq 'see_through_dev' }
        if (-not $Exists) {
            & conda create -n see_through_dev python=3.12 -y
            if ($LASTEXITCODE -ne 0) { throw 'Failed to create the see_through_dev environment.' }
        }
    } else {
        Write-Host '[dry-run] conda create -n see_through_dev python=3.12 -y' -ForegroundColor DarkGray
    }
    Run { & conda run -n see_through_dev python -m pip install torch==2.8.0+cu128 torchvision==0.23.0+cu128 torchaudio==2.8.0+cu128 --index-url https://download.pytorch.org/whl/cu128 } 'Install CUDA 12.8 PyTorch'
    Run { & conda run -n see_through_dev python -m pip install -r (Join-Path $SeeThrough 'requirements.txt') } 'Install see-through/requirements.txt'
}

if ($WithModels) {
    Step 'Downloading See-through models into see-through/.hf_home (tens of GB)'
    $env:HF_HOME = Join-Path $SeeThrough '.hf_home'
    $Repos = @(
        'layerdifforg/seethroughv0.0.2_layerdiff3d',
        '24yearsold/seethroughv0.0.1_marigold',
        '24yearsold/l2d_sam_iter2'
    )
    foreach ($Repo in $Repos) {
        Run { & conda run -n see_through_dev python -c "from huggingface_hub import snapshot_download; snapshot_download('$Repo')" } "Download Hugging Face repository $Repo"
    }
}

Step 'Verifying installation'
if (-not $DryRun) {
    & (Join-Path $ToolsPython 'Scripts\python.exe') -c "import jpype, numpy, scipy, PIL, psd_tools, playwright; print('tools python: OK')"
    if ($LASTEXITCODE -ne 0) { throw 'Tools environment verification failed.' }
    if (-not $SkipPortable) {
        if (-not (Test-Path (Join-Path $Portable 'PSD2Live.exe'))) { throw 'PSD2Live portable verification failed.' }
        Write-Host 'PSD2Live portable: OK' -ForegroundColor Green
    }
    if ($WithSeeThrough -or $WithModels) {
        & conda run -n see_through_dev python -c "import torch, diffusers, transformers, psd_tools; print('see-through env: OK', torch.__version__)"
        if ($LASTEXITCODE -ne 0) { throw 'See-through environment verification failed.' }
    }
} else {
    Write-Host "[dry-run] See-through upstream baseline: $SeeThroughCommit" -ForegroundColor DarkGray
}

Write-Host "`nSetup complete. See environment.md or the Chinese guide environment-cn.md." -ForegroundColor Green
