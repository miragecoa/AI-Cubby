$host.UI.RawUI.WindowTitle='AI Resource Manager Updater'
Write-Host 'Waiting for app to exit...' -ForegroundColor Cyan
while(Get-Process -Id __PID__ -EA SilentlyContinue){Start-Sleep 1}
Start-Sleep 2
$oldExeName=[System.IO.Path]::GetFileName('__EXE_PATH__')
$beforeExes=Get-ChildItem -Path '__APP_DIR__' -Filter '*.exe' -File | Select-Object -ExpandProperty Name
Write-Host 'Extracting update...'
try { Expand-Archive -Path '__ZIP_PATH__' -DestinationPath '__APP_DIR__' -Force -EA Stop; Write-Host 'OK' -ForegroundColor Green } catch { Write-Host "FAILED: $_" -ForegroundColor Red; Read-Host 'Press Enter to exit'; exit 1 }
$newExe=Get-ChildItem -Path '__APP_DIR__' -Filter '*.exe' -File | Where-Object { $beforeExes -notcontains $_.Name } | Select-Object -First 1
if($newExe){ Remove-Item '__EXE_PATH__' -Force -EA SilentlyContinue; Rename-Item $newExe.FullName $oldExeName -Force }
Remove-Item '__ZIP_PATH__' -Force -EA SilentlyContinue
Start-Process '__EXE_PATH__'
