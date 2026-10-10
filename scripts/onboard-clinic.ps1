<#
.SYNOPSIS
    ClinicOS / VetOS — Super-Admin Clinic Onboarding Script (PowerShell / Windows)
.DESCRIPTION
    Onboards a new clinic client with their email and initial password.
.EXAMPLE
    .\scripts\onboard-clinic.ps1 -ClinicName "City Pet Hospital" -Email "dr.sharma@citypet.com" -Password "SecretPass@123"
#>
param(
    [Parameter(Mandatory=$true)]
    [string]$ClinicName,

    [Parameter(Mandatory=$true)]
    [string]$Email,

    [Parameter(Mandatory=$true)]
    [string]$Password,

    [string]$DisplayName = "Clinic Owner",
    [string]$BranchName = "Main",
    [string]$Secret = "dev-platform-admin-secret-0001",
    [string]$ApiUrl = "http://localhost:8080/api/v1/platform-admin/onboard-clinic"
)

$body = @{
    clinicName  = $ClinicName
    email       = $Email
    password    = $Password
    displayName = $DisplayName
    branchName  = $BranchName
} | ConvertTo-Json

$headers = @{
    "Content-Type"             = "application/json"
    "X-Platform-Admin-Secret" = $Secret
}

try {
    Write-Host "[+] Onboarding new clinic '$ClinicName' for '$Email'..." -ForegroundColor Cyan
    $response = Invoke-RestMethod -Uri $ApiUrl -Method Post -Headers $headers -Body $body
    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host "  🎉 Clinic Successfully Onboarded!" -ForegroundColor Green
    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host "  Clinic Name:   $ClinicName"
    Write-Host "  Branch:        $BranchName"
    Write-Host "  Owner Name:    $DisplayName"
    Write-Host "  Login Email:   $Email"
    Write-Host "  Password:      $Password"
    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host "You can now hand these login credentials directly to your client." -ForegroundColor Yellow
} catch {
    Write-Host "[-] Failed to onboard clinic: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails) {
        Write-Host "Details: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
}
