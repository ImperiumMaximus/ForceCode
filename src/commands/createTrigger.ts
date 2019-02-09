import * as vscode from 'vscode';
import fs = require('fs-extra');
import path = require('path');

export default function createTrigger(context: vscode.ExtensionContext) {
    var triggersPath: string;
    // Here is replaceSrc possiblity
    triggersPath = `${vscode.window.forceCode.workspaceRoot}${path.sep}triggers`;
    if (fs.statSync(triggersPath).isDirectory()) {
        return selectObject()
        .then(opt => userFileNameSelection(opt))
        .then(triggerData => generateFile(triggerData))
        .then(res => {
            let fp: string = res[0].toString();
            return vscode.workspace.openTextDocument(fp).then(document => {
                return vscode.window.showTextDocument(document, vscode.ViewColumn.One);
            });
        })
        .catch(err => {
            vscode.window.forceCode.statusBarItem.text = 'ForceCode: Aborted by user';
        })
    } else {
        throw { message: triggersPath + ' is not a real folder. Check the src option in your config file.' };
    }

    async function selectObject() {
      let allResults = await vscode.window.forceCode.conn.soap._invoke('describeGlobal', {})
      let options: vscode.QuickPickItem[] = allResults.sobjects.filter(sobject => sobject.triggerable === 'true').map(sobject => {
        return {
          label: sobject.name,
          description: sobject.label
        }
      })
      let config: {} = {
        matchOnDescription: true,
        placeHolder: 'Select an Object',
      };
      return vscode.window.showQuickPick(options, config);
    }

    function userFileNameSelection(opt) {
        return new Promise((resolve, reject) => { 
            let options: vscode.InputBoxOptions = {
                value: `On${opt.label}`,
                placeHolder: 'Trigger name',
                prompt: `Enter the trigger name.`,
            };
            return vscode.window.showInputBox(options).then(triggername => {
                if (triggername) {
                  triggername = triggername.trim();
                    if (triggername.endsWith('.trigger')) {
                      triggername = triggername.substring(0, triggername.lastIndexOf('.trigger'));
                    }
                    resolve({opt: opt, name: triggername});
                }
                reject(undefined);
            });
        });
    }

    function generateFile(triggerData) {
        return Promise.all([writeFile(), writeMetaFile()]);
        function writeFile() {
            return new Promise(function (resolve, reject) {
                // Write Class file
                var finalTriggerName: string = triggersPath + path.sep + triggerData.name + '.trigger';
                fs.stat(finalTriggerName, function (err, stats) {
                    if (!err) {
                        vscode.window.forceCode.statusBarItem.text = 'ForceCode: Error creating file';
                        vscode.window.showErrorMessage('Cannot create ' + finalTriggerName + '. A file with that name already exists!');
                    } else if (err.code === 'ENOENT') {
                        var triggerFile: string = `trigger ${triggerData.name} on ${triggerData.opt.label} (before insert, after insert, before update, after update) {

}`;
                        fs.outputFile(finalTriggerName, triggerFile, function (writeErr) {
                            if (writeErr) {
                                vscode.window.forceCode.statusBarItem.text = 'ForceCode: ' + writeErr.message;
                                vscode.window.showErrorMessage(writeErr.message);
                                reject(writeErr);
                            } else {
                                vscode.window.forceCode.statusBarItem.text = 'ForceCode: ' + triggerData.name + ' was sucessfully created $(check)';
                                resolve(finalTriggerName);
                            }
                        });
                    } else {
                        vscode.window.forceCode.statusBarItem.text = 'ForceCode: ' + err.code;
                        vscode.window.showErrorMessage(err.code);
                        reject(err);
                    }
                });
            });
        }
        // Write Metadata file
        function writeMetaFile() {
            var finalMetadataName: string = triggersPath + path.sep + triggerData.name + '.trigger-meta.xml';
            return new Promise(function (resolve, reject) {
                fs.stat(finalMetadataName, function (err, stats) {
                    if (!err) {
                        vscode.window.forceCode.statusBarItem.text = 'ForceCode: Error creating file';
                        vscode.window.showErrorMessage('Cannot create ' + finalMetadataName + '. A file with that name already exists!');
                    } else if (err.code === 'ENOENT') {

                        var metaFile: string = `<?xml version="1.0" encoding="UTF-8"?>
<ApexTrigger xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>${vscode.window.forceCode.version || vscode.window.forceCode.conn.version || '37.0'}</apiVersion>
    <status>Active</status>
</ApexTrigger>`;

                        fs.outputFile(finalMetadataName, metaFile, function (writeError) {
                            if (writeError) {
                                vscode.window.forceCode.statusBarItem.text = 'ForceCode: ' + writeError.message;
                                vscode.window.showErrorMessage(writeError.message);
                                reject(err);
                            }
                            resolve(finalMetadataName);
                        });
                    } else {
                        vscode.window.forceCode.statusBarItem.text = 'ForceCode: ' + err.code;
                        reject(err);
                    }
                });

            });
        }



    }

}