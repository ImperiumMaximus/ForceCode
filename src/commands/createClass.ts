import * as vscode from 'vscode';
import fs = require('fs-extra');
import path = require('path');

export default function createClass(context: vscode.ExtensionContext) {
    var classesPath: string;
    // Here is replaceSrc possiblity
    classesPath = `${vscode.window.forceCode.workspaceRoot}${path.sep}classes`;
    if (fs.statSync(classesPath).isDirectory()) {
        return userFileNameSelection()
        .then(filename => generateFile(filename))
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
        throw { message: classesPath + ' is not a real folder. Check the src option in your config file.' };
    }

    function userFileNameSelection() {
        return new Promise((resolve, reject) => { 
            let options: vscode.InputBoxOptions = {
                placeHolder: 'Base name',
                prompt: `Enter the class name.`,
            };
            return vscode.window.showInputBox(options).then(classname => {
                if (classname) {
                    classname = classname.trim();
                    if (classname.endsWith('.cls')) {
                        classname = classname.substring(0, classname.lastIndexOf('.cls'));
                    }
                    resolve(classname);
                }
                reject(undefined);
            });
        });
    }

    function generateFile(classname) {
        return Promise.all([writeFile(), writeMetaFile()]);
        function writeFile() {
            return new Promise(function (resolve, reject) {
                // Write Class file
                var finalClassName: string = classesPath + path.sep + classname + '.cls';
                fs.stat(finalClassName, function (err, stats) {
                    if (!err) {
                        vscode.window.forceCode.statusBarItem.text = 'ForceCode: Error creating file';
                        vscode.window.showErrorMessage('Cannot create ' + finalClassName + '. A file with that name already exists!');
                    } else if (err.code === 'ENOENT') {
                        var classFile: string = `public with sharing class ${classname} {

}`;
                        fs.outputFile(finalClassName, classFile, function (writeErr) {
                            if (writeErr) {
                                vscode.window.forceCode.statusBarItem.text = 'ForceCode: ' + writeErr.message;
                                vscode.window.showErrorMessage(writeErr.message);
                                reject(writeErr);
                            } else {
                                vscode.window.forceCode.statusBarItem.text = 'ForceCode: ' + classname + ' was sucessfully created $(check)';
                                resolve(finalClassName);
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
            var finalMetadataName: string = classesPath + path.sep + classname + '.cls-meta.xml';
            return new Promise(function (resolve, reject) {
                fs.stat(finalMetadataName, function (err, stats) {
                    if (!err) {
                        vscode.window.forceCode.statusBarItem.text = 'ForceCode: Error creating file';
                        vscode.window.showErrorMessage('Cannot create ' + finalMetadataName + '. A file with that name already exists!');
                    } else if (err.code === 'ENOENT') {

                        var metaFile: string = `<?xml version="1.0" encoding="UTF-8"?>
<ApexClass xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>${vscode.window.forceCode.version || vscode.window.forceCode.conn.version || '37.0'}</apiVersion>
    <status>Active</status>
</ApexClass>`;

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
