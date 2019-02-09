import * as vscode from 'vscode';
import fs = require('fs-extra');
import path = require('path');
import * as error from '../util/error';
import { configuration } from '../services';
import model from '../models/commands';
import createClass from './createClass';
import createLwc from './createLwc';
import createTrigger from './createTrigger';


export default function create(context: vscode.ExtensionContext) {

  return displayCreateMenu()
  .then(res => processResult(res, context))

  function displayCreateMenu() {
    var quickpick: any[] = [model.createClass, model.createTrigger, model.createApexPage, model.createApexComponent];
    if (vscode.window.forceCode.version >= '32.0') {
      quickpick.push(model.createAuraComponent)
    }
    if (vscode.window.forceCode.version >= '45.0') {
      quickpick.push(model.createLwc)
    }
    let options: vscode.QuickPickItem[] = quickpick.map(record => {
        return {
            description: `${record.description}`,
            detail: `${record.detail}`,
            label: `$(${record.icon}) ${record.label}`,
        };
    });
    let config: {} = {
      matchOnDescription: true,
      matchOnDetail: true,
      placeHolder: 'Run a command',
    };
    return vscode.window.showQuickPick(options, config);
  }

  function processResult(result: vscode.QuickPickItem, context: vscode.ExtensionContext) {
    if (result !== undefined && result.description !== undefined) {
      switch (result.description) {
        case model.createClass.description: return createClass(context);
        case model.createTrigger.description: return createTrigger(context);
        case model.createLwc.description: return createLwc(context);
        default: break;
      }
    }
  }
  
}
