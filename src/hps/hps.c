/** @file       <hps/hps.c>
 *  @brief      Particle system.
 *  @date       April 2026.
 *  @author     @HexagonalUniverse
 */


#include <iso646.h>
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
#include "pcg-c-basic-0.9/pcg_basic.c"


/**
 *  Numeric type.
 */
typedef float num_t;


#define COSINE(_X)      cos(_X)
#define SINE(_X)        sin(_X)


/**
 *  2D vector.
 */
typedef struct v2_t {
    num_t x, y;
} v2;


/**
 *  3D vector.
 */
typedef struct v3_t {
    num_t x, y;
} v3;


/**
 *  4D vector.
 */
typedef struct v4_t {
    num_t x, y, z, w;
} v4;


static double random_lf(void)
{
    return (double) pcg32_random() / (double) (1llu << 32);
}


static num_t random_range(v2 range)
{
    const double a = random_lf();

    return range.x * a + range.y * (1.0 - a);
}


static v2 random_range2(v4 range2)
{
    return (v2) {
        .x = random_range((v2) { range2.x, range2.z }),
        .y = random_range((v2) { range2.y, range2.w }),
    };
}





/*
 *
 *  Particles
 *
 */

static uint64_t GLOBAL_particle_id = 0;


enum ParticleFlags {
    PARTICLE_RADIAL_MOVEMENT    = 0x01,
    PARTICLE_FREE_MOVEMENT      = 0x02,
};


/**
 *  Properties of particles to be interpolated.
 */
typedef struct particle_properties_t {
    v4      rgba;
    num_t   size;
    num_t   spin;
    num_t   __a;
    num_t   __b;
} ParticleProperties;


/**
 *  Represents a "free movement" particle.
 */
typedef struct particle_t {
    //uint64_t    id;
    v2          pos;
    v2          vel;
    v2          acc;

    num_t       life_span;      /**< How much it lives [s]. */
    num_t       time_alive;     /**< For how much it is alive [s]. */
    v2          fade;           /**< Fades in and out [s]. */

    num_t       asd;
    num_t       asd2;

    ParticleProperties prop;
    ParticleProperties from;
    ParticleProperties to;
    //uint64_t    flags;

#if 0
    union {
        /**
         *  Radial movement particle.
         */
        struct {
            num_t   radius;
            num_t   phase;
            num_t   angular_speed;
            v2      center;
        } radial;

        /**
         *  "Free" movement particle.
         */
        struct {
            v2      vel;
            v2      acc;
        } free;
    };
#endif


} Particle;


#if 0
if (p->flags & PARTICLE_RADIAL_MOVEMENT) {
    p->radial.phase += dT * p->radial.angular_speed;
    p->radial.phase = fmod(p->radial.phase, 2.0 * M_PI);

    p->pos = (v2) {
        .x = p->radial.center.x + p->radial.radius * COSINE(p->radial.phase),
        .y = p->radial.center.y + p->radial.radius * SINE(p->radial.phase),
    };
    }
#endif



typedef struct {
    /*
     *  Properties & emission
     */

    num_t   emission_period;
    num_t   emission_timer;

    v2      lifetime;
    v2      size;
    v2      spin;

    v4      initial_color;
    v4      target_color;

    v4      pos_space;  /**<    (x_min, y_min, x_max, y_max) */
    v4      vel_space;  /**<    (x_min, y_min, x_max, y_max) */
    v4      acc_space;  /**<    (x_min, y_min, x_max, y_max) */


    /*
     *  Particle control
     */

    uint64_t particle_count;
    uint64_t max_particles;

    Particle particles[4];

} ParticleSystem;



EXPORT uint64_t ps_size(ParticleSystem * const ps)
{
    if (ps == NULL)
        return 0;

    return ps->particle_count;
}



EXPORT ParticleSystem * ps_create(void)
{
    ParticleSystem * ps = (ParticleSystem *) malloc(sizeof(ParticleSystem));
    if (ps == NULL)
        return NULL;


    * ps = (ParticleSystem) { 0 };

    //ps->particles = malloc(sizeof(Particle) * 4);
    return ps;
}


EXPORT void ps_destroy(ParticleSystem * const ps)
{
    if (ps == NULL)
        return;

    //if (ps->particles != NULL) free(ps->particles);

    free(ps);
}


EXPORT bool ps_emmit(ParticleSystem * const ps)
{
    if (ps->particle_count >= 4)
        return false;


    Particle * const particle = ps->particles + ps->particle_count;

    //particle->id    = ++ GLOBAL_particle_id;

    particle->pos   = random_range2(ps->pos_space);
    particle->vel   = random_range2(ps->vel_space);
    particle->acc   = random_range2(ps->acc_space);

    particle->time_alive    = 0.0f;
    particle->life_span     = random_range((v2) { ps->lifetime.x - ps->lifetime.y, ps->lifetime.x + ps->lifetime.y} );
    particle->fade          = (v2) { 0.0f, 0.0f };

    particle->from = (ParticleProperties) {
        .rgba = ps->initial_color,
        .size = ps->size.x, // random_range((v2) { ps->size.x - ps->size.y, ps->size.x + ps->size.y }),
        .spin = ps->spin.x,
        .__a = 0.0f,
        .__b = 0.0f,
    };

    particle->to = (ParticleProperties) {
        .rgba = ps->target_color,
        .size = ps->size.y,
        .spin = ps->spin.y,
        .__a = 0.0f,
        .__b = 0.0f,
    };

    ++ ps->particle_count;

    return true;
}


EXPORT void ps_update(ParticleSystem * const ps, num_t dT)
{
    if (ps == NULL)
        return;


    if (1) {   /*  Compact */
        // @TODO currently naive: to be done on the GPU.
        for (uint64_t i = 0; i < ps->particle_count; ++ i) {
            const Particle * const particle = ps->particles + i;

            if (particle->time_alive >= particle->life_span) {
                // died.

                for (uint64_t j = i + 1; j < ps->particle_count; ++ j) {
                    const Particle * const particle2 = ps->particles + j;
                    ps->particles[j - 1] = ps->particles[j];
                }

                -- ps->particle_count;
                ps->particles[ps->particle_count] = (Particle) { 0 };
            }
        }
    }

    ps->emission_timer += dT;
    while (ps->emission_timer >= ps->emission_period) {
        ps->emission_timer -= ps->emission_period;

        if (! ps_emmit(ps))
            break;
    }
}












/*
 *
 *  OLD
 *
 */

typedef double anum_t;
typedef struct {
    double x, y;
} av2;

typedef struct RadialParticle {
    uint64_t    id;

    anum_t       life;
    anum_t       radius;
    anum_t       phase;
    anum_t       angular_speed;
    av2          center;
    av2          pos;
} RadialParticle;


EXPORT void radial_particle_integrate(RadialParticle * const p, anum_t dT)
{
    p->phase += dT * p->angular_speed;
    p->phase = fmod(p->phase, 2.0 * M_PI);

    p->life -= dT;

    p->pos = (av2) {
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


EXPORT void nothing(float dt) {
    printf("nothing\n");
}



/**
 *  Initializing the system.
 */
EXPORT void hps_init(void)
{
    pcg32_srandom(517u, 57u);

    fprintf(stdout, "[%s] Ok\n", __func__);
}

