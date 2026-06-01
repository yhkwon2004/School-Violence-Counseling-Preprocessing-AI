param(
  [string]$WebUrl = 'http://127.0.0.1:5173',
  [int]$DebugPort = 9224,
  [string]$ScreenshotDir = 'C:\tmp\ieumlog-web-ui-smoke'
)

$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$profileDir = 'C:\tmp\ieumlog-web-ui-smoke-profile'

if (-not (Test-Path -LiteralPath $chrome)) {
  throw 'Google Chrome is required for the connected web UI smoke check.'
}

$arguments = @(
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  "--remote-debugging-port=$DebugPort",
  "--user-data-dir=$profileDir",
  'about:blank'
)
$chromeProcess = Start-Process -FilePath $chrome -ArgumentList $arguments -WindowStyle Hidden -PassThru

try {
  $ready = $false
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    try {
      Invoke-WebRequest -Uri "http://127.0.0.1:$DebugPort/json/version" -UseBasicParsing -TimeoutSec 2 | Out-Null
      $ready = $true
      break
    } catch {
      Start-Sleep -Milliseconds 300
    }
  }
  if (-not $ready) { throw 'Headless Chrome debugging endpoint did not become ready.' }
  & node (Join-Path $PSScriptRoot 'verify-web-ui-local.mjs') "--webUrl=$WebUrl" "--debugUrl=http://127.0.0.1:$DebugPort" "--screenshotDir=$ScreenshotDir"
  if ($LASTEXITCODE -ne 0) { throw 'Connected web UI smoke check failed.' }
} finally {
  if ($chromeProcess -and -not $chromeProcess.HasExited) {
    Stop-Process -Id $chromeProcess.Id -Force
  }
}
