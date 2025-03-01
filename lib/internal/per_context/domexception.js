'use strict';

function throwInvalidThisError(Base, type) {
  const err = new Base();
  const key = 'ERR_INVALID_THIS';
  Object.defineProperties(err, {
    message: {
      __proto__: null,
      value: `Value of "this" must be of ${type}`,
      enumerable: false,
      writable: true,
      configurable: true,
    },
    toString: {
      __proto__: null,
      value() {
        return `${this.name} [${key}]: ${this.message}`;
      },
      enumerable: false,
      writable: true,
      configurable: true,
    },
  });
  err.code = key;
  throw err;
}

const internalsMap = new WeakMap();
const nameToCodeMap = new Map();

// These were removed from the error names table.
// See https://github.com/heycam/webidl/pull/946.
const disusedNamesSet = new Set()
  .add('DOMStringSizeError')
  .add('NoDataAllowedError')
  .add('ValidationError');

class DOMException {
  constructor(message = '', options = 'Error') {
    Error.captureStackTrace(this);

    if (options && typeof options === 'object') {
      const { name } = options;
      internalsMap.set(this, {
        message: `${message}`,
        name: `${name}`,
      });

      if ('cause' in options) {
        Object.defineProperty(this, 'cause', {
          __proto__: null,
          value: options.cause,
          configurable: true,
          writable: true,
          enumerable: false,
        });
      }
    } else {
      internalsMap.set(this, {
        message: `${message}`,
        name: `${options}`,
      });
    }
  }

  get name() {
    const internals = internalsMap.get(this);
    if (internals === undefined) {
      throwInvalidThisError(TypeError, 'DOMException');
    }
    return internals.name;
  }

  get message() {
    const internals = internalsMap.get(this);
    if (internals === undefined) {
      throwInvalidThisError(TypeError, 'DOMException');
    }
    return internals.message;
  }

  get code() {
    const internals = internalsMap.get(this);
    if (internals === undefined) {
      throwInvalidThisError(TypeError, 'DOMException');
    }

    if (disusedNamesSet.has(internals.name)) {
      return 0;
    }

    const code = nameToCodeMap.get(internals.name);
    return code === undefined ? 0 : code;
  }
}

Object.setPrototypeOf(DOMException.prototype, Error.prototype);
Object.defineProperties(DOMException.prototype, {
  [Symbol.toStringTag]: { __proto__: null, configurable: true, value: 'DOMException' },
  name: { __proto__: null, enumerable: true, configurable: true },
  message: { __proto__: null, enumerable: true, configurable: true },
  code: { __proto__: null, enumerable: true, configurable: true },
});

for (const { 0: name, 1: codeName, 2: value } of [
  ['IndexSizeError', 'INDEX_SIZE_ERR', 1],
  ['DOMStringSizeError', 'DOMSTRING_SIZE_ERR', 2],
  ['HierarchyRequestError', 'HIERARCHY_REQUEST_ERR', 3],
  ['WrongDocumentError', 'WRONG_DOCUMENT_ERR', 4],
  ['InvalidCharacterError', 'INVALID_CHARACTER_ERR', 5],
  ['NoDataAllowedError', 'NO_DATA_ALLOWED_ERR', 6],
  ['NoModificationAllowedError', 'NO_MODIFICATION_ALLOWED_ERR', 7],
  ['NotFoundError', 'NOT_FOUND_ERR', 8],
  ['NotSupportedError', 'NOT_SUPPORTED_ERR', 9],
  ['InUseAttributeError', 'INUSE_ATTRIBUTE_ERR', 10],
  ['InvalidStateError', 'INVALID_STATE_ERR', 11],
  ['SyntaxError', 'SYNTAX_ERR', 12],
  ['InvalidModificationError', 'INVALID_MODIFICATION_ERR', 13],
  ['NamespaceError', 'NAMESPACE_ERR', 14],
  ['InvalidAccessError', 'INVALID_ACCESS_ERR', 15],
  ['ValidationError', 'VALIDATION_ERR', 16],
  ['TypeMismatchError', 'TYPE_MISMATCH_ERR', 17],
  ['SecurityError', 'SECURITY_ERR', 18],
  ['NetworkError', 'NETWORK_ERR', 19],
  ['AbortError', 'ABORT_ERR', 20],
  ['URLMismatchError', 'URL_MISMATCH_ERR', 21],
  ['QuotaExceededError', 'QUOTA_EXCEEDED_ERR', 22],
  ['TimeoutError', 'TIMEOUT_ERR', 23],
  ['InvalidNodeTypeError', 'INVALID_NODE_TYPE_ERR', 24],
  ['DataCloneError', 'DATA_CLONE_ERR', 25],
  // There are some more error names, but since they don't have codes assigned,
  // we don't need to care about them.
]) {
  const desc = { enumerable: true, value };
  Object.defineProperty(DOMException, codeName, desc);
  Object.defineProperty(DOMException.prototype, codeName, desc);
  nameToCodeMap.set(name, value);
}

exports.DOMException = DOMException;
