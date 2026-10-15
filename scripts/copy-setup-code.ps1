$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$protectedPath = Join-Path $taskRoot '.local/production-setup-code.dpapi'
$secureCode = (Get-Content -LiteralPath $protectedPath -Raw).Trim() | ConvertTo-SecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureCode)
try {
  Set-Clipboard -Value ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer))
  Write-Host 'Initial setup code copied. Paste it into the MIXROOM administrator registration form.'
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
}
