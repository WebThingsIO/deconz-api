/**
 * deconz-slip.js - SLIP parser/builder
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.*
 */

'use strict';

const EventEmitter = require('events');

// The following come from RFC1055. which describes the framing used
// for SLIP.
const END = 0xc0;     // 0300
const ESC = 0xdb;     // 0333
const ESC_END = 0xdc; // 0334
const ESC_ESC = 0xdd; // 0335

class Parser extends EventEmitter {
  constructor(maxSize, params) {
    super();
    this.params = params;
    this.buffer = Buffer.alloc(maxSize);
    this.reset();
  }

  parseChunk(chunk) {
    for (let i = 0; i < chunk.length; i++) {
      let ch = chunk[i];

      if (this.handlingESC) {
        switch (ch) {

          case ESC_END:
            ch = END;
            break;

          case ESC_ESC:
            ch = ESC;
            break;

          // anything else is technically a protocol violation. We just
          // leave the byte alone.
        }
        this.handlingESC = false;
        this.buffer[this.len] = ch;
        this.len++;
        continue;
      }

      switch (ch) {

        case END: {
          if (this.len == 0) {
            // back-to-back END received. Ignore.
            continue;
          }
          // Otherwise, we've gotten to the end of the packet.
          this.emit('packet', this.buffer.slice(0, this.len), this.params);
          this.reset();
          break;
        }

        case ESC:
          this.handlingESC = true;
          break;

        default:
          this.buffer[this.len] = ch;
          this.len++;
          break;
      }
    }
  }

  reset() {
    this.handleingESC = false;
    this.len = 0;
  }
}

function Encapsulate(packet) {
  // Worst case is each character needs to be escaped and we add an
  // END character at each end.
  const dstPacket = Buffer.alloc(packet.length * 2 + 2);
  let dst = 0;
  dstPacket[dst++] = END;
  for (let src = 0; src < packet.length; src++) {
    const ch = packet[src];
    switch (ch) {

      case END:
        dstPacket[dst++] = ESC;
        dstPacket[dst++] = ESC_END;
        break;

      case ESC:
        dstPacket[dst++] = ESC;
        dstPacket[dst++] = ESC_ESC;
        break;

      default:
        dstPacket[dst++] = ch;
        break;
    }
  }
  dstPacket[dst++] = END;
  return dstPacket.slice(0, dst);
}

module.exports = {
  Encapsulate,
  Parser,
};
