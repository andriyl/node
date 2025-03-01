'use strict';

const {
  FunctionPrototypeApply,
  StringPrototypeToWellFormed,
} = primordials;

const {
  Blob,
  TransferableBlob,
} = require('internal/blob');

const {
  customInspectSymbol: kInspect,
  kEnumerableProperty,
  kEmptyObject,
} = require('internal/util');

const {
  codes: {
    ERR_INVALID_THIS,
    ERR_MISSING_ARGS,
  },
} = require('internal/errors');

const {
  inspect,
} = require('internal/util/inspect');

const {
  kClone,
  kDeserialize,
} = require('internal/worker/js_transferable');

const kState = Symbol('state');

function isFile(object) {
  return object?.[kState] !== undefined;
}

class FileState {
  name;
  lastModified;

  /**
   * @param {string} name
   * @param {number} lastModified
   */
  constructor(name, lastModified) {
    this.name = name;
    this.lastModified = lastModified;
  }
}

class File extends Blob {
  constructor(fileBits, fileName, options = kEmptyObject) {
    if (arguments.length < 2) {
      throw new ERR_MISSING_ARGS('fileBits', 'fileName');
    }

    super(fileBits, options);

    let { lastModified } = options ?? kEmptyObject;

    if (lastModified !== undefined) {
      // Using Number(...) will not throw an error for bigints.
      lastModified = +lastModified;

      if (Number.isNaN(lastModified)) {
        lastModified = 0;
      }
    } else {
      lastModified = Date.now();
    }

    this[kState] = new FileState(StringPrototypeToWellFormed(`${fileName}`), lastModified);
  }

  get name() {
    if (!isFile(this))
      throw new ERR_INVALID_THIS('File');

    return this[kState].name;
  }

  get lastModified() {
    if (!isFile(this))
      throw new ERR_INVALID_THIS('File');

    return this[kState].lastModified;
  }

  [kInspect](depth, options) {
    if (depth < 0) {
      return this;
    }

    const opts = {
      ...options,
      depth: options.depth == null ? null : options.depth - 1,
    };

    return `File ${inspect({
      size: this.size,
      type: this.type,
      name: this[kState].name,
      lastModified: this[kState].lastModified,
    }, opts)}`;
  }

  [kClone]() {
    return {
      data: { ...super[kClone]().data, ...this[kState] },
      deserializeInfo: 'internal/file:TransferableFile',
    };
  }

  [kDeserialize](data) {
    super[kDeserialize](data);

    this[kState] = new FileState(data.name, data.lastModified);
  }
}

function TransferableFile(handle, length, type = '') {
  FunctionPrototypeApply(TransferableBlob, this, [handle, length, type]);
  Object.setPrototypeOf(this, File.prototype);
}

Object.setPrototypeOf(TransferableFile.prototype, File.prototype);
Object.setPrototypeOf(TransferableFile, File);

Object.defineProperties(File.prototype, {
  name: kEnumerableProperty,
  lastModified: kEnumerableProperty,
  [Symbol.toStringTag]: {
    __proto__: null,
    configurable: true,
    value: 'File',
  },
});

module.exports = {
  File,
  TransferableFile,
};
