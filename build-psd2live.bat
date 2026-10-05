@echo off
setlocal
set "ROOT=%~dp0"
call "%ROOT%dependencies\install.bat"
if errorlevel 1 exit /b %ERRORLEVEL%
set "JAVA_HOME=%ROOT%portable\build-tools\jdk-21.0.12.1+1"
set "GRADLE_USER_HOME=%ROOT%portable\build-tools\gradle-home"
set "PATH=%JAVA_HOME%\bin;%PATH%"
if "%~1"=="" (
    call "%ROOT%portable\build-tools\gradle-9.6.1\bin\gradle.bat" -p "%ROOT%psd2live" jar
) else (
    call "%ROOT%portable\build-tools\gradle-9.6.1\bin\gradle.bat" -p "%ROOT%psd2live" %*
)
exit /b %ERRORLEVEL%
