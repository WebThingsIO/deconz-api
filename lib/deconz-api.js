/**
 * deconz.js - Driver which uses the deCONZ serial API.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.*
 */

'use strict';

const BufferBuilder = require('buffer-builder');
const BufferReader = require('buffer-reader');
const EventEmitter = require('events');

exports = module.exports;

const frame_builder = exports._frame_builder = require('./frame-builder');
const frame_parser = exports._frame_parser = require('./frame-parser');
const write_parser = exports._write_parser = require('./write-parser');
exports.constants = require('./constants');
const Slip = exports.Slip = require('./slip');

const DEFAULT_OPTIONS = {
  raw_frames: false,
};

function calcCrc(buffer, len) {
  let crc = 0;
  for (let i = 0; i < len; i++) {
    crc += buffer[i];
  }
  return (~crc + 1) & 0xffff;
}

class DeconzAPI extends EventEmitter {

  constructor(options) {
    super();
    this.options = {};
    Object.assign(this.options, DEFAULT_OPTIONS);
    Object.assign(this.options, options || {});

    this.slipParser = new Slip.Parser(160);
    this.slipParser.on('packet', this.onPacket.bind(this));
  }

  buildFrame(frame) {
    const packet = Buffer.alloc(128);
    const builder = new BufferBuilder(packet);

    if (!frame_builder[frame.type]) {
      throw new Error(`Building frame type ${frame.type} not implementd`);
    }

    builder.appendUInt8(frame.type);
    builder.appendUInt8(frame_builder.getSeqNum(frame));
    builder.appendUInt8(0);
    builder.appendUInt16LE(0);  // frameLen - we fill it in later.

    frame_builder[frame.type](frame, builder);

    // Fill in the frame length

    packet[3] = builder.length & 0xff;
    packet[4] = (builder.length >> 8) & 0xff;

    // Calculate and fill in the CRC

    const crc = calcCrc(packet, builder.length);
    builder.writeIndex = builder.length;
    builder.appendUInt16LE(crc);

    // Encapsulate the packet as per SLIP protocol
    return Slip.Encapsulate(packet.slice(0, builder.length));
  }

  canParse(buffer) {
    const type = buffer.readUInt8(0);
    return type in frame_parser;
  }

  nextFrameId() {
    return frame_builder.nextFrameId();
  }

  onPacket(packet) {
    if (packet.length < 8) {
      // The smallest packet is 6 bytes + 2 bytes of CRC
      const err = new Error('Invalid packet (too small)');
      this.emit('error', err);
      return;
    }
    const frameLen = packet[3] + (packet[4] << 8);
    if (frameLen + 2 != packet.length) {
      const err = new Error('Invalid frame length');
      this.emit('error', err);
      return;
    }
    const frameCrc = packet[frameLen] +
                     (packet[frameLen + 1] << 8);
    const expectedCrc = calcCrc(packet, frameLen);
    if (frameCrc != expectedCrc) {
      const err = new Error('CRC mismatch: ' +
                            `expected ${expectedCrc.toString(16)}, ` +
                            `found: ${frameCrc.toString(16)}`);
      this.emit('error', err);
      return;
    }
    const rawFrame = packet.slice(0, frameLen + 2);
    if (this.options.raw_frames || !this.canParse(rawFrame)) {
      this.emit('frame_raw', rawFrame);
    } else {
      const frame = this.parseFrame(rawFrame);
      this.emit('frame_object', frame);
    }
  }

  parseFrame(rawFrame) {
    // Trim the trailing CRC
    const reader = new BufferReader(rawFrame.slice(0, rawFrame.length - 2));
    // For deConz many of the requests and responses are indistiguishable
    // from each other, so we tag the packets we receive. This is mostly
    // useful when dumping frames for debug.
    const frame = {response: true};
    frame.type = reader.nextUInt8();
    frame.seqNum = reader.nextUInt8();
    frame.status = reader.nextUInt8();
    reader.nextUInt16LE();  // frameLen - we've already validated this.

    if (frame_parser[frame.type]) {
      frame_parser[frame.type](frame, reader, this.options);
    } else {
      frame.payload = reader.nextAll();
    }
    return frame;
  }

  parseWriteFrame(rawFrame) {
    // Trim the trailing CRC
    const reader = new BufferReader(rawFrame.slice(0, rawFrame.length - 2));
    const frame = {};
    frame.type = reader.nextUInt8();
    frame.seqNum = reader.nextUInt8();
    reader.nextUInt8(); // reserved
    frame.frameLen = reader.nextUInt16LE();

    if (write_parser[frame.type]) {
      write_parser[frame.type](frame, reader, this.options);
    } else {
      frame.payload = reader.nextAll();
    }
    return frame;
  }

  parseRaw(chunk) {
    this.slipParser.parseChunk(chunk);
  }
}

exports.DeconzAPI = DeconzAPI;
