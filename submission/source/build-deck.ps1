param([string]$ProjectRoot = (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent))
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Add-Type -AssemblyName System.Drawing
$sourceRoot = Join-Path $ProjectRoot 'submission\source'
$assetRoot = Join-Path $ProjectRoot 'submission\assets'
$reviewRoot = Join-Path $ProjectRoot '.artifacts\submission\native-review'
$stagingRoot = Join-Path $ProjectRoot '.artifacts\submission\rebuilt'
[void](New-Item -ItemType Directory -Force -Path $reviewRoot, $stagingRoot)
$deck = Get-Content -LiteralPath (Join-Path $sourceRoot 'deck.json') -Raw -Encoding UTF8 | ConvertFrom-Json

function Value($Object, [string]$Name, $Default) {
  $property = $Object.PSObject.Properties[$Name]
  if ($null -eq $property) { return $Default }
  return $property.Value
}
function Rgb([string]$Hex) {
  if ($Hex -notmatch '^[a-fA-F0-9]{6}$') { throw 'Invalid presentation colour' }
  return [Convert]::ToInt32($Hex.Substring(0, 2), 16) + 256 * [Convert]::ToInt32($Hex.Substring(2, 2), 16) + 65536 * [Convert]::ToInt32($Hex.Substring(4, 2), 16)
}

$existingPpt = @(Get-Process POWERPNT -ErrorAction SilentlyContinue).Count -gt 0
$application = New-Object -ComObject PowerPoint.Application
$presentation = $null
$validation = [Collections.Generic.List[object]]::new()
try {
  $presentation = $application.Presentations.Add($false)
  $presentation.PageSetup.SlideWidth = [single]$deck.width
  $presentation.PageSetup.SlideHeight = [single]$deck.height

  $slideIndex = 0
  foreach ($spec in $deck.slides) {
    $slideIndex++
    $slide = $presentation.Slides.Add($slideIndex, 12)
    $slide.Name = 'Teamfare ' + $slideIndex
    $textBounds = [Collections.Generic.List[object]]::new()
    $shapeIndex = 0
    foreach ($item in $spec.shapes) {
      $shapeIndex++
      $shape = $null
      switch ($item.type) {
        'rect' {
          $shape = $slide.Shapes.AddShape(1, [single]$item.x, [single]$item.y, [single]$item.w, [single]$item.h)
          $shape.Fill.Solid()
          $shape.Fill.ForeColor.RGB = Rgb $item.fill
          if ($null -eq $item.line) { $shape.Line.Visible = 0 } else { $shape.Line.Visible = -1; $shape.Line.ForeColor.RGB = Rgb $item.line; $shape.Line.Weight = 0.7 }
        }
        'line' {
          $shape = $slide.Shapes.AddLine([single]$item.x, [single]$item.y, [single]$item.x2, [single]$item.y2)
          $shape.Line.ForeColor.RGB = Rgb $item.color
          $shape.Line.Weight = [single]$item.width
          if ($item.arrow) { $shape.Line.EndArrowheadStyle = 3 }
        }
        'image' {
          $imagePath = Join-Path $assetRoot $item.image
          $shape = $slide.Shapes.AddPicture($imagePath, 0, -1, [single]$item.x, [single]$item.y, [single]$item.w, [single]$item.h)
          $shape.Line.Visible = -1
          $shape.Line.ForeColor.RGB = Rgb $item.line
          $shape.Line.Weight = 0.7
          $shape.AlternativeText = 'Live Teamfare application: ' + $item.image
        }
        'text' {
          $shape = $slide.Shapes.AddTextbox(1, [single]$item.x, [single]$item.y, [single]$item.w, [single]$item.h)
          $frame = $shape.TextFrame
          $frame.AutoSize = 0
          $frame.WordWrap = -1
          $frame.VerticalAnchor = 1
          $frame.MarginLeft = 0
          $frame.MarginRight = 6
          $frame.MarginTop = 0
          $frame.MarginBottom = 0
          $range = $frame.TextRange
          $range.Text = $item.text.Replace("`n", "`r")
          $range.Font.Name = $item.font
          $range.Font.Size = [single]$item.size
          $range.Font.Bold = $(if ($item.bold) { -1 } else { 0 })
          $range.Font.Color.RGB = Rgb $item.color
          $range.ParagraphFormat.SpaceBefore = 0
          $range.ParagraphFormat.SpaceAfter = 0
          $range.ParagraphFormat.LineRuleWithin = -1
          $range.ParagraphFormat.SpaceWithin = 1.08
          $alignment = Value $item 'align' 'left'
          $range.ParagraphFormat.Alignment = $(if ($alignment -eq 'center') { 2 } elseif ($alignment -eq 'right') { 3 } else { 1 })
          $href = Value $item 'href' $null
          if ($href) { $range.ActionSettings.Item(1).Hyperlink.Address = $href }
          $role = Value $item 'role' 'body'
          $actualTop = [double]$range.BoundTop
          $actualLeft = [double]$range.BoundLeft
          $actualHeight = [double]$range.BoundHeight
          $actualWidth = [double]$range.BoundWidth
          $issues = [Collections.Generic.List[string]]::new()
          if ($actualHeight -gt [double]$item.h + 1.5) { $issues.Add('Text taller than its frame') }
          if ($actualLeft -lt [double]$item.x - 1.5 -or $actualLeft + $actualWidth -gt [double]$item.x + [double]$item.w + 1.5) { $issues.Add('Text wider than its frame') }
          if ($role -ne 'footer' -and $actualTop + $actualHeight -gt 674) { $issues.Add('Body reaches the reserved footer area') }
          if ($actualTop -lt -1 -or $actualLeft -lt -1 -or $actualTop + $actualHeight -gt [double]$deck.height + 1 -or $actualLeft + $actualWidth -gt [double]$deck.width + 1) { $issues.Add('Text outside slide') }
          $textBounds.Add([pscustomobject]@{ shape = $shapeIndex; role = $role; text = $item.text; x = $actualLeft; y = $actualTop; w = $actualWidth; h = $actualHeight; issues = @($issues) })
        }
        default { throw ('Unknown native slide object: ' + $item.type) }
      }
      if ($null -ne $shape) { $shape.Name = $item.type + '-' + $shapeIndex }
    }
    if ($spec.notes) { $slide.NotesPage.Shapes.Placeholders.Item(2).TextFrame.TextRange.Text = $spec.notes }
    $collisions = [Collections.Generic.List[object]]::new()
    for ($a = 0; $a -lt $textBounds.Count; $a++) {
      for ($b = $a + 1; $b -lt $textBounds.Count; $b++) {
        $left = $textBounds[$a]; $right = $textBounds[$b]
        $overlapW = [Math]::Min($left.x + $left.w, $right.x + $right.w) - [Math]::Max($left.x, $right.x)
        $overlapH = [Math]::Min($left.y + $left.h, $right.y + $right.h) - [Math]::Max($left.y, $right.y)
        if ($overlapW -gt 2 -and $overlapH -gt 2) { $collisions.Add([pscustomobject]@{ first = $left.shape; second = $right.shape; firstText = $left.text; secondText = $right.text; overlapW = $overlapW; overlapH = $overlapH }) }
      }
    }
    $validation.Add([pscustomobject]@{ slide = $slideIndex; title = $spec.title; textBoxes = @($textBounds); collisions = @($collisions) })
  }
  $presentation.SaveAs((Join-Path $stagingRoot 'Teamfare-pitch-deck.pptx'), 24)
  # Native Office PDF export ensures the checked PowerPoint layout is the PDF layout.
  $presentation.SaveAs((Join-Path $stagingRoot 'Teamfare-pitch-deck.pdf'), 32)
  for ($n = 1; $n -le $presentation.Slides.Count; $n++) {
    $imagePath = Join-Path $reviewRoot ('slide-{0:d2}.png' -f $n)
    $presentation.Slides.Item($n).Export($imagePath, 'PNG', 1920, 1080)
  }
  $presentation.Slides.Item(1).Export((Join-Path $stagingRoot 'Teamfare-cover.png'), 'PNG', 1920, 1080)
  $report = [pscustomobject]@{ renderer = 'Microsoft PowerPoint native export'; font = $deck.font; pageCount = $presentation.Slides.Count; slides = @($validation) }
  $report | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $reviewRoot 'layout.json') -Encoding UTF8
  $issueCount = @($validation | ForEach-Object { $_.textBoxes | Where-Object { $_.issues.Count -gt 0 } }).Count
  $collisionCount = @($validation | ForEach-Object { $_.collisions }).Count
  Write-Output ($report | Select-Object renderer, font, pageCount | ConvertTo-Json -Compress)
  Write-Output ('Text frames with issues: {0}; text intersections: {1}' -f $issueCount, $collisionCount)
  if ($issueCount -gt 0 -or $collisionCount -gt 0) { throw 'The native slide layout needs review; final deliverables have not been replaced.' }
} finally {
  if ($null -ne $presentation) { $presentation.Saved = -1; $presentation.Close(); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($presentation) }
  if (-not $existingPpt) { $application.Quit() }
  [void][Runtime.InteropServices.Marshal]::ReleaseComObject($application)
}
