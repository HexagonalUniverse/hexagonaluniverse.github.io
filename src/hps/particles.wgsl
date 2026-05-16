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

    asd             : f32,
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
}; // 240 [B]



/**
 *  ...
 */
struct GlobalSettings {
    nada: f32,
    a: f32,
    b: f32,
    c: f32,

    seed: vec4<u32>,
};

const CHUNK_COUNT: u32  = 32u;
const CHUNK_LENGTH: u32 = 128u;
const DELTA_TIME: f32   = 1.0 / 60.0;



@group(0) @binding(0)
var <storage, read_write> settings: GlobalSettings;


@group(0) @binding(1)
var<storage, read_write> effects: array<EffectController>;


@group(0) @binding(2)
var<storage, read_write> particles: array<Particle>;


@group(0) @binding(3)
var <storage, read_write> chunk_map: array<u32>;





/*
 *
 *  Effects
 *
 */

var <workgroup> t_chunk_offset : array<u32, 128>;
var <workgroup> t_chunk_count : array<u32, 128>;


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
    while (emission.timer > 5.0) {
        emission.timer -= 5.0;

        var particle = Particle();
        //particle.pos = random_on_space(emission.pos_space);
        particle.pos = random_on_space(vec4f(- 50.0, - 50.0, 50.0, 50.0));
        particle.vel = random_on_space(vec4f(- 50.0, - 50.0, 50.0, 50.0));

        particles[CHUNK_LENGTH * index + effects[index].N] = particle;
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
    emmit(index);
}




/*
 *
 *  Particles
 *
 */

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

    if ((id.x >= arrayLength(&particles)) || (chunk_index >= CHUNK_COUNT)) {
        // invalid thread index.
        return;
    }

    let particle_index  = id.x % CHUNK_LENGTH;
    let effect_id       = chunk_map[chunk_index];

    if (particle_index >= effects[effect_id].N) {
        return;
    }


    if (effect_id == 2) {
        //particles[particle_index].prop.rgba = vec4(1.0, 1.0, 1.0, 1.0);
    }



    particle_integrate(&particles[particle_index], DELTA_TIME);
    particle_interpolate(&particles[particle_index]);
}




