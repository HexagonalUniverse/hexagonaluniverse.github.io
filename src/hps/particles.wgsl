/**
 *  @file       <particles.wgsl>
 *  @brief      Particle system compute-shader.
 *  @date       April 2026
 *  @author     @HexagonalUniverse
 */


/*
 *
 *  Layout
 *
 */

/**
 *  Properties of particles to be interpolated.
 */
struct ParticleProperties {
    rgba        : vec4<f32>,
    size        : f32,
    spin        : f32,
    nothing_a   : f32,  // STILL UNDEF.
    nothing_b   : f32,  // STILL UNDEF.
}; // size: 32 [B]


/**
 *  The particle entity.
 */
struct Particle {
    pos             : vec2<f32>,
    vel             : vec2<f32>,
    acc             : vec2<f32>,

    lifespan        : f32,
    time_alive      : f32,
    fade            : vec2<f32>,

    effect_id       : u32,
    asd2            : f32,

    prop            : ParticleProperties,
    from_           : ParticleProperties,
    to_             : ParticleProperties,
}; // size: 144 [B]


/**
 *  ...
 */
struct EmissionProperties {
    id              : u32,
    flags           : u32,

    // time-control.
    period          : f32,
    timer           : f32,

    lifetime        : f32,
    lifetime_var    : f32,

    fade_in         : f32,
    fade_in_var     : f32,

    fade_out        : f32,
    fade_out_var    : f32,

    align_a         : f32,
    align_b         : f32,

    // 12 x 4 = 48 [B]

    from_           : ParticleProperties,
    from_var        : ParticleProperties,

    to_             : ParticleProperties,
    to_var          : ParticleProperties,

    pos_space       : vec4<f32>,
    vel_space       : vec4<f32>,
    acc_space       : vec4<f32>
}; // size: 224 [B]


struct EffectController { // @TODO
    N: u32,
    a: u32,
    b: u32,
    c: u32,

    emission: EmissionProperties,
}; // 224 + 16 = 240 [B]



/**
 *  Global state and settings...
 */
struct GlobalSettings {
    N           : atomic<u32>,
    a           : f32,
    b           : f32,
    c           : f32,

    seed        : vec4<u32>,
};

const CHUNK_COUNT: u32  = 4u;
const CHUNK_LENGTH: u32 = 256u;
const DELTA_TIME: f32   = 1.0 / 60.0;



/**
 *  ...
 */
@group(0) @binding(0)
var <storage, read_write> settings: GlobalSettings;


/**
 *  ...
 */
@group(0) @binding(1)
var<storage, read_write> effects: array<EffectController>;



/**
 *  ...
 */
@group(0) @binding(2)
var<storage, read_write> particles: array<Particle>;


/**
 *  ...
 */
@group(0) @binding(3)
var<storage, read_write> particles_2: array<Particle>;


/**
 *  Binary mask that tracks which particles are active.
 */
@group(0) @binding(4)
var <storage, read_write> effective : array<u32>;


/**
 *  ...
 */
@group(0) @binding(5)
var <storage, read_write> offsets : array<u32>;



/**
 *  ...
 */
// @TODO discontinued...
@group(0) @binding(6)
var <storage, read_write> chunk_map: array<u32>;



/*
 *
 *  Effects
 *
 */

var <workgroup> t_chunk_offset  : array<u32, 128>;
var <workgroup> t_chunk_count   : array<u32, 128>;


/**
 *  Blellch scan alg.
 *
 *  Ref.: https://developer.download.nvidia.com/compute/cuda/2_2/sdk/website/projects/scan/doc/scan.pdf
 */
fn scan_chunk_map(index: u32, N: u32)
{

    /*
     *  Up-sweep
     */

    let l = firstLeadingBit(N); // floor of log2, essentially...

    for (var e : u32 = 0; e < l; e ++)
    {
        let step        = 1u << e;
        let next_step   = step << 1u;

        // for k from 0 to (n - 1) by 2^{e + 1} in parallel do
        let k = next_step * index;
        let r = k + next_step - 1;


        if (r < N) {
            t_chunk_offset[r] = t_chunk_offset[k + step - 1] +  t_chunk_offset[r];
        }

        workgroupBarrier();
    }


    /*
     *  Down-sweep
     */

    if (index == 0) {
        t_chunk_offset[N - 1] = 0;
    }


    workgroupBarrier();

    for (var e : i32 = i32(l) - 1; e >= 0; e --) {
        let step        = 1u << u32(e);
        let next_step   = step << 1u;


        // for k from 0 to (n - 1) by 2^{e + 1} in parallel do
        let k = next_step * index;
        let r = k + next_step - 1;

        if (r < N) {
            let t = t_chunk_offset[k + step - 1];
            t_chunk_offset[k + step - 1] = t_chunk_offset[r];
            t_chunk_offset[r] = t + t_chunk_offset[r];
        }

        workgroupBarrier();
    }
}


fn scatter_chunk_map(index: u32, N: u32)
{
    let count   = t_chunk_count[index];
    let offset  = t_chunk_offset[index];


    if (count + offset > N) {
        return;
    }

    for (var i : u32 = 0; i < count; i ++) {
        chunk_map[offset + i] = index;
    }
}


fn map_chunks(index: u32, M: u32)
{

    if ((index < M) && (M <= 128)) {
        // aí de fuder...

        // array of sizes.
        t_chunk_count[index]    = effects[index].N;
        t_chunk_offset[index]   = effects[index].N;
    }

    workgroupBarrier();


    // let N = 1u << u32(ceil(log2(f32(CHUNK_COUNT))));
    scan_chunk_map(index, 128);

    if (index < M) {
        scatter_chunk_map(index, CHUNK_COUNT);
    }
}



var<private> rnd : vec4u;
const SEED = 4;

fn init_rand(invocation_id : u32, seed : vec4u) {
    const A = vec4(1741651 * 1009,
                 140893  * 1609 * 13,
                 6521    * 983  * 7  * 2,
                 1109    * 509  * 83 * 11 * 3);
    rnd = (A * vec4u(invocation_id)) ^ seed;
}


fn rand() -> f32 {
    const C = vec4(60493  * 9377,
                 11279  * 2539 * 23,
                 7919   * 631  * 5  * 3,
                 1277   * 211  * 19 * 7 * 2);

    rnd = (rnd * C) ^ (rnd.yzwx >> vec4(4u));
    return f32(rnd.x ^ rnd.y) / f32(0xffffffff);
}


fn random_range(a: f32, b: f32) -> f32 {
    let u = rand();

    return a + (b - a) * u;
}


fn random_on_space(space: vec4<f32>) -> vec2f {
    return vec2f(
        random_range(space.x, space.z),
        random_range(space.y, space.w)
    );
}


fn emmit(index: u32)
{
    var emission = effects[index].emission;


    var N: u32 = atomicLoad(&settings.N);
    if (N >= CHUNK_LENGTH * CHUNK_COUNT) {
        return;
    }


    while (emission.timer > emission.period) {
        let old_N = atomicAdd(&settings.N, 1u);
        if (old_N >= CHUNK_LENGTH * CHUNK_COUNT) { // @TODO limit.
            break;
        }

        emission.timer -= emission.period;

        var particle = Particle();
        //particle.pos = random_on_space(emission.pos_space);
        particle.pos = random_on_space(vec4f(- 50.0, - 50.0, 50.0, 50.0));
        particle.vel = random_on_space(emission.vel_space);
        particle.acc = random_on_space(emission.acc_space);

        particle.time_alive = 0.0;
        //particle.lifespan = random_range(
        //    emission.lifetime - emission.lifetime_var,
        //    emission.lifetime + emission.lifetime_var
        //);
        particle.lifespan = 5.0;

        //particle.fade.x = random_range(
        //    emission.fade_in - emission.fade_in_var,
        //    emission.fade_in + emission.fade_in_var
        //);

        //particle.fade.y = random_range(
        //    emission.fade_out - emission.fade_out_var,
        //    emission.fade_out + emission.fade_out_var
        //);

        particle.fade.x = 0.25;
        particle.fade.y = 0.25;

        particle.from_.rgba = emission.from_.rgba;
        particle.to_.rgba   = emission.to_.rgba;

        particle.from_.size = emission.from_.size;
        particle.to_.size = emission.to_.size;

        particle.from_.spin = emission.from_.spin;
        particle.to_.spin = emission.to_.spin;


        particle.effect_id = index;

        // adding it...

        particles[old_N] = particle;
        effects[index].N += 1;
    }

    emission.timer += DELTA_TIME;

    effects[index].emission = emission;
}


@compute @workgroup_size(128)
fn effect_update(
    @builtin(local_invocation_id) l_id: vec3<u32>,
    @builtin(global_invocation_id) g_id: vec3<u32>)
{
    let index   = l_id.x;
    let M       = arrayLength(&effects);


    init_rand(g_id.x, settings.seed);

    map_chunks(index, M);


    if (effects[index].a == 0) {
        return;
    }

    emmit(index);
}




/*
 *
 *  Particles
 *
 */

var <workgroup> local_offsets       : array<u32, 128>;
var <workgroup> local_effective     : array<u32, 128>;


/**
 *  Blelloch scan alg.
 *
 *  @param  index   Particle index.
 *  @param  N       Number of particles in total...
 *  Ref.: https://developer.download.nvidia.com/compute/cuda/2_2/sdk/website/projects/scan/doc/scan.pdf
 */
fn scan_par_offsets(index: u32, N: u32)
{

    /*
     *  Up-sweep
     */

    // floor of log2, essentially...
    let l = firstLeadingBit(N);

    for (var e : u32 = 0; e < l; e ++)
    {   // e: exponent, that leads to the `step`.
        let step        = 1u << e;
        let next_step   = step << 1u;

        // for k from 0 to (n - 1) by 2^{e + 1} in parallel do
        let k = next_step * index;
        let r = k + next_step - 1;


        if (r < N) {
            local_offsets[r] = local_offsets[k + step - 1] +  local_offsets[r];
            offsets[r] = offsets[k + step - 1] +  offsets[r];
        }

        workgroupBarrier(); // sync~
    }


    /*
     *  Down-sweep
     */

    if (index == 0) { // only one need to set it...
        local_offsets[N - 1] = 0;
        offsets[N - 1] = 0;
    }


    workgroupBarrier(); // sync~

    for (var e : i32 = i32(l) - 1; e >= 0; e --) {
        let step        = 1u << u32(e);
        let next_step   = step << 1u;


        // for k from 0 to (n - 1) by 2^{e + 1} in parallel do
        let k = next_step * index;
        let r = k + next_step - 1;

        if (r < N) {
            let t = local_offsets[k + step - 1];
            local_offsets[k + step - 1] = local_offsets[r];
            local_offsets[r] = t + local_offsets[r];

            let t2 = offsets[k + step - 1];
            offsets[k + step - 1] = offsets[r];
            offsets[r] = t + offsets[r];
        }

        workgroupBarrier(); // sync~
    }
}


fn scatter_par(index: u32)
{
    if (local_effective[index] == 1u) {
        particles_2[
            local_offsets[index] - 1u
        ] = particles[index];
    }
}


@compute @workgroup_size(128)
fn par_compact(@builtin(global_invocation_id) global_invocation_id: vec3<u32>)
{
    let index: u32      = global_invocation_id.x;
    let N: u32          = arrayLength(&particles);
    let valid: bool     = index < N; // tracks if this is a valid thread...

    if (valid) {
        local_effective[index]      = u32(particles[index].time_alive < particles[index].lifespan);
        local_offsets[index]        = local_effective[index];

        effective[index]            = u32(particles[index].time_alive < particles[index].lifespan);
        offsets[index]              = effective[index];
    }


    workgroupBarrier(); // ~sync

    scan_par_offsets(index, N); // (there's sync. there so every thread must go...)


    if (valid) {
        scatter_par(index);
    }


    // copying the buffer over...
    workgroupBarrier(); // ~sync


    if (index == N - 1u) {
        var compact_count : u32 = local_offsets[N - 1u] + local_effective[N - 1u];
        atomicStore(&settings.N, compact_count);
    }


    if (valid) {
        particles[index] = particles_2[index];
    }
}







fn clip(x: f32) -> f32 {
    return max(0.0, min(1.0, x));
}


/**
 *  Integrates particle's time.
 */
fn particle_integrate(particle: ptr<storage, Particle, read_write>, delta_time: f32)
{
    (* particle).time_alive += delta_time;


    /*  Spatial information */
    (* particle).vel += (* particle).acc * delta_time;
    (* particle).pos += (* particle).vel * delta_time;
}


fn particle_interpolate(particle: ptr<storage, Particle, read_write>)
{
    let t : f32 = clip((* particle).time_alive / (* particle).lifespan);

    (* particle).prop.rgba  = (* particle).from_.rgba + t * ((* particle).to_.rgba - (* particle).from_.rgba);


    /*  fade */
    // u\left(x\right)=\max\left(0,\ \min\left(\frac{H\min\left(\frac{x-L_{a}}{\alpha},\ \frac{L_{b}-x}{\beta}\right)}{\left(L_{b}-L_{a}\right)},\ H\right)\right)
    let x: f32              = (* particle).time_alive;
    let u2 : f32            = min(x / (* particle).fade.x, ((* particle).lifespan - x) / (* particle).fade.y);
    let u1 : f32            = min(1.0, u2);
    let u : f32             = max(0.0, u1);

    // multiplicative alpha-effect.
    (* particle).prop.rgba.w *= u;


    (* particle).prop.size  = (* particle).from_.size + t * ((* particle).to_.size - (* particle).from_.size);
    (* particle).prop.spin  = (* particle).from_.spin + t * ((* particle).to_.spin - (* particle).from_.spin);
}


/**
 *  Updates the particle.
 */
@compute @workgroup_size(128)
fn particle_update(@builtin(global_invocation_id) id: vec3<u32>)
{
    // indexing.
    let chunk_index     = id.x / CHUNK_LENGTH;

    //if (id.x >= arrayLength(&particles)) { // ) || (chunk_index >= CHUNK_COUNT)
    //    // invalid thread index.
    //    return;
    //}

    let particle_index  = id.x % CHUNK_LENGTH;
    let effect_id       = chunk_map[chunk_index];




    if (particle_index >= effects[effect_id].N) {
        //return;
    }



    particle_integrate(&particles[particle_index], DELTA_TIME);
    particle_interpolate(&particles[particle_index]);
}




