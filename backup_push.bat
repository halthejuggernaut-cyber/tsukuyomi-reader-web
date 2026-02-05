@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0"

REM ログファイル（リポジトリ直下）
set LOGFILE=%~dp0backup_push.log

echo ==================================================>> "%LOGFILE%"
echo [%date% %time%] backup start>> "%LOGFILE%"
echo RepoDir: %CD%>> "%LOGFILE%"

REM 変更ファイル一覧を取得（ポーセリン形式）
git status --porcelain > "%TEMP%\git_changes.txt" 2>> "%LOGFILE%"
if errorlevel 1 (
  echo [backup] ERROR: git status failed.
  echo [backup] See log: %LOGFILE%
  pause
  exit /b 1
)

for /f "usebackq delims=" %%i in ("%TEMP%\git_changes.txt") do set HASCHANGES=1

if not defined HASCHANGES (
  echo [backup] No changes. Nothing to commit.
  echo [backup] No changes.>> "%LOGFILE%"
  pause
  exit /b 0
)

echo.
echo [backup] Changed files (from git status --porcelain):
type "%TEMP%\git_changes.txt"
echo.

echo [backup] Above list will be committed & pushed.
echo [backup] Continue? (Y/N)
set /p ANS=
if /I not "%ANS%"=="Y" (
  echo [backup] Canceled by user.
  echo CANCELED>> "%LOGFILE%"
  pause
  exit /b 0
)

echo [backup] Writing changed file list to log...
echo --- git status --porcelain --- >> "%LOGFILE%"
type "%TEMP%\git_changes.txt" >> "%LOGFILE%"

REM 念のため “ルート以外にいる”事故を検知（.gitがあるか）
if not exist ".git" (
  echo [backup] ERROR: .git not found. You are not in repo root.
  echo [backup] ERROR: .git not found.>> "%LOGFILE%"
  pause
  exit /b 1
)

REM ステージング
git add -A >> "%LOGFILE%" 2>&1
if errorlevel 1 (
  echo [backup] ERROR: git add failed.
  echo [backup] See log: %LOGFILE%
  pause
  exit /b 1
)

REM コミット
set TS=%date% %time%
git commit -m "backup %TS%" >> "%LOGFILE%" 2>&1
if errorlevel 1 (
  echo [backup] NOTE: commit skipped (maybe no staged changes).
  echo [backup] commit skipped.>> "%LOGFILE%"
  pause
  exit /b 0
)

REM push
git push >> "%LOGFILE%" 2>&1
if errorlevel 1 (
  echo [backup] ERROR: git push failed.
  echo [backup] See log: %LOGFILE%
  pause
  exit /b 1
)

echo [backup] OK: committed and pushed.
echo OK>> "%LOGFILE%"
pause
exit /b 0
