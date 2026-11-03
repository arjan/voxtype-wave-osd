/* lib/contrast.js
 *
 * Picks light or dark styling from background samples.
 * Shell-independent, so it must not import St, Clutter, Gtk, Gdk or Adw.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

export const Mode = Object.freeze({LIGHT: 'light', DARK: 'dark'});

const DARK_BELOW = 0.4;
const LIGHT_ABOVE = 0.6;
/* Samples this far apart mean the overlay straddles light and dark content. */
const MAX_SPREAD = 0.5;

export function luminance(red, green, blue) {
    return (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
}

/* DARK means a dark background (light bars); LIGHT means a light background. */
export function chooseMode(luminances, fallback) {
    if (luminances.length === 0)
        return fallback;

    const mean = luminances.reduce((sum, value) => sum + value, 0) / luminances.length;
    const spread = Math.max(...luminances) - Math.min(...luminances);
    if (spread > MAX_SPREAD)
        return fallback;
    if (mean < DARK_BELOW)
        return Mode.DARK;
    if (mean > LIGHT_ABOVE)
        return Mode.LIGHT;
    return fallback;
}
