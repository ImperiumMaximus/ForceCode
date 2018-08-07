import * as vscode from 'vscode';
import { getQueryUnderCursor } from '../commands/soql';

import { ANTLRInputStream, CommonTokenStream } from 'antlr4ts';
import { SoqlLexer } from './grammars/soql/SoqlLexer';
import { SoqlParser } from './grammars/soql/SoqlParser';

export default class SoqlCompletionProvider implements vscode.CompletionItemProvider {
    public provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.CompletionItem[]> {
        var completions: vscode.CompletionItem[] = [];
        let query: string = getQueryUnderCursor(position);
        let targetObject: string = null;

        //vscode.window.forceCode.outputChannel.appendLine(`Pos: ${JSON.stringify(position)}`);

        //vscode.window.forceCode.outputChannel.appendLine(query);
        
        let found = query.match(/from\s\n*([a-z]\w+)/i);
        if (found && found.length >= 2) {
            targetObject = found[1];
        }

        var input = 'SELECT Name FROM Opportunity WHERE AccountId IN (SELECT Id FROM Account';
        var chars = new ANTLRInputStream(input);
        var lexer = new SoqlLexer(chars);
        var tokens = new CommonTokenStream(lexer);
        var parser = new SoqlParser(tokens);
        parser.buildParseTree = true;

        var tree = parser.soqlCodeUnit();
        vscode.window.forceCode.outputChannel.appendLine(JSON.stringify(tree));

        //vscode.window.forceCode.outputChannel.appendLine(JSON.stringify(found));

        return Promise.resolve(completions);
    }
}

function getFieldCompletions(sobjectName: string): vscode.CompletionItem[] {
    return null;
}