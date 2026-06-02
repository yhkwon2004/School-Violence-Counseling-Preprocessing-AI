param(
  [Parameter(Mandatory = $true)]
  [string]$ApkPath,
  [string]$Aapt2Path = ''
)

$ErrorActionPreference = 'Stop'

function Assert-True([bool]$Condition, [string]$Label) {
  if (-not $Condition) { throw $Label }
}

function Resolve-Aapt2([string]$ExplicitPath) {
  if ($ExplicitPath) {
    Assert-True (Test-Path -LiteralPath $ExplicitPath -PathType Leaf) "aapt2 was not found at the explicit path: $ExplicitPath"
    return (Resolve-Path -LiteralPath $ExplicitPath -ErrorAction Stop).Path
  }

  $sdkRoots = @(
    $env:ANDROID_SDK_ROOT,
    $env:ANDROID_HOME,
    $(if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA 'Android\Sdk' })
  ) | Where-Object { $_ } | Select-Object -Unique

  foreach ($sdkRoot in $sdkRoots) {
    $buildTools = Join-Path $sdkRoot 'build-tools'
    if (-not (Test-Path -LiteralPath $buildTools)) { continue }
    $candidate = Get-ChildItem -LiteralPath $buildTools -Directory |
      Sort-Object { try { [version]$_.Name } catch { [version]'0.0' } } -Descending |
      ForEach-Object { Join-Path $_.FullName 'aapt2.exe' } |
      Where-Object { Test-Path -LiteralPath $_ } |
      Select-Object -First 1
    if ($candidate) { return $candidate }
  }

  throw 'aapt2 was not found. Install Android SDK Build Tools 26.0.2+ or pass -Aapt2Path explicitly.'
}

function Invoke-Aapt2([string]$Executable, [string[]]$Arguments) {
  $output = @(& $Executable @Arguments 2>&1)
  if ($LASTEXITCODE -ne 0) {
    throw "aapt2 failed: $($Arguments -join ' ')`n$($output -join "`n")"
  }
  return $output -join "`n"
}

$apkExists = Test-Path -LiteralPath $ApkPath -PathType Leaf
Assert-True $apkExists "Preview APK was not found: $ApkPath"
$apk = (Resolve-Path -LiteralPath $ApkPath -ErrorAction Stop).Path
Assert-True ([System.IO.Path]::GetExtension($apk) -ieq '.apk') 'Android preview verification requires an .apk file.'
$aapt2 = Resolve-Aapt2 $Aapt2Path

$packageName = (Invoke-Aapt2 $aapt2 @('dump', 'packagename', $apk)).Trim()
Assert-True ($packageName -eq 'kr.ieumlog.student') "Unexpected Android package id: $packageName"
Write-Output 'android_apk_package=ok'

$permissions = Invoke-Aapt2 $aapt2 @('dump', 'permissions', $apk)
Assert-True (-not $permissions.Contains('android.permission.RECORD_AUDIO')) 'Preview APK unexpectedly requests android.permission.RECORD_AUDIO.'
Write-Output 'android_apk_record_audio_absent=ok'

$manifest = Invoke-Aapt2 $aapt2 @('dump', 'xmltree', $apk, '--file', 'AndroidManifest.xml')
Assert-True ($manifest -match '(?m)allowBackup.*(?:\(type 0x12\)0x0|false)') 'Preview APK manifest must set android:allowBackup=false.'
Assert-True ($manifest -match '(?m)windowSoftInputMode.*(?:\(type 0x11\)0x10|adjustResize)') 'Preview APK manifest must set android:windowSoftInputMode=adjustResize.'
Write-Output 'android_apk_backup_disabled=ok'
Write-Output 'android_apk_keyboard_resize=ok'
Write-Output "android_apk_verified=$apk"
