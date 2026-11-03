/* lib/levelSocket.js
 *
 * Client for the voxtype daemon's audio-level Unix socket. Reconnects when the
 * daemon is not running yet or restarts.
 * Shell-independent, so it must not import St, Clutter, Gtk, Gdk or Adw.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {FrameDecoder} from './frames.js';

const RECONNECT_SECONDS = 2;
const READ_CHUNK_BYTES = 4096;

Gio._promisify(Gio.SocketClient.prototype, 'connect_async', 'connect_finish');
Gio._promisify(Gio.InputStream.prototype, 'read_bytes_async', 'read_bytes_finish');

export function defaultSocketPath() {
    return GLib.build_filenamev([GLib.get_user_runtime_dir(), 'voxtype', 'audio.sock']);
}

function isCancelled(error) {
    return error instanceof GLib.Error && error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED);
}

export class LevelSocket {
    constructor(path, onFrames) {
        this._path = path;
        this._onFrames = onFrames;
        this._decoder = new FrameDecoder();
        this._cancellable = new Gio.Cancellable();
        this._reconnectId = 0;
        this._run();
    }

    destroy() {
        if (this._reconnectId) {
            GLib.Source.remove(this._reconnectId);
            this._reconnectId = 0;
        }
        this._cancellable.cancel();
    }

    async _run() {
        const client = new Gio.SocketClient();
        let connection;
        try {
            connection = await client.connect_async(Gio.UnixSocketAddress.new(this._path), this._cancellable);
        } catch (error) {
            if (!isCancelled(error))
                this._scheduleReconnect();
            return;
        }

        await this._readFrames(connection.get_input_stream());
        connection.close(null);
        if (!this._cancellable.is_cancelled())
            this._scheduleReconnect();
    }

    async _readFrames(stream) {
        this._decoder.reset();
        try {
            for (;;) {
                const bytes = await stream.read_bytes_async(READ_CHUNK_BYTES, GLib.PRIORITY_DEFAULT, this._cancellable);
                if (bytes.get_size() === 0)
                    return;
                const frames = this._decoder.push(bytes.toArray());
                if (frames.length > 0)
                    this._onFrames(frames);
            }
        } catch (error) {
            if (!isCancelled(error))
                console.warn(`voxtype-wave-osd: ${error.message}`);
        }
    }

    _scheduleReconnect() {
        if (this._reconnectId)
            GLib.Source.remove(this._reconnectId);
        this._reconnectId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, RECONNECT_SECONDS, () => {
            this._reconnectId = 0;
            this._run();
            return GLib.SOURCE_REMOVE;
        });
    }
}
