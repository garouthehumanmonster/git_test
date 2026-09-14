Add-Type -AssemblyName System.Speech
$voiceDir = "c:\Users\Divyansh\Desktop\Projects\timeline-war\public\voice"
if (-not (Test-Path $voiceDir)) { New-Item -ItemType Directory -Path $voiceDir | Out-Null }
$lines = @(
    @("battle_begins.wav", "Battle begins!"),
    @("stone_age.wav", "Stone age!"),
    @("medieval_age.wav", "Medieval age!"),
    @("modern_age.wav", "Modern age!"),
    @("victory.wav", "Victory! Enemy base destroyed!"),
    @("defeat.wav", "Defeat! Your base has fallen!"),
    @("reinforcements.wav", "Reinforcements incoming!"),
    @("base_low.wav", "Warning! Base under attack!")
)
foreach ($pair in $lines) {
    $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
    $synth.Rate = 1
    $synth.Volume = 100
    $outPath = Join-Path $voiceDir $pair[0]
    $synth.SetOutputToWaveFile($outPath)
    $synth.Speak($pair[1])
    $synth.Dispose()
    Write-Host ("Generated: " + $pair[0])
}