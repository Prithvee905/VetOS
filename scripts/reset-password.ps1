<#
.SYNOPSIS
    ClinicOS / VetOS — Super-Admin Password Reset Script (PowerShell / Windows)
.DESCRIPTION
    Resets the password for any user account on the platform.
.EXAMPLE
    .\scripts\reset-password.ps1 -Email "dr.sharma@citypet.com" -NewPassword "NewSecretPass@456"
#>
param(
    [Parameter(Mandatory=$true)]
    [string]$Email,

    [Parameter(Mandatory=$true)]
    [string]$NewPassword,

    [string]$Secret = "dev-platform-admin-secret-0001",
    [string]$ApiUrl = "http://localhost:8080/api/v1/platform-admin/reset-password"
)

$body = @{
    email       = $Email
    newPassword = $NewPassword
} | ConvertTo-Json

$headers = @{
    "Content-Type"             = "application/json"
    "X-Platform-Admin-Secret" = $Secret
}

try {
    Write-Host "[+] Resetting password for '$Email'..." -ForegroundColor Cyan
    $response = Invoke-RestMethod -Uri $ApiUrl -Method Post -Headers $headers -Body $body
    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host "  🔑 Password Successfully Reset!" -ForegroundColor Green
    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host "  User Email:    $Email"
    Write-Host "  New Password:  $NewPassword"
    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host "The client account is updated. You can provide them their new password." -ForegroundColor Yellow
} catch {
    Write-Host "[-] Failed to reset password: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails) {
        Write-Host "Details: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
}
