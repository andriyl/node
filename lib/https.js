// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

const {
  assertCrypto,
  kEmptyObject,
  promisify,
  SymbolAsyncDispose,
} = require('internal/util');
assertCrypto();

const tls = require('tls');
const { Agent: HttpAgent } = require('_http_agent');
const {
  httpServerPreClose,
  Server: HttpServer,
  setupConnectionsTracking,
  storeHTTPOptions,
  _connectionListener,
} = require('_http_server');
const { ClientRequest } = require('_http_client');
let debug = require('internal/util/debuglog').debuglog('https', (fn) => {
  debug = fn;
});
const { URL, urlToHttpOptions, isURL } = require('internal/url');
const { validateObject } = require('internal/validators');

function Server(opts, requestListener) {
  if (!(this instanceof Server)) return new Server(opts, requestListener);

  let ALPNProtocols = ['http/1.1'];
  if (typeof opts === 'function') {
    requestListener = opts;
    opts = kEmptyObject;
  } else if (opts == null) {
    opts = kEmptyObject;
  } else {
    validateObject(opts, 'options');
    // Only one of ALPNProtocols and ALPNCallback can be set, so make sure we
    // only set a default ALPNProtocols if the caller has not set either of them
    if (opts.ALPNProtocols || opts.ALPNCallback)
      ALPNProtocols = undefined;
  }

  storeHTTPOptions.call(this, opts);
  tls.Server.call(this,
                  {
                    noDelay: true,
                    ALPNProtocols,
                    ...opts,
                  },
                  _connectionListener);

  this.httpAllowHalfOpen = false;

  if (requestListener) {
    this.addListener('request', requestListener);
  }

  this.addListener('tlsClientError', function addListener(err, conn) {
    if (!this.emit('clientError', err, conn))
      conn.destroy(err);
  });

  this.timeout = 0;
  this.maxHeadersCount = null;
  this.on('listening', setupConnectionsTracking);
}

Object.setPrototypeOf(Server.prototype, tls.Server.prototype);
Object.setPrototypeOf(Server, tls.Server);

Server.prototype.closeAllConnections = HttpServer.prototype.closeAllConnections;

Server.prototype.closeIdleConnections = HttpServer.prototype.closeIdleConnections;

Server.prototype.setTimeout = HttpServer.prototype.setTimeout;

Server.prototype.close = function() {
  httpServerPreClose(this);
  Reflect.apply(tls.Server.prototype.close, this, arguments);
  return this;
};

Server.prototype[SymbolAsyncDispose] = async function() {
  return promisify(this.close).call(this);
};

/**
 * Creates a new `https.Server` instance.
 * @param {{
 *   IncomingMessage?: IncomingMessage;
 *   ServerResponse?: ServerResponse;
 *   insecureHTTPParser?: boolean;
 *   maxHeaderSize?: number;
 *   }} [opts]
 * @param {Function} [requestListener]
 * @returns {Server}
 */
function createServer(opts, requestListener) {
  return new Server(opts, requestListener);
}


// HTTPS agents.

function createConnection(port, host, options) {
  if (port !== null && typeof port === 'object') {
    options = port;
  } else if (host !== null && typeof host === 'object') {
    options = { ...host };
  } else if (options === null || typeof options !== 'object') {
    options = {};
  } else {
    options = { ...options };
  }

  if (typeof port === 'number') {
    options.port = port;
  }

  if (typeof host === 'string') {
    options.host = host;
  }

  debug('createConnection', options);

  if (options._agentKey) {
    const session = this._getSession(options._agentKey);
    if (session) {
      debug('reuse session for %j', options._agentKey);
      options = {
        session,
        ...options,
      };
    }
  }

  const socket = tls.connect(options);

  if (options._agentKey) {
    // Cache new session for reuse
    socket.on('session', (session) => {
      this._cacheSession(options._agentKey, session);
    });

    // Evict session on error
    socket.once('close', (err) => {
      if (err)
        this._evictSession(options._agentKey);
    });
  }

  return socket;
}

/**
 * Creates a new `HttpAgent` instance.
 * @param {{
 *   keepAlive?: boolean;
 *   keepAliveMsecs?: number;
 *   maxSockets?: number;
 *   maxTotalSockets?: number;
 *   maxFreeSockets?: number;
 *   scheduling?: string;
 *   timeout?: number;
 *   maxCachedSessions?: number;
 *   servername?: string;
 *   }} [options]
 * @constructor
 */
function Agent(options) {
  if (!(this instanceof Agent))
    return new Agent(options);

  HttpAgent.call(this, options);
  this.defaultPort = 443;
  this.protocol = 'https:';
  this.maxCachedSessions = this.options.maxCachedSessions;
  if (this.maxCachedSessions === undefined)
    this.maxCachedSessions = 100;

  this._sessionCache = {
    map: {},
    list: [],
  };
}
Object.setPrototypeOf(Agent.prototype, HttpAgent.prototype);
Object.setPrototypeOf(Agent, HttpAgent);
Agent.prototype.createConnection = createConnection;

/**
 * Gets a unique name for a set of options.
 * @param {{
 *   host: string;
 *   port: number;
 *   localAddress: string;
 *   family: number;
 *   }} [options]
 * @returns {string}
 */
Agent.prototype.getName = function getName(options = kEmptyObject) {
  let name = HttpAgent.prototype.getName.call(this, options);

  name += ':';
  if (options.ca)
    name += options.ca;

  name += ':';
  if (options.cert)
    name += options.cert;

  name += ':';
  if (options.clientCertEngine)
    name += options.clientCertEngine;

  name += ':';
  if (options.ciphers)
    name += options.ciphers;

  name += ':';
  if (options.key)
    name += options.key;

  name += ':';
  if (options.pfx)
    name += options.pfx;

  name += ':';
  if (options.rejectUnauthorized !== undefined)
    name += options.rejectUnauthorized;

  name += ':';
  if (options.servername && options.servername !== options.host)
    name += options.servername;

  name += ':';
  if (options.minVersion)
    name += options.minVersion;

  name += ':';
  if (options.maxVersion)
    name += options.maxVersion;

  name += ':';
  if (options.secureProtocol)
    name += options.secureProtocol;

  name += ':';
  if (options.crl)
    name += options.crl;

  name += ':';
  if (options.honorCipherOrder !== undefined)
    name += options.honorCipherOrder;

  name += ':';
  if (options.ecdhCurve)
    name += options.ecdhCurve;

  name += ':';
  if (options.dhparam)
    name += options.dhparam;

  name += ':';
  if (options.secureOptions !== undefined)
    name += options.secureOptions;

  name += ':';
  if (options.sessionIdContext)
    name += options.sessionIdContext;

  name += ':';
  if (options.sigalgs)
    name += JSON.stringify(options.sigalgs);

  name += ':';
  if (options.privateKeyIdentifier)
    name += options.privateKeyIdentifier;

  name += ':';
  if (options.privateKeyEngine)
    name += options.privateKeyEngine;

  return name;
};

Agent.prototype._getSession = function _getSession(key) {
  return this._sessionCache.map[key];
};

Agent.prototype._cacheSession = function _cacheSession(key, session) {
  // Cache is disabled
  if (this.maxCachedSessions === 0)
    return;

  // Fast case - update existing entry
  if (this._sessionCache.map[key]) {
    this._sessionCache.map[key] = session;
    return;
  }

  // Put new entry
  if (this._sessionCache.list.length >= this.maxCachedSessions) {
    const oldKey = this._sessionCache.list.shift();
    debug('evicting %j', oldKey);
    delete this._sessionCache.map[oldKey];
  }

  this._sessionCache.list.push(key);
  this._sessionCache.map[key] = session;
};

Agent.prototype._evictSession = function _evictSession(key) {
  const index = this._sessionCache.list.indexOf(key);
  if (index === -1)
    return;

  this._sessionCache.list.splice(index, 1);
  delete this._sessionCache.map[key];
};

const globalAgent = new Agent({ keepAlive: true, scheduling: 'lifo', timeout: 5000 });

/**
 * Makes a request to a secure web server.
 * @param {...any} args
 * @returns {ClientRequest}
 */
function request(...args) {
  let options = {};

  if (typeof args[0] === 'string') {
    const urlStr = args.shift();
    options = urlToHttpOptions(new URL(urlStr));
  } else if (isURL(args[0])) {
    options = urlToHttpOptions(args.shift());
  }

  if (args[0] && typeof args[0] !== 'function') {
    Object.assign(options, args.shift());
  }

  options._defaultAgent = module.exports.globalAgent;
  args.unshift(options);

  return Reflect.construct(ClientRequest, args);
}

/**
 * Makes a GET request to a secure web server.
 * @param {string | URL} input
 * @param {{
 *   agent?: Agent | boolean;
 *   auth?: string;
 *   createConnection?: Function;
 *   defaultPort?: number;
 *   family?: number;
 *   headers?: object;
 *   hints?: number;
 *   host?: string;
 *   hostname?: string;
 *   insecureHTTPParser?: boolean;
 *   joinDuplicateHeaders?: boolean;
 *   localAddress?: string;
 *   localPort?: number;
 *   lookup?: Function;
 *   maxHeaderSize?: number;
 *   method?: string;
 *   path?: string;
 *   port?: number;
 *   protocol?: string;
 *   setHost?: boolean;
 *   socketPath?: string;
 *   timeout?: number;
 *   signal?: AbortSignal;
 *   uniqueHeaders?: Array;
 *   } | string | URL} [options]
 * @param {Function} [cb]
 * @returns {ClientRequest}
 */
function get(input, options, cb) {
  const req = request(input, options, cb);
  req.end();
  return req;
}

module.exports = {
  Agent,
  globalAgent,
  Server,
  createServer,
  get,
  request,
};
