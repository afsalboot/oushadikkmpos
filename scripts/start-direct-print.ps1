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
} catch {
    Write-Error $_
    exit 1
}
