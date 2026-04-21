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



const ptr   = mod._get_particle_array();
const size  = mod._get_particle_size();
const radial_particle_integrate = mod.cwrap("radial_particle_integrate", null, ["number", "number"]);;
const hps_init                  = mod.cwrap("hps_init", null, []);

const ps_update = mod._ps_update;



console.log(mod, ptr, size, radial_particle_integrate);







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

        this.id = 0;

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

        const offset = real_ptr >> 3;

        // retrieving position.
        const x = mod.HEAPF64[offset + 7];
        const y = mod.HEAPF64[offset + 8];
        const orientation_angle = - Math.PI / 2 + Math.atan2(y - this.center_y, x - this.center_x);

        // transforming.
        this.element.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(${orientation_angle}rad)`;
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












class SvgTriangle {
    constructor() {
        const box = document.querySelector(".box");
        const ns = "http://www.w3.org/2000/svg";

        this.svg = document.createElementNS(ns, "svg");
        this.svg.setAttribute("viewBox", "0 0 10 10");
        this.svg.classList.add("small-triangle");

        this.shape = document.createElementNS(ns, "polygon");
        this.shape.setAttribute("points", "5,0 10,10 0,10");
        this.shape.setAttribute("fill", "rgb(239, 202, 108)");

        this.svg.appendChild(this.shape);
        box.appendChild(this.svg);
    }
}


export class GParticle {
    constructor(id, element) {
        this.id = id;
        this.element = element;
    }


    render() {
        // retrieving position.
        const x = this.view[0];
        const y = this.view[1];

        //console.log(this.id, x, y);
        //const orientation_angle = - Math.PI / 2 + Math.atan2(y - this.center_y, x - this.center_x);
        const orientation_angle = 1;

        // transforming.
        this.element.svg.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(${orientation_angle}rad)`;
    }
}


/**
 *  WEBGPU particle system scheduler.
 */
class ParticleSystemScheduler {
    /*  Constants */
    #buffer_length;
    #data_size;
    #buffer_size;

    /*  Compute pipeline */
    #adapter;
    #device;
    #shader;
    #bind_group;
    #pipeline;

    /*  Buffers */
    #gpu_main_buffer;
    #gpu_read_buffer;
    array_read_buffer;
    read_buffer;


    constructor() {
        /*  Constants */
        this.#buffer_length     = 4;
        this.#data_size         = 144;
        this.#buffer_size       = this.#buffer_length *  this.#data_size;
    }


    async create() {

        this.#adapter = await navigator.gpu.requestAdapter();
        console.log(this.#adapter.limits.maxStorageBufferBindingSize, this.#adapter.limits.maxBufferSize);

        this.#device = await this.#adapter.requestDevice({
            requiredLimits: {
                maxStorageBufferBindingSize: this.#adapter.limits.maxStorageBufferBindingSize,
            }
        });


        /*
         *  Creating the buffers.
         */

        this.#gpu_main_buffer = this.#device.createBuffer({
            size: this.#buffer_size,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST
        });


        this.#gpu_read_buffer = this.#device.createBuffer({
            size: this.#buffer_size,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
        });


        /* 
        const init_data = new Float32Array(this.#buffer_length * (this.#data_size / 4));
        for (let i = 0; i < this.#buffer_length * (this.#buffer_size / 4); ++ i)
            init_data[i] = i;
        */
        //const init_data = new Float32Array(this.#buffer_length * (this.#data_size / 4));
        //this.#device.queue.writeBuffer(this.#gpu_main_buffer, 0, init_data);


        /*
         *  Loading the shader.
         */


        const shader_code = await fetch("src/hps/particles.wgsl").then(r => r.text());
        this.#shader = this.#device.createShaderModule({ code: shader_code });

        this.#pipeline = this.#device.createComputePipeline({
            layout: "auto",
            compute: { module: this.#shader, entryPoint: "particle_update" }
        });

        this.#bind_group = this.#device.createBindGroup({
            layout: this.#pipeline.getBindGroupLayout(0),
            entries: [{
                binding: 0,
                resource: { buffer: this.#gpu_main_buffer }
            }]
        });
    }


    async dispatch(data) {

        // measuring performance.
        const perf_start = performance.now();


        if (data !== undefined) {
            /*
             *  Submitting data.
             */

            this.#device.queue.writeBuffer(this.#gpu_main_buffer, 0, data);
        }


        /*
         *  Compute pipeline
         */

        const encoder = this.#device.createCommandEncoder();

        const pass = encoder.beginComputePass();
        pass.setPipeline(this.#pipeline);
        pass.setBindGroup(0, this.#bind_group);
        pass.dispatchWorkgroups(Math.ceil(this.#buffer_length / 256));
        pass.end();


        // reading it...
        this.#gpu_read_buffer.unmap();
        encoder.copyBufferToBuffer(this.#gpu_main_buffer, 0, this.#gpu_read_buffer, 0, this.#buffer_size);

        // ok.
        this.#device.queue.submit([encoder.finish()]);
        //await this.#device.queue.onSubmittedWorkDone();


        const perf_end = performance.now();
        //console.log("TIME:" + (perf_end - perf_start));


        // reading buffer in the CPU.
        await this.#gpu_read_buffer.mapAsync(GPUMapMode.READ);

        this.array_read_buffer      = this.#gpu_read_buffer.getMappedRange();
        this.read_buffer            = new Float32Array(this.array_read_buffer);

        return this.read_buffer;
    }
}



export class ParticleSystemManager {
    constructor() {
        this.running = false;
        this._loop = this._loop.bind(this);
        this.gparticles = [];


        hps_init();
        this.ps_ptr = mod._ps_create();
        const offset = this.ps_ptr >> 2;
        mod.HEAPF32[offset + 0] = 0.5;
        mod.HEAPF32[offset + 1] = 0.0;

        // lifetime.
        mod.HEAPF32[offset + 2] = 2.0;
        mod.HEAPF32[offset + 3] = 0.0;

        // size.
        mod.HEAPF32[offset + 4] = 5.0;
        mod.HEAPF32[offset + 5] = 10.0;

        // spin.
        mod.HEAPF32[offset + 6] = 5.0;
        mod.HEAPF32[offset + 7] = 10.0;

        // color.
        mod.HEAPF32[offset + 8] = 1.0;
        mod.HEAPF32[offset + 9] = 1.0;
        mod.HEAPF32[offset + 10] = 1.0;
        mod.HEAPF32[offset + 11] = 1.0;

        mod.HEAPF32[offset + 12] = 0.0;
        mod.HEAPF32[offset + 13] = 0.0;
        mod.HEAPF32[offset + 14] = 0.0;
        mod.HEAPF32[offset + 15] = 1.0;

        // pos-space.
        mod.HEAPF32[offset + 16] = 0.0; mod.HEAPF32[offset + 17] = 0.0;
        mod.HEAPF32[offset + 18] = 100.0; mod.HEAPF32[offset + 19] = 100.0;

        // vel-space.
        mod.HEAPF32[offset + 20] = 20.0; mod.HEAPF32[offset + 21] = 20.0;
        mod.HEAPF32[offset + 22] = 20.0; mod.HEAPF32[offset + 23] = 20.0;

        mod.HEAPF32[offset + 28] = 0.0;

        this.particles_view = new Float32Array(mod.HEAPF32.buffer, this.ps_ptr + 128, 4 * (144 / 4));
    }


    async create() {
        this.pss = new ParticleSystemScheduler();
        await this.pss.create();

        for (let i = 0; i < 4; ++ i) {
            var gp = new GParticle(i, new SvgTriangle());
            gp.view = new Float32Array(mod.HEAPF32.buffer, this.ps_ptr + 128 + 144 * i, 144 / 4);
            this.gparticles.push(gp);
        }
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


    async _loop() {
        if (! this.running)
            return;


        // dispatching...
        //console.log(this.particles_view);
        const result = await this.pss.dispatch(this.particles_view);
        //console.log("Gathered: " + result, typeof(result));


        // synchronizing...
        //console.log(result.byteLength, result);
        this.particles_view.set(result);


        const size = mod._ps_size(this.ps_ptr);
        //console.log(size);
        for (let i = 0; i < size; ++ i) {
            const gparticle = this.gparticles[i];

            gparticle.render();
        }


        mod._ps_update(this.ps_ptr, 0.016);
        //mod._ps_destroy(ps_ptr);

        requestAnimationFrame(this._loop);
    }
}



async function init() {
    if (! navigator.gpu) {
        console.log("WebGPU not supported");
        return;
    }

}


await init();

