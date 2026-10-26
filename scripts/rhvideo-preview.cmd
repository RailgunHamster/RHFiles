@echo off
setlocal
rem A separate profile prevents this preview from opening/replacing the installed RHFiles.
set "RHFILES_TEST_PROFILE_ROOT=%LOCALAPPDATA%\RHFiles-RHVideo-Preview"
set "RHFILES_TEST_DESKTOP_ID=rhvideo-preview"
set "RHFILES_AUTORUN_TESTS=0"
start "" "%~dp0RHFiles.exe"
endlocal
