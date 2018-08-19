import * as vscode from 'vscode';
import fs = require('fs-extra');
import * as path from 'path';
import * as error from '../util/error';
import { start } from 'repl';
var elegantSpinner: any = require('elegant-spinner');

export class SoqlQuery {
    private startLine: number;
    private endLine: number;
    private queryLines: string[] = [];

    constructor(start: number, end: number, lines: string[]) {
        this.startLine = start;
        this.endLine = end;
        this.queryLines.push(...lines);
    }

    public prettyPrint(toTrim: boolean = true, joinCharacter?: string): string {
        let flattenedQuery = this.queryLines.join(joinCharacter || ' ').replace(';', '');
        return toTrim ? flattenedQuery.trim() : flattenedQuery;
    }

    public getLine(pos: vscode.Position): string {
        let i = pos.line - 1;
        if (i >= 0 && i < this.queryLines.length) {
            return this.queryLines[i];
        }
        return null
    }

    public getLastLine(): string {
        return this.queryLines[this.queryLines.length - 1];
    }

    public setLine(pos: vscode.Position, line: string): void {
        let i = pos.line - 1; 
        if (i >= 0 && i < this.queryLines.length) {
            this.queryLines[i] = line;
        }
    }

    public setLastLine(line: string): void {
        this.queryLines[this.queryLines.length - 1] = line;
    }

    public getStartLine(): number {
        return this.startLine;
    }

    public getEndLine(): number {
        return this.endLine;
    }

    public flattenPosition(pos: vscode.Position, relative?: boolean): vscode.Position {
        if (this.queryLines.length == 1) {
            return pos;
        }

        let line = relative ? pos.line - 1 : pos.line - this.startLine;
        let character = pos.character;

        for (var i = 0; i < line; i++) {
            character += this.queryLines[i].length + (this.queryLines[i].length ? 1 : 0);
        }

        return new vscode.Position(1, character);
    }

    public expandPositiion(idx: number): vscode.Position {
        if (this.queryLines.length == 1) {
            return new vscode.Position(1, idx);
        }

        let line = 0;
        let col = idx;

        while (line < this.queryLines.length && 
                col > this.queryLines[line].length) {
            col -= this.queryLines[line].length ? this.queryLines[line++].length + 1 : this.queryLines[line++].length;
        }

        return new vscode.Position(line + 1, col);
    }
}

export default function soql(context: vscode.ExtensionContext): Promise<any> {
    var interval: any = undefined;
    const spinner: any = elegantSpinner();
    var query: SoqlQuery = undefined;
    let errors = undefined;
    let diagnosticCollection: vscode.DiagnosticCollection;

    return vscode.window.forceCode.connect(context)
        .then(svc => getSoqlQuery(svc))
        .then(finished, onError);

    function getSoqlQuery(svc) {
        return new Promise((resolve, reject) => {
            query = getQueryUnderCursor(vscode.window.activeTextEditor.selection.start);

            clearInterval(interval);
            interval = setInterval(function () {
                vscode.window.forceCode.statusBarItem.text = 'ForceCode: Run SOQL Query ' + spinner();
            }, 50);
            return vscode.window.forceCode.conn.query(query.prettyPrint(), (err, res) => {
                errors = err;
                resolve(res);
            });
        });
        
    }
    function finished(res) {
        // Take the results
        // And write them to a file
        clearInterval(interval);

        let document = vscode.window.activeTextEditor.document;
        var diagnostics: vscode.Diagnostic[] = [];

        if (errors) {
            let matches = /(\w+) at Row:\d+:Column:(\d+)\W(.*)/gmi.exec(errors);

            if (matches && matches.length === 4) {
                let failurePosition = new vscode.Position(query.getStartLine(), parseInt(matches[2]) - 1);
                var failureRange: vscode.Range = document.lineAt(query.getStartLine()).range.with(failurePosition);
                diagnostics.push(new vscode.Diagnostic(failureRange, matches[3], vscode.DiagnosticSeverity.Error));
            }
        }

        vscode.window.forceCode.diagnosticCollection.set(document.uri, diagnostics);

        if (diagnostics.length > 0) {
            vscode.window.forceCode.statusBarItem.text = 'ForceCode: Run SOQL Query $(thumbsdown)';
        } else {            
            vscode.window.forceCode.statusBarItem.text = 'ForceCode: Run SOQL Query $(thumbsup)';
            vscode.window.forceCode.outputChannel.appendLine(JSON.stringify(res));
        }
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

export function getQueryUnderCursor(pos: vscode.Position): SoqlQuery {
    let startLine: number = pos.line;
    let endLine: number = startLine;
    let query: string = '';
    let currentLineText: string;

    if (startLine > 0) {   
        currentLineText = vscode.window.activeTextEditor.document.lineAt(startLine).text;
        while (startLine > 0 && !currentLineText.trim().toLocaleUpperCase().startsWith('SELECT')) {
            currentLineText = vscode.window.activeTextEditor.document.lineAt(startLine--).text;
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
    
    let curLine = startLine;
    let lines: string[] = [];
    while (curLine <= endLine) {
        lines.push(vscode.window.activeTextEditor.document.lineAt(curLine++).text);
    }

    return new SoqlQuery(startLine, endLine, lines);
}
