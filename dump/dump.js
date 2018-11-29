#!/usr/bin/env node
//
// Program for decoding a wireshark capture of the serial port data
// going to a ConBee dongle.
//
// See: http://blog.davehylands.com/capturing-usb-serial-using-wireshark/
// for details on how to setup wireshark and save the .json file
// that this program uses for input.

'use strict';

const commandLineArgs = require('command-line-args');
const zclId = require('zcl-id');
const zcl = require('zcl-packet');
const zdo = require('zigbee-zdo');

const deconz = require('../lib/deconz-api');
const C = deconz.constants;
const DeconzAPI = deconz.DeconzAPI;
const Slip = deconz.Slip;

const {dumpFrame} = require('./dump-frame');

const readSlip = new Slip.Parser(160, {read: true, label: 'Rcvd:'});
const writeSlip = new Slip.Parser(160, {read: false, label: 'Sent:'});

readSlip.on('packet', onPacket);
writeSlip.on('packet', onPacket);

const dc = new DeconzAPI();

let DEBUG_rawFrames = false;
let DEBUG_frameDetail = false;

function calcCrc(buffer, len) {
  let crc = 0;
  for (let i = 0; i < len; i++) {
    crc += buffer[i];
  }
  return (~crc + 1) & 0xffff;
}

function hexStr(number, width) {
  return `00000000${number.toString(16)}`.slice(-width);
}

function isZclFrame(frame) {
  if (typeof frame.profileId === 'number') {
    return frame.profileId === C.PROFILE_ID.ZHA ||
           frame.profileId === C.PROFILE_ID.ZLL;
  }
  return frame.profileId === C.PROFILE_ID.ZHA_HEX ||
         frame.profileId === C.PROFILE_ID.ZLL_HEX;
}

function onPacket(packet, params) {
  // Validate the CRC
  const frameLen = packet.length - 2;
  const actualCrc = calcCrc(packet, frameLen);
  const expectedCrc = packet[frameLen] + (packet[frameLen + 1] << 8);
  if (actualCrc != expectedCrc) {
    console.error(`Invalid CRC calculated ${hexStr(actualCrc, 4)},`,
                  `expecting ${hexStr(expectedCrc, 4)}`);
    console.error(params.label, packet);
    return;
  }
  let label = `     ${params.timeStamp}`.slice(-9);
  label += `     ${params.frameNum}`.slice(-6);
  label += ` ${params.label}`;
  if (DEBUG_rawFrames) {
    console.log(label, packet);
  }
  let frame;
  if (params.read) {
    frame = dc.parseFrame(packet);
    frame.received = true;
  } else {
    frame = dc.parseWriteFrame(packet);
  }
  if (zdo.isZdoFrame(frame)) {
    zdo.parseZdoFrame(frame);
    dumpFrame(label, frame, DEBUG_frameDetail);
  } else if (isZclFrame(frame)) {
    const clusterId = parseInt(frame.clusterId, 16);
    zcl.parse(frame.data, clusterId, (_error, zclData) => {
      frame.zcl = zclData;
      dumpFrame(label, frame, DEBUG_frameDetail);
    });
    dumpFrame(label, frame, DEBUG_frameDetail);
  } else {
    dumpFrame(label, frame, DEBUG_frameDetail);
  }
}

const optionsDefs = [
  {name: 'raw', alias: 'r', type: Boolean},
  {name: 'detail', alias: 'd', type: Boolean},
  {name: 'json', alias: 'j', type: String, defaultOption: true},
];
const options = commandLineArgs(optionsDefs);

DEBUG_rawFrames = options.raw;
DEBUG_frameDetail = options.detail;

let json;
try {
  json = require(`./${options.json}`);
} catch (error) {
  console.log('Error parsing JSON file:', options.json);
  console.log(error);
  process.exit();
}

for (const packet of json) {
  const layer = packet._source.layers;
  const frameNum = layer.frame['frame.number'];
  const timeStamp = layer.frame['frame.time_relative'].slice(0, -6);
  const usb = layer.usb;
  const data = layer['usb.capdata'].replace(/:/g, '');

  const read = usb['usb.dst'] === 'host';
  if (read) {
    if (data.length == 4) {
      continue;
    }
    // Strip the first two characters (FTDI status bytes).
    readSlip.params.timeStamp = timeStamp;
    readSlip.params.frameNum = frameNum;
    readSlip.parseChunk(Buffer.from(data.slice(4), 'hex'));
  } else {
    writeSlip.params.timeStamp = timeStamp;
    writeSlip.params.frameNum = frameNum;
    writeSlip.parseChunk(Buffer.from(data, 'hex'));
  }
}
