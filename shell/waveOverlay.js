/* shell/waveOverlay.js
 *
 * The floating waveform. Shows while frames arrive and fades out once they
 * stop, which is how the end of a voxtype recording is detected.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {BarAccumulator, edgeFade} from '../lib/wave.js';

const WIDTH = 360;
const HEIGHT = 56;
const BOTTOM_OFFSET = 0.12;
const PADDING = 14;
const VERTICAL_PADDING = 8;
const BAR_WIDTH = 3;
const BAR_GAP = 2;
const BAR_ALPHA = 0.9;
const EDGE_FADE_WIDTH = 48;
const DOT_RADIUS = 4;
const DOT_GAP = 12;

const FRAMES_PER_BAR = 2;
const GAIN = 3.0;
const MAX_BARS = 200;

/* voxtype only sends frames while recording; this much silence means it stopped. */
const IDLE_MS = 300;
const REPAINT_MS = 33;
const FADE_IN_MS = 120;
const FADE_OUT_MS = 200;

export const WaveOverlay = GObject.registerClass(
class WaveOverlay extends St.DrawingArea {
    constructor() {
        super({
            style_class: 'voxtype-wave-osd',
            width: WIDTH,
            height: HEIGHT,
            reactive: false,
            can_focus: false,
            opacity: 0,
            visible: false,
        });
        this._bars = new BarAccumulator({framesPerBar: FRAMES_PER_BAR, gain: GAIN, capacity: MAX_BARS});
        this._lastFrameTime = 0;
        this._tickId = 0;
        this._monitorsChangedId = Main.layoutManager.connect('monitors-changed', () => this._reposition());
        this._reposition();
    }

    destroy() {
        if (this._tickId) {
            GLib.Source.remove(this._tickId);
            this._tickId = 0;
        }
        Main.layoutManager.disconnect(this._monitorsChangedId);
        super.destroy();
    }

    addFrames(frames) {
        for (const frame of frames)
            this._bars.add(frame);
        this._lastFrameTime = GLib.get_monotonic_time();

        if (this._tickId)
            return;
        this._fadeIn();
        this._tickId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, REPAINT_MS, () => {
            if (GLib.get_monotonic_time() - this._lastFrameTime < IDLE_MS * 1000) {
                this.queue_repaint();
                return GLib.SOURCE_CONTINUE;
            }
            this._tickId = 0;
            this._fadeOut();
            return GLib.SOURCE_REMOVE;
        });
    }

    _fadeIn() {
        this.remove_all_transitions();
        this._bars.clear();
        this.show();
        this.ease({opacity: 255, duration: FADE_IN_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
    }

    _fadeOut() {
        this.ease({
            opacity: 0,
            duration: FADE_OUT_MS,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => this.hide(),
        });
    }

    _reposition() {
        const monitor = Main.layoutManager.primaryMonitor;
        this.set_position(
            Math.round(monitor.x + (monitor.width - WIDTH) / 2),
            Math.round(monitor.y + monitor.height * (1 - BOTTOM_OFFSET) - HEIGHT));
    }

    vfunc_repaint() {
        const cr = this.get_context();
        const [width, height] = this.get_surface_size();
        const middle = height / 2;

        cr.setSourceRGBA(0.93, 0.26, 0.26, 1);
        cr.arc(PADDING, middle, DOT_RADIUS, 0, 2 * Math.PI);
        cr.fill();

        const waveStart = PADDING + DOT_GAP;
        const waveEnd = width - PADDING;
        const step = BAR_WIDTH + BAR_GAP;
        const visibleBars = this._bars.bars.slice(-Math.floor((waveEnd - waveStart) / step));
        const firstX = waveEnd - visibleBars.length * step;
        const maxHalfHeight = middle - VERTICAL_PADDING;

        visibleBars.forEach((level, index) => {
            const x = firstX + index * step;
            const alpha = BAR_ALPHA * edgeFade(x + BAR_WIDTH / 2, waveStart, waveEnd, EDGE_FADE_WIDTH);
            if (alpha <= 0)
                return;
            const halfHeight = Math.max(1, level * maxHalfHeight);
            cr.setSourceRGBA(1, 1, 1, alpha);
            cr.rectangle(x, middle - halfHeight, BAR_WIDTH, halfHeight * 2);
            cr.fill();
        });

        cr.$dispose();
    }
});
