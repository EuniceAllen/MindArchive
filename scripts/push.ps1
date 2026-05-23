# MindArchive - 自动提交 & 推送脚本
# 用法: .\scripts\push.ps1 "提交信息"
#       或直接双击运行（会弹出输入框）

$git = "E:\projects\Git\bin\git.exe"

# 获取提交信息：优先用命令行参数，否则弹窗输入
$message = $args[0]
if (-not $message) {
    $message = Read-Host "请输入提交信息"
}
if (-not $message) {
    $message = "update: $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
}

Write-Host "`n📋 提交信息: $message" -ForegroundColor Cyan

# 1. 查看状态
Write-Host "`n📂 检查文件变更..." -ForegroundColor Yellow
& $git status --short

$changes = & $git status --porcelain
if (-not $changes) {
    Write-Host "✅ 没有变更，无需提交。" -ForegroundColor Green
    exit 0
}

# 2. 暂存所有变更
Write-Host "`n➕ 暂存文件..." -ForegroundColor Yellow
& $git add .

# 3. 提交
Write-Host "`n💾 提交中..." -ForegroundColor Yellow
& $git commit -m $message

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ 提交失败" -ForegroundColor Red
    exit 1
}

# 4. 推送
Write-Host "`n🚀 推送到 GitHub..." -ForegroundColor Yellow
& $git push

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ 推送成功！" -ForegroundColor Green
} else {
    Write-Host "`n❌ 推送失败，请检查网络或代理" -ForegroundColor Red
}
