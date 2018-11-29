/**
 * deconz-constants.js - Constants for the deCONZ serial API.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.*
 */

'use strict';

const C = require('../lib/deconz-api').constants;
const util = require('util');
const zclId = require('zcl-id');
const zdo = require('zigbee-zdo');

function deviceStateStr(frame) {
  let devStateStr = '';
  devStateStr += frame.dataConfirm ? 'C' : '-';
  devStateStr += frame.dataIndication ? 'D' : '-';
  devStateStr += frame.dataRequest ? 'R' : '-';   // space avail
  devStateStr += frame.configChanged ? 'F' : '-';
  return `Net:${'OJCL'[frame.networkState]} Dev:${devStateStr}`;
}

function dumpFrame(label, frame, dumpFrameDetail) {
  let frameTypeStr = frameTypeAsStr(frame);
  if (!frameTypeStr) {
    frameTypeStr = `Unknown(0x${frame.type.toString(16)})`;
  }
  if (frame.response) {
    frameTypeStr += ' Response';
  } else {
    frameTypeStr += ' Request ';
  }

  switch (frame.type) {

    case C.FRAME_TYPE.READ_PARAMETER:
    case C.FRAME_TYPE.WRITE_PARAMETER: {
      let paramStr;
      if (frame.paramId in C.PARAM_ID) {
        paramStr = C.PARAM_ID[frame.paramId].label;
      } else {
        paramStr = `Unknown(${frame.paramId})`;
      }
      const param = C.PARAM_ID[frame.paramId];
      if (param) {
        if (frame.hasOwnProperty(param.fieldName)) {
          paramStr += `: ${frame[param.fieldName]}`;
        }
      }
      console.log(label, frameTypeStr, paramStr);
      break;
    }

    case C.FRAME_TYPE.APS_DATA_CONFIRM: { // Query Send State
      if (!frame.response) {
        console.log(label, 'Query Send Data State (APS Data Confirm) Request');
        break;
      }
      const dstAddr = frame.destination64 || frame.destination16;
      console.log(label, 'Query Send Data State (APS Data Confirm) Response',
                  dstAddr, `ID:${frame.id}`,
                  deviceStateStr(frame));
      break;
    }

    case C.FRAME_TYPE.APS_DATA_INDICATION: {  // Read Received Data
      if (!frame.response) {
        console.log(label, 'Read Received Data (APS Data Indication) Request');
        break;
      }
      dumpZigbeeRxFrame(label, frame);
      break;
    }

    case C.FRAME_TYPE.APS_DATA_REQUEST: {   // Enqueue Send Data
      if (frame.response) {
        console.log(label, 'Enqueue Send Data (APS Data Request) Response',
                    deviceStateStr(frame));
        break;
      }
      dumpZigbeeTxFrame(label, frame);
      break;
    }

    case C.FRAME_TYPE.DEVICE_STATE:
    case C.FRAME_TYPE.DEVICE_STATE_CHANGED:
      if (frame.response) {
        console.log(label, frameTypeStr, deviceStateStr(frame));
      } else {
        console.log(label, frameTypeStr);
      }
      break;

    case C.FRAME_TYPE.VERSION:
      if (frame.response) {
        console.log(label, frameTypeStr, frame.version);
      } else {
        console.log(label, frameTypeStr);
      }
      break;

    default:
      console.log(label, `Unknown ${frameTypeStr}`);
  }
  if (dumpFrameDetail) {
    const frameStr = util.inspect(frame, {depth: null})
      .replace(/\n/g, `\n${label} `);
    console.log(label, frameStr);
  }
}

function dumpZclPayload(label, frame) {
  label += '  ';
  const cmd = frame.zcl.cmd || frame.zcl.cmdId;
  const clusterId = parseInt(frame.clusterId, 16);
  switch (cmd) {
    case 'read':
    case 'readRsp':
    case 'report':
    case 'write':
    case 'writeRsp': {
      for (const attrEntry of frame.zcl.payload) {
        const attrId = attrEntry.attrId;
        const attr = zclId.attr(clusterId, attrId);
        const attrIdStr = `    ${attrId}`.slice(-5);
        let s = `${attrIdStr}:${attr ? attr.key : '???'}`;
        if (attrEntry.hasOwnProperty('status')) {
          const status = zclId.status(attrEntry.status);
          s += ` ${attrEntry.status}:${status ? status.key : '???'}`;
        }
        if (attrEntry.hasOwnProperty('dataType')) {
          const dataType = zclId.dataType(attrEntry.dataType);
          s += ` ${attrEntry.dataType}:${dataType ? dataType.key : '???'}`;
        }
        if (attrEntry.hasOwnProperty('attrData')) {
          s += ` 0x${attrEntry.attrData.toString(16)}(${attrEntry.attrData})`;
        }
        console.log(label, s);
      }
      break;
    }

    default:
      console.log(label, 'payload:', frame.zcl.payload);
  }
}

function dumpZigbeeRxFrame(label, frame) {
  const cluster = zclId.cluster(parseInt(frame.clusterId, 16));
  const clusterKey = cluster && cluster.key || '???';
  const remoteAddr = frame.remote64 || frame.remote16;
  if (zdo.isZdoFrame(frame)) {
    const shortDescr = frame.shortDescr || '';
    const status = frameStatus(frame);
    console.log(label, 'Read Received Data', remoteAddr,
                'ZDO',
                zdo.getClusterIdAsString(frame.clusterId),
                zdo.getClusterIdDescription(frame.clusterId),
                shortDescr,
                'status:', status.key, `(${status.value})`);
    zdo.dumpZdoFrame(`${label}  `, frame);
  } else if (isZhaFrame(frame)) {
    if (frame.zcl) {
      console.log(label, 'Read Received Data', remoteAddr,
                  'ZHA', frame.clusterId, clusterKey,
                  frame.zcl ? frame.zcl.cmdId : '???');
      dumpZclPayload(label, frame);
    } else {
      console.log(label, 'Read Received Data', remoteAddr,
                  'ZHA', frame.clusterId, clusterKey,
                  '??? no zcl ???');
    }
  } else if (isZllFrame(frame)) {
    if (frame.zcl) {
      console.log(label, 'Read Received Data', remoteAddr,
                  'ZLL', frame.clusterId, clusterKey,
                  frame.zcl ? frame.zcl.cmdId : '???');
      dumpZclPayload(label, frame);
    } else {
      console.log(label, 'Read Received Data', remoteAddr,
                  'ZLL', frame.clusterId, clusterKey,
                  '??? no zcl ???');
    }
  } else {
    console.log(label, 'Read Received Data', remoteAddr,
                `???(${frame.profileId})`, frame.clusterId);
  }
}

function dumpZigbeeTxFrame(label, frame) {
  const cluster = zclId.cluster(parseInt(frame.clusterId, 16));
  const clusterKey = cluster && cluster.key || '???';
  const dstAddr = frame.destination64 || frame.destination16;
  if (zdo.isZdoFrame(frame)) {
    const shortDescr = frame.shortDescr || '';
    console.log(label, 'Enqueue Send Data', dstAddr,
                'ZDO',
                zdo.getClusterIdAsString(frame.clusterId),
                zdo.getClusterIdDescription(frame.clusterId),
                shortDescr);
    zdo.dumpZdoFrame(`${label}  `, frame);
  } else if (isZhaFrame(frame)) {
    if (frame.zcl) {
      const cmd = frame.zcl.cmd || frame.zcl.cmdId;
      console.log(label, 'Enqueue Send Data', dstAddr,
                  'ZHA', frame.clusterId, clusterKey, cmd);
      dumpZclPayload(label, frame);
    } else {
      console.log(label, 'Enqueue Send Data', dstAddr,
                  `ID:${frame.id}`,
                  'ZHA', frame.clusterId, clusterKey,
                  '??? no zcl ???');
    }
  } else if (isZllFrame(frame)) {
    if (frame.zcl) {
      const cmd = frame.zcl.cmd || frame.zcl.cmdId;
      console.log(label, 'Enqueue Send Data', dstAddr,
                  `ID:${frame.id}`,
                  'ZLL', frame.clusterId, clusterKey, cmd);
      dumpZclPayload(label, frame);
    } else {
      console.log(label, 'Enqueue Send Data', dstAddr,
                  `ID:${frame.id}`,
                  'ZLL', frame.clusterId, clusterKey,
                  '??? no zcl ???');
    }
  } else {
    console.log(label, 'Enqueue Send Data', dstAddr,
                `???(${frame.profileId})`, frame.clusterId);
  }
}

function isZhaFrame(frame) {
  if (typeof frame.profileId === 'number') {
    return frame.profileId === C.PROFILE_ID.ZHA;
  }
  return frame.profileId === C.PROFILE_ID.ZHA_HEX;
}

function isZllFrame(frame) {
  if (typeof frame.profileId === 'number') {
    return frame.profileId === C.PROFILE_ID.ZLL;
  }
  return frame.profileId === C.PROFILE_ID.ZLL_HEX;
}

function frameStatus(frame) {
  if (frame.hasOwnProperty('status')) {
    const status = zclId.status(frame.status);
    if (status) {
      return status;
    }
    // Something that zclId doesn't know about.
    return {
      key: 'unknown',
      value: frame.status,
    };
  }

  // Frames sent from the device not in response to an ExplicitTx
  // (like "End Device Announcement") won't have a status.
  return {
    key: 'none',
    // eslint-disable-next-line no-undefined
    value: undefined,
  };
}

function frameTypeAsStr(frame) {
  if (C.FRAME_TYPE.hasOwnProperty(frame.type)) {
    return C.FRAME_TYPE[frame.type];
  }
  return `${frame.type} (0x${frame.type.toString(16)})`;
}

module.exports = {
  dumpFrame,
};
