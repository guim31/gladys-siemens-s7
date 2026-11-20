// -----------------------------------------------------------------------------
// The hub: one PLC, its variables, and what Gladys sees of them.
//
// - The device (one Gladys device for the PLC, one feature per variable) is
//   published as soon as the configuration is read: the address gives the
//   type, the PLC does not need to answer first.
// - The container reads every variable at the chosen pace (1 s to 1 min), in
//   as few requests as the PDU allows, and keeps the latest value of each; a
//   flush publishes the changed ones, no faster than the 300 states a minute
//   Gladys accepts (with many variables, the flush slows down).
// - A lost connection is retried with a growing delay (5 s to 1 min).
// - Writes go through the declared variables only, and only when the user
//   turned writing on.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig, readTarget } from './config.js';
import { localize, pick } from './i18n.js';
import { createIssueLog } from './issues.js';
import { KINDS, publishedUnit } from './kinds.js';
import { STATUS, VARIABLE_ERRORS, itemCode, variableError } from './messages.js';
import { decode, encode } from './s7/address.js';
import { S7Client } from './s7/client.js';
import { ITEM_OK } from './s7/frames.js';
import { WriteError, toState, toWrite } from './values.js';
import { parseVariables } from './variables.js';

const logger = createLogger({ name: 's7-hub' });

export const TRIGGERS = {
  DISCONNECTED: 'plc_disconnected',
  RECONNECTED: 'plc_reconnected',
  VARIABLE_ERROR: 'variable_error',
};

// Gladys accepts 300 states a minute per integration: keep a margin.
const STATES_PER_MINUTE = 240;
// Re-send unchanged values: the dashboard says "no recent value" after 48 h.
const HEARTBEAT_MS = 6 * 3600 * 1000;
// Delays before a new connection attempt, in seconds.
const RETRY_DELAYS = [5, 10, 30, 60];
const TIMEOUT_MS = 5000;

export class S7Hub {
  /**
   * @param {object} options
   * @param {object} options.gladys
   * @param {(options: object) => S7Client} [options.createClient]
   * @param {() => number} [options.now]
   * @param {boolean} [options.timers] run the reading timer
   * @param {() => void} [options.onChange] the widget has something new to show
   */
  constructor({ gladys, createClient, now = Date.now, timers = true, onChange = () => {} }) {
    this.gladys = gladys;
    this.createClient = createClient ?? ((options) => new S7Client(options));
    this.now = now;
    this.timers = timers;
    this.onChange = onChange;
    this.config = normalizeConfig({});
    this.target = null;
    this.ids = null;
    this.client = null;
    this.variables = [];
    this.configErrors = [];
    this.latest = new Map();
    this.status = { connected: null, code: null, lastReadAt: null, readMs: null };
    this.issues = createIssueLog(logger);
    this.failures = 0;
    this.nextAttemptAt = 0;
    this.pollTimer = null;
    this.polling = Promise.resolve();
    this.flushTimer = null;
    this.lastFlushAt = 0;
    this.flushing = Promise.resolve();
    this.generation = 0;
    this.connecting = null;
  }

  // --- Configuration and connection ----------------------------------------

  async configure(config) {
    await this.stop();
    this.generation += 1;
    this.config = config;
    this.latest.clear();
    this.status = { connected: null, code: null, lastReadAt: null, readMs: null };
    this.failures = 0;
    this.nextAttemptAt = 0;
    const { variables, errors } = parseVariables(config.variables);
    this.configErrors = errors;
    this.variables = variables;

    const target = readTarget(config);
    if (target.error) {
      this.target = null;
      this.ids = null;
      this.status.code = target.error;
      await this.gladys.publishDiscoveredDevices([]);
      await this.#setConnectionStatus(false, STATUS[target.error]);
      return;
    }
    this.target = target;
    this.ids = this.gladys.externalIds('plc', target.platformId);
    await this.publishDevice();
    await this.poll();
    this.#schedule();
  }

  async stop() {
    clearTimeout(this.pollTimer);
    this.pollTimer = null;
    clearTimeout(this.flushTimer);
    this.flushTimer = null;
    this.generation += 1;
    const client = this.client;
    this.client = null;
    client?.close();
    // A connection attempt in progress gives up at once.
    this.connecting?.close();
    await this.polling;
    await this.flushing;
  }

  #schedule() {
    if (!this.timers || !this.target) {
      return;
    }
    const generation = this.generation;
    this.pollTimer = setTimeout(async () => {
      this.pollTimer = null;
      await this.poll().catch((err) => logger.error(`Reading cycle failed: ${err.message}`));
      if (generation === this.generation) {
        this.#schedule();
      }
    }, this.intervalMs());
    this.pollTimer.unref?.();
  }

  intervalMs() {
    return Number(this.config.interval) * 1000;
  }

  /** One reading cycle (the timer's, or a test's). Never two at once. */
  poll() {
    this.polling = this.polling.then(() => this.#pollNow());
    return this.polling;
  }

  async #pollNow() {
    if (!this.target) {
      return;
    }
    const generation = this.generation;
    if (!this.client) {
      if (this.now() < this.nextAttemptAt) {
        return;
      }
      const client = this.createClient({
        host: this.target.host,
        port: this.target.port,
        localTsap: this.target.localTsap,
        remoteTsap: this.target.remoteTsap,
        timeoutMs: TIMEOUT_MS,
      });
      this.connecting = client;
      try {
        await client.connect();
      } catch (err) {
        if (generation === this.generation) {
          await this.#onDown(err.code);
        }
        return;
      } finally {
        this.connecting = null;
      }
      if (generation !== this.generation) {
        client.close();
        return;
      }
      this.client = client;
      client.on('close', () => {
        if (this.client === client) {
          this.client = null;
          this.#onDown('unreachable').catch(() => {});
        }
      });
    }
    await this.#readAll(generation);
  }

  async #readAll(generation) {
    const client = this.client;
    const started = this.now();
    let results;
    try {
      results =
        this.variables.length > 0 ? await client.read(this.variables.map((v) => v.address)) : [];
    } catch (err) {
      if (generation !== this.generation || this.client !== client) {
        return;
      }
      this.client = null;
      client.close();
      await this.#onDown(err.code === 'closed' ? 'unreachable' : err.code);
      return;
    }
    if (generation !== this.generation) {
      return;
    }
    this.status.readMs = this.now() - started;
    this.status.lastReadAt = this.now();
    let changed = false;
    this.variables.forEach((variable, index) => {
      changed = this.#onResult(variable, results[index]) || changed;
    });
    if (this.status.connected !== true) {
      await this.#onUp();
    } else if (changed) {
      this.onChange();
    }
    this.#scheduleFlush();
  }

  /** @returns {boolean} whether the variable changed between good and bad */
  #onResult(variable, result) {
    if (result.code !== ITEM_OK) {
      const code = itemCode(result.code);
      const wasBad = variable.problem !== undefined;
      variable.problem = { code, params: { code: result.code } };
      this.latest.delete(variable.key);
      if (!wasBad) {
        logger.warn(`${variable.address.text}: refused by the PLC (code ${result.code})`);
        this.#fireTrigger(TRIGGERS.VARIABLE_ERROR, {
          variable_name: variable.name,
          error: pick(localize(VARIABLE_ERRORS[code], { code: result.code }), this.config.language),
        });
      }
      return !wasBad;
    }
    const wasBad = variable.problem !== undefined;
    if (wasBad) {
      delete variable.problem;
      logger.info(`${variable.address.text}: readable again`);
    }
    const state = toState(variable, decode(variable.address, result.bytes));
    if (state === null) {
      this.latest.delete(variable.key);
    } else {
      this.latest.set(variable.key, state);
    }
    return wasBad;
  }

  async #onUp() {
    const wasDown = this.status.connected === false;
    this.status.connected = true;
    this.status.code = null;
    this.failures = 0;
    const where = `${this.target.host}:${this.target.port}`;
    if (wasDown) {
      this.issues.ok('link', `PLC ${where} connected again`);
    } else {
      logger.info(`Connected to the PLC ${where} (${this.variables.length} variables)`);
    }
    await this.#setConnectionStatus(true);
    await this.#publishTransport('local');
    if (wasDown) {
      this.#fireTrigger(TRIGGERS.RECONNECTED, {});
    }
    this.onChange();
  }

  async #onDown(code) {
    const known = STATUS[code] ? code : 'unreachable';
    const delay = RETRY_DELAYS[Math.min(this.failures, RETRY_DELAYS.length - 1)] * 1000;
    this.failures += 1;
    this.nextAttemptAt = this.now() + Math.max(delay, this.intervalMs());
    if (this.status.connected === false && this.status.code === known) {
      return;
    }
    const wasUp = this.status.connected === true;
    this.status.connected = false;
    this.status.code = known;
    // Old values must not be re-sent by the heartbeat while the PLC is away.
    this.latest.clear();
    this.issues.fail(
      'link',
      `PLC ${this.target.host}:${this.target.port} unavailable (${known}), retrying`,
    );
    await this.#setConnectionStatus(false, STATUS[known]);
    await this.#publishTransport('unreachable');
    if (wasUp) {
      this.#fireTrigger(TRIGGERS.DISCONNECTED, {
        error: pick(STATUS[known], this.config.language),
      });
    }
    this.onChange();
  }

  async #setConnectionStatus(connected, message) {
    try {
      await this.gladys.setConnectionStatus(connected, message);
    } catch (err) {
      logger.debug(`setConnectionStatus failed: ${err.message}`);
    }
  }

  async #publishTransport(transport) {
    if (!this.#createdDevice()) {
      return;
    }
    try {
      await this.gladys.publishTransports([{ external_id: this.ids.device, transport }]);
    } catch (err) {
      logger.debug(`publishTransports failed: ${err.message}`);
    }
  }

  #fireTrigger(key, data) {
    if (!this.ids) {
      return;
    }
    const payload = { device: this.ids.device, device_name: this.deviceName(), ...data };
    this.gladys.publishSceneEvent(key, payload).catch((err) => {
      logger.debug(`Scene event ${key} refused: ${err.message}`);
    });
  }

  // --- Device ----------------------------------------------------------------

  /** The name of the device: the one given in Gladys, else "S7 <host>". */
  deviceName() {
    return (
      this.#createdDevice()?.name ??
      `${this.target?.label ?? 'S7'} ${this.target?.host ?? ''}`.trim()
    );
  }

  #createdDevice() {
    return (
      this.ids &&
      (this.gladys.devices ?? []).find((device) => device.external_id === this.ids.device)
    );
  }

  /** Whether a variable can be changed from the dashboard. */
  #writable(variable) {
    return Boolean(KINDS[variable.kind].writable && variable.write && this.config.allow_write);
  }

  /** The variables published as features. */
  features() {
    return this.variables.map((variable) => {
      const kind = KINDS[variable.kind];
      const { unit } = publishedUnit(variable.kind, variable.unit ?? kind.units[0]);
      return {
        variable,
        feature: {
          name: variable.name,
          external_id: this.ids.feature(variable.key),
          category: kind.category,
          type: kind.type,
          ...(unit ? { unit } : {}),
          min: variable.min ?? kind.min,
          max: variable.max ?? kind.max,
          read_only: !this.#writable(variable),
          has_feedback: true,
          keep_history: true,
        },
      };
    });
  }

  buildDevice() {
    if (!this.ids || this.variables.length === 0) {
      return null;
    }
    return {
      name: `${this.target.label} ${this.target.host}`,
      external_id: this.ids.device,
      model: this.target.label === 'LOGO!' ? 'Siemens LOGO!' : 'Siemens S7',
      should_poll: false,
      features: this.features().map(({ feature }) => feature),
    };
  }

  async publishDevice() {
    const device = this.buildDevice();
    await this.gladys.publishDiscoveredDevices(device ? [device] : []);
  }

  async rescan() {
    await this.publishDevice();
  }

  /** A device was added in Gladys: its features exist now, send every value. */
  async onDeviceCreated(device) {
    if (this.ids && device?.external_id === this.ids.device) {
      this.gladys.forgetPublishedStates(this.ids.device);
      await this.flush();
      await this.#publishTransport(this.status.connected ? 'local' : 'unreachable');
    }
  }

  // --- Publication -------------------------------------------------------------

  /** Time between two flushes: the interval, or slower with many variables. */
  flushPeriodMs() {
    const count = Math.max(1, this.variables.length);
    return Math.max(this.intervalMs(), Math.ceil((count * 60_000) / STATES_PER_MINUTE));
  }

  #scheduleFlush() {
    if (this.flushTimer) {
      return;
    }
    const wait = Math.max(0, this.lastFlushAt + this.flushPeriodMs() - this.now());
    if (wait === 0 || !this.timers) {
      this.flush().catch(() => {});
      return;
    }
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush().catch(() => {});
    }, wait);
    this.flushTimer.unref?.();
  }

  /** Publish the latest values of the features Gladys has; resolves once sent. */
  flush() {
    this.flushing = this.flushing.then(() => this.#flushNow());
    return this.flushing;
  }

  async #flushNow() {
    this.lastFlushAt = this.now();
    const created = this.#createdDevice();
    if (!created) {
      return;
    }
    const known = new Set((created.features ?? []).map((feature) => feature.external_id));
    const states = [];
    for (const [key, state] of this.latest) {
      const externalId = this.ids.feature(key);
      if (known.size > 0 && !known.has(externalId)) {
        continue;
      }
      states.push({ device_feature_external_id: externalId, state });
    }
    if (states.length === 0) {
      return;
    }
    try {
      await this.gladys.publishChangedStates(states, { heartbeat: HEARTBEAT_MS });
      this.issues.ok('publish', 'Gladys accepts the values again');
    } catch (err) {
      this.issues.fail('publish', `Gladys refused the values: ${err.message}`);
    }
  }

  // --- Writes ----------------------------------------------------------------

  /** A declared variable by name or address. */
  findVariable(text) {
    const wanted = String(text ?? '').trim();
    const lower = wanted.toLowerCase();
    return (
      this.variables.find((variable) => variable.name.toLowerCase() === lower) ??
      this.variables.find((variable) => variable.address.text.toLowerCase() === lower)
    );
  }

  /** The variable of a feature external id. */
  variableOfFeature(externalId) {
    return this.variables.find(
      (variable) => this.ids && this.ids.feature(variable.key) === externalId,
    );
  }

  /**
   * Write a value to a declared variable, then read it back. Throws a WriteError.
   * @returns {Promise<{ variable: object, name: string, value: number|boolean }>}
   */
  async write(variable, input) {
    if (!variable) {
      throw new WriteError('unknownVariable', { name: '?' });
    }
    const { name } = variable;
    if (!this.config.allow_write) {
      throw new WriteError('writeDisabled');
    }
    if (!variable.write) {
      throw new WriteError('notDeclaredWritable', { name });
    }
    const client = this.client;
    if (!client || this.status.connected !== true) {
      throw new WriteError('notConnected');
    }
    const value = toWrite(variable, input);
    let code;
    try {
      code = await client.write(variable.address, encode(variable.address, value));
    } catch (err) {
      if (err.code === 'closed' || err.code === 'unreachable') {
        throw new WriteError('notConnected');
      }
      throw new WriteError('failed', { detail: String(err.message).slice(0, 120) });
    }
    if (code !== ITEM_OK) {
      throw new WriteError('refused', { returnCode: code });
    }
    logger.info(`Wrote ${JSON.stringify(value)} to ${name} (${variable.address.text})`);
    // Read it back: the dashboard shows what the PLC holds, not what was asked.
    try {
      const [result] = await client.read([variable.address]);
      this.#onResult(variable, result);
      await this.flush();
    } catch (err) {
      logger.debug(`Read-back of ${variable.address.text} failed: ${err.message}`);
    }
    return { variable, name, value };
  }

  /**
   * Read any address once, declared or not (the "Read an address" action).
   * @returns {Promise<{ code: number, value?: number|boolean }>}
   */
  async readAddress(address) {
    const client = this.client;
    if (!client || this.status.connected !== true) {
      throw new WriteError('notConnected');
    }
    const [result] = await client.read([address]);
    return result.code === ITEM_OK
      ? { code: result.code, value: decode(address, result.bytes) }
      : { code: result.code };
  }

  // --- Reports ---------------------------------------------------------------

  /** Every problem of the configuration, as multi-language texts. */
  problems() {
    return [
      ...this.configErrors.map((error) => variableError(error)),
      ...this.variables
        .filter((variable) => variable.problem)
        .map((variable) =>
          variableError({ entry: variable.entry, name: variable.name, ...variable.problem }),
        ),
    ];
  }

  /** The current connection message, or null when connected. */
  statusMessage() {
    if (this.status.connected === true) {
      return null;
    }
    return this.status.code ? (STATUS[this.status.code] ?? STATUS.unreachable) : null;
  }

  /** The number of variables read without error, and the total. */
  counts() {
    return {
      good:
        this.status.connected === true
          ? this.variables.filter((variable) => !variable.problem).length
          : 0,
      total: this.variables.length,
    };
  }
}
