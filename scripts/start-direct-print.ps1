param(
    [ValidateSet('https://oushadikkmpos.vercel.app', 'http://localhost:3000')]
    [string]$Url = 'https://oushadikkmpos.vercel.app',
    [switch]$CheckOnly
)

$ErrorActionPreference = 'Stop'

try {
    $receiptPrinter = Get-CimInstance Win32_Printer | Where-Object { $_.Default } | Select-Object -First 1
    if (!$receiptPrinter -or $receiptPrinter.Name -ne 'POS80') {
        throw 'Set POS80 as the Windows default printer before opening direct-print mode.'
    }

    $receiptEdgeCandidates = @(
        "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
        "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
        "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe"
    )
    $receiptEdge = $receiptEdgeCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    if (!$receiptEdge) { throw 'Microsoft Edge was not found.' }

    # Separate profile prevents an existing ordinary Edge session from swallowing
    # the printing flags. No account-wide policy or default-printer changes.
    $receiptProfile = Join-Path $env:LOCALAPPDATA 'OushadhiPOS\DirectPrintEdge'
    function Get-ReceiptBrowser {
        Get-CimInstance Win32_Process -Filter "Name = 'msedge.exe'" |
            Where-Object {
                $_.CommandLine -and
                $_.CommandLine -notmatch '--type=' -and
                $_.CommandLine.Contains($receiptProfile)
            } | Select-Object -First 1
    }
    $receiptExistingBrowser = Get-ReceiptBrowser
    if ($receiptExistingBrowser -and (
        $receiptExistingBrowser.CommandLine -notmatch '(?:^|\s)--kiosk-printing(?:\s|$)' -or
        $receiptExistingBrowser.CommandLine -notmatch '(?:^|\s)--use-system-default-printer(?:\s|$)'
    )) {
        throw 'The dedicated POS profile is already open without direct-print flags. Close its windows and run this launcher again.'
    }
    $receiptArguments = @(
        ('--user-data-dir="' + $receiptProfile + '"'),
        '--kiosk-printing',
        '--use-system-default-printer',
        '--no-first-run',
        '--no-default-browser-check',
        ('--app="' + $Url + '/sales"')
    )
    Write-Output "Printer: $($receiptPrinter.Name)"
    Write-Output "POS address: $Url/sales"
    Write-Output "Dedicated browser profile: $receiptProfile"
    if ($CheckOnly) { Write-Output 'Configuration check passed; no browser opened and no receipt printed.'; exit 0 }

    # This is the interactive POS window the cashier will use.
    Start-Process -FilePath $receiptEdge -ArgumentList $receiptArguments -WindowStyle Normal
    $receiptVerifiedBrowser = $null
    for ($receiptAttempt = 0; $receiptAttempt -lt 20; $receiptAttempt++) {
        $receiptVerifiedBrowser = Get-ReceiptBrowser
        if ($receiptVerifiedBrowser) { break }
        Start-Sleep -Milliseconds 500
    }
    if (!$receiptVerifiedBrowser -or
        $receiptVerifiedBrowser.CommandLine -notmatch '(?:^|\s)--kiosk-printing(?:\s|$)' -or
        $receiptVerifiedBrowser.CommandLine -notmatch '(?:^|\s)--use-system-default-printer(?:\s|$)') {
        throw 'Direct-print launch could not be verified. Do not use an ordinary Edge or installed-app shortcut for silent printing.'
    }
    Write-Output "Verified dedicated Edge process $($receiptVerifiedBrowser.ProcessId): silent-print and default-printer flags are active."
    Write-Output 'Physical printing is not verified until an existing receipt is reprinted in this window.'
} catch {
    Write-Error $_
    exit 1
}
