# One-time setup: creates a "Thinking Spaces (Web)" shortcut on the
# Windows desktop that opens the real, hosted app directly in your
# default browser -- https://thinking.thegardners.xyz -- using the same
# thought-bubble icon as the local-dev launcher shortcut.
#
# This is a SEPARATE shortcut from Setup-Desktop-Icon.ps1's -- that one
# still pulls the latest code and runs the app locally for making/
# testing changes (what this whole repo is for); this one is for
# everyday use of the real, deployed app once a change has shipped.
# Neither replaces the other.
#
# Run this once (right-click -> Run with PowerShell, or
# `powershell -File Setup-Desktop-Icon-Web.ps1` from this folder).

$launcherDir = $PSScriptRoot
$iconPath = Join-Path $launcherDir "thinking-spaces.ico"
$desktop = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktop "Thinking Spaces (Web).url"

# A .url file (not a .lnk) -- Windows opens these in your default
# browser directly, no need to hardcode a specific browser's exe path.
# The icon is referenced by its path in the repo rather than copied in,
# so it keeps working as long as the repo stays where it is.
$content = @"
[InternetShortcut]
URL=https://thinking.thegardners.xyz
IconFile=$iconPath
IconIndex=0
"@

Set-Content -Path $shortcutPath -Value $content -Encoding ASCII

Write-Host "Desktop shortcut created: $shortcutPath"
Write-Host "Double-click it any time to open the real, hosted Thinking Spaces app."
