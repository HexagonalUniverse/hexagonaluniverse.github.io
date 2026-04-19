/** @file   <src/main.js>
 *  @brief  Application main src.
 *  @date   Created on April 2026.
 *  @author @HexagonalUniverse
 */


import { OrbitalParticle, Orbital } from "./particles.js";

import createModule from "./tmnc.auto.js";
const mod = await createModule();
const nothing = mod.cwrap("nothing", null, ["number"]);
nothing(1.6);


/*
 *
 *  Instancing animations
 * 
 */

const box = document.querySelector(".box");
const rect = box.getBoundingClientRect();

const cx = box.clientWidth * 0.5;
const cy = box.clientHeight * 0.5;

const system = new Orbital();

for (let i = 0; i < 20; ++i) {
    //const el = document.createElement("div");
    
    const ns = "http://www.w3.org/2000/svg";

    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 10 10");
    svg.classList.add("dot");

    const tri = document.createElementNS(ns, "polygon");
    tri.setAttribute("points", "5,0 10,10 0,10");
    tri.setAttribute("fill", "rgb(239, 202, 108)");

    svg.appendChild(tri);
    box.appendChild(svg);


    //el.className = "dot";
    //box.appendChild(el);
    system.add(new OrbitalParticle(
        svg,
        cx,
        cy,
        40 + i * 4,
        i,
        0.1
    ));
}

system.start();



