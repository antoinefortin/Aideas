param([switch]$SelfContained)
$ErrorActionPreference = 'Stop'
$env:DOTNET_CLI_TELEMETRY_OPTOUT = '1'
$project = Join-Path $PSScriptRoot 'AudioDock.csproj'
$destination = Join-Path $PSScriptRoot 'publish'
if ($SelfContained) {
    dotnet publish $project -c Release -r win-x64 --self-contained true -o $destination
} else {
    dotnet publish $project -c Release -o $destination
}
if ($LASTEXITCODE -ne 0) { throw 'Compilation impossible. Voir les messages ci-dessus.' }
Write-Host "Application disponible dans : $destination"
