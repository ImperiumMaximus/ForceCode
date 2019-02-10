import * as vscode from 'vscode';
import fs = require('fs-extra');
import path = require('path');
import * as error from '../util/error';
import { configuration } from '../services';

export default function createLwc(context: vscode.ExtensionContext) {
  var lwcsPath: string;
    // Here is replaceSrc possiblity
    return configuration().then(config => {
      lwcsPath = `${vscode.window.forceCode.workspaceRoot}${path.sep}lwc`;
      if (!fs.existsSync(lwcsPath)) {
        fs.mkdirSync(lwcsPath)
      }
      if (fs.statSync(lwcsPath).isDirectory()) {
        return userFileNameSelection().then(lwcname => {
          return generateFiles(lwcname, config)
            .then(res => {
              let fp: string = res[1].toString();
              return vscode.workspace.openTextDocument(fp).then(document => {
                  return vscode.window.showTextDocument(document, vscode.ViewColumn.One);
              });
          })
        });
      } else {
        throw { message: lwcsPath + ' is not a real folder. Check the src option in your config file.' };
      }
    }).catch(err => error.outputError);

    function userFileNameSelection() {
      // don't force name convention for custom class type.
      let options: vscode.InputBoxOptions = {
          placeHolder: 'Base name',
          prompt: `Enter LWC name. An empty component will be created`,
      };
      return vscode.window.showInputBox(options).then(lwcname => {
          if (lwcname) {
              if (lwcname.indexOf(' ') > -1) {
                lwcname = lwcname.replace(' ', '');
              }
              lwcname = lwcname.charAt(0).toLowerCase() + lwcname.slice(1)
              return lwcname;
          }
          return undefined;
      });
    }

    function generateFiles(lwcname: string, config) {
      return Promise.all([createSubDir(), writeHtmlFile(), writeJsFile(), writeJsMetaFile()]);
      
      function createSubDir() {
        return new Promise(function (resolve, reject) {
          var finalLwcDirName: string = lwcsPath + path.sep + lwcname;
          fs.stat(finalLwcDirName, function(err, stats) {
            if (!err) {
              vscode.window.forceCode.statusBarItem.text = 'ForceCode: Error creating LWC';
              vscode.window.showErrorMessage('Cannot create ' + finalLwcDirName + '. A component with that name already exists!');
            } else if (err.code === 'ENOENT') {
              fs.mkdir(finalLwcDirName, 0o777, function(mkdirErr) {
                if (mkdirErr) {
                  vscode.window.forceCode.statusBarItem.text = 'ForceCode: ' + mkdirErr.message;
                  vscode.window.showErrorMessage(mkdirErr.message);
                  reject(mkdirErr);
              } else {
                  //vscode.window.forceCode.statusBarItem.text = 'ForceCode: ' + classname + ' was sucessfully created $(check)';
                  resolve(finalLwcDirName);
              }
              })
            }
          })
        })
      }

      function writeHtmlFile() {
        return new Promise(function (resolve, reject) {
          var finalLwcHtmlName: string = lwcsPath + path.sep + lwcname + path.sep + lwcname + '.html';
          fs.stat(finalLwcHtmlName, function(err, stats) {
            if (!err) {
              vscode.window.forceCode.statusBarItem.text = 'ForceCode: Error creating file';
              vscode.window.showErrorMessage('Cannot create ' + finalLwcHtmlName + '. A file with that name already exists!');
            } else if (err.code === 'ENOENT') {
              var htmlFile: string = `<template>
</template>`;
              fs.outputFile(finalLwcHtmlName, htmlFile, function(writeErr) {
                if (writeErr) {
                  vscode.window.forceCode.statusBarItem.text = 'ForceCode: ' + writeErr.message;
                  vscode.window.showErrorMessage(writeErr.message);
                  reject(writeErr);
                } else {
                  resolve(finalLwcHtmlName);
                }
              })
            } else {
              vscode.window.forceCode.statusBarItem.text = 'ForceCode: ' + err.code;
              vscode.window.showErrorMessage(err.code);
              reject(err);
            }
          })
        })
      }

      function writeJsFile() {
        return new Promise(function (resolve, reject) {
          var finalLwcJsName: string = lwcsPath + path.sep + lwcname + path.sep + lwcname + '.js';
          fs.stat(finalLwcJsName, function(err, stats) {
            if (!err) {
              vscode.window.forceCode.statusBarItem.text = 'ForceCode: Error creating file';
              vscode.window.showErrorMessage('Cannot create ' + finalLwcJsName + '. A file with that name already exists!');
            } else if (err.code === 'ENOENT') {
              var jsFile: string = `import { LightningElement } from 'lwc';
              
export default class ${lwcname.charAt(0).toUpperCase() + lwcname.slice(1)} extends LightningElement {

}`;
              fs.outputFile(finalLwcJsName, jsFile, function(writeErr) {
                if (writeErr) {
                  vscode.window.forceCode.statusBarItem.text = 'ForceCode: ' + writeErr.message;
                  vscode.window.showErrorMessage(writeErr.message);
                  reject(writeErr);
                } else {
                  resolve(finalLwcJsName);
                }
              })
            } else {
              vscode.window.forceCode.statusBarItem.text = 'ForceCode: ' + err.code;
              vscode.window.showErrorMessage(err.code);
              reject(err);
            }
          })
        })
      }

      function writeJsMetaFile() {
        return new Promise(function (resolve, reject) {
          var finalLwcJsMetaName: string = lwcsPath + path.sep + lwcname + path.sep + lwcname + '.js-meta.xml';
          fs.stat(finalLwcJsMetaName, function(err, stats) {
            if (!err) {
              vscode.window.forceCode.statusBarItem.text = 'ForceCode: Error creating file';
              vscode.window.showErrorMessage('Cannot create ' + finalLwcJsMetaName + '. A file with that name already exists!');
            } else if (err.code === 'ENOENT') {
              var jsMetaFile: string = `<?xml version="1.0" encoding="UTF-8"?>
<LightningComponentBundle xmlns="http://soap.sforce.com/2006/04/metadata">
      <apiVersion>${vscode.window.forceCode.conn.version || vscode.window.forceCode.conn.version || '45.0'}</apiVersion>
      <isExposed>true</isExposed>
      <targets>
          <target>lightning__AppPage</target>
          <target>lightning__RecordPage</target>
          <target>lightning__HomePage</target>
      </targets>
</LightningComponentBundle>`;
              fs.outputFile(finalLwcJsMetaName, jsMetaFile, function(writeErr) {
                if (writeErr) {
                  vscode.window.forceCode.statusBarItem.text = 'ForceCode: ' + writeErr.message;
                  vscode.window.showErrorMessage(writeErr.message);
                  reject(writeErr);
                } else {
                  resolve(finalLwcJsMetaName);
                }
              })
            } else {
              vscode.window.forceCode.statusBarItem.text = 'ForceCode: ' + err.code;
              vscode.window.showErrorMessage(err.code);
              reject(err);
            }
          })
        })
      }
    }
}