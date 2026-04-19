/** @file       <hps/nothing.c>
 *  @brief      Particle system.
 *  @date       April 2026.
 *  @author     @HexagonalUniverse
 */


#if defined(__EMSCRIPTEN__)
#include <emscripten/emscripten.h>

#define EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define EXPORT

#endif


#include <inttypes.h>
#include <math.h>

#include <stdio.h>
#include <stdlib.h>



/*
 *
 *  Particles
 *
 */

typedef double num_t;
#define COSINE(_X)      cos(_X)
#define SINE(_X)        sin(_X)



typedef struct v2_t {
    num_t x, y;
} v2;


typedef struct RadialParticle {
    uint64_t id;

    num_t   life;
    num_t   radius;
    num_t   phase;
    num_t   angular_speed;
    v2      center;
    v2      pos;
} RadialParticle;


EXPORT void radial_particle_integrate(RadialParticle * const p, num_t dT)
{
    p->phase += dT * p->angular_speed;
    p->life -= dT;

    p->pos = (v2) {
        .x = p->center.x + p->radius * COSINE(p->phase),
        .y = p->center.y + p->radius * SINE(p->phase),
    };
}




static RadialParticle p_array[256] = { 0 };


EXPORT const uint64_t get_particle_size(void)
{
    return sizeof(RadialParticle);
}


EXPORT void * get_particle_array(void)
{
    return (void *) p_array;
}










/**
 * @todo
 */
typedef struct FreeParticle {
    uint64_t id;
    v2 pos;
    v2 vel;
    v2 acc;
} FreeParticle;


static void particle_integrate(FreeParticle * const p, num_t dT)
{   /*
     *  naïve integrator...
     */

    p->pos.x += p->vel.x * dT;
    p->pos.y += p->vel.y * dT;

    p->acc.x += p->vel.x * dT;
    p->acc.y += p->vel.y * dT;

}












EXPORT void nothing(float dt) {
    printf("nothing\n");
}


