'use strict';

// See https://console.spec.whatwg.org/#console-namespace
// > For historical web-compatibility reasons, the namespace object
// > for console must have as its [[Prototype]] an empty object,
// > created as if by Object.create(%ObjectPrototype%),
// > instead of %ObjectPrototype%.

// Since in Node.js, the Console constructor has been exposed through
// require('console'), we need to keep the Console constructor but
// we cannot actually use `new Console` to construct the global console.
// Therefore, the console.Console.prototype is not
// in the global console prototype chain anymore.

const {
  FunctionPrototypeBind,
} = primordials;

const {
  Console,
  kBindProperties,
} = require('internal/console/constructor');

const globalConsole = { __proto__: {} };

// Since Console is not on the prototype chain of the global console,
// the symbol properties on Console.prototype have to be looked up from
// the global console itself. In addition, we need to make the global
// console a namespace by binding the console methods directly onto
// the global console with the receiver fixed.
for (const prop of Reflect.ownKeys(Console.prototype)) {
  if (prop === 'constructor') { continue; }
  const desc = Reflect.getOwnPropertyDescriptor(Console.prototype, prop);
  if (typeof desc.value === 'function') { // fix the receiver
    const name = desc.value.name;
    desc.value = FunctionPrototypeBind(desc.value, globalConsole);
    Reflect.defineProperty(desc.value, 'name', { __proto__: null, value: name });
  }
  Reflect.defineProperty(globalConsole, prop, desc);
}

globalConsole[kBindProperties](true, 'auto');

// This is a legacy feature - the Console constructor is exposed on
// the global console instance.
globalConsole.Console = Console;

module.exports = globalConsole;
