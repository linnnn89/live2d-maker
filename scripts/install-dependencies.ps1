[CmdletBinding()]
param(
    [string]$DestinationRoot,
    [switch]$SkipPortable,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
# A Windows PowerShell child can inherit PS7 module paths through cmd/Python.
# Load the running host's Utility module so Get-FileHash resolves the matching implementation.
Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Utility/Microsoft.PowerShell.Utility.psd1') -Force
if (-not $DestinationRoot) { $DestinationRoot = Split-Path -Parent $PSScriptRoot }
$Source = Join-Path (Split-Path -Parent $PSScriptRoot) 'dependencies'
$DestinationRoot = [IO.Path]::GetFullPath($DestinationRoot)
$Manifest = Get-Content -LiteralPath (Join-Path $Source 'manifest.json') -Raw | ConvertFrom-Json
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Check-Hash([string]$Path, [string]$Expected) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "Missing dependency: $Path" }
    if ((Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $Expected) {
        throw "SHA-256 mismatch: $Path. Restore the committed dependency before installing."
    }
}

Check-Hash (Join-Path $Source $Manifest.nativeJar.file) $Manifest.nativeJar.sha256
foreach ($Package in $Manifest.packages) {
    if ($SkipPortable -and $Package.name -eq 'psd2live-runtime') { continue }
    foreach ($Part in $Package.parts) {
        Check-Hash (Join-Path $Source $Part.file) $Part.sha256
    }
    $Parent = [IO.Path]::GetFullPath((Join-Path $DestinationRoot $Package.target))
    $Probe = Join-Path $Parent $Package.probe
    $PackageHome = Join-Path $Parent ($Package.probe.Split('/')[0])
    $Marker = Join-Path $PackageHome '.dependency-sha256'
    if (Test-Path -LiteralPath $PackageHome) {
        if (-not (Test-Path -LiteralPath $Probe -PathType Leaf)) {
            throw "Incomplete existing dependency: $PackageHome. Move it aside before retrying; it will not be overwritten."
        }
        if ((Test-Path -LiteralPath $Marker) -and (Get-Content -LiteralPath $Marker -Raw).Trim() -ne $Package.sha256) {
            throw "Existing dependency version differs: $PackageHome. Move it aside before retrying."
        }
        Write-Host "$($Package.name): existing installation retained ($PackageHome)"
        continue
    }
    if ($DryRun) {
        Write-Host "[dry-run] verified $($Package.name); extract into $Parent"
        continue
    }
    $TempRoot = Join-Path ([IO.Path]::GetTempPath()) ('live2d-dependencies-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $TempRoot | Out-Null
    try {
        $Zip = Join-Path $TempRoot 'package.zip'
        $Output = [IO.File]::Create($Zip)
        try {
            foreach ($Part in $Package.parts) {
                $Input = [IO.File]::OpenRead((Join-Path $Source $Part.file))
                try { $Input.CopyTo($Output) } finally { $Input.Dispose() }
            }
        } finally { $Output.Dispose() }
        Check-Hash $Zip $Package.sha256
        $Archive = [IO.Compression.ZipFile]::OpenRead($Zip)
        try {
            $Prefix = $Parent.TrimEnd('\') + '\'
            foreach ($Entry in $Archive.Entries) {
                $Resolved = [IO.Path]::GetFullPath((Join-Path $Parent $Entry.FullName))
                if (-not $Resolved.StartsWith($Prefix, [StringComparison]::OrdinalIgnoreCase)) {
                    throw "Unsafe archive entry: $($Entry.FullName)"
                }
            }
        } finally { $Archive.Dispose() }
        New-Item -ItemType Directory -Force -Path $Parent | Out-Null
        [IO.Compression.ZipFile]::ExtractToDirectory($Zip, $Parent)
        if (-not (Test-Path -LiteralPath $Probe -PathType Leaf)) { throw "Installation probe missing: $Probe" }
        [IO.File]::WriteAllText($Marker, $Package.sha256)
        Write-Host "$($Package.name): installed ($PackageHome)"
    } finally {
        $ResolvedTemp = [IO.Path]::GetFullPath($TempRoot)
        $TempPrefix = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\live2d-dependencies-'
        if (-not $ResolvedTemp.StartsWith($TempPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe temporary cleanup path' }
        Remove-Item -LiteralPath $ResolvedTemp -Recurse -Force
    }
}
Write-Host 'Dependency archives and native application JAR: SHA-256 verified.'
