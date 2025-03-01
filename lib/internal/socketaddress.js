'use strict';

const {
  SocketAddress: _SocketAddress,
  AF_INET,
  AF_INET6,
} = internalBinding('block_list');

const {
  validateObject,
  validateString,
  validatePort,
  validateUint32,
} = require('internal/validators');

const {
  codes: {
    ERR_INVALID_ARG_VALUE,
  },
} = require('internal/errors');

const {
  customInspectSymbol: kInspect,
  kEmptyObject,
} = require('internal/util');

const { inspect } = require('internal/util/inspect');

const {
  markTransferMode,
  kClone,
  kDeserialize,
} = require('internal/worker/js_transferable');

const kHandle = Symbol('kHandle');
const kDetail = Symbol('kDetail');

class SocketAddress {
  static isSocketAddress(value) {
    return value?.[kHandle] !== undefined;
  }

  constructor(options = kEmptyObject) {
    markTransferMode(this, true, false);

    validateObject(options, 'options');
    let { family = 'ipv4' } = options;
    const {
      address = (family === 'ipv4' ? '127.0.0.1' : '::'),
      port = 0,
      flowlabel = 0,
    } = options;

    let type;
    if (typeof family?.toLowerCase === 'function')
      family = family.toLowerCase();
    switch (family) {
      case 'ipv4':
        type = AF_INET;
        break;
      case 'ipv6':
        type = AF_INET6;
        break;
      default:
        throw new ERR_INVALID_ARG_VALUE('options.family', options.family);
    }

    validateString(address, 'options.address');
    validatePort(port, 'options.port');
    validateUint32(flowlabel, 'options.flowlabel', false);

    this[kHandle] = new _SocketAddress(address, port, type, flowlabel);
    this[kDetail] = this[kHandle].detail({
      address: undefined,
      port: undefined,
      family: undefined,
      flowlabel: undefined,
    });
  }

  get address() {
    return this[kDetail].address;
  }

  get port() {
    return this[kDetail].port;
  }

  get family() {
    return this[kDetail].family === AF_INET ? 'ipv4' : 'ipv6';
  }

  get flowlabel() {
    // The flow label can be changed internally.
    return this[kHandle].flowlabel();
  }

  [kInspect](depth, options) {
    if (depth < 0)
      return this;

    const opts = {
      ...options,
      depth: options.depth == null ? null : options.depth - 1,
    };

    return `SocketAddress ${inspect(this.toJSON(), opts)}`;
  }

  [kClone]() {
    const handle = this[kHandle];
    return {
      data: { handle },
      deserializeInfo: 'internal/socketaddress:InternalSocketAddress',
    };
  }

  [kDeserialize]({ handle }) {
    this[kHandle] = handle;
    this[kDetail] = handle.detail({
      address: undefined,
      port: undefined,
      family: undefined,
      flowlabel: undefined,
    });
  }

  toJSON() {
    return {
      address: this.address,
      port: this.port,
      family: this.family,
      flowlabel: this.flowlabel,
    };
  }
}

class InternalSocketAddress {
  constructor(handle) {
    markTransferMode(this, true, false);

    this[kHandle] = handle;
    this[kDetail] = this[kHandle]?.detail({
      address: undefined,
      port: undefined,
      family: undefined,
      flowlabel: undefined,
    });
  }
}

InternalSocketAddress.prototype.constructor =
  SocketAddress.prototype.constructor;
Object.setPrototypeOf(InternalSocketAddress.prototype, SocketAddress.prototype);

module.exports = {
  SocketAddress,
  InternalSocketAddress,
  kHandle,
};
