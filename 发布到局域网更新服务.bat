@echo off
chcp 65001 >nul
setlocal

cd /d "%~dp0"

set "UPDATE_DIR=D:\软件更新服务"
set "DOWNLOAD_DIR=%UPDATE_DIR%\download"
set "PORT=8080"
set "LAN_IP=192.192.3.180"
set "SIGN_CERT_SUBJECT=CN=EDY Local Code Signing"
for /f "delims=" %%v in ('node -p "require('./package.json').version"') do set "VERSION=%%v"
set "FILE_NAME=designer-%VERSION%.exe"
set "EXE_PATH=src-tauri\target\release\image_slicer_tauri.exe"

if not exist "%DOWNLOAD_DIR%" mkdir "%DOWNLOAD_DIR%"

echo 正在构建桌面程序...
call npm run tauri build -- --no-bundle
if errorlevel 1 (
  echo.
  echo 构建失败，请查看上方错误。
  pause
  exit /b 1
)

if not exist "%EXE_PATH%" (
  echo.
  echo 未找到构建产物：%EXE_PATH%
  pause
  exit /b 1
)

echo 正在签名桌面程序...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$cert=Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert | Where-Object { $_.Subject -eq '%SIGN_CERT_SUBJECT%' } | Sort-Object NotAfter -Descending | Select-Object -First 1; if(-not $cert){Write-Error '未找到本地代码签名证书'; exit 1}; $sig=Set-AuthenticodeSignature -LiteralPath '%CD%\%EXE_PATH%' -Certificate $cert -HashAlgorithm SHA256; if($sig.Status -ne 'Valid'){Write-Error ('签名失败：'+$sig.Status+' '+$sig.StatusMessage); exit 1}; Write-Host ('签名成功：'+$cert.Thumbprint)"
if errorlevel 1 (
  echo.
  echo 签名失败，请确认本机已信任本地代码签名证书。
  pause
  exit /b 1
)

copy /y "%EXE_PATH%" "%DOWNLOAD_DIR%\%FILE_NAME%" >nul
powershell -NoProfile -ExecutionPolicy Bypass -Command "$cert=Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert | Where-Object { $_.Subject -eq '%SIGN_CERT_SUBJECT%' } | Sort-Object NotAfter -Descending | Select-Object -First 1; if(-not $cert){Write-Error '未找到本地代码签名证书'; exit 1}; $sig=Set-AuthenticodeSignature -LiteralPath '%DOWNLOAD_DIR%\%FILE_NAME%' -Certificate $cert -HashAlgorithm SHA256; if($sig.Status -ne 'Valid'){Write-Error ('发布包签名失败：'+$sig.Status+' '+$sig.StatusMessage); exit 1}; Write-Host ('发布包签名成功：'+$cert.Thumbprint)"
if errorlevel 1 (
  echo.
  echo 发布包签名失败，请确认本机已信任本地代码签名证书。
  pause
  exit /b 1
)

node -e "const fs=require('fs');const path=require('path');const root=process.env.UPDATE_DIR;const file=process.env.FILE_NAME;const url='http://'+process.env.LAN_IP+':'+process.env.PORT+'/download/'+file;const notes=['更新检查和更新包下载改为后端直连局域网，不走系统代理','修复开翻墙代理时无法收到局域网更新的问题','生图和提示词 API 请求仍保持原有代理逻辑'];const manifest={version:process.env.VERSION,releaseDate:new Date().toISOString().slice(0,10),fileName:file,file_name:file,downloadUrl:url,url,notes,forceUpdate:false};fs.writeFileSync(path.join(root,'latest.json'),JSON.stringify(manifest,null,2),'utf8');fs.writeFileSync(path.join(root,'启动更新服务器.bat'),['@echo off','chcp 65001 >nul','cd /d \"'+root+'\"','node update-server.js','pause'].join('\r\n'),'utf8');"

echo.
echo 已发布到：%DOWNLOAD_DIR%\%FILE_NAME%
echo 更新清单：http://%LAN_IP%:%PORT%/latest.json
echo.
pause
