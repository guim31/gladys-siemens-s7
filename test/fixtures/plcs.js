// -----------------------------------------------------------------------------
// Realistic PLC memories and the Variables field that goes with them.
//
// - HEATING: an S7-1200 running a boiler room, its data in DB10 (non
//   optimized), a mode bit in M, a window contact on I0.0, the pump on Q0.1.
// - LOGO: a LOGO! 8 driving a greenhouse, its values in V memory (DB1), the
//   temperature in tenths of a degree as the analog blocks give it.
// Values as such PLCs hold them; addresses as their programs would map them.
// -----------------------------------------------------------------------------

export function heatingMemory() {
  const db10 = Buffer.alloc(32);
  db10.writeFloatBE(45.2, 0); // flow temperature
  db10.writeFloatBE(38.7, 4); // return temperature
  db10.writeFloatBE(-2.5, 8); // outdoor temperature
  db10.writeFloatBE(21, 12); // room setpoint
  db10.writeInt16BE(63, 16); // burner modulation, %
  db10.writeInt32BE(1234567, 18); // energy, Wh
  db10[22] = 0b01; // X22.0 pump running, X22.1 fault
  const m = Buffer.alloc(16);
  m[0] = 0b1; // M0.0 heating on
  const i = Buffer.alloc(4);
  i[0] = 0b1; // I0.0 window closed
  const q = Buffer.alloc(4);
  q[0] = 0b10; // Q0.1 pump output
  return { DB: { 10: db10 }, M: m, I: i, Q: q };
}

export const HEATING_VARIABLES = [
  'Flow: DB10,REAL0 temperature',
  'Return: DB10,REAL4 temperature',
  'Outdoor: DB10,REAL8 temperature',
  'Setpoint: DB10,REAL12 setpoint min=5 max=30',
  'Burner: DB10,INT16 unit=%',
  'Energy: DB10,DINT18 energy unit=Wh',
  'Pump: DB10,X22.0',
  'Fault: DB10.DBX22.1 binary',
  'Heating: M0.0 switch',
  'Window: I0.0',
  'Pump output: Q0.1',
].join('; ');

export function logoMemory() {
  const v = Buffer.alloc(64);
  v.writeInt16BE(215, 0); // VW0 temperature ×10
  v.writeInt16BE(55, 2); // VW2 humidity
  v[4] = 0b1; // V4.0 light
  v.writeUInt16BE(1520, 10); // VW10 counter
  const q = Buffer.alloc(2);
  return { DB: { 1: v }, M: Buffer.alloc(4), I: Buffer.alloc(2), Q: q };
}

export const LOGO_VARIABLES = [
  'Greenhouse: VW0 temperature scale=0.1',
  'Humidity: VW2 humidity',
  'Light: V4.0 switch',
  'Watering cycles: VW10',
  'Fan: Q0.0',
].join('; ');

/** The LOGO! TSAP pair of LOGO!Soft Comfort's default server connection. */
export const LOGO_TSAP = 0x0200;
