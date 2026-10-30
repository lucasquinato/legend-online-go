param([string]$Version = '0.1.4')
$ErrorActionPreference = 'Stop'
if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw 'Versão deve ser X.Y.Z.' }
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$sourceRoot = Join-Path $repoRoot 'apps/launcher'
$framework = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319'
if (-not (Test-Path -LiteralPath (Join-Path $framework 'mscorlib.dll'))) { throw '.NET Framework 4.x não encontrado.' }
if (-not (Test-Path -LiteralPath (Join-Path $PSHOME 'Microsoft.CodeAnalysis.CSharp.dll'))) { throw 'Use PowerShell 7 com Roslyn disponível.' }
$publicKeyPath = Join-Path $repoRoot 'client/manifests/update-public.xml'
if (-not (Test-Path -LiteralPath $publicKeyPath)) { throw 'Chave pública de atualizações ausente no repositório.' }
$publicKey = [xml][IO.File]::ReadAllText($publicKeyPath)
if (-not $publicKey.RSAKeyValue.Modulus -or -not $publicKey.RSAKeyValue.Exponent -or $publicKey.RSAKeyValue.D) { throw 'Identidade pública de atualizações inválida.' }
$stage = Join-Path $repoRoot '.local/build'
$output = Join-Path $repoRoot 'dist/launcher'
New-Item -ItemType Directory -Force -Path $stage,$output | Out-Null
$key = [IO.File]::ReadAllText($publicKeyPath)
$trust = 'namespace LegendOnline { internal static class UpdateTrust { internal const string PublicKeyXml = @"' + $key.Replace('"','""') + '"; } }'
$trustPath = Join-Path $stage 'UpdateTrust.cs'; [IO.File]::WriteAllText($trustPath,$trust)
$info = [IO.File]::ReadAllText((Join-Path $sourceRoot 'Properties/AssemblyInfo.cs')) -replace '2\.0\.0\.0',($Version + '.0')
$infoPath = Join-Path $stage 'AssemblyInfo.cs'; [IO.File]::WriteAllText($infoPath,$info)
$compiler = @'
using System;
using System.IO;
using System.Linq;
using System.Text;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
public static class LauncherCompiler {
 public static void Build(string[] files,string framework,string output,string resources,bool console) {
  if(string.IsNullOrEmpty(resources))resources=null;
  var trees=files.Select(p=>CSharpSyntaxTree.ParseText(File.ReadAllText(p),new CSharpParseOptions(LanguageVersion.CSharp12),p,Encoding.UTF8));
  var refs=new[]{"mscorlib.dll","System.dll","System.Core.dll","System.Drawing.dll","System.Windows.Forms.dll","System.Web.Extensions.dll","System.Security.dll","Microsoft.CSharp.dll"}.Select(n=>MetadataReference.CreateFromFile(Path.Combine(framework,n)));
  var options=new CSharpCompilationOptions(console?OutputKind.ConsoleApplication:OutputKind.WindowsApplication,optimizationLevel:OptimizationLevel.Release,allowUnsafe:true);
  var c=CSharpCompilation.Create(Path.GetFileNameWithoutExtension(output),trees,refs,options);
  var embedded=resources==null?null:new[]{"LegendOnline.logo.png","LegendOnline.logo.ico"}.Select(n=>new ResourceDescription(n,()=>File.OpenRead(Path.Combine(resources,n)),true));
  using(var manifest=resources==null?null:File.OpenRead(Path.Combine(resources,"app.manifest")))
  using(var icon=resources==null?null:File.OpenRead(Path.Combine(resources,"app.ico")))
  using(var win32=c.CreateDefaultWin32Resources(true,false,manifest,icon))
  using(var stream=File.Create(output)) {
   var result=c.Emit(stream,win32Resources:win32,manifestResources:embedded);
   if(!result.Success)throw new Exception(string.Join(Environment.NewLine,result.Diagnostics.Where(d=>d.Severity==DiagnosticSeverity.Error)));
  }
 }
}
'@
$refs = @((Join-Path $PSHOME 'Microsoft.CodeAnalysis.dll'),(Join-Path $PSHOME 'Microsoft.CodeAnalysis.CSharp.dll'),(Join-Path $PSHOME 'System.Collections.Immutable.dll'))
$refs += (Get-ChildItem (Join-Path $PSHOME 'ref') -Filter '*.dll').FullName
Add-Type -TypeDefinition $compiler -ReferencedAssemblies $refs -CompilerOptions '/nowarn:1701'
$wire = Join-Path $repoRoot 'apps/updater/ReleaseWire.cs'
$files = @((Get-ChildItem -LiteralPath $sourceRoot -Recurse -Filter '*.cs' | Where-Object { $_.FullName -notmatch '[\\/](bin|obj)[\\/]' -and $_.Name -ne 'AssemblyInfo.cs' }).FullName) + @($trustPath,$infoPath,$wire)
[LauncherCompiler]::Build($files,$framework,(Join-Path $output 'LegendOnline.exe'),$sourceRoot,$false)
$updaterFiles = @((Join-Path $repoRoot 'apps/updater/Program.cs'),$wire,$trustPath)
[LauncherCompiler]::Build($updaterFiles,$framework,(Join-Path $output 'LegendOnline.Updater.exe'),$null,$true)
$runtime = Join-Path $repoRoot 'vendor/air-runtime'
if (-not (Test-Path -LiteralPath $runtime)) { throw 'Pacote do runtime AIR ausente.' }
Copy-Item -LiteralPath $runtime -Destination $output -Recurse -Force
@{ schema=1; version=$Version } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $output 'release.json') -Encoding utf8NoBOM
Write-Output "Launcher e updater compilados em $output ($Version). Runtime AIR preservado."
