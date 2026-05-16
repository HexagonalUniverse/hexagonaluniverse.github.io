/** @file   <src/main.js>
 *  @brief  Application main src.
 *  @date   Created on April 2026.
 *  @author @HexagonalUniverse
 */


import { ParticleEffect, ParticleSystem } from "./hps/particles.js";
import { mat4 } from "./wgpu-matrix.module.js";



/*
 *
 *  Instancing animations
 * 
 */

const box = document.querySelector(".bg");
const rect = box.getBoundingClientRect();

const cx = box.clientWidth * 0.5;
const cy = box.clientHeight * 0.5;





class SvgTriangle {
    constructor() {
        const ns = "http://www.w3.org/2000/svg";

        this.svg = document.createElementNS(ns, "svg");
        this.svg.setAttribute("viewBox", "0 0 10 10");
        this.svg.classList.add("small-triangle");

        this.shape = document.createElementNS(ns, "polygon");
        this.shape.setAttribute("points", "5,0 10,10 0,10");
        this.shape.setAttribute("fill", "rgb(239, 202, 108)");

        this.svg.appendChild(this.shape);
    }
}


if (0) {
    for (let i = 0; i < 6; ++i) {
        const figure = new SvgTriangle();
        const svg = figure.svg;
    
        box.appendChild(svg);
    
        system.add(new RadialParticle(
            svg,
            1.0,
            cx,
            cy,
            100,
            6.28318530717958 / 6 * i,
            0.25
        ));
    }

    //system.start();
}






class Animator {
    constructor() {
        this.running = false;

        this.animations = []

        this._loop = this._loop.bind(this);
    }

    start() {
        this.running = true;
        requestAnimationFrame(this._loop);
    }


    _loop() {
        if (! this.running)
            return;

        for (let i = 0; i < this.animations.length; ++ i) {
            this.animations[i].animate();
        }

        requestAnimationFrame(this._loop);
    }
}





if (1) {
    const canvas = document.querySelector("canvas");
    const ps = new ParticleSystem(canvas);

    const bg_pe = new ParticleEffect();
    bg_pe.set(await (await fetch("src/bg-particle-effect.json")).json());
    ps.add_effect(bg_pe);

    await ps.create();



    const adapter = ps.get_adapter();
    const device = ps.get_device();
    const context = ps.get_context();
    const presentation_format = ps.presentation_format;



    if (0) {

        const psm = new ParticleEffect(adapter, device);
        await psm.create();







        // ref.: https://webgpu.github.io/webgpu-samples/?sample=particles#main.ts
        const NUMBER_OF_PARTICLES = 16;
        const PARTICLE_SIZE = 144;

        const particle_buffer = device.createBuffer({
            size: NUMBER_OF_PARTICLES * PARTICLE_SIZE,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });

        const render_wgsl = await fetch("src/hps/render.wgsl").then(r => r.text());

        const render_shader = device.createShaderModule({ code: render_wgsl });



        const bind_group_layout = device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX,
                    buffer: {
                        type: "read-only-storage",
                    }
                },
            ],
        });

        const render_pipeline_layout = device.createPipelineLayout({
            bindGroupLayouts: [bind_group_layout],
        });


        const render_bind_group = device.createBindGroup({
            layout: bind_group_layout,

            entries: [
                {
                    binding: 0,
                    resource: {
                        buffer: psm.get_gpu_main_buffer(),
                    },
                },
            ],
        });


        const render_pipeline = device.createRenderPipeline({
            layout: render_pipeline_layout,
            // layout: "auto",
            // device.createPipelineLayout({bindGroupLayouts: [bind_group_layout_render],}),

            primitive: {
                topology: "triangle-list",
            },

            vertex: {
                module: render_shader,
            },

            fragment: {
                module: render_shader,
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

        /*
        const u_buffer_size =
            4 * 4 * 4 + // modelViewProjectionMatrix : mat4x4f
            3 * 4 + // right : vec3f
            4 + // padding
            3 * 4 + // up : vec3f
            4 + // padding
            0;

        const u_buffer = device.createBuffer({
            size: u_buffer_size,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        const u_bind_group = device.createBindGroup({
            layout: render_pipeline.getBindGroupLayout(0),
            entries: [{
                binding: 0,
                resource: u_buffer,
            }],
        });
        */

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

        const quad_vertex_buffer = device.createBuffer({
            size: 6 * 2 * 4,
            usage: GPUBufferUsage.VERTEX,
            mappedAtCreation: true,
        });

        const vertex_data = [
            -1.0, -1.0, +1.0, -1.0, -1.0, +1.0, -1.0, +1.0, +1.0, -1.0, +1.0, +1.0,
        ];

        new Float32Array(quad_vertex_buffer.getMappedRange()).set(vertex_data);
        quad_vertex_buffer.unmap();



        const aspect = canvas.width / canvas.height;
        const projection = mat4.perspective((2 * Math.PI) / 5, aspect, 1, 100.0);
        const view = mat4.create();
        const mvp = mat4.create();
    }

    class Drawer {

        constructor(psm) {
            this.psm = psm;
        }

        animate(psm) {
            /*
            mat4.identity(view);
            mat4.translate(view, [0, 0, -3], view);
            mat4.rotateX(view, Math.PI * -0.2, view);
            mat4.multiply(projection, view, mvp);

            device.queue.writeBuffer(
                u_buffer,
                0,
                new Float32Array([
                    // modelViewProjectionMatrix
                    mvp[0], mvp[1], mvp[2], mvp[3],
                    mvp[4], mvp[5], mvp[6], mvp[7],
                    mvp[8], mvp[9], mvp[10], mvp[11],
                    mvp[12], mvp[13], mvp[14], mvp[15],

                    view[0], view[4], view[8], // right

                    0, // padding

                    view[1], view[5], view[9], // up

                    0, // padding
                ])
            );
            */

            const texture_view = context.getCurrentTexture().createView();
            render_pass_descriptor.colorAttachments[0].view = texture_view;

            const command_encoder = device.createCommandEncoder();

            // const compute_pass = command_encoder.beginComputePass();
            //command_encoder.copyBufferToBuffer(this.psm.get_gpu_main_buffer(), 0, particle_buffer, 0, PARTICLE_SIZE * NUMBER_OF_PARTICLES);



            const pass_encoder = command_encoder.beginRenderPass(render_pass_descriptor);
            pass_encoder.setPipeline(render_pipeline);
            pass_encoder.setBindGroup(0, render_bind_group);
            // pass_encoder.setVertexBuffer(0, particle_buffer);
            // pass_encoder.setVertexBuffer(1, quad_vertex_buffer);
            //pass_encoder.draw(6, NUMBER_OF_PARTICLES, 0, 0);

            // triangles.
            pass_encoder.draw(3, NUMBER_OF_PARTICLES, 0, 0);

            pass_encoder.end();

            device.queue.submit([command_encoder.finish()]);
        }
    }


    if (1) {


        // const drawer = new Drawer(psm);




        const animator = new Animator();

        animator.animations.push(ps);
        // animator.animations.push(psm);
        // animator.animations.push(drawer);

        animator.start();
    }
}



