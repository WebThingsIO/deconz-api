/**
 * deconz-constants.js - Constants for the deCONZ serial API.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.*
 */

'use strict';

exports = module.exports;

const ft = exports.FRAME_TYPE = {};

ft.APS_DATA_CONFIRM = 0x04;
ft[ft.APS_DATA_CONFIRM] = 'Query Send Data State (0x04)';
ft.DEVICE_STATE = 0x07;
ft[ft.DEVICE_STATE] = 'Device State (0x07)';
ft.CHANGE_NETWORK_STATE = 0x08;
ft[ft.CHANGE_NETWORK_STATE] = 'Change Network State (0x08)';
ft.READ_PARAMETER = 0x0a;
ft[ft.READ_PARAMETER] = 'Read Parameter (0x0A)';
ft.WRITE_PARAMETER = 0x0b;
ft[ft.WRITE_PARAMETER] = 'Write Parameter (0x0b)';
ft.VERSION = 0x0d;
ft[ft.VERSION] = 'Version (0x0d)';
ft.DEVICE_STATE_CHANGED = 0x0e;
ft[ft.DEVICE_STATE_CHANGED] = 'Device State Changed (0x0e)';
ft.APS_DATA_REQUEST = 0x12;
ft[ft.APS_DATA_REQUEST] = 'Enqueue Send Data (0x12)';
ft.APS_DATA_INDICATION = 0x17;
ft[ft.APS_DATA_INDICATION] = 'Read Received Data (0x17)';

exports.NETWORK_ADDR_MODE = {
  GROUP: 1,   // group addresses are 16-bit
  ADDR16: 2,
  ADDR64: 3,
};

const NETWORK_STATE_STR = exports.NETWORK_STATE_STR = [
  'NET_OFFLINE',
  'NET_JOINING',
  'NET_CONNECTED',
  'NET_LEAVING',
];
const NETWORK_STATE = exports.NETWORK_STATE = {};
for (let stateIdx = 0; stateIdx < NETWORK_STATE_STR.length; stateIdx++) {
  NETWORK_STATE[NETWORK_STATE_STR[stateIdx]] = stateIdx;
}

const pi = exports.PARAM_ID = {};

pi.MAC_ADDRESS = 0x01;                  // 1
pi[pi.MAC_ADDRESS] = {
  label: 'MAC Address',
  fieldName: 'macAddress',
};
pi.NETWORK_PANID16 = 0x05;              // 5
pi[pi.NETWORK_PANID16] = {
  label: 'Network PANID16',
  fieldName: 'networkPanId16',
};
pi.NETWORK_ADDR16 = 0x07;               // 7
pi[pi.NETWORK_ADDR16] = {
  label: 'Network Addr16',
  fieldName: 'networkAddr16',
};
pi.NETWORK_PANID64 = 0x08;              // 8
pi[pi.NETWORK_PANID64] = {
  label: 'Network PANID64',
  fieldName: 'networkPanId64',
};
pi.APS_DESIGNATED_COORDINATOR = 0x09;   // 9
pi[pi.APS_DESIGNATED_COORDINATOR] = {
  label: 'APS Designated Coordinator',
  fieldName: 'apsDesignatedCoordinator',
};
pi.SCAN_CHANNELS = 0x0a;                // 10
pi[pi.SCAN_CHANNELS] = {
  label: 'Scan Channels',
  fieldName: 'scanChannels',
};
pi.APS_PANID64 = 0x0b;                  // 11
pi[pi.APS_PANID64] = {
  label: 'APS PANID64',
  fieldName: 'apsPanId64',
};
pi.TRUST_CENTER_ADDR64 = 0x0e;          // 14
pi[pi.TRUST_CENTER_ADDR64] = {
  label: 'Trust Center Addr64',
  fieldName: 'trustCenterAddr64',
};
pi.SECURITY_MODE = 0x10;                // 16
pi[pi.SECURITY_MODE] = {
  label: 'Security Mode',
  fieldName: 'securityMode',
};
pi.NETWORK_KEY = 0x18;                  // 24
pi[pi.NETWORK_KEY] = {
  label: 'Network Key',
  fieldName: 'networkKey',
};
pi.OPERATING_CHANNEL = 0x1c;            // 28
pi[pi.OPERATING_CHANNEL] = {
  label: 'Operating Channel',
  fieldName: 'operatingChannel',
};
pi.PERMIT_JOIN = 0x21;                  // 33
pi[pi.PERMIT_JOIN] = {
  label: 'Permit Join',
  fieldName: 'permitJoin',
};
pi.PROTOCOL_VERSION = 0x22;             // 34
pi[pi.PROTOCOL_VERSION] = {
  label: 'Protocol Version',
  fieldName: 'protocolVersion',
};
pi.NETWORK_UPDATE_ID = 0x24;            // 36
pi[pi.NETWORK_UPDATE_ID] = {
  label: 'Network Update ID',
  fieldName: 'networkUpdateId',
};

exports.PROFILE_ID = {
  ZDO: 0,
  ZHA: 260,
  ZLL: 49246,
  ZDO_HEX: '0000',
  ZHA_HEX: '0104',
  ZLL_HEX: 'c05e',
};

const STATUS_STR = exports.STATUS_STR = [
  'SUCCESS',
  'FAILURE',
  'BUSY',
  'TIMEOUT',
  'UNSUPPORTED',
  'ERROR',
  'NO_NETWORK',
  'INVALID_VALUE',
];

const STATUS = exports.STATUS = {};
for (let statusIdx = 0; statusIdx < STATUS_STR.length; statusIdx++) {
  STATUS[STATUS_STR[statusIdx]] = statusIdx;
}
