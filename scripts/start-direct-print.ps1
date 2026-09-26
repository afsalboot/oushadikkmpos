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

    $receiptBrowserCandidates = @(
        "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
        "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
        "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
    )
    $receiptBrowser = $receiptBrowserCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    if (!$receiptBrowser) { throw 'Google Chrome is required for this direct-print launcher.' }

    # Separate profile prevents an existing ordinary browser session from swallowing
    # the printing flags. No account-wide policy or default-printer changes.
    $receiptEnvironment = if ($Url -eq 'https://oushadikkmpos.vercel.app') { 'Production' } else { 'Local' }
    $receiptProfile = Join-Path $env:LOCALAPPDATA ('OushadhiPOS\DirectPrintChrome-' + $receiptEnvironment)
    $receiptExpectedApp = [regex]::Escape($Url + '/sales')
    $receiptAppPattern = '--app="?' + $receiptExpectedApp + '"?(?:\s|$)'
    function Get-ReceiptBrowser {
        Get-CimInstance Win32_Process -Filter "Name = 'chrome.exe'" |
            Where-Object {
                $_.CommandLine -and
                $_.CommandLine -notmatch '--type=' -and
                $_.CommandLine.Contains($receiptProfile)
            } | Select-Object -First 1
    }
    $receiptExistingBrowser = Get-ReceiptBrowser
    if ($receiptExistingBrowser -and (
        $receiptExistingBrowser.CommandLine -notmatch '(?:^|\s)--kiosk-printing(?:\s|$)' -or
        $receiptExistingBrowser.CommandLine -notmatch '(?:^|\s)--use-system-default-printer(?:\s|$)' -or
        $receiptExistingBrowser.CommandLine -notmatch $receiptAppPattern
    )) {
        throw 'This dedicated POS profile is open with a different address or without direct-print flags. Close its windows and run this launcher again.'
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
    Write-Output "Environment: $receiptEnvironment"
    Write-Output "Dedicated browser profile: $receiptProfile"
    if ($CheckOnly) { Write-Output 'Configuration check passed; no browser opened and no receipt printed.'; exit 0 }

    # This is the interactive POS window the cashier will use.
    Start-Process -FilePath $receiptBrowser -ArgumentList $receiptArguments -WindowStyle Normal
    $receiptVerifiedBrowser = $null
    for ($receiptAttempt = 0; $receiptAttempt -lt 20; $receiptAttempt++) {
        $receiptVerifiedBrowser = Get-ReceiptBrowser
        if ($receiptVerifiedBrowser) { break }
        Start-Sleep -Milliseconds 500
    }
    if (!$receiptVerifiedBrowser -or
        $receiptVerifiedBrowser.CommandLine -notmatch '(?:^|\s)--kiosk-printing(?:\s|$)' -or
        $receiptVerifiedBrowser.CommandLine -notmatch '(?:^|\s)--use-system-default-printer(?:\s|$)' -or
        $receiptVerifiedBrowser.CommandLine -notmatch $receiptAppPattern) {
        throw 'Direct-print launch could not be verified. Do not use an ordinary browser or installed-app shortcut for silent printing.'
    }
    Write-Output "Verified dedicated Chrome process $($receiptVerifiedBrowser.ProcessId): $receiptEnvironment address, silent-print and default-printer flags are active."
    Write-Output 'Physical printing is not verified until an existing receipt is reprinted in this window.'
} catch {
    [Console]::Error.WriteLine('Direct print could not start: ' + $_.Exception.Message)
    exit 1
}
