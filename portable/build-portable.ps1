param(
  [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot),
  [switch]$BuildSelfExtractingExe
)

$ErrorActionPreference = "Stop"
$project = (Resolve-Path -LiteralPath $ProjectRoot).Path
$release = Join-Path $project "release"
$bundle = Join-Path $release "DBridge-Portable"
$runtime = (Get-Command node.exe -ErrorAction Stop).Source
$compiler = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
$modules = Join-Path $PSScriptRoot "node_modules"

if (-not $release.StartsWith($project, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Release path escaped the project directory."
}
if (Test-Path -LiteralPath $release) {
  Remove-Item -LiteralPath $release -Recurse -Force
}

New-Item -ItemType Directory -Path (Join-Path $bundle "app") -Force | Out-Null
if (-not (Test-Path -LiteralPath $modules)) {
  throw "Bundled database drivers are missing. Run npm install in the portable folder first."
}
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "server.mjs") -Destination $bundle
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "oracle-sql-id.mjs") -Destination $bundle
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "oracle-bottleneck.mjs") -Destination $bundle
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "postgres-bottleneck.mjs") -Destination $bundle
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "mongodb-bottleneck.mjs") -Destination $bundle
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "runtime-trace.mjs") -Destination $bundle
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "Start-DBridge.cmd") -Destination $bundle
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "README.txt") -Destination $bundle
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "SECURITY-NOTES.txt") -Destination $bundle
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "package.json") -Destination $bundle
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "package-lock.json") -Destination $bundle
Copy-Item -LiteralPath $modules -Destination (Join-Path $bundle "node_modules") -Recurse -Force
Copy-Item -Path (Join-Path $PSScriptRoot "app\*") -Destination (Join-Path $bundle "app") -Force
Copy-Item -LiteralPath $runtime -Destination (Join-Path $bundle "node.exe")

$manifest = Join-Path $bundle "PACKAGE-MANIFEST.txt"
$manifestLines = @(
  "DBridge Portable v2.21 payload manifest",
  "Generated: $([DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ'))",
  "Format: SHA256  relative-path",
  "PACKAGE-MANIFEST.txt is not self-hashed.",
  "Bundled dependencies are recorded in package-lock.json and covered by the archive SHA256.",
  ""
)
$bundleModules = Join-Path $bundle "node_modules"
$manifestLines += Get-ChildItem -LiteralPath $bundle -File -Recurse |
  Where-Object { -not $_.FullName.StartsWith($bundleModules, [System.StringComparison]::OrdinalIgnoreCase) } |
  Sort-Object FullName |
  ForEach-Object {
    $relative = $_.FullName.Substring($bundle.Length + 1).Replace("\", "/")
    "$(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256 | Select-Object -ExpandProperty Hash)  $relative"
  }
Set-Content -LiteralPath $manifest -Value $manifestLines -Encoding UTF8

$archive = Join-Path $release "DBridge-Portable.zip"
Push-Location $release
try {
  & "$env:SystemRoot\System32\tar.exe" -a -c -f $archive "DBridge-Portable"
  if ($LASTEXITCODE -ne 0) { throw "Portable ZIP creation failed." }
} finally {
  Pop-Location
}

$archiveHash = Get-FileHash -LiteralPath $archive -Algorithm SHA256
Set-Content -LiteralPath (Join-Path $release "DBridge-Portable.zip.sha256.txt") -Value "$($archiveHash.Hash)  DBridge-Portable.zip" -Encoding ASCII

if (-not $BuildSelfExtractingExe) {
  Get-ChildItem -LiteralPath $release | Select-Object Name, Length, LastWriteTime
  return
}

if (-not (Test-Path -LiteralPath $compiler)) {
  throw "The Windows .NET Framework compiler is unavailable. The ZIP edition was created successfully."
}

$compilerArgs = @(
  "/nologo",
  "/target:winexe",
  "/platform:anycpu",
  "/optimize+",
  "/reference:C:\Windows\Microsoft.NET\Framework64\v4.0.30319\System.IO.Compression.dll",
  "/reference:C:\Windows\Microsoft.NET\Framework64\v4.0.30319\System.IO.Compression.FileSystem.dll",
  "/reference:C:\Windows\Microsoft.NET\Framework64\v4.0.30319\System.Windows.Forms.dll",
  "/resource:$archive,DBridgePayload",
  "/out:$(Join-Path $release 'DBridge-Advanced-Portable.exe')",
  (Join-Path $PSScriptRoot "PortableLauncher.cs")
)
& $compiler $compilerArgs

if ($LASTEXITCODE -ne 0) { throw "Portable launcher compilation failed." }
Get-ChildItem -LiteralPath $release | Select-Object Name, Length, LastWriteTime
