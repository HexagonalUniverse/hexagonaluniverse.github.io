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

            try {
                this.animations[i].animate();

            } catch (error) {
                console.log("[ERROR]", error.message);
                this.running = false;
            }
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


    ps.add_effect(new ParticleEffect({
        "emission-frequency":   128.0,

        "lifespan":             6.0,

        "size":                 [50.0, 20.0],
        "spin":                 [0.0, 1.57],

        "fade-in":              0.550,
        "fade-out":             0.550,

        "initial-color":        "#34FA8A50",
        "target-color":         "#2744DA55",

        "pos-space": {
            "min-x": - 50.0, "max-x": + 50.0,
            "min-y": - 50.0, "max-y": + 50.0,
        },

        "vel-space": {
            "min-x": -0.0, "max-x": 0.0,
            "min-y": -0.0, "max-y": 0.0,
        },

        "acc-space": {
            "min-x": 0.0, "max-x": 0.0,
            "min-y": 0.0, "max-y": 0.0,
        },

        "range": {
            "size": 50.0,
            "spin": 1.0,
        },
    }));

    await ps.create();


    {
        const animator = new Animator();

        animator.animations.push(ps);
        // animator.animations.push(psm);
        // animator.animations.push(drawer);

        animator.start();
    }
}



