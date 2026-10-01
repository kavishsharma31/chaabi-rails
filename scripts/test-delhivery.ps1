$BaseUrl = "http://localhost:3000"
$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$OutputFile = "eval-results\delhivery-$Timestamp.txt"

function Run-Test {
    param(
        [string]$Name,
        [string]$Endpoint,
        [string]$Body
    )

    Add-Content $OutputFile "========================================"
    Add-Content $OutputFile "TEST: $Name"
    Add-Content $OutputFile "TIME: $(Get-Date -Format o)"
    Add-Content $OutputFile "ENDPOINT: $Endpoint"
    Add-Content $OutputFile "INPUT:"
    Add-Content $OutputFile $Body

    $Started = Get-Date

    try {
        $response = Invoke-RestMethod `
            -Method POST `
            -Uri "$BaseUrl$Endpoint" `
            -ContentType "application/json" `
            -Body $Body

        $Duration = [math]::Round(((Get-Date) - $Started).TotalMilliseconds)

        Add-Content $OutputFile "STATUS: SUCCESS"
        Add-Content $OutputFile "LATENCY_MS: $Duration"
        Add-Content $OutputFile "OUTPUT:"
        Add-Content $OutputFile ($response | ConvertTo-Json -Depth 10)
    }
    catch {
        $Duration = [math]::Round(((Get-Date) - $Started).TotalMilliseconds)

        Add-Content $OutputFile "STATUS: ERROR"
        Add-Content $OutputFile "LATENCY_MS: $Duration"

        if ($_.Exception.Response) {
            Add-Content $OutputFile "HTTP_STATUS: $([int]$_.Exception.Response.StatusCode)"
        }

        Add-Content $OutputFile "ERROR:"
        Add-Content $OutputFile $_.Exception.Message
        Add-Content $OutputFile $_.ErrorDetails.Message
    }

    Add-Content $OutputFile ""
}

Run-Test `
    -Name "Validate - good address" `
    -Endpoint "/validate" `
    -Body '{"address":"H-36 1st floor residency greens sector 46 gurgaon","req_id":"ORDER-12345"}'

Run-Test `
    -Name "Validate - junk address" `
    -Endpoint "/validate" `
    -Body '{"address":"xyz","req_id":"VALIDATE-BAD"}'

Run-Test `
    -Name "Validate - incomplete address" `
    -Endpoint "/validate" `
    -Body '{"address":"sector 45 gurgaon","req_id":"VALIDATE-INCOMPLETE"}'

Run-Test `
    -Name "Validate - timeout" `
    -Endpoint "/validate" `
    -Body '{"address":"some address","req_id":"VALIDATE-TIMEOUT"}'

Write-Host ""
Write-Host "Tests complete."
Write-Host "Results saved to: $OutputFile"