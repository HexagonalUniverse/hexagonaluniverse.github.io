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















/*
 *  Constants
 */


const GLOBAL_SETTINGS_DATA_SIZE     = 32; // [B]
const EFFECT_CONTROLLER_DATA_SIZE   = 240; // [B]
const PARTICLE_DATA_SIZE            = 144; // [B]

const CHUNK_LENGTH                  = 16; // [u.]
const CHUNK_SIZE                    = CHUNK_LENGTH * PARTICLE_DATA_SIZE; // [B]
const CHUNK_COUNT                   = 8;


/**
 *  Particle system compute processor.
 *
 *  @details    WEBGPU compute shader particle system scheduler.
 */
class Processor {
    /*  Compute pipeline */

    #adapter;   // ref.
    #device;    // ref.
    #shader;    // owns.


    #bind_group;
    #bind_group_layout;
    #pipeline_layout;
    #pipeline_particle;
    #pipeline_effect;
    #pipeline_compact;
    #pipeline_compact_0;
    #pipeline_compact_1;
    #pipeline_compact_2;


    #chunks_allocated;
    #currently_allocated;

    #gbuffer_settings;
    #gbuffer_particles;
    #gbuffer_particles_2;
    #gbuffer_effective;
    #gbuffer_offsets;
    #gbuffer_effects;
    #gbuffer_chunk_map;
    #gbuffer_scan_psum_0;

    read_buffer;
    read_buffer_gs;

    constructor() {
        this.#chunks_allocated      = 0;
        this.#currently_allocated   = 0;
    }


    get_setting_buffer() {
        return this.#gbuffer_settings;
    }

    get_particle_buffer() {
        return this.#gbuffer_particles;
    }

    get_effect_buffer() {
        return this.#gbuffer_effects;
    }

    get_chunk_map_buffer() {
        return this.#gbuffer_chunk_map;
    }


    _bind() {
        this.#bind_group = this.#device.createBindGroup({
            // layout: this.#pipeline_effect.getBindGroupLayout(0),
            layout: this.#bind_group_layout,

            entries: [
                {
                    binding: 0,
                    resource: {
                        buffer: this.#gbuffer_settings,
                    },
                },

                {
                    binding: 1,
                    resource: {
                        buffer: this.#gbuffer_effects,
                    },
                },
                {
                    binding: 2,
                    resource: {
                        buffer: this.#gbuffer_particles,
                    },
                },
                {
                    binding: 3,
                    resource: {
                        buffer: this.#gbuffer_particles_2,
                    },
                },
                {
                    binding: 4,
                    resource: {
                        buffer: this.#gbuffer_effective,
                    },
                },
                {
                    binding: 5,
                    resource: {
                        buffer: this.#gbuffer_offsets,
                    },
                },
                {
                    binding: 6,
                    resource: {
                        buffer: this.#gbuffer_chunk_map,
                    },
                },
                {
                    binding: 7,
                    resource: {
                        buffer: this.#gbuffer_scan_psum_0,
                    },
                },
            ],
        });

    }


    /**
     *  Reallocates the particles buffer.
     *
     *  @param length The length of the buffer, in units of particles.
     */
    _reallocate_particles(length) {
        if (length < this.#currently_allocated) {
            return;
        }


        // the chunks are allocated in a exponential manner.
        //const chunks        = Math.ceil(length / CHUNK_LENGTH);
        const chunks        = CHUNK_COUNT;
        const log2          = Math.ceil(Math.log2(chunks));
        const exp2          = Math.pow(2, log2); // [u.]
        const to_allocate   = exp2 * CHUNK_SIZE; // [B]


        if (this.#gbuffer_particles !== undefined) {
            this.#gbuffer_particles.destroy();
        }


        if (this.#gbuffer_particles_2 !== undefined) {
            this.#gbuffer_particles_2.destroy();
        }


        this.#gbuffer_particles = this.#device.createBuffer({
            size:   to_allocate,
            usage:  GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
        });


        this.#gbuffer_particles_2 = this.#device.createBuffer({
            size:   to_allocate,
            usage:  GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
        });


        this.#gbuffer_effective = this.#device.createBuffer({
            size:   4 * CHUNK_LENGTH * exp2,
            usage:  GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
        })


        this.#gbuffer_offsets = this.#device.createBuffer({
            size:   4 * CHUNK_LENGTH * exp2,
            usage:  GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
        })


        this.#chunks_allocated      = chunks;
        this.#currently_allocated   = chunks * CHUNK_LENGTH;
        console.log("[PROCESSOR] Allocated chunks: " + this.#chunks_allocated + " [u.]",
            "( " + this.#chunks_allocated + " particles, ",
            this.#currently_allocated * PARTICLE_DATA_SIZE + " [B])");

        this._bind();
    }


    async create(adapter, device, shader) {
        this.#adapter           = adapter;
        this.#device            = device;
        this.#shader            = shader;


        this.#bind_group_layout = this.#device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "storage" },
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "storage" },
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "storage" },
                },
                {
                    binding: 3,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "storage"},
                },
                {
                    binding: 4,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "storage"},
                },
                {
                    binding: 5,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "storage"},
                },
                {
                    binding: 6,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "storage"},
                },
                {
                    binding: 7,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "storage"},
                },
            ],
        });


        this.#pipeline_layout = this.#device.createPipelineLayout({
            bindGroupLayouts: [this.#bind_group_layout],
        });


        this.#pipeline_particle = this.#device.createComputePipeline({
            layout: this.#pipeline_layout,
            compute: {
                module: this.#shader,
                entryPoint: "particle_update"
            },
        });


        this.#pipeline_effect = this.#device.createComputePipeline({
            layout: this.#pipeline_layout,
            compute: {
                module: this.#shader,
                entryPoint: "effect_update",
            },
        });


        this.#pipeline_compact = this.#device.createComputePipeline({
            layout: this.#pipeline_layout,
            compute: {
                module: this.#shader,
                entryPoint: "par_compact",
            },
        });


        this.#pipeline_compact_0 = this.#device.createComputePipeline({
            layout: this.#pipeline_layout,
            compute: {
                module: this.#shader,
                entryPoint: "par_compact_0",
            },
        });


        this.#pipeline_compact_1 = this.#device.createComputePipeline({
            layout: this.#pipeline_layout,
            compute: {
                module: this.#shader,
                entryPoint: "par_compact_1",
            },
        });


        this.#pipeline_compact_2 = this.#device.createComputePipeline({
            layout: this.#pipeline_layout,
            compute: {
                module: this.#shader,
                entryPoint: "par_compact_2",
            },
        });




        this.#gbuffer_settings = this.#device.createBuffer({
            size:   GLOBAL_SETTINGS_DATA_SIZE,
            usage:  GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
        });


        // @TODO currently fixed...
        this.#gbuffer_effects = this.#device.createBuffer({
            size:   8 * EFFECT_CONTROLLER_DATA_SIZE,
            usage:  GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
        });


        this.#gbuffer_chunk_map = this.#device.createBuffer({
            size:   4 * CHUNK_COUNT,
            usage:  GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
        });


        this.read_buffer = device.createBuffer({
            size: 4 * CHUNK_LENGTH * CHUNK_COUNT,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });


        this.read_buffer_gs = device.createBuffer({
            size:   GLOBAL_SETTINGS_DATA_SIZE,
            usage:  GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });


        this.read_buffer_scan = device.createBuffer({
            size:   4 * CHUNK_COUNT,
            usage:  GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });


        this.#gbuffer_scan_psum_0 = device.createBuffer({
            size:   4 * CHUNK_LENGTH * CHUNK_COUNT / 16, // @TODO 128
            usage:  GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
        });


        // initially allocating 8 chunks...
        this._reallocate_particles(CHUNK_COUNT * CHUNK_LENGTH);
    }


    dispatch(command_encoder, count) {
        if (command_encoder === undefined || command_encoder === null) {
            return;

        } else if (count === undefined || count === null) { //  || count === 0
            return;

        }


        {   /*
             *  Global settings
             */


            const uboDataF32 = new Float32Array(4);
            const uboDataU32 = new Uint32Array(uboDataF32);
            //uboDataF32[0] = simulationParams.simulate ? simulationParams.deltaTime : 0.0;
            //uboDataF32[1] = simulationParams.brightnessFactor;

''
            // [2] [3] are alignment padding
            uboDataF32[0] = 0xffffffff * Math.random(); // seed.x
            uboDataF32[1] = 0xffffffff * Math.random(); // seed.y
            uboDataF32[2] = 0xffffffff * Math.random(); // seed.z
            uboDataF32[3] = 0xffffffff * Math.random(); // seed.w

            this.#device.queue.writeBuffer(this.#gbuffer_settings, 4 * 4, uboDataF32);
        }


        {
            const WORKGROUP_SIZE = 128;

            const pass = command_encoder.beginComputePass();
            pass.setPipeline(this.#pipeline_particle);
            pass.setBindGroup(0, this.#bind_group);

            pass.dispatchWorkgroups(Math.ceil(CHUNK_COUNT * CHUNK_LENGTH / WORKGROUP_SIZE));
            pass.end();
        }


        if (this.asd123 === undefined)
            this.asd123 = 0;

        this.asd123 += 1;
        if (this.asd123 >= 60 * 2) {
            this.asd123 = 0;

            const WORKGROUP_SIZE = 16;

            if (0) {
                const pass = command_encoder.beginComputePass();
                pass.setPipeline(this.#pipeline_compact);
                pass.setBindGroup(0, this.#bind_group);

                pass.dispatchWorkgroups(Math.ceil(CHUNK_COUNT * CHUNK_LENGTH / WORKGROUP_SIZE));
                pass.end();

            } else {
                // first.
                var pass = command_encoder.beginComputePass();
                pass.setPipeline(this.#pipeline_compact_0);
                pass.setBindGroup(0, this.#bind_group);

                pass.dispatchWorkgroups(Math.ceil(CHUNK_COUNT * CHUNK_LENGTH / WORKGROUP_SIZE));
                pass.end();


                // second.
                pass = command_encoder.beginComputePass();
                pass.setPipeline(this.#pipeline_compact_1);
                pass.setBindGroup(0, this.#bind_group);

                pass.dispatchWorkgroups(Math.ceil(CHUNK_COUNT / WORKGROUP_SIZE)); // LESS WG.!
                pass.end();


                // third.
                pass = command_encoder.beginComputePass();
                pass.setPipeline(this.#pipeline_compact_2);
                pass.setBindGroup(0, this.#bind_group);

                pass.dispatchWorkgroups(Math.ceil(CHUNK_COUNT * CHUNK_LENGTH / WORKGROUP_SIZE));
                pass.end();
            }

        }


        {
            // ...
            const WORKGROUP_SIZE = 128;

            const pass = command_encoder.beginComputePass();
            pass.setPipeline(this.#pipeline_effect);
            pass.setBindGroup(0, this.#bind_group);

            pass.dispatchWorkgroups(1);
            pass.end();
        }


        {
            command_encoder.copyBufferToBuffer(
                //this.#gbuffer_chunk_map,
                //this.#gbuffer_effective,
                this.#gbuffer_offsets,
                0,
                this.read_buffer,
                0,
                4 * CHUNK_LENGTH * CHUNK_COUNT,
            );

            command_encoder.copyBufferToBuffer(
                this.#gbuffer_scan_psum_0,
                0,
                this.read_buffer_scan,
                0,
                4 * CHUNK_COUNT,
            );



            command_encoder.copyBufferToBuffer(
                this.#gbuffer_settings,
                0,
                this.read_buffer_gs,
                0,
                GLOBAL_SETTINGS_DATA_SIZE,
            );

        }
    }
}


class RenderContext {

    #device;
    #context;
    #shader;

    #bind_group_layout;
    #pipeline_layout;
    #bind_group;
    #pipeline_render;
    #pass_descriptor;


    constructor(device, context, shader, presentation_format, canvas) {
        this.#device    = device;
        this.#context   = context;
        this.#shader    = shader;


        const bind_group_layout = this.#device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX,
                    buffer: {
                        type: "read-only-storage",
                    }
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.VERTEX,
                    buffer: {
                        type: "read-only-storage",
                    }
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.VERTEX,
                    buffer: {
                        type: "read-only-storage",
                    }
                },
                {
                    binding: 3,
                    visibility: GPUShaderStage.VERTEX,
                    buffer: {
                        type: "read-only-storage",
                    }
                },
            ],
        });


        const render_pipeline_layout = this.#device.createPipelineLayout({
            bindGroupLayouts: [bind_group_layout],
        });


        const render_pipeline = this.#device.createRenderPipeline({
            layout: render_pipeline_layout,
            // layout: "auto",
            // device.createPipelineLayout({bindGroupLayouts: [bind_group_layout_render],}),

            primitive: {
                topology: "triangle-list",
            },

            vertex: {
                module: shader,
            },

            fragment: {
                module: shader,
                targets: [
                    {
                        format: presentation_format,

                        blend: {
                            color: {
                                srcFactor: "src-alpha",
                                dstFactor: "one",
                                operation: "add",
                            },

                            alpha: {
                                srcFactor: "zero",
                                dstFactor: "one",
                                operation: "add",
                            },
                        }
                    },
                ],
            },

            depthStencil: {
                depthWriteEnabled: false,
                depthCompare: "less",
                format: "depth24plus",
            },
        });


        const depth_texture = device.createTexture({
            size: [canvas.width, canvas.height],
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });

        const render_pass_descriptor = {
            colorAttachments: [
                {
                    view: undefined,
                    clearValue: [0, 0, 0, 1],
                    loadOp: "clear",
                    storeOp: "store",
                },
            ],

            depthStencilAttachment: {
                view: depth_texture.createView(),

                depthClearValue: 1.0,
                depthLoadOp: "clear",
                depthStoreOp: "store",
            },
        };



        // setting object's variables...
        this.#bind_group_layout = bind_group_layout;
        this.#pipeline_layout = render_pipeline_layout;
        this.#pipeline_render = render_pipeline;
        this.#pass_descriptor = render_pass_descriptor;
    }


    bind(
        gbuffer_settings,
        gbuffer_effects,
        gbuffer_particles,
        gbuffer_chunk_map) {
        const render_bind_group = this.#device.createBindGroup({
            layout: this.#bind_group_layout,

            entries: [
                {
                    binding: 0,
                    resource: {
                        buffer: gbuffer_settings,
                    },
                },
                {
                    binding: 1,
                    resource: {
                        buffer: gbuffer_effects,
                    },
                },
                {
                    binding: 2,
                    resource: {
                        buffer: gbuffer_particles,
                    },
                },
                {
                    binding: 3,
                    resource: {
                        buffer: gbuffer_chunk_map,
                    },
                },
            ],
        });


        this.#bind_group = render_bind_group;
    }


    dispatch(command_encoder, count) {
        if (command_encoder === undefined || command_encoder === null) {
            return;

        } else if (count === undefined || count === null || count === 0) {
            return;

        }


        const texture_view = this.#context.getCurrentTexture().createView();
        this.#pass_descriptor.colorAttachments[0].view = texture_view;

        const pass = command_encoder.beginRenderPass(this.#pass_descriptor);
        pass.setPipeline(this.#pipeline_render);
        pass.setBindGroup(0, this.#bind_group);
        // pass.setVertexBuffer(0, particle_buffer);
        // pass.setVertexBuffer(1, quad_vertex_buffer);
        //pass.draw(6, NUMBER_OF_PARTICLES, 0, 0);

        /*
            @TODO   currently we're just rendering triangles...

         */
        pass.draw(3, count, 0, 0);


        // end~
        pass.end();
    }
}


/**
 *  Represents a particle effect, to be used inside the ParticleSystem.
 *
 *  API.
 */
export class ParticleEffect {

    cfg;
    #data;


    /**
     *  Sets JSON configuration into the C-struct.
     *  @param cfg  The JSON.
     */
    set(cfg) {
        if (cfg === undefined)
            return;

        console.log(cfg);

        // emission offset.
        const e_offset = 4;



        this.#data = new ArrayBuffer(
            EFFECT_CONTROLLER_DATA_SIZE
        );

        const u32 = new Uint32Array(this.#data);
        const f32 = new Float32Array(this.#data);

        // field `N`
        u32[0] = 0;

        // field `a`
        u32[1] = 1;

        // field `b`
        u32[2] = 1;

        // field `c`
        u32[3] = 1;


        // field `id`
        f32[e_offset + 0] = 0;

        // field `flags`
        f32[e_offset + 1] = 0;


        // field `period`
        if (valid_number(cfg["emission-period"]))
            f32[e_offset + 2] = cfg["emission-period"];

        else if (valid_number(cfg["emission-frequency"]))
            f32[e_offset + 2] = 1.0 / cfg["emission-frequency"];


        // field `timer`
        f32[e_offset + 3] = 0.0;


        // fields `lifetime`, `lifetime_var`
        if (valid_number(cfg["lifespan"]))
            f32[e_offset + 4] = cfg["lifespan"];
        //f32[e_offset + 5] = ...;

        // fields `fade_in`, `fade_in_var`, `fade_out`, `fade_out_var`
        if (valid_number(cfg["fade-in"]))
            f32[e_offset + 6] = cfg["fade-in"];

        f32[e_offset + 7] = 0.0;

        if (valid_number(cfg["fade-out"]))
            f32[e_offset + 8] = cfg["fade-out"];

        f32[e_offset + 9] = 0.0;

        f32[e_offset + 10]    = 0.0;
        f32[e_offset + 11]    = 0.0;


        // `from_`
        var offset = 16;
        var color = parse_hex_to_f32(cfg["initial-color"]);
        console.log("COLOR: " + color);

        f32[offset + 0]     = color[0];
        f32[offset + 1]     = color[1];
        f32[offset + 2]     = color[2];
        f32[offset + 3]     = color[3];


        if (valid_number(cfg["size"])) {
            f32[offset + 4]         = cfg["size"];
            f32[offset + 4 + 8]     = 0.0;
        }
        else if (valid_tuple(cfg["size"])) {
            f32[offset + 4]         = cfg["size"][0];
            f32[offset + 4 + 8]     = cfg["size"][1];
        }


        if (valid_number(cfg["spin"])) {
            f32[offset + 5]         = cfg["spin"];
            f32[offset + 5 + 8]     = 0.0;
        }
        else if (valid_tuple(cfg["spin"])) {
            f32[offset + 5]         = cfg["spin"][0];
            f32[offset + 5 + 8]     = cfg["spin"][1];
        }


        offset = 16 + 8 * 2;
        color = parse_hex_to_f32(cfg["target-color"]);
        f32[offset + 0]     = color[0];
        f32[offset + 1]     = color[1];
        f32[offset + 2]     = color[2];
        f32[offset + 3]     = color[3];


        offset = 16 + 8 * 2 * 2;
        parse_space_on_heap(f32, offset + 0, cfg["pos-space"]);
        parse_space_on_heap(f32, offset + 4, cfg["vel-space"]);
        parse_space_on_heap(f32, offset + 8, cfg["acc-space"]);
    }


    get_data() {
        return this.#data;
    }



    constructor(cfg) {
        if (cfg !== undefined) {
            this.set(cfg);
        }
    }
}


/**
 *  Particle effects compute & renderer context manager.
 *
 *  API.
 */
export class ParticleSystem {

    #adapter;   // owns
    #device;    // owns
    #context;   // owns

    #shader;    // owns.
    #processor; // owns.
    #renderer;  // owns.


    particle_effects;
    presentation_format;

    status;

    constructor(canvas) {
        this.particle_effects = [ ];
        this.canvas = canvas;

        this.status = true;
    }

    async __retrieve_gpu_context() {

        if (! navigator.gpu) {
            console.log("WebGPU not supported");
            return false;
        }


        const adapter = await navigator.gpu?.requestAdapter({
            featureLevel: "compatibility",
        });

        console.log(adapter.limits.maxStorageBufferBindingSize, adapter.limits.maxBufferSize);

        const device = await adapter?.requestDevice({
            requiredLimits: {
                maxStorageBuffersInVertexStage:     4,
                maxStorageBufferBindingSize:        adapter.limits.maxStorageBufferBindingSize,
            }
        });


        device.addEventListener("uncapturederror", (event) => {


            if (this.status) {
                this.status = false;
                throw event.error;
            }

        });


        if (! ('gpu' in navigator)) {
            fail('navigator.gpu is not defined - WebGPU not available in this browser');
        }

        if (! adapter) {
            fail("requestAdapter returned null - this sample can't run on this system");
        }


        const context = this.canvas.getContext("webgpu");
        const device_pixel_ratio = window.devicePixelRatio;
        this.canvas.width = this.canvas.clientWidth * device_pixel_ratio;
        this.canvas.height = this.canvas.clientHeight * device_pixel_ratio;
        this.presentation_format = navigator.gpu.getPreferredCanvasFormat();

        context.configure({
            device,
            format: this.presentation_format,
        });


        this.#adapter   = adapter;
        this.#device    = device;
        this.#context   = context;

        return true;
    }


    async __allocate_resources() {

        const shader_code = await fetch("src/hps/particles.wgsl").then(r => r.text());
        this.#shader = this.#device.createShaderModule({
            code: shader_code
        });


        // @TODO merge
        const render_shader_code = await fetch("src/hps/render.wgsl").then(r => r.text());
        const render_shader = this.#device.createShaderModule({
            code: render_shader_code
        });



        this.#renderer  = new RenderContext(this.#device, this.#context, render_shader, this.presentation_format, this.canvas);
        this.#processor = new Processor();
        await this.#processor.create(this.#adapter, this.#device, this.#shader);

        this.#renderer.bind(
            this.#processor.get_setting_buffer(),
            this.#processor.get_effect_buffer(),
            this.#processor.get_particle_buffer(),
            this.#processor.get_chunk_map_buffer()
        );

        return true;
    }


    /**
     *  (Attempts to) terminate the two-phase object creation.
     */
    async create() {
        const could_retrieve = await this.__retrieve_gpu_context();
        if (! could_retrieve)
            return false;


        const could_allocate = await this.__allocate_resources();
        if (! could_allocate)
            return false;


        for (let pe_index = 0; pe_index < this.particle_effects.length; ++ pe_index) {
            const data = this.particle_effects[pe_index].get_data();

            this.#device.queue.writeBuffer(
                this.#processor.get_effect_buffer(),
                EFFECT_CONTROLLER_DATA_SIZE * pe_index,
                data,
            );
        }

        return true;
    }


    /**
     *  Computes the a new frame animation.
     *
     *  @details    Performs compute and rendering passes.
     */
    animate() {
        //update_viewport_size();

        if (! this.status) {
            console.log("B.E. error...");
            return;
        }


        for (let pe_index = 0; pe_index < this.particle_effects.length; ++ pe_index) {
            //this.particle_effects[pe_index].animate();
        }


        const command_encoder = this.#device.createCommandEncoder();

        const number_of_particle_effects = this.particle_effects.length;
        const dispatch_count = CHUNK_LENGTH * number_of_particle_effects;


        // compute-shader.
        this.#processor.dispatch(command_encoder, dispatch_count);

        // rendering...
        this.#renderer.dispatch(command_encoder, CHUNK_LENGTH * CHUNK_COUNT);


        // submitting the workload.
        this.#device.queue.submit([
            command_encoder.finish(),
        ]);


        this._test();
    }

    async _test() {
        if (this.asd === undefined)
        {
            this.asd = 0;
        }


        if (this.asd >= 60) {

            await this.#device.queue.onSubmittedWorkDone();

            await this.#processor.read_buffer.mapAsync(GPUMapMode.READ);
            var data = this.#processor.read_buffer.getMappedRange();
            var view = new Uint32Array(data.slice(0));
            //console.log(view);

            for (let i = 0; i < view.length; i += 16) {
                console.log(...view.slice(i, i + 16));
            }

            this.#processor.read_buffer.unmap();


            await this.#processor.read_buffer_scan.mapAsync(GPUMapMode.READ);
            var data = this.#processor.read_buffer_scan.getMappedRange();
            var view = new Uint32Array(data.slice(0));
            console.log("SCAN: " + view);
            this.#processor.read_buffer_scan.unmap();



            await this.#processor.read_buffer_gs.mapAsync(GPUMapMode.READ);
            data = this.#processor.read_buffer_gs.getMappedRange();
            view = new Uint32Array(data.slice(0));
            console.log("GS. N = " + view[0] + " | " + view[1]);
            this.#processor.read_buffer_gs.unmap();


            this.asd = 0;
        }

        this.asd += 1;
    }



    add_effect(particle_effect) {
        this.particle_effects.push(particle_effect);
    }


    get_adapter() { return this.#adapter;   }
    get_device() {  return this.#device;    }
    get_context() { return this.#context;   }
}
