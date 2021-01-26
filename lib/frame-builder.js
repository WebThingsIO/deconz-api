/**
 * deconz-frame-builder.js - Build frames for the deCONZ serial API.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.*
 */

'use strict';

const assert = require('assert');
const C = require('./constants.js');

function swapHex(string) {
  return string.match(/.{2}/g).reverse().join('');
}

const frame_builder = module.exports = {

  // The seqNum is incremented for each new command sent to the dongle.
  seqNum: 0,
  nextSeqNum: function nextSeqNum() {
    this.seqNum = this.seqNum >= 0xff ? 1 : ++this.seqNum;
    return this.seqNum;
  },

  getSeqNum: function getSeqNum(frame) {
    assert(frame, 'Frame parameter must be supplied');
    const seqNum = frame.seqNum ||
                   (frame.seqNum !== 0 && this.nextSeqNum()) ||
                   frame.seqNum;
    frame.seqNum = seqNum;
    return seqNum;
  },

  // The frameId is used for tracking data sent and received over the
  // network.
  frameId: 0,
  nextFrameId: function nextFrameId() {
    this.frameId = this.frameId >= 0xff ? 1 : ++this.frameId;
    return this.frameId;
  },

  getFrameId: function getFrameId(frame) {
    assert(frame, 'Frame parameter must be supplied');
    const id = frame.id || (frame.id !== 0 && this.nextFrameId()) || frame.id;
    frame.id = id;
    return id;
  },
};

// ----- Param Builders ----------------------------------------------------

const param_builder = {};
param_builder[C.PARAM_ID.APS_DESIGNATED_COORDINATOR] =
function(frame, builder) {
  builder.appendUInt8(frame.apsDesignatedCoordinator);
};
param_builder[C.PARAM_ID.SCAN_CHANNELS] = function(frame, builder) {
  builder.appendUint32LE(frame.scanChannels);
};
param_builder[C.PARAM_ID.APS_PANID64] = function(frame, builder) {
  builder.appenedString(swapHex(frame.apsPanId64), 'hex');
};
param_builder[C.PARAM_ID.TRUST_CENTER_ADDR64] = function(frame, builder) {
  builder.appendString(swapHex(frame.trustCenterAddr64), 'hex');
};
param_builder[C.PARAM_ID.SECURITY_MODE] = function(frame, builder) {
  builder.appendUInt8(frame.securityMode);
};
param_builder[C.PARAM_ID.NETWORK_KEY] = function(frame, builder) {
  let data;
  if (Array.isArray(frame.networkKey) || Buffer.isBuffer(frame.networkKey)) {
    data = Buffer.from(frame.networkKey);
  } else {
    data = Buffer.from(frame.networkKey, 'ascii');
  }
  builder.appendBuffer(data);
};
param_builder[C.PARAM_ID.NETWORK_UPDATE_ID] = function(frame, builder) {
  builder.appendUInt8(frame.networkUpdateId);
};
param_builder[C.PARAM_ID.PERMIT_JOIN] = function(frame, builder) {
  builder.appendUInt8(frame.permitJoin);
};
param_builder[C.PARAM_ID.WATCHDOG_TTL] = function(frame, builder) {
  builder.appendUInt32LE(frame.watchDogTTL);
};

// ----- Frame Builders ----------------------------------------------------

// Query Send Data State Request
frame_builder[C.FRAME_TYPE.APS_DATA_CONFIRM] = function(frame, builder) {
  builder.appendUInt16LE(0);  // payloadLen
};

// Read Received Data Request
frame_builder[C.FRAME_TYPE.APS_DATA_INDICATION] = function(frame, builder) {
  if (frame.hasOwnProperty('flags')) {
    builder.appendUInt16LE(1);   // payloadLen
    builder.appendUInt8(frame.flags);
  } else {
    builder.appendUInt16LE(0);   // payloadLen
  }
};

// Enqueue Send Data Request
frame_builder[C.FRAME_TYPE.APS_DATA_REQUEST] = function(frame, builder) {
  const payloadLenOffset = builder.writeIndex;
  builder.appendUInt16LE(0);  // placeholder for payloadLen
  const payloadOffset = builder.writeIndex;

  builder.appendUInt8(this.getFrameId(frame));
  builder.appendUInt8(0); // flags
  if (frame.hasOwnProperty('destinationEndpoint')) {
    if (frame.hasOwnProperty('destination16') &&
        frame.destination16 != 'fffe') {
      builder.appendUInt8(2); // dstAddrMode 2 = 16-bit NWK address
      builder.appendString(swapHex(frame.destination16), 'hex');
    } else {
      builder.appendUInt8(3); // dstAddrMode 3 = 64-bit IEEE address
      builder.appendString(swapHex(frame.destination64), 'hex');
    }
    builder.appendUInt8(frame.destinationEndpoint);
  } else {
    builder.appendUInt8(1); // dstAddrMode 1 = Group address
    builder.appendString(swapHex(frame.destination16), 'hex');
  }
  if (typeof frame.profileId === 'number') {
    builder.appendUInt16LE(frame.profileId, 'hex');
  } else {
    builder.appendString(swapHex(frame.profileId), 'hex');
  }
  if (typeof frame.clusterId === 'number') {
    builder.appendUInt16LE(frame.clusterId, 'hex');
  } else {
    builder.appendString(swapHex(frame.clusterId), 'hex');
  }
  builder.appendUInt8(frame.sourceEndpoint);
  builder.appendUInt16LE(frame.data.length);
  builder.appendBuffer(frame.data);
  if (frame.hasOwnProperty('options')) {
    builder.appendUInt8(frame.options);
  } else {
    builder.appendUInt8(0x04);  // Use APS ACKs
  }
  if (frame.hasOwnProperty('broadcastRadius')) {
    builder.appendUInt8(frame.broadcastRadius);
  } else {
    builder.appendUInt8(0x00);
  }

  // Now that we know the payload length, go back and fill it in.
  const endIndex = builder.writeIndex;
  const payloadLen = endIndex - payloadOffset;
  builder.writeIndex = payloadLenOffset;
  builder.appendUInt16LE(payloadLen);

  // The buffer builder increases the length even though we're writing
  // into the middle, so we restore both the length and the writeIndex.
  builder.writeIndex = builder.length = endIndex;
};

frame_builder[C.FRAME_TYPE.CHANGE_NETWORK_STATE] = function(frame, builder) {
  builder.appendUInt8(frame.networkState);
};

frame_builder[C.FRAME_TYPE.DEVICE_STATE] = function(frame, builder) {
  builder.appendUInt8(0);
  builder.appendUInt8(0);
  builder.appendUInt8(0);
};

frame_builder[C.FRAME_TYPE.READ_PARAMETER] = function(frame, builder) {
  if (frame.paramId == C.PARAM_ID.NETWORK_KEY) {
    builder.appendUInt16LE(2);  // payloadLen
    builder.appendUInt8(frame.paramId);
    builder.appendUInt8(0); // key index
  } else {
    builder.appendUInt16LE(1);  // payloadLen
    builder.appendUInt8(frame.paramId);
  }
};

frame_builder[C.FRAME_TYPE.VERSION] = function(_frame, builder) {
  builder.appendUInt32LE(0);
};

frame_builder[C.FRAME_TYPE.WRITE_PARAMETER] = function(frame, builder) {
  const payloadLenOffset = builder.writeIndex;
  builder.appendUInt16LE(0);  // placeholder for payloadLen
  const payloadOffset = builder.writeIndex;

  builder.appendUInt8(frame.paramId);
  if (param_builder[frame.paramId]) {
    param_builder[frame.paramId](frame, builder);
  } else {
    throw new Error(`Parameter ${frame.paramId} not supported ` +
                    'for WRITE_PARAMETER');
  }
  // Now that we know the payload length, go back and fill it in.
  const endIndex = builder.writeIndex;
  const payloadLen = endIndex - payloadOffset;
  builder.writeIndex = payloadLenOffset;
  builder.appendUInt16LE(payloadLen);

  // The buffer builder increases the length even though we're writing
  // into the middle, so we restore both the length and the writeIndex.
  builder.writeIndex = builder.length = endIndex;
};
