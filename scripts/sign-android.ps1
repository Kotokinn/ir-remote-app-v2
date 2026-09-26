<#
.SYNOPSIS
  One-shot: (optionally build) -> check signature -> create keystore if missing -> zipalign -> sign -> verify.

.EXAMPLE
  .\scripts\sign-android.ps1                 # sign the newest APK already built
  .\scripts\sign-android.ps1 -Build          # build first (tauri android build --apk), then sign
  .\scripts\sign-android.ps1 -CheckOnly      # only report whether the APK is signed, and by whom
  .\scripts\sign-android.ps1 -Apk C:\x\app.apk -Out C:\x\app-signed.apk

.NOTES
  Passwords: read from $env:ANDROID_KS_PASS if set, else prompted (never written to disk, never put on a
  command line). The keystore is created on first run at .\keystore\release.jks (git-ignored).
  BACK UP that file and remember its password: every future update must be signed with the same key,
  or Android refuses to install it over the old app.
#>
[CmdletBinding()]
param(
  [switch]$Build,
  [switch]$CheckOnly,
  [switch]$Force,                       # re-sign even if the APK already carries a (non-debug) signature
  [string]$Target = "aarch64",          # only used with -Build (aarch64 | armv7 | i686 | x86_64)
  [string]$Apk,                         # default: newest APK under the Gradle outputs
  [string]$Out,                         # default: <apk name without -unsigned>-signed.apk next to the input
  [string]$Keystore,                    # default: <frontend>\keystore\release.jks
  [string]$Alias = "ir-remote",
  [string]$Dname = "CN=IR Remote, OU=Mobile, O=IR Remote, C=VN"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
if (-not $Keystore) { $Keystore = Join-Path $root "keystore\release.jks" }
$apkOutputs = Join-Path $root "src-tauri\gen\android\app\build\outputs\apk"

function Step($text) { Write-Host "`n==> $text" -ForegroundColor Cyan }
function Fail($text) { Write-Host "ERROR: $text" -ForegroundColor Red; exit 1 }

# Runs a native tool without PowerShell turning its stderr into a terminating error; returns text + exit code.
function Invoke-Native([string]$exe, [string[]]$arguments) {
  $previous = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $text = (& $exe @arguments 2>&1 | ForEach-Object { "$_" }) -join "`n"
    return [pscustomobject]@{ Code = $LASTEXITCODE; Text = $text }
  } finally {
    $ErrorActionPreference = $previous
  }
}

# ---- 1. tools ---------------------------------------------------------------------------------------------
Step "Locating tools"
$javaHome = $env:JAVA_HOME
$keytool = if ($javaHome -and (Test-Path "$javaHome\bin\keytool.exe")) { "$javaHome\bin\keytool.exe" } else { (Get-Command keytool -ErrorAction SilentlyContinue).Source }
if (-not $keytool) { Fail "keytool not found. Set JAVA_HOME to a JDK." }
if ($javaHome) { $env:PATH = "$javaHome\bin;$env:PATH" }   # apksigner.bat needs java

$sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } elseif ($env:ANDROID_SDK_ROOT) { $env:ANDROID_SDK_ROOT } else { Join-Path $env:LOCALAPPDATA "Android\Sdk" }
$buildTools = Get-ChildItem (Join-Path $sdk "build-tools") -Directory -ErrorAction SilentlyContinue |
  Where-Object { (Test-Path "$($_.FullName)\apksigner.bat") -and (Test-Path "$($_.FullName)\zipalign.exe") } |
  Sort-Object { try { [version]$_.Name } catch { [version]"0.0" } } -Descending | Select-Object -First 1
if (-not $buildTools) { Fail "No Android build-tools with apksigner + zipalign under $sdk\build-tools (install via Android Studio SDK Manager)." }
$apksigner = Join-Path $buildTools.FullName "apksigner.bat"
$zipalign = Join-Path $buildTools.FullName "zipalign.exe"
Write-Host "keytool   : $keytool"
Write-Host "build-tools: $($buildTools.Name)"

# ---- 2. build (optional) ----------------------------------------------------------------------------------
if ($Build) {
  Step "Building APK (tauri android build --apk --target $Target)"
  Push-Location $root
  try {
    & npx tauri android build --apk --target $Target
    if ($LASTEXITCODE -ne 0) { Fail "tauri android build failed (exit $LASTEXITCODE)." }
  } finally { Pop-Location }
}

# ---- 3. pick the APK --------------------------------------------------------------------------------------
Step "Selecting APK"
if (-not $Apk) {
  $latest = Get-ChildItem $apkOutputs -Recurse -Filter *.apk -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -notlike "*-signed.apk" } | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $latest) { Fail "No APK under $apkOutputs. Run with -Build, or pass -Apk." }
  $Apk = $latest.FullName
}
if (-not (Test-Path $Apk)) { Fail "APK not found: $Apk" }
$Apk = (Resolve-Path $Apk).Path
Write-Host "APK: $Apk  ($([math]::Round((Get-Item $Apk).Length / 1MB, 1)) MB, built $((Get-Item $Apk).LastWriteTime))"

# ---- 4. is it signed? -------------------------------------------------------------------------------------
Step "Checking existing signature"
$check = Invoke-Native $apksigner @("verify", "--print-certs", $Apk)
$signed = $check.Code -eq 0
if ($signed) {
  $subject = ($check.Text -split "`n" | Where-Object { $_ -match "certificate DN" } | Select-Object -First 1)
  Write-Host "Already signed. $subject" -ForegroundColor Green
  $isDebug = $check.Text -match "Android Debug"
  if ($isDebug) { Write-Host "(that is the Android *debug* certificate: not valid for release)" -ForegroundColor Yellow }
} else {
  Write-Host "NOT signed (or signature invalid): $(($check.Text -split "`n")[0])" -ForegroundColor Yellow
}
if ($CheckOnly) { exit ($(if ($signed) { 0 } else { 2 })) }
if ($signed -and -not $isDebug -and -not $Force) { Write-Host "Nothing to do (use -Force to re-sign)."; exit 0 }

# ---- 5. keystore ------------------------------------------------------------------------------------------
function Get-PlainPassword([string]$prompt) {
  $secure = Read-Host $prompt -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

Step "Keystore"
$password = $env:ANDROID_KS_PASS
if (Test-Path $Keystore) {
  Write-Host "Using $Keystore"
  if (-not $password) { $password = Get-PlainPassword "Keystore password" }
} else {
  Write-Host "No keystore at $Keystore -> creating one (RSA 2048, valid ~27 years, alias '$Alias')" -ForegroundColor Yellow
  if (-not $password) {
    $password = Get-PlainPassword "New keystore password (min 6 chars)"
    if ((Get-PlainPassword "Repeat password") -ne $password) { Fail "Passwords differ." }
  }
  if ($password.Length -lt 6) { Fail "Password must be at least 6 characters." }
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Keystore) | Out-Null
  $env:ANDROID_KS_PASS = $password
  $gen = Invoke-Native $keytool @(
    "-genkeypair", "-v", "-keystore", $Keystore, "-storetype", "PKCS12", "-alias", $Alias,
    "-keyalg", "RSA", "-keysize", "2048", "-validity", "10000", "-dname", $Dname,
    "-storepass:env", "ANDROID_KS_PASS", "-keypass:env", "ANDROID_KS_PASS"
  )
  if ($gen.Code -ne 0) { Fail "keytool failed:`n$($gen.Text)" }
  Write-Host "Keystore created. BACK IT UP (and the password) - losing it means you can never update the installed app." -ForegroundColor Yellow
}
$env:ANDROID_KS_PASS = $password   # apksigner/keytool read it from the environment, not the command line

# ---- 6. zipalign + sign + verify --------------------------------------------------------------------------
if (-not $Out) { $Out = Join-Path (Split-Path -Parent $Apk) (([IO.Path]::GetFileNameWithoutExtension($Apk) -replace "-unsigned$", "") + "-signed.apk") }
$aligned = Join-Path ([IO.Path]::GetTempPath()) ("aligned-" + [guid]::NewGuid().ToString("N") + ".apk")
try {
  Step "zipalign"
  $align = Invoke-Native $zipalign @("-f", "-p", "4", $Apk, $aligned)
  if ($align.Code -ne 0) { Fail "zipalign failed:`n$($align.Text)" }

  Step "Signing"
  if (Test-Path $Out) { Remove-Item $Out -Force }
  $sign = Invoke-Native $apksigner @(
    "sign", "--ks", $Keystore, "--ks-key-alias", $Alias, "--ks-pass", "env:ANDROID_KS_PASS",
    "--key-pass", "env:ANDROID_KS_PASS", "--out", $Out, $aligned
  )
  if ($sign.Code -ne 0) { Fail "apksigner failed (wrong password/alias?):`n$($sign.Text)" }
} finally {
  if (Test-Path $aligned) { Remove-Item $aligned -Force }
  Remove-Item Env:\ANDROID_KS_PASS -ErrorAction SilentlyContinue
}

Step "Verifying"
$final = Invoke-Native $apksigner @("verify", "--verbose", "--print-certs", $Out)
if ($final.Code -ne 0) { Fail "Signed APK does not verify:`n$($final.Text)" }
$final.Text -split "`n" | Where-Object { $_ -match "Verifies|Verified using|certificate (DN|SHA-256)" } | ForEach-Object { Write-Host $_ }

Write-Host "`nDONE -> $Out" -ForegroundColor Green
Write-Host "Install: adb install -r `"$Out`""
