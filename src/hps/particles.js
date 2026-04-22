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










let WINDOW_HEIGHT = 0.0;
let WINDOW_WIDTH = 0.0;


function update_viewport_size()
{
    const rect = document.querySelector(".bg").getBoundingClientRect();
    WINDOW_WIDTH  = rect.width;
    WINDOW_HEIGHT = rect.height;
}



class SvgTriangle {
    constructor() {
        const box = document.querySelector(".bg");
        const ns = "http://www.w3.org/2000/svg";

        this.svg = document.createElementNS(ns, "svg");
        this.svg.setAttribute("viewBox", "0 0 100 100");
        this.svg.setAttribute("preserveAspectRatio", "xMinYMin meet");
        this.svg.classList.add("small-triangle");

        this.shape = document.createElementNS(ns, "polygon");
        this.shape.setAttribute("points", "5,0 10,10 0,10");
        this.shape.setAttribute("fill", "rgb(239, 202, 108)");

        this.svg.appendChild(this.shape);
        box.appendChild(this.svg);
    }
}


/**
 *  Renders a particle.
 */
export class GraphicalParticle {
    constructor(id, element) {
        this.id = id; // just for...
        this.element = element;
    }


    render() {
        // retrieving position.
        const x = this.view[0];
        const y = this.view[1];

        const px = (x * WINDOW_WIDTH / 100.0);
        const py = (y * WINDOW_HEIGHT / 100.0);

        const vx = this.view[2];
        const vy = this.view[3];

        // 4, 5, 6, 7, 8, 9, 10, 11

        const r = (this.view[12] * 255) | 0; // APPARENTLY, FLOAT -> INT IS FASTER VIA THIS PIPE OPERATION.
        const g = (this.view[13] * 255) | 0;
        const b = (this.view[14] * 255) | 0;
        const a = this.view[15];

        const size = this.view[16];
        const spin = this.view[17];

        const orientation_angle = + Math.PI / 2 + Math.atan2(vy, vx);


        // transforming.
        this.element.svg.style.transform = `translate(${px}px, ${py}px) translate(-50%, -50%) rotate(${orientation_angle}rad) scale(${size})`;
        this.element.shape.setAttribute("fill", `rgb(${r}, ${g}, ${b})`);
        this.element.svg.setAttribute("fill-opacity", `${a}`);

    }
}



/*  Constants */
const buffer_length         = 1024;
const data_size             = 144;
const buffer_size           = buffer_length * data_size;
const ps_particle_offset    = 144;


/**
 *  WEBGPU particle system scheduler.
 */
class ParticleSystemScheduler {
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
        this.#buffer_length     = 1024;
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


function valid_number(number) {
    return number !== undefined && typeof number === "number";
}


function valid_tuple(obj) {
    return Array.isArray(obj) && obj.length === 2;
}


function parse_hex_to_f32(hex) {
    if (typeof hex !== "string" || hex[0] !== "#" || hex.length !== 9)
        return [1, 1, 1, 1];

    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const a = parseInt(hex.slice(7, 9), 16);

    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
        console.log("zebra");
        return [1, 1, 1, 1];
    }

    return [r / 255, g / 255, b / 255, a / 255];
}


function parse_space_on_heap(heap, base, src) {
    let min_x;
    let min_y;
    let max_x;
    let max_y;


    if (src && typeof src === "object")
    {
        if (typeof src["min-x"] === "number") min_x = src["min-x"];
        if (typeof src["min-y"] === "number") min_y = src["min-y"];
        if (typeof src["max-x"] === "number") max_x = src["max-x"];
        if (typeof src["max-y"] === "number") max_y = src["max-y"];
    }


    // x
    if (min_x === undefined && max_x === undefined)
    {
        min_x = 0.0;
        max_x = 0.0;
    }
    else if (min_x === undefined)
    {
        min_x = max_x;
    }
    else if (max_x === undefined)
    {
        max_x = min_x;
    }


    // y
    if (min_y === undefined && max_y === undefined)
    {
        min_y = 0.0;
        max_y = 0.0;
    }
    else if (min_y === undefined)
    {
        min_y = max_y;
    }
    else if (max_y === undefined)
    {
        max_y = min_y;
    }


    heap[base + 0] = min_x;
    heap[base + 1] = min_y;
    heap[base + 2] = max_x;
    heap[base + 3] = max_y;
}




export class ParticleSystemManager {

    /**
     *  Sets JSON configuration into the C-struct.
     *  @param cfg  The JSON.
     */
    set(cfg) {
        if (cfg === undefined)
            return;

        const offset = this.ps_ptr >> 2;


        if (valid_number(cfg["emission-period"]))
            mod.HEAPF32[offset + 0] = cfg["emission-period"];

        else if (valid_number(cfg["emission-frequency"]))
            mod.HEAPF32[offset + 0] = 1.0 / cfg["emission-frequency"];


        if (valid_number(cfg["lifespan"]))
            mod.HEAPF32[offset + 2] = cfg["lifespan"];


        if (valid_number(cfg["size"]))
            mod.HEAPF32[offset + 4] = 5.0;

        else if (valid_tuple(cfg["size"])) {
            mod.HEAPF32[offset + 4] = cfg["size"][0];
            mod.HEAPF32[offset + 5] = cfg["size"][1];
        }


        if (valid_number(cfg["spin"]))
            mod.HEAPF32[offset + 6] = 5.0;

        else if (valid_tuple(cfg["spin"])) {
            mod.HEAPF32[offset + 6] = cfg["spin"][0];
            mod.HEAPF32[offset + 7] = cfg["spin"][1];
        }


        if (valid_number(cfg["fade-in"]))
            mod.HEAPF32[offset + 28] = cfg["fade-in"];

        if (valid_number(cfg["fade-out"]))
            mod.HEAPF32[offset + 29] = cfg["fade-out"];


        var color = parse_hex_to_f32(cfg["initial-color"]);
        mod.HEAPF32[offset + 8]     = color[0];
        mod.HEAPF32[offset + 9]     = color[1];
        mod.HEAPF32[offset + 10]    = color[2];
        mod.HEAPF32[offset + 11]    = color[3];


        color = parse_hex_to_f32(cfg["target-color"]);
        mod.HEAPF32[offset + 12]    = color[0];
        mod.HEAPF32[offset + 13]    = color[1];
        mod.HEAPF32[offset + 14]    = color[2];
        mod.HEAPF32[offset + 15]    = color[3];


        parse_space_on_heap(mod.HEAPF32, offset + 16, cfg["pos-space"]);
        parse_space_on_heap(mod.HEAPF32, offset + 20, cfg["vel-space"]);
        parse_space_on_heap(mod.HEAPF32, offset + 24, cfg["acc-space"]);
    }



    constructor() {
        this.running = false;
        this._loop = this._loop.bind(this);
        this.gparticles = [];


        hps_init();
        this.ps_ptr = mod._ps_create();
        const offset = this.ps_ptr >> 2;
        mod.HEAPF32[offset + 0] = 0.1;
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

        mod.HEAPF32[offset + 24] = 20.0; mod.HEAPF32[offset + 25] = 20.0;
        mod.HEAPF32[offset + 26] = 20.0; mod.HEAPF32[offset + 27] = 20.0;

        mod.HEAPF32[offset + 28] = 0.0;

        this.particles_view = new Float32Array(mod.HEAPF32.buffer, this.ps_ptr + ps_particle_offset, buffer_length * (data_size / 4));
    }


    async create() {
        this.pss = new ParticleSystemScheduler();
        await this.pss.create();

        for (let i = 0; i < buffer_length; ++ i) {
            var gp = new GraphicalParticle(i, new SvgTriangle());
            gp.view = new Float32Array(mod.HEAPF32.buffer, this.ps_ptr + ps_particle_offset + data_size * i, data_size / 4);
            this.gparticles.push(gp);
        }


        const response = await fetch("src/bg-particle-effect.json");
        this.set(await response.json());
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

        update_viewport_size();


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

        for (let i = size; i < buffer_length; ++ i) {
            this.gparticles[i].element.svg.setAttribute("fill-opacity", `0`);
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

