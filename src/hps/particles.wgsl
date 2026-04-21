/**
 *  @file       <particles.wgsl>
 *  @brief      Particle system compute-shader.
 *  @date       April 2026
 *  @author     @HexagonalUniverse
 */


/*
 *
 *  Particles
 *
 */

/**
 *  Properties of particles to be interpolated.
 */
struct ParticleProperties {
    rgba        : vec4<f32>,
    size        : f32,
    spin        : f32,
    nothing_a   : f32,  // STILL UNDEFINED; KEPT FOR FOPADDING
    nothing_b   : f32,  // STILL UNDEFINED; KEPT FOR PADDING
}; // size: 32 [B]


struct Particle {
    pos             : vec2<f32>,
    vel             : vec2<f32>,
    acc             : vec2<f32>,

    lifespan        : f32,
    time_alive      : f32,
    fade            : vec2<f32>,

    asd             : f32,
    asd2            : f32,

    prop            : ParticleProperties,
    from_           : ParticleProperties,
    to_             : ParticleProperties,
}; // size: 144 [B]


struct EmissionProperties {
    period          : f32,
    timer           : f32,

    lifetime        : f32,
    lifetime_range  : f32,
};



@group(0) @binding(0)
var<storage, read_write> particles: array<Particle>;


@group(0) @binding(1)
var<storage, read_write> emission_properties: EmissionProperties;




/**
 *  Integrates particle's time.
 */
fn integrate(particle: ptr<storage, Particle, read_write>, delta_time: f32)
{
    (* particle).time_alive += delta_time;


    /*  Spatial information */
    (* particle).vel += (* particle).acc * delta_time;
    (* particle).pos += (* particle).vel * delta_time;
}


// @TODO uniform buffer
fn particle_interpolate(particle: ptr<storage, Particle, read_write>)
{
    // @todo CLIP
    let t : f32 = (* particle).time_alive / (* particle).lifespan;

    (* particle).prop.rgba  = (* particle).from_.rgba + t * ((* particle).from_.rgba - (* particle).to_.rgba);
    (* particle).prop.size  = (* particle).from_.size + t * ((* particle).from_.size - (* particle).to_.size);
    (* particle).prop.spin  = (* particle).from_.spin + t * ((* particle).from_.spin - (* particle).to_.spin);
}





/**
 *  Updates the particles.
 */
@compute @workgroup_size(256)
fn particle_update(@builtin(global_invocation_id) id: vec3<u32>)
{
    // thread index.
    let particle_index = id.x;


    if (particle_index >= arrayLength(&particles)) {
        return;
    }


    const delta_time : f32 = 1.0 / 60.0; // @TODO
    integrate(&particles[particle_index], delta_time);
    particle_interpolate(&particles[particle_index]);
}



@compute @workgroup_size(256)
fn ps_compact(@builtin(global_invocation_id) id: vec3<u32>)
{

    // thread index.
    let particle_index = id.x;

    const delta_time : f32 = 1.0 / 60.0; // @TODO
    integrate(&particles[particle_index], delta_time);
}

