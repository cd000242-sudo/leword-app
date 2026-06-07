param(
  [string]$Root = "C:\tmp\leword-android-toolchain"
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$androidToolsUrl = "https://dl.google.com/android/repository/commandlinetools-win-14742923_latest.zip"
$jdkUrl = "https://api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jdk/hotspot/normal/eclipse"

function Resolve-FullPath([string]$Path) {
  $executionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Path)
}

function Assert-UnderRoot([string]$Path, [string]$AllowedRoot) {
  $fullPath = Resolve-FullPath $Path
  $fullRoot = Resolve-FullPath $AllowedRoot
  if (-not $fullPath.StartsWith($fullRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to modify path outside toolchain root: $fullPath"
  }
}

function Download-File([string]$Url, [string]$OutFile) {
  if (Test-Path -LiteralPath $OutFile) {
    Write-Host "Using cached download: $OutFile"
    return
  }

  Write-Host "Downloading $Url"
  Invoke-WebRequest -Uri $Url -OutFile $OutFile
}

function Find-JdkHome([string]$JdkRoot) {
  $candidate = Get-ChildItem -LiteralPath $JdkRoot -Directory -ErrorAction SilentlyContinue |
    Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName "bin\java.exe") } |
    Select-Object -First 1

  if (-not $candidate) {
    throw "Could not find a JDK under $JdkRoot"
  }

  $candidate.FullName
}

$rootPath = Resolve-FullPath $Root
$downloads = Join-Path $rootPath "downloads"
$jdkRoot = Join-Path $rootPath "jdk"
$androidHome = Join-Path $rootPath "android-sdk"
$cmdlineLatest = Join-Path $androidHome "cmdline-tools\latest"
$cmdlineExtract = Join-Path $rootPath "cmdline-tools-extract"
$jdkZip = Join-Path $downloads "temurin-jdk17.zip"
$androidZip = Join-Path $downloads "commandlinetools-win-14742923_latest.zip"

New-Item -ItemType Directory -Force -Path $downloads, $jdkRoot, $androidHome | Out-Null

Download-File $jdkUrl $jdkZip
Download-File $androidToolsUrl $androidZip

if (-not (Get-ChildItem -LiteralPath $jdkRoot -Directory -ErrorAction SilentlyContinue)) {
  Write-Host "Extracting JDK 17"
  Expand-Archive -LiteralPath $jdkZip -DestinationPath $jdkRoot -Force
}

$sdkManager = Join-Path $cmdlineLatest "bin\sdkmanager.bat"
if (-not (Test-Path -LiteralPath $sdkManager)) {
  Assert-UnderRoot $cmdlineExtract $rootPath
  if (Test-Path -LiteralPath $cmdlineExtract) {
    Remove-Item -LiteralPath $cmdlineExtract -Recurse -Force
  }

  Write-Host "Extracting Android command line tools"
  Expand-Archive -LiteralPath $androidZip -DestinationPath $cmdlineExtract -Force

  $extractedCmdline = Join-Path $cmdlineExtract "cmdline-tools"
  if (-not (Test-Path -LiteralPath (Join-Path $extractedCmdline "bin\sdkmanager.bat"))) {
    throw "Unexpected Android command line tools archive layout"
  }

  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $cmdlineLatest) | Out-Null
  Move-Item -LiteralPath $extractedCmdline -Destination $cmdlineLatest
}

$jdkHome = Find-JdkHome $jdkRoot
$env:JAVA_HOME = $jdkHome
$env:ANDROID_HOME = $androidHome
$env:ANDROID_SDK_ROOT = $androidHome
$env:PATH = "$jdkHome\bin;$cmdlineLatest\bin;$androidHome\platform-tools;$env:PATH"

Write-Host "Preparing Android SDK licenses for noninteractive install"
$licenseDir = Join-Path $androidHome "licenses"
New-Item -ItemType Directory -Force -Path $licenseDir | Out-Null
Set-Content -LiteralPath (Join-Path $licenseDir "android-sdk-license") -Value @(
  "8933bad161af4178b1185d1a37fbf41ea5269c55",
  "d56f5187479451eabf01fb78af6dfcb131a6481e",
  "24333f8a63b6825ea9c5514f83c2829b004d1fee"
)
Set-Content -LiteralPath (Join-Path $licenseDir "android-sdk-preview-license") -Value @(
  "84831b9409646a918e30573bab4c9c91346d8abd",
  "504667f4c0de7af1a06de9f4b1727b84351f2910"
)

Write-Host "Installing Android SDK packages"
& $sdkManager --sdk_root=$androidHome "platform-tools" "platforms;android-36" "build-tools;36.0.0"
if ($LASTEXITCODE -ne 0) {
  throw "Android SDK package installation failed with exit code $LASTEXITCODE"
}

foreach ($requiredPath in @(
  (Join-Path $androidHome "platform-tools\adb.exe"),
  (Join-Path $androidHome "platforms\android-36"),
  (Join-Path $androidHome "build-tools\36.0.0\aapt2.exe")
)) {
  if (-not (Test-Path -LiteralPath $requiredPath)) {
    throw "Android SDK package installation did not create required path: $requiredPath"
  }
}

Write-Host "JAVA_HOME=$jdkHome"
Write-Host "ANDROID_HOME=$androidHome"
