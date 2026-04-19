/** @file       <src/hps/particles.js>
 *  @brief      Particle animations.
 *  @details    Wrapper over the WASM module.
 *  @date       Created on April 2026.
 *  @author     @HexagonalUniverse
 */


import createModule from "./out/tmnc.auto.js";
const mod = await createModule();
const nothing = mod.cwrap("nothing", null, ["number"]);
nothing(1.6);

mod.onRuntimeInitialized = () => {
    // SAFE: HEAPU64 / HEAPF64 exist here
    console.log("CARREGOU PORRA");
};


const ptr = mod._get_particle_array();
const size = mod._get_particle_size();
const radial_particle_integrate = mod.cwrap("radial_particle_integrate", null, ["number", "number"]);;




console.log(mod, ptr, size, radial_particle_integrate);


var particles = [];



/**
 *  A particle that orbits around a given center, radius, and angular-speed.
 */
export class RadialParticle
{
    constructor(element,
                lifespan = 5.0,
                center_x = 0.0,
                center_y = 0.0,
                radius = 1.0,
                phase = 0.0,
                angular_speed = 1.0
                ) {

        this.id = particles.length;
        particles.push(this);


        const offset = (ptr + Number(size) * this.id) >> 3;
        mod.HEAPU64[offset] = BigInt(this.id);
        mod.HEAPF64[offset + 1] = lifespan;
        mod.HEAPF64[offset + 2] = radius;
        mod.HEAPF64[offset + 3] = phase;
        mod.HEAPF64[offset + 4] = angular_speed;
        mod.HEAPF64[offset + 5] = center_x;
        mod.HEAPF64[offset + 6] = center_y;


        // correspondent HTML element.
        this.element    = element;

        // position.
        this.center_x   = center_x;
        this.center_y   = center_y;
        this.radius     = radius;

        // angle.
        this.phase          = phase;
        this.angular_speed  = angular_speed;

        this.life = lifespan;
    }


    update(delta_time, dx = 0, dy = 0) 
    {
        const real_ptr = Number(ptr) + Number(size) * this.id;
        radial_particle_integrate(real_ptr, delta_time);

        // parametric coordinates.
        const offset = real_ptr >> 3;
        const x = mod.HEAPF64[offset + 7];
        const y = mod.HEAPF64[offset + 8];

        // transforming.
        this.element.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    }


    is_dead() {
        return this.life <= 0.0;
    }
}


export class Orbital {
    constructor() {
        this.particles  = [];
        this.running    = false;

        this._loop = this._loop.bind(this);
    }


    add(particle) {
        this.particles.push(particle);
    }


    start() {
        if (this.running)
            return;

        this.running = true;
        requestAnimationFrame(this._loop);
    }


    stop() {
        this.running = false;
    }

    
    _loop() {
        if (! this.running)
            return;

        
        for (let i = this.particles.length - 1; i >= 0; -- i) {
            const particle = this.particles[i];
            
            particle.update(1 / 60.0);

            if (particle.is_dead()) {
                particle.element.remove();
                this.particles.splice(i, 1);
            }
        }
        
        requestAnimationFrame(this._loop);
    }
}
