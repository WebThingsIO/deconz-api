#!/bin/bash

PORT=/dev/ttyUSB2
PKT1='17 12 00 2b 00 24 00 2e 02 00 00 01 03 b9 09 01 00 00 a3 22 00 01 04 01 06 00 07 00 08 46 0a 00 00 10 01 00 af ff a2 00 01 02 e3 1a fa'
PKT2='04 13 00 13 00 0c 00 2a 01 02 fc ff 00 00 a6 00 00 00 00 fc fc'

# ./test-serial.js -d ${PORT} "${PKT1}" "${PKT2}"

SLIP_PKT1='c0 17 12 00 2b 00 24 00 2e 02 00 00 01 03 b9 09 01 00 00 a3 22 00 01 04 01 06 00 07 00 08 46 0a 00 00 10 01 00 af ff a2 00 01 02 e3 1a fa c0'
SLIP_PKT2='c0 04 13 00 13 00 0c 00 2a 01 02 fc ff 00 00 a6 00 00 00 00 fc fc c0'

./test-serial.js -d -s ${PORT} "${SLIP_PKT1} ${SLIP_PKT2}"
