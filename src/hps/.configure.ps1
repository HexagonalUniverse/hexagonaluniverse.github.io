
$env:EMSDK = "$env:USERPROFILE\dev\downloads\emsdk"


cmake `
    -DCMAKE_BUILD_TYPE=Release `
    -DBUILD_WASM=ON `
    -G `
    "MinGW Makefiles" `
    -S "src\hps" `
    -B "src\hps\cmake-build"
