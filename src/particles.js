/** @file   <src/particles.js>
 *  @brief  Particle and orbital animations.
 *  @date   Created on April 2026.
 *  @author @HexagonalUniverse
 */


/**
 *  A particle that orbits around a given center, radius, and angular-speed.
 */
export class OrbitalParticle 
{
    constructor(element, center_x, center_y, radius, phase, angular_speed, lifespan = 5.0) {
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
        // integrating.
        this.phase += this.angular_speed * delta_time;
        this.life -= delta_time;

        
        // parametric coordinates.
        const x = dx + this.center_x + this.radius * Math.cos(this.phase);
        const y = dy + this.center_y + this.radius * Math.sin(this.phase);

        
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
