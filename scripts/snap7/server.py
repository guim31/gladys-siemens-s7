# Snap7 server for the tests of gladys-siemens-s7: DB1 (64 bytes), DB2 (8),
# MK (64), PE (16), PA (16), with known values.
import ctypes, struct, time, sys, logging
import snap7
from snap7.type import SrvArea
logging.basicConfig(level=logging.INFO)
srv = snap7.server.Server()
def area(size):
    return (ctypes.c_uint8 * size)()
db1, db2, mk, pe, pa = area(64), area(8), area(64), area(16), area(16)
struct.pack_into('>f', db1, 0, 21.5)      # DB1,REAL0
struct.pack_into('>h', db1, 4, -120)      # DB1,INT4
struct.pack_into('>H', db1, 6, 1500)      # DB1,WORD6
struct.pack_into('>i', db1, 8, 123456)    # DB1,DINT8
db1[12] = 0b00000101                      # DB1,X12.0 / X12.2
struct.pack_into('>d', db1, 16, 1234.5678)# DB1,LREAL16
mk[0] = 0b00000010                        # M0.1
struct.pack_into('>H', mk, 10, 42)        # MW10
pe[0] = 0b00000001                        # I0.0
srv.register_area(SrvArea.DB, 1, db1)
srv.register_area(SrvArea.DB, 2, db2)
srv.register_area(SrvArea.MK, 0, mk)
srv.register_area(SrvArea.PE, 0, pe)
srv.register_area(SrvArea.PA, 0, pa)
srv.start(tcp_port=102)
print('snap7 server up', flush=True)
while True:
    time.sleep(1)
    while True:
        ev = srv.pick_event()
        if not ev: break
        print(srv.event_text(ev), flush=True)
