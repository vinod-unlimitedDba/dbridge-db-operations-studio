param(
  [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot),
  [switch]$BuildSelfExtractingExe
)

$ErrorActionPreference = "Stop"
$project = (Resolve-Path -LiteralPath $ProjectRoot).Path
$release = Join-Path $project "release"
$windowsBundle = Join-Path $release "DBridge-Portable"
$nodeBundle = Join-Path $release "DBridge-Node-Portable"
$runtime = (Get-Command node.exe -ErrorAction Stop).Source
$compiler = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
$modules = Join-Path $PSScriptRoot "node_modules"

$projectBoundary = $project.TrimEnd("\", "/") + [IO.Path]::DirectorySeparatorChar
foreach ($target in @($release, $windowsBundle, $nodeBundle)) {
  $resolvedTarget = [IO.Path]::GetFullPath($target)
  if (-not $resolvedTarget.StartsWith($projectBoundary, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Release path escaped the project directory: $resolvedTarget"
  }
}

New-Item -ItemType Directory -Path $release -Force | Out-Null
$generatedTargets = @(
  $windowsBundle,
  $nodeBundle,
  (Join-Path $release "DBridge-Portable.zip"),
  (Join-Path $release "DBridge-Portable.zip.sha256.txt"),
  (Join-Path $release "DBridge-Node-Portable.zip"),
  (Join-Path $release "DBridge-Node-Portable.zip.sha256.txt"),
  (Join-Path $release "DBridge-Node-Portable.tar.gz"),
  (Join-Path $release "DBridge-Node-Portable.tar.gz.sha256.txt")
)
foreach ($target in $generatedTargets) {
  if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force }
}

if (-not (Test-Path -LiteralPath $modules)) {
  throw "Bundled database drivers are missing. Run npm ci in the portable folder first."
}

$runtimeFiles = @(
  "server.mjs",
  "smoke-test.mjs",
  "portable-launcher.mjs",
  "ssh-terminal.mjs",
  "ssh-trust.mjs",
  "oracle-sql-id.mjs",
  "oracle-bottleneck.mjs",
  "postgres-bottleneck.mjs",
  "mongodb-bottleneck.mjs",
  "relational-bottleneck.mjs",
  "runtime-trace.mjs",
  "diagnostic-studio.mjs",
  "migration-log-compare.mjs",
  "session-credentials.mjs"
)
$sharedFiles = @(
  "Start-DBridge.cmd",
  "start-dbridge.sh",
  "Start-DBridge.command",
  "README.txt",
  "SECURITY-NOTES.txt",
  "package.json",
  "package-lock.json"
)

foreach ($bundle in @($windowsBundle, $nodeBundle)) {
  New-Item -ItemType Directory -Path (Join-Path $bundle "app") -Force | Out-Null
  foreach ($file in @($runtimeFiles + $sharedFiles)) {
    $source = Join-Path $PSScriptRoot $file
    if (-not (Test-Path -LiteralPath $source)) { throw "Required portable file is missing: $file" }
    Copy-Item -LiteralPath $source -Destination $bundle
  }
  Copy-Item -Path (Join-Path $PSScriptRoot "app\*") -Destination (Join-Path $bundle "app") -Force
}

Copy-Item -LiteralPath $modules -Destination (Join-Path $windowsBundle "node_modules") -Recurse -Force
Copy-Item -LiteralPath $runtime -Destination (Join-Path $windowsBundle "node.exe")

function Write-PackageManifest([string]$Bundle, [string]$Title) {
  $manifest = Join-Path $Bundle "PACKAGE-MANIFEST.txt"
  $manifestLines = @(
    "$Title v2.30 payload manifest",
    "Generated: $([DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ'))",
    "Format: SHA256  relative-path",
    "PACKAGE-MANIFEST.txt is not self-hashed.",
    "Dependencies are pinned by package-lock.json and covered by the archive SHA256.",
    ""
  )
  $bundleModules = Join-Path $Bundle "node_modules"
  $manifestLines += Get-ChildItem -LiteralPath $Bundle -File -Recurse |
    Where-Object { -not $_.FullName.StartsWith($bundleModules, [System.StringComparison]::OrdinalIgnoreCase) } |
    Sort-Object FullName |
    ForEach-Object {
      $relative = $_.FullName.Substring($Bundle.Length + 1).Replace("\", "/")
      "$(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256 | Select-Object -ExpandProperty Hash)  $relative"
    }
  Set-Content -LiteralPath $manifest -Value $manifestLines -Encoding UTF8
}

Write-PackageManifest $windowsBundle "DBridge Windows Offline Portable"
Write-PackageManifest $nodeBundle "DBridge Node Portable"

$windowsArchive = Join-Path $release "DBridge-Portable.zip"
$nodeZip = Join-Path $release "DBridge-Node-Portable.zip"
$nodeTar = Join-Path $release "DBridge-Node-Portable.tar.gz"
Push-Location $release
try {
  & "$env:SystemRoot\System32\tar.exe" -a -c -f $windowsArchive "DBridge-Portable"
  if ($LASTEXITCODE -ne 0) { throw "Windows portable ZIP creation failed." }
  & "$env:SystemRoot\System32\tar.exe" -a -c -f $nodeZip "DBridge-Node-Portable"
  if ($LASTEXITCODE -ne 0) { throw "Node portable ZIP creation failed." }
  & "$env:SystemRoot\System32\tar.exe" -czf $nodeTar "DBridge-Node-Portable"
  if ($LASTEXITCODE -ne 0) { throw "Node portable tar.gz creation failed." }
} finally {
  Pop-Location
}

foreach ($archive in @($windowsArchive, $nodeZip, $nodeTar)) {
  $archiveHash = Get-FileHash -LiteralPath $archive -Algorithm SHA256
  Set-Content -LiteralPath "$archive.sha256.txt" -Value "$($archiveHash.Hash)  $(Split-Path -Leaf $archive)" -Encoding ASCII
}

if (-not $BuildSelfExtractingExe) {
  Get-ChildItem -LiteralPath $release | Select-Object Name, Length, LastWriteTime
  return
}

if (-not (Test-Path -LiteralPath $compiler)) {
  throw "The Windows .NET Framework compiler is unavailable. The ZIP editions were created successfully."
}

$compilerArgs = @(
  "/nologo",
  "/target:winexe",
  "/platform:anycpu",
  "/optimize+",
  "/reference:C:\Windows\Microsoft.NET\Framework64\v4.0.30319\System.IO.Compression.dll",
  "/reference:C:\Windows\Microsoft.NET\Framework64\v4.0.30319\System.IO.Compression.FileSystem.dll",
  "/reference:C:\Windows\Microsoft.NET\Framework64\v4.0.30319\System.Windows.Forms.dll",
  "/resource:$windowsArchive,DBridgePayload",
  "/out:$(Join-Path $release 'DBridge-Advanced-Portable.exe')",
  (Join-Path $PSScriptRoot "PortableLauncher.cs")
)
& $compiler $compilerArgs
if ($LASTEXITCODE -ne 0) { throw "Portable launcher compilation failed." }
Get-ChildItem -LiteralPath $release | Select-Object Name, Length, LastWriteTime
