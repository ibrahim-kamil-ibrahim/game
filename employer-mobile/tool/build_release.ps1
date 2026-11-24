<#
.SYNOPSIS
  Builds signed production APK and AAB artifacts for the Employer app.

.DESCRIPTION
  Requires a production HTTPS API URL. The URL is compiled into the app, so it
  cannot be changed after distribution without publishing a new build.

.EXAMPLE
  .\tool\build_release.ps1 -ApiBaseUrl "https://api.example.com/api/v1"
#>
param(
  [Parameter(Mandatory = $true)]
  [string]$ApiBaseUrl
)

$ErrorActionPreference = 'Stop'

if (-not $ApiBaseUrl.StartsWith('https://')) {
  throw "Production API URL must use HTTPS. Received: $ApiBaseUrl"
}

if (-not (Test-Path 'android/key.properties')) {
  throw 'android/key.properties is missing. Configure release signing before building.'
}

Write-Host "Building Employer app against $ApiBaseUrl" -ForegroundColor Cyan
flutter clean
flutter pub get
flutter analyze
flutter test

flutter build apk --release --dart-define=API_BASE_URL=$ApiBaseUrl
flutter build appbundle --release --dart-define=API_BASE_URL=$ApiBaseUrl

Write-Host ''
Write-Host 'Artifacts:' -ForegroundColor Green
Write-Host '  build/app/outputs/flutter-apk/app-release.apk'
Write-Host '  build/app/outputs/bundle/release/app-release.aab'
Write-Host ''
Write-Host 'Back up android/key.properties and the keystore; losing them blocks future updates.'
