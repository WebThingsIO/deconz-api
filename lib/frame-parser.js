/**
 * deconz-frame-parser.js - Parse frames for the deCONZ serial API.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.*
 */

'use strict';

const C = require('./constants.js');

const frame_parser = module.exports = {};

function swapHex(string) {
  return string.match(/.{2}/g).reverse().join('');
}

// ----- Param Parsers -----------------------------------------------------

const param_parser = {};
param_parser[C.PARAM_ID.MAC_ADDRESS] = function(frame, reader) {
  frame.macAddress = swapHex(reader.nextString(8, 'hex'));
};
param_parser[C.PARAM_ID.NETWORK_PANID16] = function(frame, reader) {
  frame.networkPanId16 = swapHex(reader.nextString(2, 'hex'));
};
param_parser[C.PARAM_ID.NETWORK_ADDR16] = function(frame, reader) {
  frame.networkAddr16 = swapHex(reader.nextString(2, 'hex'));
};
param_parser[C.PARAM_ID.NETWORK_PANID64] = function(frame, reader) {
  frame.networkPanId64 = swapHex(reader.nextString(8, 'hex'));
};
param_parser[C.PARAM_ID.APS_DESIGNATED_COORDINATOR] = function(frame, reader) {
  frame.apsDesignatedCoordinator = reader.nextUInt8();
};
param_parser[C.PARAM_ID.SCAN_CHANNELS] = function(frame, reader) {
  frame.scanChannels = reader.nextUInt32LE();
};
param_parser[C.PARAM_ID.APS_PANID64] = function(frame, reader) {
  frame.apsPanId64 = swapHex(reader.nextString(8, 'hex'));
};
param_parser[C.PARAM_ID.TRUST_CENTER_ADDR64] = function(frame, reader) {
  frame.trustCenterAddr64 = swapHex(reader.nextString(8, 'hex'));
};
param_parser[C.PARAM_ID.SECURITY_MODE] = function(frame, reader) {
  frame.securityMode = reader.nextUInt8();
};
param_parser[C.PARAM_ID.NETWORK_KEY] = function(frame, reader) {
  if (frame.status == C.STATUS.SUCCESS) {
    frame.networkKey = swapHex(reader.nextString(16, 'hex'));
  } else {
    frame.networkKey = '';
  }
};
param_parser[C.PARAM_ID.OPERATING_CHANNEL] = function(frame, reader) {
  frame.operatingChannel = reader.nextUInt8();
};
param_parser[C.PARAM_ID.PERMIT_JOIN] = function(frame, reader) {
  frame.permitJoin = reader.nextUInt8();
};
param_parser[C.PARAM_ID.PROTOCOL_VERSION] = function(frame, reader) {
  frame.protocolVersion = reader.nextUInt16LE();
};
param_parser[C.PARAM_ID.NETWORK_UPDATE_ID] = function(frame, reader) {
  frame.networkUpdateId = reader.nextUInt8();
};

// ----- Frame Parsers -----------------------------------------------------

function parseDeviceState(frame, reader) {
  frame.deviceState = reader.nextUInt8();
  frame.networkState = (frame.deviceState & 0x03);
  frame.dataConfirm = (frame.deviceState & 0x04) != 0;
  frame.dataIndication = (frame.deviceState & 0x08) != 0;
  frame.configChanged = (frame.deviceState & 0x10) != 0;
  frame.dataRequest = (frame.deviceState & 0x20) != 0;
}

// Query Send Data State Response
frame_parser[C.FRAME_TYPE.APS_DATA_CONFIRM] =
function(frame, reader, _options) {
  frame.payloadLen = reader.nextUInt16LE();
  parseDeviceState(frame, reader);
  if (frame.status != 0) {
    return;
  }
  frame.id = reader.nextUInt8();
  frame.dstAddrMode = reader.nextUInt8();
  switch (frame.dstAddrMode) {
    case 0:
      // This means that there is no addressing information included
      // and can happen when trying to send to a group address when
      // there are no bindings setup.
      break;
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
  frame.sourceEndpoint = reader.nextString(1, 'hex');
  frame.status = reader.nextUInt8();
};

// Read Received Data
frame_parser[C.FRAME_TYPE.APS_DATA_INDICATION] =
function(frame, reader, _options) {
  frame.payloadLen = reader.nextUInt16LE();
  parseDeviceState(frame, reader);
  frame.dstAddrMode = reader.nextUInt8();
  if (frame.dstAddrMode == C.NETWORK_ADDR_MODE.ADDR64) {
    frame.destination64 = swapHex(reader.nextString(8, 'hex'));
  } else {
    frame.destination16 = swapHex(reader.nextString(2, 'hex'));
  }
  frame.destinationEndpoint = reader.nextUInt8();
  frame.srcAddrMode = reader.nextUInt8();
  if (frame.srcAddrMode == C.NETWORK_ADDR_MODE.ADDR64) {
    frame.remote64 = swapHex(reader.nextString(8, 'hex'));
  } else {
    frame.remote16 = swapHex(reader.nextString(2, 'hex'));
  }
  frame.sourceEndpoint = reader.nextString(1, 'hex');
  frame.profileId = swapHex(reader.nextString(2, 'hex'));
  frame.clusterId = swapHex(reader.nextString(2, 'hex'));
  const dataLen = reader.nextUInt16LE();
  frame.data = reader.nextBuffer(dataLen);
  reader.nextUInt8(); // reserved
  reader.nextUInt8(); // reserved
  frame.lqi = reader.nextUInt8();
  reader.nextUInt8(); // reserved
  reader.nextUInt8(); // reserved
  reader.nextUInt8(); // reserved
  reader.nextUInt8(); // reserved
  frame.rssi = reader.nextInt8();
};

frame_parser[C.FRAME_TYPE.APS_DATA_REQUEST] =
function(frame, reader, _options) {
  frame.payloadLen = reader.nextUInt16LE();
  parseDeviceState(frame, reader);
  frame.id = reader.nextUInt8();
};

frame_parser[C.FRAME_TYPE.CHANGE_NETWORK_STATE] =
function(frame, reader, _options) {
  frame.networkState = reader.nextUInt8();
};

frame_parser[C.FRAME_TYPE.DEVICE_STATE] =
frame_parser[C.FRAME_TYPE.DEVICE_STATE_CHANGED] =
function(frame, reader, _options) {
  parseDeviceState(frame, reader);
};

frame_parser[C.FRAME_TYPE.READ_PARAMETER] = function(frame, reader, _options) {
  frame.payloadLen = reader.nextUInt16LE();
  frame.paramId = reader.nextUInt8();
  if (param_parser[frame.paramId]) {
    param_parser[frame.paramId](frame, reader);
  } else {
    console.error('No parser for paramId:', frame.paramId);
    frame.paramData = reader.nextAll();
  }
};

frame_parser[C.FRAME_TYPE.VERSION] = function(frame, reader, _options) {
  frame.version = swapHex(reader.nextString(4, 'hex'));
};

frame_parser[C.FRAME_TYPE.WRITE_PARAMETER] = function(frame, reader, _options) {
  frame.payloadLen = reader.nextUInt16LE();
  frame.paramId = reader.nextUInt8();
};
