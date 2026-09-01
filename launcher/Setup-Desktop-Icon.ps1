# One-time setup: creates a "Thinking Spaces" shortcut on the Windows
# desktop, pointed at Start-ThinkingSpaces.bat in this same folder and
# using thinking-spaces.ico as its icon. Run this once (right-click ->
# Run with PowerShell, or `powershell -File Setup-Desktop-Icon.ps1` from
# this folder); after that, the desktop icon itself is what you double-
# click every time -- this script doesn't need running again unless the
# repo is moved to a different folder.

$launcherDir = $PSScriptRoot
$batPath = Join-Path $launcherDir "Start-ThinkingSpaces.bat"
$iconPath = Join-Path $launcherDir "thinking-spaces.ico"
$desktop = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktop "Thinking Spaces.lnk"

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $batPath
$shortcut.WorkingDirectory = $launcherDir
$shortcut.IconLocation = $iconPath
$shortcut.WindowStyle = 7  # minimized -- the two server windows are the visible part, not this launcher wrapper
$shortcut.Description = "Pull the latest Thinking Spaces code and start both dev servers"
$shortcut.Save()

Write-Host "Desktop shortcut created: $shortcutPath"
Write-Host "Double-click it any time you want to open Thinking Spaces."
