/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

// Generated with AI for personal use.
// Do NOT upload to extensions.gnome.org (EGO) unless you understand JavaScript
// and can maintain this code.

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {LevelSocket, defaultSocketPath} from './lib/levelSocket.js';
import {WaveOverlay} from './shell/waveOverlay.js';

export default class VoxtypeWaveOsdExtension extends Extension {
    enable() {
        this._overlay = new WaveOverlay();
        /* trackFullscreen: false keeps the overlay above fullscreen windows,
         * like the volume OSD. Destroying the overlay untracks it again. */
        Main.layoutManager.addTopChrome(this._overlay, {trackFullscreen: false});
        this._levelSocket = new LevelSocket(defaultSocketPath(), frames => this._overlay.addFrames(frames));
    }

    disable() {
        this._levelSocket.destroy();
        this._levelSocket = null;
        this._overlay.destroy();
        this._overlay = null;
    }
}
