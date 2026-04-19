
#include <emscripten/emscripten.h>
#include <stdio.h>


EMSCRIPTEN_KEEPALIVE
void nothing(float dt) {
    // your simulation step
    printf("nothing\n");
}


