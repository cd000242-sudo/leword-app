param(
  [string]$ToolchainRoot = "C:\tmp\leword-android-toolchain",
  [string]$ApiUrl = "http://172.30.1.57:34983",
  [string]$OutputApk = "apps\mobile\builds\leword-mobile-rank-tracking.apk"
)

$ErrorActionPreference = "Stop"

function Resolve-FullPath([string]$Path) {
  $executionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Path)
}

function Find-JdkHome([string]$JdkRoot) {
  $candidate = Get-ChildItem -LiteralPath $JdkRoot -Directory -ErrorAction SilentlyContinue |
    Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName "bin\java.exe") } |
    Select-Object -First 1

  if (-not $candidate) {
    throw "Could not find a JDK under $JdkRoot. Run scripts\setup-mobile-android-toolchain.ps1 first."
  }

  $candidate.FullName
}

$repoRoot = Resolve-FullPath "."
$toolchain = Resolve-FullPath $ToolchainRoot
$androidHome = Join-Path $toolchain "android-sdk"
$cmdlineLatest = Join-Path $androidHome "cmdline-tools\latest"
$jdkHome = Find-JdkHome (Join-Path $toolchain "jdk")
$outputPath = Resolve-FullPath $OutputApk
$asciiTemp = Resolve-FullPath "C:\tmp\leword-expo-tmp"
$gradleHome = Resolve-FullPath "C:\tmp\leword-gradle-home"

if (-not (Test-Path -LiteralPath (Join-Path $androidHome "platforms\android-36"))) {
  throw "Android platform android-36 is not installed. Run scripts\setup-mobile-android-toolchain.ps1 first."
}

$env:JAVA_HOME = $jdkHome
$env:ANDROID_HOME = $androidHome
$env:ANDROID_SDK_ROOT = $androidHome
$env:EXPO_PUBLIC_LEWORD_API_URL = $ApiUrl
$env:LEWORD_API_ENV = "local"
$env:NODE_ENV = "production"
$env:TEMP = $asciiTemp
$env:TMP = $asciiTemp
$env:GRADLE_USER_HOME = $gradleHome
$env:PATH = "$jdkHome\bin;$cmdlineLatest\bin;$androidHome\platform-tools;$env:PATH"

New-Item -ItemType Directory -Force -Path $asciiTemp, $gradleHome | Out-Null

Write-Host "Prebuilding native Android project"
& node scripts/run-mobile-command.js --cwd apps/mobile -- npx expo prebuild --platform android --clean --no-install
if ($LASTEXITCODE -ne 0) {
  throw "Expo prebuild failed with exit code $LASTEXITCODE"
}

Write-Host "Building release APK"
& node scripts/run-mobile-command.js --cwd apps/mobile/android -- .\gradlew.bat :app:assembleRelease --no-daemon
if ($LASTEXITCODE -ne 0) {
  throw "Gradle release build failed with exit code $LASTEXITCODE"
}

$releaseDir = Join-Path $repoRoot "apps\mobile\android\app\build\outputs\apk\release"
$apk = Get-ChildItem -LiteralPath $releaseDir -Filter "*.apk" |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if (-not $apk) {
  throw "Could not find a release APK under $releaseDir"
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $outputPath) | Out-Null
Copy-Item -LiteralPath $apk.FullName -Destination $outputPath -Force

$hash = Get-FileHash -Algorithm SHA256 -LiteralPath $outputPath
Write-Host "APK=$outputPath"
Write-Host "SHA256=$($hash.Hash)"
