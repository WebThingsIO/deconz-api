#!/usr/bin/env node

'use strict';

const commandLineArgs = require('command-line-args');
const SerialPort = require('serialport');
const util = require('util');
const zcl = require('zcl-packet');
const zclId = require('zcl-id');
const zdo = require('zigbee-zdo');

const deconz = require('../lib/deconz-api');
const C = deconz.constants;
const DeconzAPI = deconz.DeconzAPI;

const {dumpFrame} = require('../dump/dump-frame');

let DEBUG_frames = false;
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

// Server in this context means "server of the cluster"
const DIR = {
  CLIENT_TO_SERVER: 0,
  SERVER_TO_CLIENT: 1,
};

function serialWriteError(error) {
  if (error) {
    console.log('SerialPort.write error:', error);
    throw error;
  }
}

class Node {
  constructor(adapter, addr64, addr16) {
    this.adapter = adapter;
    this.addr64 = addr64;
    this.addr16 = addr16;
    this.zclSeqNum = 1;
  }

  advanceZclSeqNum() {
    this.zclSeqNum = (this.zclSeqNum + 1) & 0xff;
    if (this.zclSeqNum == 0) {
      // I'm not sure if 0 is a valid sequence number or not, but we'll skip it
      // just in case.
      this.zclSeqNum = 1;
    }
  }

  activeEndpoints() {
    console.log('');
    console.log('Querying active endpoints for', this.addr64, this.addr16);
    const frame = this.adapter.zdo.makeFrame({
      destination64: this.addr64,
      destination16: this.addr16,
      clusterId: zdo.CLUSTER_ID.ACTIVE_ENDPOINTS_REQUEST,
    });
    this.adapter.sendFrame(frame);
  }

  handleActiveEndpointsResponse(frame) {
    console.log(`Active Endpoints for address ${this.addr16}:`,
                frame.activeEndpoints);
  }

  discover(endpoint, clusterId) {
    const frame = this.makeDiscoverAttributesFrame(endpoint, clusterId, 0);
    this.adapter.sendFrame(frame);
  }

  handleDiscoverResponse(frame) {
    this.discover = {
      endpoint: parseInt(frame.sourceEndpoint, 16),
      clusterId: frame.clusterId,
      complete: frame.zcl.payload.discComplete,
      attrInfos: frame.zcl.payload.attrInfos,
    };
    this.doNextRead();
  }

  doNextRead() {
    if (this.discover.attrInfos.length > 0) {
      const attrInfo = this.discover.attrInfos.shift();
      const attrId = attrInfo.attrId;
      this.discover.attrId = attrId;
      this.readAttr(this.discover.endpoint,
                    this.discover.clusterId,
                    this.discover.attrId);
    } else if (this.discover.complete) {
      this.adapter.demoDone();
    } else {
      const frame = this.makeDiscoverAttributesFrame(this.discover.endpoint,
                                                     this.discover.clusterId,
                                                     this.discover.attrId + 1);
      this.adapter.sendFrame(frame);
    }
  }

  readAttr(endpoint, clusterId, attrId) {
    const readFrame = this.makeReadAttributeFrame(endpoint, clusterId, attrId);
    this.adapter.sendFrame(readFrame);
  }

  handleReadResponse(frame) {
    const clusterId = parseInt(frame.clusterId, 16);
    for (const attrEntry of frame.zcl.payload) {
      if (attrEntry.status == C.STATUS.SUCCESS) {
        const attr = zclId.attr(clusterId, attrEntry.attrId);
        const attrStr = attr ? attr.key : 'unknown';
        const dataType = zclId.dataType(attrEntry.dataType);
        const dataTypeStr = dataType ? dataType.key : 'unknown';
        console.log('AttrId:',
                    `${attrStr} ( ${attrEntry.attrId})`,
                    'dataType:', `${dataTypeStr} (${attrEntry.dataType})`,
                    'data:', attrEntry.attrData);
      }
    }
 
    this.doNextRead();
  }

  makeReadAttributeFrame(endpoint, clusterId, attrIds) {
    if (!Array.isArray(attrIds)) {
      attrIds = [attrIds];
    }
    const frame = this.makeZclFrame(
      endpoint, clusterId,
      {
        cmd: 'read',
        payload: attrIds.map((attrId) => {
          return {direction: DIR.CLIENT_TO_SERVER, attrId: attrId};
        }),
      }
    );
    return frame;
  }

  makeDiscoverAttributesFrame(endpoint, clusterId, startAttrId) {
    const frame = this.makeZclFrame(
      endpoint, clusterId,
      {
        cmd: 'discover',
        payload: {
          startAttrId: startAttrId,
          maxAttrIds: 255,
        },
      }
    );
    return frame;
  }

  makeZclFrame(endpoint, clusterId, zclData) {
    if (!zclData.hasOwnProperty('frameCntl')) {
      zclData.frameCntl = {
        // frameType 0 = foundation
        // frameType 1 = functional (cluster specific)
        frameType: 0,
      };
    }
    if (!zclData.frameCntl.hasOwnProperty('manufSpec')) {
      zclData.frameCntl.manufSpec = 0;
    }
    if (!zclData.frameCntl.hasOwnProperty('direction')) {
      zclData.frameCntl.direction = DIR.CLIENT_TO_SERVER;
    }
    if (!zclData.frameCntl.hasOwnProperty('disDefaultRsp')) {
      zclData.frameCntl.disDefaultRsp = 0;
    }
    if (!zclData.hasOwnProperty('manufCode')) {
      zclData.manufCode = 0;
    }
    if (!zclData.hasOwnProperty('payload')) {
      zclData.payload = [];
    }
    if (!zclData.hasOwnProperty('seqNum')) {
      zclData.seqNum = this.zclSeqNum;
      this.advanceZclSeqNum();
    }

    const frame = {
      id: deconz._frame_builder.nextFrameId(),
      type: C.FRAME_TYPE.APS_DATA_REQUEST,
      destination64: this.addr64,
      sourceEndpoint: 1,

      destinationEndpoint: endpoint,
      profileId: zclId.profile('HA').value,
      clusterId: clusterId,

      broadcastRadius: 0,
      options: 0,
      zcl: zclData,
    };
    if (typeof this.addr16 !== 'undefined') {
      frame.destination16 = this.addr16;
    }

    frame.data = zcl.frame(zclData.frameCntl,
                           zclData.manufCode,
                           zclData.seqNum,
                           zclData.cmd,
                           zclData.payload,
                           clusterId);
    return frame;
  }

  handleZclFrame(frame) {
    if (frame.zcl.cmdId == 'discoverRsp') {
      this.handleDiscoverResponse(frame);
    } else if (frame.zcl.cmdId == 'readRsp') {
      this.handleReadResponse(frame);
    }

  }

  simpleDescriptor(endpoint) {
    console.log('');
    console.log('Querying Simple Descriptor for', this.addr64, this.addr16,
                'endpoint:', endpoint);
    const frame = this.adapter.zdo.makeFrame({
      destination64: this.addr64,
      destination16: this.addr16,
      clusterId: zdo.CLUSTER_ID.SIMPLE_DESCRIPTOR_REQUEST,
      endpoint: endpoint,
    });
    this.adapter.sendFrame(frame);
  }

  handleSimpleDescriptorResponse(frame) {
    console.log('Simple Descriptor Response for endpoint', frame.endpoint);
    console.log('   Profile:', frame.appProfileId);
    console.log('  DeviceId:', frame.appDeviceId);
    console.log('   Version:', frame.appDeviceVersion);
    if (frame.inputClusters.length > 0) {
      console.log('  Input Clusters');
      for (const clusterId of frame.inputClusters) {
        const cluster = zclId.cluster(parseInt(clusterId, 16));
        const clusterStr = cluster ? `-${cluster.key}` : '';
        console.log(`    ${clusterId}${clusterStr}`);
      }
    }
    if (frame.inputClusters.length > 0) {
      console.log('  Output Clusters');
      for (const clusterId of frame.outputClusters) {
        const cluster = zclId.cluster(parseInt(clusterId, 16));
        const clusterStr = cluster ? `-${cluster.key}` : '';
        console.log(`    ${clusterId}${clusterStr}`);
      }
    }
  }
}

class DeconzTest {
  constructor(port, addr16, endpoint, clusterId) {
    this.port = port;

    this.discover = {addr16, endpoint, clusterId};
    console.log('DeconzTest: this.discover =', this.discover);

    this.node16 = {};
    this.node64 = {};

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

  demoDone() {
    console.log('Demo completed');
    this.serialport.close();
  }

  dumpNodes() {
    console.log('');
    console.log('Discovered Nodes:');
    console.log('Addr16 Addr64');
    console.log('------ ----------------');
    for (const addr16 in this.node16) {
      const node = this.node16[addr16];
      console.log(` ${node.addr16}  ${node.addr64}`);
    }
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

  isZclFrame(frame) {
    if (typeof frame.profileId === 'number') {
      return frame.profileId === C.PROFILE_ID.ZHA ||
             frame.profileId === C.PROFILE_ID.ZLL;
    }
    return frame.profileId === C.PROFILE_ID.ZHA_HEX ||
           frame.profileId === C.PROFILE_ID.ZLL_HEX;
  }

  handleFrame(frame) {
    frame.received = true;

    if (zdo.isZdoFrame(frame)) {
      zdo.parseZdoFrame(frame);
    } else if (this.isZclFrame(frame)) {
      const clusterId = parseInt(frame.clusterId, 16);
      zcl.parse(frame.data, clusterId, (error, zclData) => {
        if (error) {
          return;
        }
        frame.zcl = zclData;
        if (DEBUG_frames) {
          dumpFrame('Rcvd:', frame, DEBUG_frameDetail);
        }
        const node = this.node64[frame.remote64];
        if (node) {
          node.handleZclFrame(frame);
        }
      });
      return;
    }

    if (DEBUG_frames) {
      dumpFrame('Rcvd:', frame, DEBUG_frameDetail);
    }

    if (frame.type == C.FRAME_TYPE.APS_DATA_INDICATION ||
        frame.type == C.FRAME_TYPE.APS_DATA_CONFIRM) {
      this.deviceStateUpdateInProgress = false;
    }

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

    if (frame.type == C.FRAME_TYPE.READ_PARAMETER) {
      if (this.paramIdx < PARAM.length) {
        const paramId = PARAM[this.paramIdx];
        const fieldName = C.PARAM_ID[paramId].fieldName;
        this[fieldName] = frame[fieldName];
        this.paramIdx++;
        if (this.paramIdx == PARAM.length) {
          this.dumpParameters();
          this.sendFrame(this.zdo.makeFrame({
            destination64: this.macAddress,
            destination16: '0000',
            clusterId: zdo.CLUSTER_ID.MANAGEMENT_LQI_REQUEST,
            startIndex: 0,
          }));
        } else {
          this.readParameter(this.paramIdx);
        }
      }
    } else if (frame.type == C.FRAME_TYPE.APS_DATA_INDICATION) {
      if (frame.status != 0) {
        console.log('', 'Data Indication frame.status ERROR:',
                    frame.status, C.STATUS_STR[frame.status]);
        return;
      }

      const clusterId = zdo.getClusterIdAsInt(frame.clusterId);
      const node = this.node64[frame.remote64];
      switch (clusterId) {
        case zdo.CLUSTER_ID.ACTIVE_ENDPOINTS_RESPONSE:
          if (node) {
            node.handleActiveEndpointsResponse(frame);
            if (this.discover.endpoint) {
              node.simpleDescriptor(this.discover.endpoint);
            } else {
              this.demoDone();
            }
          }
          break;
        case zdo.CLUSTER_ID.SIMPLE_DESCRIPTOR_RESPONSE:
          if (node) {
            node.handleSimpleDescriptorResponse(frame);
            if (this.discover.clusterId) {
              node.discover(this.discover.endpoint, this.discover.clusterId);
            } else {
              this.demoDone();
            }
          }
          break;
        case zdo.CLUSTER_ID.MANAGEMENT_LQI_RESPONSE:
          this.handleManagementLqiResponse(frame);
          break;
      }
    }
  }

  managementLqi(startIndex) {
    const lqiFrame = this.zdo.makeFrame({
      type: C.FRAME_TYPE.APS_DATA_REQUEST,
      destination64: this.macAddress,
      destination16: '0000',
      clusterId: zdo.CLUSTER_ID.MANAGEMENT_LQI_REQUEST,
      startIndex: startIndex,
    });
    this.sendFrame(lqiFrame);
  }

  handleManagementLqiResponse(frame) {
    for (let idx = 0; idx < frame.numEntriesThisResponse; idx++) {
      const neighbor = frame.neighbors[idx];
      const node = new Node(this, neighbor.addr64, neighbor.addr16);
      this.node16[neighbor.addr16] = node;
      this.node64[neighbor.addr64] = node;
    }
    const nextStartIndex = frame.startIndex + frame.numEntriesThisResponse;
    if (nextStartIndex < frame.numEntries) {
      this.managementLqi(nextStartIndex);
    } else {
      this.dumpNodes();

      if (!this.discover.addr16) {
        console.log('No addr16 provided - done');
        this.demoDone();
        return;
      }

      const node = this.node16[this.discover.addr16];
      if (node) {
        node.activeEndpoints();
      } else {
        console.error('Unable to find address:', this.discover.addr16);
        this.demoDone();
      }
    }
  }

  readParameter(paramIdx) {
    if (paramIdx >= PARAM.length) {
      this.managementLqi(0);
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
      dumpFrame('Sent:', frame);
    }
    const rawFrame = this.dc.buildFrame(frame);
    if (DEBUG_rawFrames) {
      console.log('Sent:', rawFrame);
    }
    this.serialport.write(rawFrame, serialWriteError);
  }
}

function isConBeePort(port) {
  return (port.vendorId === '0403' &&
          (port.productId === '6015' || port.productId === '6001') &&
          port.manufacturer === 'FTDI');
}

const optionsDefs = [
  {name: 'addr16', alias: 'a', type: String},
  {name: 'cluster', alias: 'c', type: String},
  {name: 'endpoint', alias: 'e', type: Number},
  {name: 'frames', alias: 'f', type: Boolean},
  {name: 'detail', alias: 'd', type: Boolean},
  {name: 'raw', alias: 'r', type: Boolean},
  {name: 'slip', alias: 's', type: Boolean},
];
const options = commandLineArgs(optionsDefs);
DEBUG_frames = options.frames;
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
  const _dcTest = new DeconzTest(conBeePorts[0],
                                 options.addr16,
                                 options.endpoint,
                                 options.cluster);
});
