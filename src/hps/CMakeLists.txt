#   <CMakeLists.txt>
#   ----------------
#
#   Root cmake.
#

cmake_minimum_required(VERSION 4.0.3)



#
#   Emscripten tool-chain.
#

option(BUILD_WASM "Build WebAssembly via Emscripten" OFF)
if (BUILD_WASM)
    set(CMAKE_TOOLCHAIN_FILE
            "$ENV{EMSDK}/upstream/emscripten/cmake/Modules/Platform/Emscripten.cmake"
            CACHE STRING "" FORCE)
endif ()



#
#   The project
#

project(hps VERSION 0.1.0 LANGUAGES C)

set(CMAKE_RUNTIME_OUTPUT_DIRECTORY "${PROJECT_SOURCE_DIR}/out")
set(CMAKE_LIBRARY_OUTPUT_DIRECTORY "${PROJECT_SOURCE_DIR}/out")
set(CMAKE_ARCHIVE_OUTPUT_DIRECTORY "${PROJECT_SOURCE_DIR}/out")
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)


add_executable(THE-GREATEST-EXECUTABLE-THIS-WORLD-HAS-EVER-AND-WILL-EVER-SEE nothing.c)


set_target_properties(THE-GREATEST-EXECUTABLE-THIS-WORLD-HAS-EVER-AND-WILL-EVER-SEE PROPERTIES
        OUTPUT_NAME "tmnc.auto"
)


target_link_options(THE-GREATEST-EXECUTABLE-THIS-WORLD-HAS-EVER-AND-WILL-EVER-SEE PRIVATE
        "-sMODULARIZE=1"
        "-sEXPORT_ES6=1"
        "-sWASM=1"
        "-sEXPORTED_FUNCTIONS=_nothing"
        "-sEXPORTED_RUNTIME_METHODS=ccall,cwrap"
)