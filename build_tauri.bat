@echo off
chcp 65001 >nul
setlocal

cd /d "%~dp0"

echo 正在检查 Tauri 构建环境...
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo 未找到 Node.js。请先安装 Node.js 18 或更高版本：
  echo https://nodejs.org/
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo.
  echo 未找到 npm。请确认 Node.js 已完整安装，并重新打开命令行窗口。
  pause
  exit /b 1
)

where cargo >nul 2>nul
if errorlevel 1 (
  echo.
  echo 未找到 Rust / cargo。请先安装 Rust：
  echo https://www.rust-lang.org/tools/install
  pause
  exit /b 1
)

where rustc >nul 2>nul
if errorlevel 1 (
  echo.
  echo 未找到 rustc。请确认 Rust 已完整安装，并重新打开命令行窗口。
  pause
  exit /b 1
)

echo.
echo 正在安装前端依赖...
call npm install
if errorlevel 1 (
  echo.
  echo npm install 失败，请检查网络或 npm 源配置。
  pause
  exit /b 1
)

echo.
echo 正在打包 Tauri 程序...
call npm run tauri build -- --no-bundle
if errorlevel 1 (
  echo.
  echo Tauri 打包失败，请查看上方错误信息。
  pause
  exit /b 1
)

echo.
echo 打包完成。可执行文件位于：
echo src-tauri\target\release\image_slicer_tauri.exe
pause
