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
    ORDERBY,
    FROM
}

export default class SoqlCompletionProvider implements vscode.CompletionItemProvider {
    public provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.CompletionItem[]> {
        var completions: vscode.CompletionItem[] = [];
        let query: SoqlQuery = getQueryUnderCursor(position);
        let relativePosition: vscode.Position = position.with(position.line - query.getStartLine(), position.character);
        let relativeFlattenedPosition: vscode.Position = query.flattenPosition(relativePosition, true);
        let pointRemoved: boolean = false;
        let commaSanitized: boolean = false;

        if (shouldRemovePoint(query, relativePosition)) {
            query.setLine(relativePosition.line, replaceAt(query.getLine(relativePosition.line), relativePosition.character - 1, ''));
            relativePosition = relativePosition.with(relativePosition.line, relativePosition.character - 1);
            relativeFlattenedPosition = relativeFlattenedPosition.with(relativeFlattenedPosition.line, relativeFlattenedPosition.character - 1)
            pointRemoved = true;
        }
        if (shouldRemoveComma(query, relativePosition)) {
            let affectedLine = query.getLine(relativePosition.line)
            query.setLine(relativePosition.line, replaceAt(affectedLine, 
                    affectedLine.substring(0, relativePosition.character).lastIndexOf(','), ' '));
            commaSanitized = true;
            relativeFlattenedPosition = relativeFlattenedPosition.with(relativeFlattenedPosition.line, 
                relativeFlattenedPosition.character - query.prettyPrint().substring(0, relativeFlattenedPosition.character).match(/\s/g).length + 1);
        }
        if (shouldCompleteFilter(query, relativePosition)) {
            let affectedLine = query.getLine(relativePosition.line)
            query.setLine(relativePosition.line, splice(affectedLine, relativeFlattenedPosition.character, 0, '=null'));
        }
        if (shouldAddComma(query, relativePosition)) {
            query.setLine(relativePosition.line, replaceAt(query.getLine(relativePosition.line), relativePosition.character, ','));
            commaSanitized = true;
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
        var listener = new SoqlTreeListener(relativeFlattenedPosition);
        ParseTreeWalker.DEFAULT.walk(listener, tree);

        vscode.window.forceCode.outputChannel.appendLine(listener.targetObject);
        vscode.window.forceCode.outputChannel.appendLine(listener.targetField);
        vscode.window.forceCode.outputChannel.appendLine(listener.targetFieldCtx.toString());

        if (listener.shouldCompleteField()) {
            let fieldTokens: string[] = listener.targetField.split('.');
            completions.push(...getFieldCompletions(fieldTokens, listener, pointRemoved, commaSanitized));
        } else if (listener.shouldCompleteSObject()) {
            completions.push(...getSObjectCompletions(listener.targetObject));
        } else if (listener.shouldCompleteChildRelationship()) {
            completions.push(...getChildRelationshipCompletions(listener.targetObject, listener.targetRelationshipObject));
        }

        return Promise.resolve(completions);
    }
}

function getFieldCompletions(fieldTokens: string[], listener: SoqlTreeListener, pointRemoved: boolean, commaSanitized: boolean): vscode.CompletionItem[] {
    let sObjectName: string = listener.targetObject;
    let completions: vscode.CompletionItem[] = [];

    if (listener.isInSubquery && listener.targetRelationshipObject) {
        let query = `childRelationships[*relationshipName=${listener.targetRelationshipObject}]`;
        let childRelationship = extractFromJson(sObjectName, query);
        if (childRelationship && childRelationship.value && childRelationship.value.length) {
            sObjectName = childRelationship.value[0].childSObject;
        }
    }
    
    if (!commaSanitized) {
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
            
            let results = extractFromJson(sObjectName, query, options);
            
            if (i == fieldTokens.length - 1 && !pointRemoved) {
                // we are at the last element, provide completions
                completions.push(...processFields(results));
            } else { 
                // we are jumping to another object through a lookup field on the current one (we assume that the field name is complete)
                sObjectName = processRelationship(results);
            }
        }
    } 
    
    if (pointRemoved || commaSanitized) {
        let results = extractFromJson(sObjectName, 'fields');
        completions.push(...processFields(results));
    }

    return completions;
}

function getSObjectCompletions(targetObject?: string): vscode.CompletionItem[] {
    let completions: vscode.CompletionItem[] = [];
    getSObjectJsonList().forEach(checkIfPropose);
    getSObjectJsonList(true).forEach(checkIfPropose);

    return completions;

    function checkIfPropose(element: string) {
        if (!targetObject || element.match(new RegExp('^' + targetObject + '.*', 'i'))) {
            completions.push(new vscode.CompletionItem(element, vscode.CompletionItemKind.Class));
        }
    }
}

function getChildRelationshipCompletions(targetObject: string, targetRelationshipObject?: string): vscode.CompletionItem[] {
    let completions: vscode.CompletionItem[] = [];

    let query = targetRelationshipObject ? `childRelationships[*relationshipName~/^${targetRelationshipObject}.*/i]` : 'childRelationships';
    let options = targetRelationshipObject ? {allowRegexp: true} : {};

    let childRelationships = extractFromJson(targetObject, query, options);

    if (childRelationships && childRelationships.value) {
        childRelationships.value.forEach(element => {
            completions.push(new vscode.CompletionItem(element.relationshipName, vscode.CompletionItemKind.Class));
        });
    }

    return completions;
}

function getSObjectJsonList(listCustom?: boolean): string[] {
    let targetDir: string = path.join(
    vscode.workspace.workspaceFolders[0].uri.fsPath,
    SFDX_DIR,
    TOOLS_DIR,
    SOBJECTS_DIR,
    listCustom ? CUSTOMOBJECTS_DIR : STANDARDOBJECTS_DIR,
    JSONS_DIR);

    return fs.readdirSync(targetDir).map(f => {
        return f.substring(0, f.lastIndexOf('.json'));
    });
}

function extractFromJson(sObjectName: string, query: string, jsonQueryoptions?: {}): any {
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

// TODO: handle subqueries
function isCursorInSelectStatement(query: SoqlQuery, position: vscode.Position): boolean {
    let flattenedQuery = query.prettyPrint();
    let flattenedPosition = query.flattenPosition(position, true);

    let startMatch = /\b(SELECT)\b/i.exec(flattenedQuery);
    let endMatch = /\b(FROM)\b/i.exec(flattenedQuery);

    return startMatch && endMatch && flattenedPosition.character > startMatch.index && 
            flattenedPosition.character - 1 <= endMatch.index;
}

function isCursorInWhereStatement(query: SoqlQuery, position: vscode.Position): boolean {
    let flattenedQuery = query.prettyPrint();
    let flattenedPosition = query.flattenPosition(position, true);

    let startMatch = /\b(WHERE)\b/i.exec(flattenedQuery);
    let endMatch = /\b(WITH|GROUP\sBY|ORDER\sBY|LIMIT|OFFSET|FOR|$)\b/i.exec(flattenedQuery);

    return startMatch && endMatch && flattenedPosition.character > startMatch.index && 
            flattenedPosition.character - 1 <= endMatch.index;
}

function shouldRemoveComma(query: SoqlQuery, position: vscode.Position): boolean {
    if (!isCursorInSelectStatement(query, position)) return false;

    let flattenedQuery = query.prettyPrint();
    let flattenedPosition = query.flattenPosition(position, true);

    let lastCommaPosition: number = flattenedQuery.substring(0, flattenedPosition.character).lastIndexOf(',') + 1;

    let querySubstrToEnd = flattenedQuery.substring(flattenedPosition.character);
    var match = querySubstrToEnd.match(/([a-z]\w+\.?)/i);

    return !flattenedQuery.substring(lastCommaPosition, flattenedPosition.character).trim().length && 
            match && match.length && match[0].toLocaleUpperCase() === 'FROM';
}

function shouldCompleteFilter(query: SoqlQuery, position: vscode.Position): boolean {
    if (!isCursorInWhereStatement(query, position)) return false;

    let flattenedQuery = query.prettyPrint();
    let flattenedPosition = query.flattenPosition(position, true);

    let startIndex = flattenedQuery.substring(0, flattenedPosition.character).lastIndexOf(' ') + 1;
    let endIndex: number = -1;
    let endMatch = /(\s+|$)/i.exec(flattenedQuery.substring(flattenedPosition.character));

    if (endMatch) {
        endIndex = endMatch.index + flattenedPosition.character;
    }

    let maybeField = flattenedQuery.substring(startIndex, endIndex);

    return maybeField.trim() === maybeField;
}

function shouldAddComma(query: SoqlQuery, position: vscode.Position): boolean {
    if (!isCursorInSelectStatement(query, position)) return false;

    let flattenedQuery = query.prettyPrint();
    let flattenedPosition = query.flattenPosition(position, true);

    let querySubstrToEnd = flattenedQuery.substring(flattenedPosition.character);

    var match = querySubstrToEnd.match(/([a-z]\w+\.?)/i);
    return match && match.length && match[0].toLocaleUpperCase() !== 'FROM';
}

function replaceAt(str, index, replace): string {
    return str.substring(0, index) + replace + str.substring(index + 1);
}

function splice(str: string, idx: number, rem: number, newStr: string): string {
    return str.slice(0, idx) + newStr + str.slice(idx + Math.abs(rem));
}
class SoqlTreeListener implements SoqlListener {
    pos: vscode.Position;
    targetObject: string = null;
    targetRelationshipObject: string = null;
    targetField: string = '';
    targetFieldCtx: FieldContext = FieldContext.UNKNOWN;
    isInSubquery: boolean = false;


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
            this.isInSubquery = this.isInSubquery || curCtx instanceof SoqlParser.WhereSubqueryContext;
        }
    }

    enterRelationshipItem = (ctx: SoqlParser.RelationshipItemContext) => {
        let curCtx: ParserRuleContext = ctx;
        while (curCtx && !(curCtx instanceof SoqlParser.SubqueryContext)) {
            curCtx = curCtx.parent;
        }

        if (curCtx && (curCtx instanceof SoqlParser.SubqueryContext) && this.isInRange(curCtx.start, curCtx.stop)) {
            this.targetRelationshipObject = ctx.text;
        }
    }

    enterSelectStatement = (ctx: SoqlParser.SelectStatementContext) => {
        if (this.isInRange(ctx.start, ctx.stop, true)) {
            this.targetFieldCtx = FieldContext.SELECT;
        }
    }

    enterWhereStatement = (ctx: SoqlParser.WhereStatementContext) => {
        if (this.isInRange(ctx.start, ctx.stop, true)) {
            this.targetFieldCtx = FieldContext.WHERE;
        }
    }

    enterOrderByStatement = (ctx: SoqlParser.OrderByStatementContext) => {
        if (this.isInRange(ctx.start, ctx.stop, true)) {
            this.targetFieldCtx = FieldContext.ORDERBY;
        }
    }

    enterGroupByStatement = (ctx: SoqlParser.GroupByStatementContext) => {
        if (this.isInRange(ctx.start, ctx.stop, true)) {
            this.targetFieldCtx = FieldContext.GROUPBY;
        }
    }

    enterFromStatement = (ctx: SoqlParser.FromStatementContext) => {
        if (this.isInRange(ctx.start, ctx.stop, true)) {
            this.targetFieldCtx = FieldContext.FROM;
        }
    }
 
    enterFieldItem = (ctx: SoqlParser.FieldItemContext) => {
        if (this.isInRange(ctx.start, ctx.stop, true)) {
            this.targetField = ctx.text;
        }
    }

    enterSelectSubqueryStatement = (ctx: SoqlParser.SelectSubqueryStatementContext) => {
        if (this.isInRange(ctx.start, ctx.stop, true)) {
            this.targetFieldCtx = FieldContext.SELECT;
            this.isInSubquery = true;
        }
    }

    enterFromSubqueryStatement = (ctx: SoqlParser.FromSubqueryStatementContext) => {
        if (this.isInRange(ctx.start, ctx.stop, true)) {
            this.targetFieldCtx = FieldContext.FROM;
            this.isInSubquery = true;
        }
    }

    private isInRange(start: Token, end: Token, oneExtraAtEnd?: boolean): boolean {
        return (this.pos.line > start.line && this.pos.line < end.line) || 
            (this.pos.line == start.line && this.pos.line != end.line && this.pos.character >= start.startIndex) ||
            (this.pos.line == end.line && this.pos.line != start.line && this.pos.character <= (oneExtraAtEnd ? end.stopIndex + 1 : end.stopIndex)) ||
            (this.pos.line == start.line && this.pos.line == end.line && this.pos.character >= start.startIndex && this.pos.character <= (oneExtraAtEnd ? end.stopIndex + 1 : end.stopIndex));
    }

    public shouldCompleteField(): boolean {
        return !!this.targetObject && this.targetFieldCtx !== FieldContext.FROM;
    }

    public shouldCompleteSObject(): boolean {
        return this.targetFieldCtx === FieldContext.FROM;
    }

    public shouldCompleteChildRelationship(): boolean {
        return !!this.targetObject && this.targetFieldCtx === FieldContext.FROM && this.isInSubquery;
    }
}