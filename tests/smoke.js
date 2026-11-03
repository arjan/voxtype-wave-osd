#!/usr/bin/env -S gjs -m
/* tests/smoke.js
 *
 * Headless checks for lib/. Runs without GNOME Shell and without touching the
 * real voxtype socket; a fake daemon listens on a temporary path:
 *
 *     gjs -m tests/smoke.js
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const HERE = GLib.path_get_dirname(
    GLib.filename_from_uri(import.meta.url)[0]);
const PROJECT = GLib.path_get_dirname(HERE);

const {FRAME_BYTES, FrameDecoder} = await import(`file://${PROJECT}/lib/frames.js`);
const {BarAccumulator, barHeight, edgeFade} = await import(`file://${PROJECT}/lib/wave.js`);
const {LevelSocket, defaultSocketPath} = await import(`file://${PROJECT}/lib/levelSocket.js`);

let failures = 0;

function check(description, actual, expected) {
    const actualText = JSON.stringify(actual);
    const expectedText = JSON.stringify(expected);

    if (actualText === expectedText) {
        print(`  ok    ${description}`);
    } else {
        print(`  FAIL  ${description}\n          expected ${expectedText}\n          actual   ${actualText}`);
        failures++;
    }
}

function encodeFrame(seq, min, max, peakDbfs) {
    const buffer = new ArrayBuffer(FRAME_BYTES);
    new Uint32Array(buffer, 0, 1)[0] = seq;
    new Float32Array(buffer, 4, 3).set([min, max, peakDbfs]);
    return new Uint8Array(buffer);
}

function concat(...parts) {
    const total = parts.reduce((sum, part) => sum + part.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
        out.set(part, offset);
        offset += part.length;
    }
    return out;
}

function delay(ms) {
    return new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
        resolve();
        return GLib.SOURCE_REMOVE;
    }));
}

async function waitFor(predicate, timeoutMs) {
    const deadline = GLib.get_monotonic_time() + timeoutMs * 1000;
    while (!predicate()) {
        if (GLib.get_monotonic_time() > deadline)
            return false;
        await delay(20);
    }
    return true;
}

print('frame decoding');
{
    const decoder = new FrameDecoder();
    const frames = decoder.push(concat(encodeFrame(1, -0.5, 0.25, -6), encodeFrame(2, -0.125, 0.75, -2.5)));
    check('decodes consecutive frames',
        frames.map(f => [f.seq, f.min, f.max, f.peakDbfs]),
        [[1, -0.5, 0.25, -6], [2, -0.125, 0.75, -2.5]]);

    const split = encodeFrame(3, -1, 1, 0);
    check('holds back a partial frame', decoder.push(split.slice(0, 5)), []);
    check('completes a frame split across reads',
        decoder.push(split.slice(5)).map(f => f.seq),
        [3]);

    decoder.push(encodeFrame(4, 0, 0, -120).slice(0, 9));
    decoder.reset();
    check('reset drops a pending partial frame',
        decoder.push(encodeFrame(5, 0, 0, -120)).map(f => f.seq),
        [5]);
}

print('bar heights');
check('silence is a zero bar', barHeight(0, 3), 0);
check('loud input is clamped to full height', barHeight(1, 3), 1);
check('quiet input is lifted above linear', barHeight(0.1, 1) > 0.1, true);

{
    const bars = new BarAccumulator({framesPerBar: 2, gain: 1, capacity: 3});
    bars.add({min: -0.25, max: 0.1});
    check('no bar before enough frames', bars.bars.length, 0);
    bars.add({min: -0.05, max: 0.5});
    check('one bar per framesPerBar frames uses the loudest sample',
        bars.bars,
        [barHeight(0.5, 1)]);

    bars.add({min: NaN, max: Infinity});
    bars.add({min: 0, max: 0});
    check('non-finite samples are ignored', bars.bars.at(-1), 0);

    for (let i = 0; i < 6; i++)
        bars.add({min: 0, max: 1});
    check('keeps at most capacity bars', bars.bars.length, 3);

    bars.add({min: 0, max: 1});
    bars.clear();
    bars.add({min: 0, max: 0});
    bars.add({min: 0, max: 0});
    check('clear drops bars and the half-filled bar', bars.bars, [0]);
}

print('edge fade');
check('invisible at the start', edgeFade(0, 0, 100, 20), 0);
check('invisible at the end', edgeFade(100, 0, 100, 20), 0);
check('fully visible in the middle', edgeFade(50, 0, 100, 20), 1);
check('half visible halfway into the fade', edgeFade(10, 0, 100, 20), 0.5);
check('rises monotonically through the fade',
    [2, 6, 10, 14, 18].map(x => edgeFade(x, 0, 100, 20)).every((value, i, all) => i === 0 || value > all[i - 1]),
    true);
check('outside the range stays invisible', edgeFade(-5, 0, 100, 20), 0);

print('socket path');
check('lives in the user runtime dir',
    defaultSocketPath(),
    GLib.build_filenamev([GLib.get_user_runtime_dir(), 'voxtype', 'audio.sock']));

print('level socket');
{
    const dir = GLib.dir_make_tmp('voxtype-wave-osd-XXXXXX');
    const path = GLib.build_filenamev([dir, 'audio.sock']);
    const received = [];
    const connections = [];

    const levelSocket = new LevelSocket(path, frames => received.push(...frames.map(f => f.seq)));
    await delay(100);
    check('waits quietly while no daemon is listening', received, []);

    const service = new Gio.SocketService();
    service.add_address(Gio.UnixSocketAddress.new(path),
        Gio.SocketType.STREAM, Gio.SocketProtocol.DEFAULT, null);
    service.connect('incoming', (_service, connection) => {
        connections.push(connection);
        return true;
    });
    service.start();

    check('reconnects once the daemon appears', await waitFor(() => connections.length === 1, 5000), true);

    const output = connections[0].get_output_stream();
    const frameA = encodeFrame(10, -0.5, 0.5, -6);
    const frameB = encodeFrame(11, -0.5, 0.5, -6);
    output.write_all(concat(frameA, frameB.slice(0, 7)), null);
    output.flush(null);
    check('delivers complete frames', await waitFor(() => received.length === 1, 2000), true);
    output.write_all(frameB.slice(7), null);
    output.flush(null);
    check('delivers frames split across writes',
        await waitFor(() => received.length === 2, 2000) && received,
        [10, 11]);

    connections[0].close(null);
    check('reconnects after the daemon drops the connection',
        await waitFor(() => connections.length === 2, 5000), true);

    connections[1].get_output_stream().write_all(encodeFrame(20, 0, 0, -120), null);
    check('reads from the new connection',
        await waitFor(() => received.length === 3, 2000) && received.at(-1),
        20);

    levelSocket.destroy();
    connections[1].get_output_stream().write_all(encodeFrame(21, 0, 0, -120), null);
    await delay(150);
    check('stops delivering after destroy', received.at(-1), 20);

    connections[1].close(null);
    await delay(2500);
    check('does not reconnect after destroy', connections.length, 2);

    service.stop();
    service.close();
    GLib.unlink(path);
    GLib.rmdir(dir);
}

print(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`);
if (failures > 0)
    imports.system.exit(1);
