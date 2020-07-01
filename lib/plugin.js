'use strict';

const {createUnsupportedError} = require('./errors');
const {defineConstants, castArray} = require('./utils');

const constants = (exports.constants = defineConstants({
  PLUGIN_ROOT_HOOKS: 'mochaHooks',
  PLUGIN_GLOBAL_SETUP: 'mochaGlobalSetup',
  PLUGIN_GLOBAL_TEARDOWN: 'mochaGlobalTeardown'
}));

exports.PluginLoader = class PluginLoader {
  constructor() {
    this.pluginMap = new Map([
      [constants.PLUGIN_ROOT_HOOKS, []],
      [constants.PLUGIN_GLOBAL_SETUP, []],
      [constants.PLUGIN_GLOBAL_TEARDOWN, []]
    ]);
  }

  load(requiredModule) {
    // we should explicitly NOT fail if other stuff is exported.
    // we only care about the plugins we know about.
    if (requiredModule && typeof requiredModule === 'object') {
      PLUGIN_TYPES.forEach(pluginType => {
        const plugin = requiredModule[pluginType];
        if (plugin) {
          PluginValidators[pluginType](plugin);
          this.pluginMap.set(pluginType, [
            ...this.pluginMap.get(pluginType),
            ...castArray(plugin)
          ]);
        }
      });
    }
  }

  async finalize() {
    const mochaHooks = this.pluginMap.get(PLUGIN_ROOT_HOOKS);
    const finalizedPlugins = Object.create(null);
    if (mochaHooks.length) {
      finalizedPlugins.rootHooks = await aggregateRootHooks(mochaHooks);
    }

    const mochaGlobalSetup = this.pluginMap.get(PLUGIN_GLOBAL_SETUP);
    if (mochaGlobalSetup.length) {
      finalizedPlugins.globalSetup = mochaGlobalSetup;
    }

    const mochaGlobalTeardown = this.pluginMap.get(PLUGIN_GLOBAL_TEARDOWN);
    if (mochaGlobalTeardown.length) {
      finalizedPlugins.globalTeardown = mochaGlobalTeardown;
    }

    return finalizedPlugins;
  }

  static create() {
    return new PluginLoader();
  }
};

const PLUGIN_TYPES = new Set(Object.values(constants));
const {
  PLUGIN_ROOT_HOOKS,
  PLUGIN_GLOBAL_SETUP,
  PLUGIN_GLOBAL_TEARDOWN
} = constants;

const createFunctionArrayValidator = pluginType => value => {
  let isValid = true;
  if (Array.isArray(value)) {
    if (value.some(item => typeof item !== 'function')) {
      isValid = false;
    }
  } else if (typeof value !== 'function') {
    isValid = false;
  }
  if (!isValid) {
    throw createUnsupportedError(
      `${pluginType} must be a function or an array of functions`
    );
  }
};

const PluginValidators = {
  [PLUGIN_ROOT_HOOKS]: value => {
    if (
      Array.isArray(value) ||
      (typeof value !== 'function' && typeof value !== 'object')
    ) {
      throw createUnsupportedError(
        `${PLUGIN_ROOT_HOOKS} must be an object or a function returning (or fulfilling with) an object`
      );
    }
  },
  [PLUGIN_GLOBAL_SETUP]: createFunctionArrayValidator(PLUGIN_GLOBAL_SETUP),
  [PLUGIN_GLOBAL_TEARDOWN]: createFunctionArrayValidator(PLUGIN_GLOBAL_TEARDOWN)
};

/**
 * Loads root hooks as exported via `mochaHooks` from required files.
 * These can be sync/async functions returning objects, or just objects.
 * Flattens to a single object.
 * @param {Array<MochaRootHookObject|MochaRootHookFunction>} rootHooks - Array of root hooks
 * @private
 * @returns {MochaRootHookObject}
 */
const aggregateRootHooks = async rootHooks => {
  const rootHookObjects = await Promise.all(
    rootHooks.map(async hook => (typeof hook === 'function' ? hook() : hook))
  );

  return rootHookObjects.reduce(
    (acc, hook) => ({
      beforeAll: [...acc.beforeAll, ...(hook.beforeAll || [])],
      beforeEach: [...acc.beforeEach, ...(hook.beforeEach || [])],
      afterAll: [...acc.afterAll, ...(hook.afterAll || [])],
      afterEach: [...acc.afterEach, ...(hook.afterEach || [])]
    }),
    {beforeAll: [], beforeEach: [], afterAll: [], afterEach: []}
  );
};
