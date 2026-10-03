'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld(
  'aura',
  Object.freeze({
    invoke: async (method, payload = {}) => {
      const result = await ipcRenderer.invoke('aura:invoke', method, payload);
      if (!result?.ok) {
        const error = new Error(result?.error?.message || 'The operation could not be completed.');
        error.code = result?.error?.code || 'OPERATION_FAILED';
        throw error;
      }
      return result.data;
    },
    onEvent: (callback) => {
      if (typeof callback !== 'function') throw new TypeError('An event callback is required.');
      const listener = (_event, data) => callback(data);
      ipcRenderer.on('aura:event', listener);
      return () => ipcRenderer.removeListener('aura:event', listener);
    },
  }),
);
