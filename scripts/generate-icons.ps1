Add-Type -AssemblyName System.Drawing

$srcPath = Join-Path $PSScriptRoot '..\public\user-icon.png'
if (-not (Test-Path $srcPath)) {
    $srcPath = 'public\user-icon.png'
}
$srcImg = [System.Drawing.Bitmap]::FromFile((Resolve-Path $srcPath).Path)

$densities = @(
    [PSCustomObject]@{ name = 'mdpi'; legacy = 48; adaptive = 108; fgSize = 72 },
    [PSCustomObject]@{ name = 'hdpi'; legacy = 72; adaptive = 162; fgSize = 108 },
    [PSCustomObject]@{ name = 'xhdpi'; legacy = 96; adaptive = 216; fgSize = 144 },
    [PSCustomObject]@{ name = 'xxhdpi'; legacy = 144; adaptive = 324; fgSize = 216 },
    [PSCustomObject]@{ name = 'xxxhdpi'; legacy = 192; adaptive = 432; fgSize = 288 }
)

foreach ($d in $densities) {
    $folder = "android\app\src\main\res\mipmap-$($d.name)"
    if (-not (Test-Path $folder)) {
        New-Item -ItemType Directory -Path $folder -Force | Out-Null
    }

    # 1. Legacy ic_launcher.png & ic_launcher_round.png
    $legacyBmp = New-Object System.Drawing.Bitmap($d.legacy, $d.legacy)
    $g = [System.Drawing.Graphics]::FromImage($legacyBmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.DrawImage($srcImg, 0, 0, $d.legacy, $d.legacy)
    $g.Dispose()

    $legacyBmp.Save("$folder\ic_launcher.png", [System.Drawing.Imaging.ImageFormat]::Png)
    $legacyBmp.Save("$folder\ic_launcher_round.png", [System.Drawing.Imaging.ImageFormat]::Png)
    $legacyBmp.Dispose()

    # 2. Adaptive ic_launcher_foreground.png (108dp canvas with centered icon)
    $fgBmp = New-Object System.Drawing.Bitmap($d.adaptive, $d.adaptive)
    $gFg = [System.Drawing.Graphics]::FromImage($fgBmp)
    $gFg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $gFg.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $gFg.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $gFg.Clear([System.Drawing.Color]::Transparent)

    $offset = [int](($d.adaptive - $d.fgSize) / 2)
    $gFg.DrawImage($srcImg, $offset, $offset, $d.fgSize, $d.fgSize)
    $gFg.Dispose()

    $fgBmp.Save("$folder\ic_launcher_foreground.png", [System.Drawing.Imaging.ImageFormat]::Png)
    $fgBmp.Dispose()

    Write-Host "Generated mipmap-$($d.name): legacy=$($d.legacy)x$($d.legacy), adaptive=$($d.adaptive)x$($d.adaptive) (fg=$($d.fgSize))"
}

$srcImg.Dispose()
Write-Host "All launcher icons generated successfully!"
