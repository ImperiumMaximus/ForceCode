import * as vscode from 'vscode';
import fs = require('fs-extra');
import * as path from 'path';
import * as error from '../util/error';
var elegantSpinner: any = require('elegant-spinner');

export default function soql(context: vscode.ExtensionContext): Promise<any> {
    var interval: any = undefined;
    const spinner: any = elegantSpinner();
    return vscode.window.forceCode.connect(context)
        .then(svc => getSoqlQuery(svc))
        .then(finished, onError);

    function getSoqlQuery(svc) {
        return new Promise((resolve, reject) => {
            let query = getQueryUnderCursor(vscode.window.activeTextEditor.selection.start);

            clearInterval(interval);
            interval = setInterval(function () {
                vscode.window.forceCode.statusBarItem.text = 'ForceCode: Run SOQL Query ' + spinner();
            }, 50);
            return vscode.window.forceCode.conn.query(query, (err, res) => {
                if (err) {
                    reject(err);
                }
                resolve(res);
            });
        });
        
    }
    function finished(res) {
        // Take the results
        // And write them to a file
        clearInterval(interval);
        vscode.window.forceCode.statusBarItem.text = 'ForceCode: Run SOQL Query $(thumbsup)';
        vscode.window.forceCode.outputChannel.appendLine(JSON.stringify(res));
    }
    function onError(err) {
        // Take the results
        // And write them to a file
        error.outputError({ message: err }, vscode.window.forceCode.outputChannel);
        clearInterval(interval);
        vscode.window.forceCode.statusBarItem.text = 'ForceCode: Run SOQL Query $(thumbsdown)';
    }
    // =======================================================================================================================================
}

export function getQueryUnderCursor(pos: vscode.Position): string {
    let startLine: number = pos.line;
    let endLine: number = startLine;
    let query: string = '';
    let currentLineText: string;

    if (startLine > 0) {   
        do  {
            currentLineText = vscode.window.activeTextEditor.document.lineAt(--startLine).text;
        } while (startLine > 0 && !currentLineText.trim().endsWith(';'));

        if (startLine > 0) {
            startLine++;
        }

/*        if (startLine < 0) {
            reject('Cannot find start boundary of query under cursor');
        }*/
    }

    if (endLine < (vscode.window.activeTextEditor.document.lineCount - 1)) {
        currentLineText = vscode.window.activeTextEditor.document.lineAt(endLine).text;
        while (endLine < (vscode.window.activeTextEditor.document.lineCount - 1) && !currentLineText.trim().endsWith(';')) {
            currentLineText = vscode.window.activeTextEditor.document.lineAt(++endLine).text;
        }

/*        if (endLine > vscode.window.activeTextEditor.document.lineCount) {
            reject('Cannot find end boundary of query under cursor');
        }*/
    }
    

    while (startLine <= endLine) {
        query += vscode.window.activeTextEditor.document.lineAt(startLine++).text + ' ';
    }

    return query.trim().replace(';', '');
}
