Add-Type -AssemblyName System.Drawing
$bmp192 = New-Object System.Drawing.Bitmap(192, 192)
$g192 = [System.Drawing.Graphics]::FromImage($bmp192)
$g192.Clear([System.Drawing.Color]::MediumTurquoise)
$g192.Dispose()
$bmp192.Save('c:\Users\Laptop Duhok\Desktop\taher1212\taher1212\icon-192.png', [System.Drawing.Imaging.ImageFormat]::Png)
$bmp192.Dispose()

$bmp512 = New-Object System.Drawing.Bitmap(512, 512)
$g512 = [System.Drawing.Graphics]::FromImage($bmp512)
$g512.Clear([System.Drawing.Color]::MediumTurquoise)
$g512.Dispose()
$bmp512.Save('c:\Users\Laptop Duhok\Desktop\taher1212\taher1212\icon-512.png', [System.Drawing.Imaging.ImageFormat]::Png)
$bmp512.Dispose()
