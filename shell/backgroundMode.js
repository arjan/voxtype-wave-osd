/* shell/backgroundMode.js
 *
 * Samples the screen behind the overlay to choose light or dark bars, falling
 * back to the system colour scheme when the background is ambiguous.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import Shell from 'gi://Shell';
import St from 'gi://St';

import {Mode, chooseMode, luminance} from '../lib/contrast.js';

const SAMPLE_COLUMNS = 5;
const SAMPLE_ROWS = 2;

export function systemMode() {
    return St.Settings.get().color_scheme === St.SystemColorScheme.PREFER_DARK ? Mode.DARK : Mode.LIGHT;
}

/* Must run while the overlay is still invisible, or it samples itself. */
export async function detectMode(x, y, width, height) {
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
    return chooseMode(luminances, systemMode());
}
