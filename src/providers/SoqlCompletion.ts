import * as vscode from 'vscode';
import { getQueryUnderCursor } from '../commands/soql';

import { ANTLRInputStream, CommonTokenStream, Token, ParserRuleContext } from 'antlr4ts';
import { ParseTreeWalker } from 'antlr4ts/tree';
import { SoqlLexer } from './grammars/soql/SoqlLexer';
import  * as SoqlParser from './grammars/soql/SoqlParser';
import { SoqlListener } from './grammars/soql/SoqlListener';
import { SFDX_DIR, TOOLS_DIR, SOBJECTS_DIR, STANDARDOBJECTS_DIR, CUSTOMOBJECTS_DIR, JSONS_DIR } from '../dx/generator/fauxClassGenerator';
import * as path from 'path';
import * as fs from 'fs-extra';
var jsonQuery = require('json-query');


export default class SoqlCompletionProvider implements vscode.CompletionItemProvider {
    public provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.CompletionItem[]> {
        var completions: vscode.CompletionItem[] = [];
        let query: any = getQueryUnderCursor(position);

        // Todo CLEAN the query before parsing: 
        // for instance if I type SELECT Name, |(trigger autocompletion manually) FROM Object__c the parser breaks and cannot detect the target object (Object__c)
        // buf if I'm in this situation: SELECT Name, Cr|(trigger autocompletion) FROM Object__c the parser works
        var chars = new ANTLRInputStream(query.query);
        var lexer = new SoqlLexer(chars);
        var tokens = new CommonTokenStream(lexer);
        var parser = new SoqlParser.SoqlParser(tokens);
        parser.buildParseTree = true;

        var tree = parser.soqlCodeUnit();
        var listener = new SoqlTreeListener(position.with(position.line - query.startLine, position.character));
        ParseTreeWalker.DEFAULT.walk(listener, tree);

        vscode.window.forceCode.outputChannel.appendLine(listener.targetObject);
        vscode.window.forceCode.outputChannel.appendLine(listener.targetField);

        if (listener.shouldCompleteField()) {
            let fieldTokens: string[] = listener.targetField.split('.');
            completions.push(...getFieldCompletions(fieldTokens, listener.targetFieldCtx, listener.targetObject));
        }

        return Promise.resolve(completions);
    }
}

function getFieldCompletions(fieldTokens: string[], fieldCtx: FieldContext, startingSObjectName: string): vscode.CompletionItem[] {
    let targetJson: string = null;
    let sObjectName: string = startingSObjectName;
    let completions: vscode.CompletionItem[] = [];
    for (var i = 0; i < fieldTokens.length; i++) {
        let targetField: string = fieldTokens[i];
        targetJson = path.join(
            vscode.workspace.workspaceFolders[0].uri.fsPath,
            SFDX_DIR,
            TOOLS_DIR,
            SOBJECTS_DIR,
            isCustom(sObjectName) ? CUSTOMOBJECTS_DIR : STANDARDOBJECTS_DIR,
            JSONS_DIR,
            sObjectName + '.json'
        );

        let query;
        if (i == fieldTokens.length - 1) {
            query = `fields[*name~/^${targetField}.*/i]`;
        } else {
            query = `fields[*relationshipName=${targetField}]`;
        }
        let results = jsonQuery(query, { data: fs.readJsonSync(targetJson), allowRegexp: true });
        if (results && results.value) {
            // we are at the last element, provide completions
            if (i == fieldTokens.length - 1) {
                results.value.forEach(f => {
                    completions.push(new vscode.CompletionItem(f.name, vscode.CompletionItemKind.Field));
                    if (f.type === 'reference') {
                        completions.push(new vscode.CompletionItem(f.relationshipName, vscode.CompletionItemKind.Module));
                    }
                });
            } else { // we are jumping to another object through a lookup field on the current one (we assume that the field name is complete)
                let f = results.value[0];
                if (f.referenceTo && f.referenceTo.length) {
                    sObjectName = f.referenceTo[0]; // TODO: how to deal with polymorphic lookups?
                }
            }
        }
    }
    return completions;
}

function isCustom(sObjectName: string): boolean {
    return sObjectName.endsWith('__c') || sObjectName.endsWith('__mdt') || sObjectName.endsWith('__e') || sObjectName.endsWith('__x');
}

enum FieldContext {
    UNKNOWN,
    SELECT,
    WHERE,
    GROUPBY,
    ORDERBY 
}

class SoqlTreeListener implements SoqlListener {
    pos: vscode.Position;
    targetObject: string = null;
    targetField: string = null;
    targetFieldCtx: FieldContext = FieldContext.UNKNOWN;


    constructor(position: vscode.Position) {
        this.pos = position;
    }

    visitTerminal = () => { };
    visitErrorNode = () => { };
    enterEveryRule = () => { };
    exitEveryRule = () => { };

    enterObjectType = (ctx: SoqlParser.ObjectTypeContext) => {
        //vscode.window.forceCode.outputChannel.appendLine(JSON.stringify(ctx));
        let curCtx: ParserRuleContext = ctx;
        while (curCtx && !(curCtx instanceof SoqlParser.WhereSubqueryContext || 
            curCtx instanceof SoqlParser.SoqlStatementContext)) {
            curCtx = curCtx.parent;
        }

        if (curCtx && (curCtx instanceof SoqlParser.WhereSubqueryContext) && 
            this.isInRange(curCtx.start, curCtx.stop) ||
            (curCtx instanceof SoqlParser.SoqlStatementContext && !this.targetObject)) {
            this.targetObject = ctx.text;
        }
    }

    enterRelationshipItem = (ctx: SoqlParser.RelationshipItemContext) => {
        let curCtx: ParserRuleContext = ctx;
        while (curCtx && !(curCtx instanceof SoqlParser.SubqueryContext)) {
            curCtx = curCtx.parent;
        }

        if (curCtx && (curCtx instanceof SoqlParser.SubqueryContext) && this.isInRange(curCtx.start, curCtx.stop)) {
            this.targetObject = ctx.text;
        }
    }

    enterFieldItem = (ctx: SoqlParser.FieldItemContext) => {
        let curCtx: ParserRuleContext = ctx;

        if (!this.isInRange(ctx.start, ctx.stop, true))
            return;

        this.targetField = ctx.text;

        while (curCtx && !(curCtx instanceof SoqlParser.SelectStatementContext || 
                curCtx instanceof SoqlParser.WhereStatementContext || curCtx instanceof SoqlParser.OrderByStatementContext || 
                curCtx instanceof SoqlParser.GroupByStatementContext)) {
            curCtx = curCtx.parent;
        }

        if (curCtx && this.isInRange(curCtx.start, curCtx.stop, true)) {
            if (curCtx instanceof SoqlParser.SelectStatementContext) {
                this.targetFieldCtx = FieldContext.SELECT;
            } else if (curCtx instanceof SoqlParser.WhereStatementContext) {
                this.targetFieldCtx = FieldContext.WHERE;
            } else if (curCtx instanceof SoqlParser.OrderByStatementContext) {
                this.targetFieldCtx = FieldContext.ORDERBY;
            } else if (curCtx instanceof SoqlParser.GroupByStatementContext) {
                this.targetFieldCtx = FieldContext.GROUPBY;
            }
        }
    }

    private isInRange(start: Token, end: Token, oneExtraAtEnd?: boolean): boolean {
        return (this.pos.line > start.line && this.pos.line < end.line) || 
            (this.pos.line == start.line && this.pos.line != end.line && this.pos.character >= start.startIndex) ||
            (this.pos.line == end.line && this.pos.line != start.line && this.pos.character <= (oneExtraAtEnd ? end.stopIndex + 1 : end.stopIndex)) ||
            (this.pos.line == start.line && this.pos.line == end.line && this.pos.character >= start.startIndex && this.pos.character <= (oneExtraAtEnd ? end.stopIndex + 1 : end.stopIndex));
    }

    public shouldCompleteField(): boolean {
        return !!this.targetObject && !!this.targetField && !!this.targetFieldCtx;
    }
}