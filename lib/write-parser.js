/**
 * deconz-write-parser.js - Parse frames for the deCONZ serial API.
 *
 * In particular, this file contains parsers for parsing packets which
 * are sent using the deConz serial protocol. These parsers are
 * typically only used for a monitoring tool, or something which decodes
 * wireshark captures.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.*
 */

'use strict';

const C = require('./constants.js');

const write_parser = module.exports = {};
const frame_parser = exports._frame_parser = require('./frame-parser');

function swapHex(string) {
  return string.match(/.{2}/g).reverse().join('');
}

// Query Send Data State Request
write_parser[C.FRAME_TYPE.APS_DATA_CONFIRM] = function(frame, reader) {
  frame.payloadLen = reader.nextUInt16LE();
};

// Read Received Data Request
write_parser[C.FRAME_TYPE.APS_DATA_INDICATION] = function(frame, reader) {
  frame.payloadLen = reader.nextUInt16LE();
  if (frame.payloadLen > 0) {
    frame.flags = reader.nextUInt8();
  }
};

// Enqueue Send Data Request
write_parser[C.FRAME_TYPE.APS_DATA_REQUEST] = function(frame, reader) {
  frame.payloadLen = reader.nextUInt16LE();
  frame.id = reader.nextUInt8();
  frame.flags = reader.nextUInt8();
  if (frame.flags == 1) {
    // Not sure what this is. The docs on mention flags = 0, but deConz
    // sends packets with flags = 1.
    frame.flagsData = reader.nextUInt16LE();
  }
  frame.dstAddrMode = reader.nextUInt8();
  switch (frame.dstAddrMode) {
    case C.NETWORK_ADDR_MODE.GROUP:
      frame.destination16 = swapHex(reader.nextString(2, 'hex'));
      break;
    case C.NETWORK_ADDR_MODE.ADDR64:
      frame.destination64 = swapHex(reader.nextString(8, 'hex'));
      frame.destinationEndpoint = reader.nextUInt8();
      break;
    case C.NETWORK_ADDR_MODE.ADDR16:
      frame.destination16 = swapHex(reader.nextString(2, 'hex'));
      frame.destinationEndpoint = reader.nextUInt8();
      break;
    default:
      throw new Error(`Invalid dstAddrMode: ${frame.dstAddrMode}`);
  }
  frame.profileId = swapHex(reader.nextString(2, 'hex'));
  frame.clusterId = swapHex(reader.nextString(2, 'hex'));
  frame.sourceEndpoint = reader.nextUInt8();
  const dataLen = reader.nextUInt16LE();
  frame.data = reader.nextBuffer(dataLen);
  frame.txOptions = reader.nextUInt8();
  frame.broadcastRadius = reader.nextUInt8();
};

write_parser[C.FRAME_TYPE.CHANGE_NETWORK_STATE] = function(frame, reader) {
  frame.networkState = reader.nextUInt8();
};

write_parser[C.FRAME_TYPE.DEVICE_STATE] =
write_parser[C.FRAME_TYPE.VERSION] =
function(_frame, _reader) {
  // Nothing to parse.
};

write_parser[C.FRAME_TYPE.READ_PARAMETER] =
  frame_parser[C.FRAME_TYPE.WRITE_PARAMETER];

write_parser[C.FRAME_TYPE.WRITE_PARAMETER] =
  frame_parser[C.FRAME_TYPE.READ_PARAMETER];
