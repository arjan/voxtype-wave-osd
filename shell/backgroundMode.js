/* shell/backgroundMode.js
 *
 * Samples the screen behind the overlay to choose light or dark bars, falling
 * back to the system colour scheme when the background is ambiguous.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';

import {Mode, chooseMode, luminance} from '../lib/contrast.js';

const SAMPLE_COLUMNS = 5;
const SAMPLE_ROWS = 2;
const SAMPLE_TIMEOUT_MS = 200;

export function systemMode() {
    return St.Settings.get().color_scheme === St.SystemColorScheme.PREFER_DARK ? Mode.DARK : Mode.LIGHT;
}

/*
 * Must run while the overlay is still invisible, or it samples itself. Never
 * rejects and never takes longer than SAMPLE_TIMEOUT_MS: the overlay waits on
 * it, and a pick that does not complete would keep it hidden for good.
 */
export async function detectMode(x, y, width, height) {
    const fallback = systemMode();
    let timeoutId = 0;
    const timeout = new Promise(resolve => {
        timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, SAMPLE_TIMEOUT_MS, () => {
            timeoutId = 0;
            console.warn('voxtype-wave-osd: screen sampling timed out, using the system colour scheme');
            resolve(fallback);
            return GLib.SOURCE_REMOVE;
        });
    });

    try {
        return await Promise.race([sampleMode(x, y, width, height, fallback), timeout]);
    } catch (e) {
        console.warn(`voxtype-wave-osd: screen sampling failed (${e.message}), using the system colour scheme`);
        return fallback;
    } finally {
        if (timeoutId)
            GLib.Source.remove(timeoutId);
    }
}

async function sampleMode(x, y, width, height, fallback) {
    /* A Shell.Screenshot runs one task at a time, so each parallel pick gets its own. */
    const picks = [];
    for (let row = 0; row < SAMPLE_ROWS; row++) {
        for (let column = 0; column < SAMPLE_COLUMNS; column++) {
            const sampleX = Math.round(x + width * (column + 0.5) / SAMPLE_COLUMNS);
            const sampleY = Math.round(y + height * (row + 0.5) / SAMPLE_ROWS);
            picks.push(new Shell.Screenshot().pick_color(sampleX, sampleY));
        }
    }
    const luminances = (await Promise.all(picks))
        .map(([color]) => luminance(color.red, color.green, color.blue));
    return chooseMode(luminances, fallback);
}
