import * as vscode from 'vscode';
import { getQueryUnderCursor, SoqlQuery } from '../commands/soql';

import { ANTLRInputStream, CommonTokenStream, Token, ParserRuleContext } from 'antlr4ts';
import { ParseTreeWalker } from 'antlr4ts/tree';
import { SoqlLexer } from './grammars/soql/SoqlLexer';
import  * as SoqlParser from './grammars/soql/SoqlParser';
import { SoqlListener } from './grammars/soql/SoqlListener';
import { SFDX_DIR, TOOLS_DIR, SOBJECTS_DIR, STANDARDOBJECTS_DIR, CUSTOMOBJECTS_DIR, JSONS_DIR } from '../dx/generator/fauxClassGenerator';
import * as path from 'path';
import * as fs from 'fs-extra';
var jsonQuery = require('json-query');

enum FieldContext {
    UNKNOWN,
    SELECT,
    WHERE,
    GROUPBY,
    ORDERBY 
}

export default class SoqlCompletionProvider implements vscode.CompletionItemProvider {
    public provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.CompletionItem[]> {
        var completions: vscode.CompletionItem[] = [];
        let query: SoqlQuery = getQueryUnderCursor(position);
        let relativePosition: vscode.Position = position.with(position.line - query.getStartLine(), position.character);
        let pointRemoved: boolean = false;
        let commaRemoved: boolean = false;

        if (shouldRemovePoint(query, relativePosition)) {
            query.setLine(relativePosition.line, replaceAt(query.getLine(relativePosition.line), relativePosition.character - 1, ''));
            relativePosition = relativePosition.with(relativePosition.line, relativePosition.character - 1);
            pointRemoved = true;
        }
        if (shouldRemoveComma(query, relativePosition)) {
            let affectedLine = query.getLine(relativePosition.line)
            query.setLine(relativePosition.line, replaceAt(affectedLine, 
                    affectedLine.substring(0, relativePosition.character).lastIndexOf(','), ' '));
            commaRemoved = true;
        }
        if (shouldCompleteFilter(query, relativePosition)) {

        }
        if (shouldAddComma(query, relativePosition)) {

        }

        // Todo CLEAN the query before parsing: 
        // for instance if I type SELECT Name, |(trigger autocompletion manually) FROM Object__c the parser breaks and cannot detect the target object (Object__c)
        // buf if I'm in this situation: SELECT Name, Cr|(trigger autocompletion) FROM Object__c the parser works
        var chars = new ANTLRInputStream(query.prettyPrint());
        var lexer = new SoqlLexer(chars);
        var tokens = new CommonTokenStream(lexer);
        var parser = new SoqlParser.SoqlParser(tokens);
        parser.buildParseTree = true;

        var tree = parser.soqlCodeUnit();
        var listener = new SoqlTreeListener(relativePosition);
        ParseTreeWalker.DEFAULT.walk(listener, tree);

        vscode.window.forceCode.outputChannel.appendLine(listener.targetObject);
        vscode.window.forceCode.outputChannel.appendLine(listener.targetField);

        if (commaRemoved || listener.shouldCompleteField()) {
            let fieldTokens: string[] = commaRemoved ? [] : listener.targetField.split('.');
            completions.push(...getFieldCompletions(fieldTokens, listener.targetFieldCtx, listener.targetObject, pointRemoved, commaRemoved));
        }

        return Promise.resolve(completions);
    }
}

function getFieldCompletions(fieldTokens: string[], fieldCtx: FieldContext, startingSObjectName: string, pointRemoved: boolean, commaRemoved: boolean): vscode.CompletionItem[] {
    let targetJson: string = null;
    let sObjectName: string = startingSObjectName;
    let completions: vscode.CompletionItem[] = [];
    for (var i = 0; i < fieldTokens.length; i++) {
        let targetField: string = fieldTokens[i];

        let query;
        let options: {} = {};

        if (i == fieldTokens.length - 1 && !pointRemoved) {
            query = `fields[*name~/^${targetField}.*/i]`;
            options['allowRegexp'] = true;
        } else {
            query = `fields[*relationshipName=${targetField}]`;
        }
        
        let results = extractFields(sObjectName, query, options);
        
        if (i == fieldTokens.length - 1 && !pointRemoved) {
            // we are at the last element, provide completions
            completions.push(...processFields(results));
        } else { 
            // we are jumping to another object through a lookup field on the current one (we assume that the field name is complete)
            sObjectName = processRelationship(results);
        }
    }

    if (pointRemoved || commaRemoved) {
        let results = extractFields(sObjectName, 'fields');
        completions.push(...processFields(results));
    }

    return completions;
}

function extractFields(sObjectName: string, query: string, jsonQueryoptions?: {}): any {
    let options = { data: null };
    Object.assign(options, jsonQueryoptions);
    if (sObjectName !== 'SObject') {
        let targetJson = path.join(
            vscode.workspace.workspaceFolders[0].uri.fsPath,
            SFDX_DIR,
            TOOLS_DIR,
            SOBJECTS_DIR,
            isCustom(sObjectName) ? CUSTOMOBJECTS_DIR : STANDARDOBJECTS_DIR,
            JSONS_DIR,
            sObjectName + '.json'
        );

        options['data'] = fs.readJsonSync(targetJson);
    } else {
        options['data'] = { fields: [{ name: 'Id' }, { name: 'Name' }] };
    }
    return jsonQuery(query, options);
}

function processFields(results: any): vscode.CompletionItem[] {
    let completions: vscode.CompletionItem[] = [];
    if (results && results.value) {
        results.value.forEach(f => {
            completions.push(new vscode.CompletionItem(f.name, vscode.CompletionItemKind.Field));
            if (f.type === 'reference') {
                completions.push(new vscode.CompletionItem(f.relationshipName, vscode.CompletionItemKind.Module));
            }
        });
    } 

    return completions;
}

function processRelationship(results: any): string {
    if (results && results.value) {
        let f = results.value[0];
        if (f.referenceTo) {
            if (f.referenceTo.length == 1) {
                return f.referenceTo[0];
            } else {
                return 'SObject'; // we don't infere the actual type, in this case we provide a couple of fields that are in common to all SObjects
            }
        } 
    }

    return null;
}

function isCustom(sObjectName: string): boolean {
    return sObjectName.endsWith('__c') || sObjectName.endsWith('__mdt') || sObjectName.endsWith('__e') || sObjectName.endsWith('__x');
}

function shouldRemovePoint(query: SoqlQuery, position: vscode.Position): boolean {
    return position.character && query.getLine(position.line).substring(position.character - 1, position.character) == '.';
}

function shouldRemoveComma(query: SoqlQuery, position: vscode.Position): boolean {
    let flattenedQuery = query.prettyPrint();
    let flattenedPosition = query.positionAsFlatten(position, true);

    let lastCommaPosition: number = flattenedQuery.substring(0, flattenedPosition.character).lastIndexOf(',') + 1;

    return !flattenedQuery.substring(lastCommaPosition, flattenedPosition.character).trim().length;
}

function shouldCompleteFilter(query: SoqlQuery, position: vscode.Position): boolean {
    return false;
}

function shouldAddComma(query: SoqlQuery, position: vscode.Position): boolean {
    return false;
}

function replaceAt(str, index, replace): string {
    return str.substring(0, index) + replace + str.substring(index + 1);
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