#!/usr/bin/env node

'use strict';

const commandLineArgs = require('command-line-args');
const deconzApi = require('../lib/deconz-api');
const {dumpFrame} = require('../dump/dump-frame');
const SerialPort = require('serialport');
const Slip = exports.Slip = require('../lib/slip');
const util = require('util');
const zcl = require('zcl-packet');
const zdo = require('zigbee-zdo');

const C = deconzApi.constants;

let DEBUG_rawFrames = false;
let DEBUG_frameDetail = false;
let DEBUG_slip = false;

function isZclFrame(frame) {
  if (typeof frame.profileId === 'number') {
    return frame.profileId === C.PROFILE_ID.ZHA ||
           frame.profileId === C.PROFILE_ID.ZLL;
  }
  return frame.profileId === C.PROFILE_ID.ZHA_HEX ||
         frame.profileId === C.PROFILE_ID.ZLL_HEX;
}

class Driver {
  constructor(portName, serialPort) {
    this.portName = portName;
    this.serialPort = serialPort;

    this.dc = new deconzApi.DeconzAPI({raw_frames: DEBUG_rawFrames});

    this.dc.on('error', (err) => {
      console.error('deConz error:', err);
    });

    if (DEBUG_rawFrames) {
      this.dc.on('frame_raw', (rawFrame) => {
        console.log('Rcvd:', rawFrame);
        if (this.dc.canParse(rawFrame)) {
          try {
            const frame = this.dc.parseFrame(rawFrame);
            try {
              this.handleFrame(frame);
            } catch (e) {
              console.error('Error handling frame_raw');
              console.error(e);
              console.error(util.inspect(frame, {depth: null}));
            }
          } catch (e) {
            console.error('Error parsing frame_raw');
            console.error(e);
            console.error(rawFrame);
          }
        } else {
          console.error('canParse returned false for frame');
          console.error(rawFrame);
        }
      });
    } else {
      this.dc.on('frame_object', (frame) => {
        try {
          this.handleFrame(frame);
        } catch (e) {
          console.error('Error handling frame_object');
          console.error(e);
          console.error(util.inspect(frame, {depth: null}));
        }
      });
    }

    console.log(`DeconzDriver: Using serial port ${portName}`);
    this.serialPort.on('data', (chunk) => {
      if (DEBUG_slip) {
        console.log('Rcvd Chunk:', chunk);
      }
      this.dc.parseRaw(chunk);
    });
  }

  handleFrame(frame) {
    const label = 'Rcvd';
    if (zdo.isZdoFrame(frame)) {
      zdo.parseZdoFrame(frame);
      dumpFrame(label, frame, DEBUG_frameDetail);
    } else if (isZclFrame(frame)) {
      const clusterId = parseInt(frame.clusterId, 16);
      zcl.parse(frame.data, clusterId, (_error, zclData) => {
        frame.zcl = zclData;
        dumpFrame(label, frame, DEBUG_frameDetail);
      });
    } else {
      dumpFrame(label, frame, DEBUG_frameDetail);
    }
  }
}

function serialWriteError(error) {
  if (error) {
    console.error('SerialPort.write error:', error);
    throw error;
  }
}

function main() {
  const optionsDefs = [
    {name: 'debug', alias: 'd', type: Boolean},
    {name: 'slip', alias: 's', type: Boolean},
  ];
  const options = commandLineArgs(optionsDefs, {stopAtFirstUnknown: true});
  const argv = options._unknown || [];

  DEBUG_rawFrames = options.debug;
  DEBUG_frameDetail = options.debug;
  DEBUG_slip = options.debug;

  console.log('argv =', argv);

  if (argv.length < 2) {
    console.error('Usage: test-serial.js [options] port data');
    return;
  }
  const port = argv[0];
  const packets = argv.slice(1);

  console.log('Opening', port);
  const serialPort = new SerialPort(port, {
    baudRate: 38400,
    lock: true,
  }, (err) => {
    if (err) {
      console.error('`${portName} is locked');
      return;
    }

    const _ = new Driver(port, serialPort);

    if (options.slip) {
      // Data is already SLIP encapsulated
      for (const packet of packets) {
        const slipFrame = new Buffer(packet.replace(/\s+/g, ''), 'hex');
        if (DEBUG_slip) {
          console.log('Sent Chunk:', slipFrame);
        }
        serialPort.write(slipFrame, serialWriteError);
        setTimeout(() => {
          console.log('x');
        }, 0);
      }
    } else {
      // Data is a raw packet - needs to be slip encapsulated
      for (const packet of packets) {
        const rawFrame = new Buffer(packet.replace(/\s+/g, ''), 'hex');
        if (DEBUG_rawFrames) {
          console.log('Sent:', rawFrame);
        }
        const slipFrame = Slip.Encapsulate(rawFrame);
        if (DEBUG_slip) {
          console.log('Sent Chunk:', slipFrame);
        }
        serialPort.write(slipFrame, serialWriteError);
      }
    }
    setTimeout(() => {
      console.log('Closing serial port');
      serialPort.close();
    }, 3000);
  });
}

main();

