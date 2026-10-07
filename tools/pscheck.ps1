# Vérifie chaque script : analyse PowerShell + compilation du C# embarqué en C# 5, avertissements = erreurs
param([string[]]$Files)
$ok = $true
Add-Type -AssemblyName Microsoft.CodeAnalysis, Microsoft.CodeAnalysis.CSharp -ErrorAction SilentlyContinue
foreach ($n in "System.Drawing.Common","System.Drawing.Primitives","System.Drawing") { try { Add-Type -AssemblyName $n -ErrorAction Stop } catch {} }
foreach ($f in $Files) {
  $tokens = $null; $errs = $null
  $ast = [System.Management.Automation.Language.Parser]::ParseFile($f, [ref]$tokens, [ref]$errs)
  if ($errs.Count) { $ok = $false; Write-Output "PARSE $f"; $errs | ForEach-Object { Write-Output "  $($_.Extent.StartLineNumber): $($_.Message)" } ; continue }
  $here = $ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.StringConstantExpressionAst] -and $n.StringConstantType -eq 'SingleQuotedHereString' -and $n.Value -match 'class ' }, $true)
  foreach ($h in $here) {
    $code = $h.Value
    $opts = [Microsoft.CodeAnalysis.CSharp.CSharpParseOptions]::new([Microsoft.CodeAnalysis.CSharp.LanguageVersion]::CSharp5)
    $tree = [Microsoft.CodeAnalysis.CSharp.CSharpSyntaxTree]::ParseText($code, $opts)
    $refs = [System.Collections.Generic.List[Microsoft.CodeAnalysis.MetadataReference]]::new()
    foreach ($a in [AppDomain]::CurrentDomain.GetAssemblies()) { if (-not $a.IsDynamic -and $a.Location) { try { $refs.Add([Microsoft.CodeAnalysis.MetadataReference]::CreateFromFile($a.Location)) } catch {} } }
    $copts = [Microsoft.CodeAnalysis.CSharp.CSharpCompilationOptions]::new([Microsoft.CodeAnalysis.OutputKind]::DynamicallyLinkedLibrary).WithWarningLevel(4).WithAllowUnsafe($true)
    $comp = [Microsoft.CodeAnalysis.CSharp.CSharpCompilation]::Create("chk", [Microsoft.CodeAnalysis.SyntaxTree[]]@($tree), $refs, $copts)
    $diags = $comp.GetDiagnostics() | Where-Object { $_.Severity -ge [Microsoft.CodeAnalysis.DiagnosticSeverity]::Warning -and $_.Id -notin @('CS1701','CS1702','CS8019') }
    # types WinRT / Drawing absents sous Linux : on ignore les références manquantes
    $diags = $diags | Where-Object { $_.Id -notin @('CS0246','CS0234','CS0012','CS1069') }
    if ($diags) { $ok = $false; Write-Output "CSHARP $f"; $diags | ForEach-Object { Write-Output "  $($_.ToString())" } }
  }
  Write-Output "ok $f"
}
if (-not $ok) { exit 1 }
