New-Item -ItemType Directory -Path "public/src/hps/out" -Force | Out-Null

Copy-Item -Path "src/hps/out/*" -Destination "public/src/hps/out" -Recurse -Force