#!/usr/bin/env node

'use strict';

const commandLineArgs = require('command-line-args');
const SerialPort = require('serialport');
const util = require('util');
const zdo = require('zigbee-zdo');

const deconz = require('./lib/deconz-api');
const C = deconz.constants;
const DeconzAPI = deconz.DeconzAPI;

const {dumpFrame} = require('./dump/dump-frame');

const DEBUG_frames = true;
let DEBUG_frameDetail = false;
let DEBUG_rawFrames = false;
let DEBUG_slip = false;

const PARAM = [
  C.PARAM_ID.MAC_ADDRESS,
  C.PARAM_ID.NETWORK_PANID16,
  C.PARAM_ID.NETWORK_ADDR16,
  C.PARAM_ID.NETWORK_PANID64,
  C.PARAM_ID.APS_DESIGNATED_COORDINATOR,
  C.PARAM_ID.SCAN_CHANNELS,
  C.PARAM_ID.APS_PANID64,
  C.PARAM_ID.TRUST_CENTER_ADDR64,
  C.PARAM_ID.SECURITY_MODE,
  C.PARAM_ID.NETWORK_KEY,
  C.PARAM_ID.OPERATING_CHANNEL,
  C.PARAM_ID.PROTOCOL_VERSION,
  C.PARAM_ID.NETWORK_UPDATE_ID,
];

function serialWriteError(error) {
  if (error) {
    console.log('SerialPort.write error:', error);
    throw error;
  }
}

class DeconzTest {
  constructor(port) {
    this.port = port;

    this.dc = new DeconzAPI({raw_frames: DEBUG_rawFrames});
    this.zdo = new zdo.ZdoApi(deconz._frame_builder.nextFrameId,
                              C.FRAME_TYPE.APS_DATA_REQUEST);

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

    this.serialport = new SerialPort(port.comName, {
      baudRate: 38400,
    }, (err) => {
      if (err) {
        console.log('SerialPort open err =', err);
        return;
      }

      this.serialport.on('data', (chunk) => {
        if (DEBUG_slip) {
          console.log('Rcvd Chunk:', chunk);
        }
        this.dc.parseRaw(chunk);
      });
      this.readParameters();
    });
  }

  dumpParameters() {
    for (const paramId of PARAM) {
      const param = C.PARAM_ID[paramId];
      const label = param.label.padStart(20, ' ');
      let value = this[param.fieldName];
      if (paramId == C.PARAM_ID.SCAN_CHANNELS) {
        value = value.toString(16).padStart(8, '0');
      }
      console.log(`${label}: ${value}`);
    }
  }

  handleFrame(frame) {
    frame.received = true;

    if (zdo.isZdoFrame(frame)) {
      zdo.parseZdoFrame(frame);
    }

    if (DEBUG_frames) {
      dumpFrame('Rcvd:', frame, DEBUG_frameDetail);
    }

    if (frame.type == C.FRAME_TYPE.APS_DATA_INDICATION ||
        frame.type == C.FRAME_TYPE.APS_DATA_CONFIRM) {
      this.deviceStateUpdateInProgress = false;
    }

    if (!this.deviceStateUpdateInProgress) {
      if (frame.hasOwnProperty('dataConfirm') && frame.dataConfirm) {
        // There's a send confirmation ready to be read
        this.deviceStateUpdateInProgress = true;
        this.sendFrame({
          type: C.FRAME_TYPE.APS_DATA_CONFIRM,
        });
      } else if (!this.deviceStateUpdateInProgress) {
        if (frame.hasOwnProperty('dataIndication') && frame.dataIndication) {
          // There's a frame ready to be read.
          this.deviceStateUpdateInProgress = true;
          this.sendFrame({
            type: C.FRAME_TYPE.APS_DATA_INDICATION,
          });
        }
      }
    }

    if (frame.type == C.FRAME_TYPE.READ_PARAMETER) {
      if (this.paramIdx < PARAM.length) {
        const paramId = PARAM[this.paramIdx];
        const fieldName = C.PARAM_ID[paramId].fieldName;
        this[fieldName] = frame[fieldName];
        this.paramIdx++;
        if (this.paramIdx == PARAM.length) {
          this.dumpParameters();
          this.sendFrame({
            type: C.FRAME_TYPE.VERSION,
          });
        } else {
          this.readParameter(this.paramIdx);
        }
      }
    } else if (frame.type == C.FRAME_TYPE.VERSION) {
      this.sendFrame(this.zdo.makeFrame({
        destination64: this.macAddress,
        destination16: '0000',
        clusterId: zdo.CLUSTER_ID.MANAGEMENT_LQI_REQUEST,
        startIndex: 0,
      }));
    } else if (frame.type == C.FRAME_TYPE.APS_DATA_INDICATION) {
      const clusterId = parseInt(frame.clusterId, 16);
      if (clusterId == zdo.CLUSTER_ID.MANAGEMENT_LQI_RESPONSE) {
        if (frame.numEntries > 0) {
          this.sendFrame(this.zdo.makeFrame({
            destination64: frame.neighbors[0].addr64,
            clusterId: zdo.CLUSTER_ID.NETWORK_ADDRESS_REQUEST,
            addr64: frame.neighbors[0].addr64,
            requestType: 0,
            startIndex: 0,
          }));
        } else {
          setTimeout(() => {
            if (this.serialport.isOpen) {
              console.log('Demo completed');
              this.serialport.close();
            }
          }, 1000);
        }
      } else {
        setTimeout(() => {
          if (this.serialport.isOpen) {
            console.log('Demo completed');
            this.serialport.close();
          }
        }, 1000);
      }
    }
  }

  readParameter(paramIdx) {
    if (paramIdx >= PARAM.length) {
      return;
    }
    const paramId = PARAM[paramIdx];
    this.sendFrame({
      type: C.FRAME_TYPE.READ_PARAMETER,
      paramId: paramId,
    });
  }

  readParameters() {
    this.paramIdx = 0;
    this.readParameter(this.paramIdx);
  }

  sendFrame(frame) {
    if (DEBUG_frames) {
      dumpFrame('Sent:', frame, DEBUG_frameDetail);
    }
    const rawFrame = this.dc.buildFrame(frame);
    if (DEBUG_rawFrames) {
      console.log('Sent:', rawFrame);
    }
    this.serialport.write(rawFrame, serialWriteError);
  }
}

function isConBeePort(port) {
  return (port.vendorId == '1cf1' && port.productId == '0030') ||
         (port.vendorId === '0403' &&
          (port.productId === '6015' || port.productId === '6001') &&
          port.manufacturer === 'FTDI');
}

const optionsDefs = [
  {name: 'detail', alias: 'd', type: Boolean},
  {name: 'raw', alias: 'r', type: Boolean},
  {name: 'slip', alias: 's', type: Boolean},
];
const options = commandLineArgs(optionsDefs);
DEBUG_rawFrames = options.raw;
DEBUG_frameDetail = options.detail;
DEBUG_slip = options.slip;

SerialPort.list((error, ports) => {
  if (error) {
    console.error(error);
    return;
  }

  const conBeePorts = ports.filter(isConBeePort);
  if (conBeePorts.length == 0) {
    console.error('No ConBee ports found');
    return;
  }
  if (conBeePorts.length > 1) {
    console.error('Too many ConBee ports found');
    return;
  }
  const portName = conBeePorts[0].comName;
  console.log('Found ConBee at', portName);
  const _dcTest = new DeconzTest(conBeePorts[0]);
});
