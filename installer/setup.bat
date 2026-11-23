@echo off
setlocal
set "PY="
where py >nul 2>nul && set "PY=py -3"
if not defined PY (
  where python >nul 2>nul && set "PY=python"
)
if not defined PY (
  echo Python 3 est introuvable. Installe Python 3.11 ou plus recent, puis relance.
  pause
  exit /b 1
)
%PY% "%~dp0setup.py" %*
set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" pause
endlocal & exit /b %RC%
