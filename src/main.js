/** @file   <src/main.js>
 *  @brief  Application main src.
 *  @date   Created on April 2026.
 *  @author @HexagonalUniverse
 */


import { RadialParticle, Orbital, ParticleSystemManager } from "./hps/particles.js";




/*
 *
 *  Instancing animations
 * 
 */

const box = document.querySelector(".bg");
const rect = box.getBoundingClientRect();

const cx = box.clientWidth * 0.5;
const cy = box.clientHeight * 0.5;


const system = new Orbital();




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






const psm = new ParticleSystemManager();
await psm.create();
psm.start();


