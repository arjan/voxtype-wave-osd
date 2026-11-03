/* lib/wave.js
 *
 * Turns audio frames into waveform bar heights, and the edge fade that makes
 * the scrolling wave look endless.
 * Shell-independent, so it must not import St, Clutter, Gtk, Gdk or Adw.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

/* Speech peaks are small compared to full scale; a power curve below 1 lifts
 * quiet syllables so the wave stays readable without clipping loud ones. */
const LOUDNESS_EXPONENT = 0.7;

export function barHeight(peak, gain) {
    return Math.min(1, (peak * gain) ** LOUDNESS_EXPONENT);
}

export function edgeFade(position, start, end, fadeWidth) {
    const distance = Math.min(position - start, end - position);
    const t = Math.max(0, Math.min(1, distance / fadeWidth));
    return t * t * (3 - 2 * t);
}

export class BarAccumulator {
    constructor({framesPerBar, gain, capacity}) {
        this._framesPerBar = framesPerBar;
        this._gain = gain;
        this._capacity = capacity;
        this.bars = [];
        this._peak = 0;
        this._frameCount = 0;
    }

    add(frame) {
        if (Number.isFinite(frame.min) && Number.isFinite(frame.max))
            this._peak = Math.max(this._peak, Math.abs(frame.min), Math.abs(frame.max));

        this._frameCount++;
        if (this._frameCount < this._framesPerBar)
            return;

        this.bars.push(barHeight(this._peak, this._gain));
        if (this.bars.length > this._capacity)
            this.bars.splice(0, this.bars.length - this._capacity);
        this._peak = 0;
        this._frameCount = 0;
    }

    clear() {
        this.bars.length = 0;
        this._peak = 0;
        this._frameCount = 0;
    }
}
