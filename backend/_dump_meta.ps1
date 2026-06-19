$f = "C:\Users\mscott\AI_Workspace\prolificcapital\divinitycrm\backend\src\services\stage-automations.js"
$content = Get-Content $f
$out = @()
for($i=0; $i -lt $content.Count; $i++){
  $l = $content[$i]
  # Capture STAGE markers
  if($l -match "^\s*//\s*STAGE \d|^\s*//\s*\*\s*→\s*DEAD|^\s*//\s*Owner:|^\s*//\s*===|^\s*//\s*---"){
    $out += "$($i+1): $($l.Trim())"
  }
}
$out | Out-File -FilePath "C:\Users\mscott\AI_Workspace\prolificcapital\divinitycrm\backend\_audit_meta.txt" -Encoding utf8
Write-Host "Done. Lines: $($out.Count)"
