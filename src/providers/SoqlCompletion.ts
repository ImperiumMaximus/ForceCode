import * as vscode from 'vscode';
import { getQueryUnderCursor, SoqlQuery } from '../commands/soql';

import { ANTLRInputStream, CommonTokenStream, Token, ParserRuleContext } from 'antlr4ts';
import { ParseTreeWalker } from 'antlr4ts/tree';
import { SoqlLexer } from './grammars/soql/SoqlLexer';
import * as SoqlParser from './grammars/soql/SoqlParser';
import { SoqlListener } from './grammars/soql/SoqlListener';
import { SFDX_DIR, TOOLS_DIR, SOBJECTS_DIR, STANDARDOBJECTS_DIR, CUSTOMOBJECTS_DIR, JSONS_DIR } from '../dx/generator/fauxClassGenerator';
import * as path from 'path';
import * as fs from 'fs-extra';
var jsonQuery = require('json-query');
const moment: any = require('moment');
var reverse = require('reverse-string');

const enum FieldContext {
    UNKNOWN,
    SELECT,
    WHERE,
    GROUPBY,
    ORDERBY,
    FROM
}

const enum SubQueryType {
    UNKNOWN, 
    CHILDRELATIONSHIP,
    SEMIJOIN
}

enum ConditionalOperator {
    EQUAL    = '=',
    NEQUAL   = '!=',
    NEQUAL2  = '<>', 
    LT       = '<',
    LTE      = '<=',
    GT       = '>',
    GTE      = '>=',
    IN       = 'IN',
    NOTIN    = 'NOT IN',
    INCLUDES = 'INCLUDES',
    EXCLUDES = 'EXCLUDES',
    LIKE     = 'LIKE'
}

enum DateLiterals {
    L90D = 'LAST_90_DAYS',
    LFQ  = 'LAST_FISCAL_QUARTER',
    LFY  = 'LAST_FISCAL_YEAR',
    LM   = 'LAST_MONTH',
    LND  = 'LAST_N_DAYS:n',
    LNFQ = 'LAST_N_FISCAL_QUARTERS:n',
    LNFY = 'LAST_N_FISCAL_YEARS:n',
    LNM  = 'LAST_N_MONTHS:n',
    LNQ  = 'LAST_N_QUARTERS:n',
    LNW  = 'LAST_N_WEEKS:n',
    LNY  = 'LAST_N_YEARS:n',
    LQ   = 'LAST_QUARTER',
    LW   = 'LAST_WEEK',
    LY   = 'LAST_YEAR',
    N90D = 'NEXT_90_DAYS',
    NFQ  = 'NEXT_FISCAL_QUARTER',
    NFY  = 'NEXT_FISCAL_YEAR',
    NM   = 'NEXT_MONTH',
    NND  = 'NEXT_N_DAYS:n',
    NNFQ = 'NEXT_N_FISCAL_QUARTERS:n',
    NNFY = 'NEXT_N_FISCAL_YEARS:n',
    NNM  = 'NEXT_N_MONTHS:n',
    NNQ  = 'NEXT_N_QUARTERS:n',
    NNW  = 'NEXT_N_WEEKS:n',
    NNY  = 'NEXT_N_YEARS:n',
    NQ   = 'NEXT_QUARTER',
    NW   = 'NEXT_WEEK',
    NY   = 'NEXT_YEAR',
    TFQ  = 'THIS_FISCAL_QUARTER',
    TFY  = 'THIS_FISCAL_YEAR',
    TM   = 'THIS_MONTH',
    TQ   = 'THIS_QUARTER',
    TW   = 'THIS_WEEK',
    TY   = 'THIS_YEAR',
    TOD  = 'TODAY',
    TOM  = 'TOMORROW',
    YES  = 'YESTERDAY'
}

export default class SoqlCompletionProvider implements vscode.CompletionItemProvider {
    public provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.CompletionItem[]> {
        var completions: vscode.CompletionItem[] = [];

        let query: SoqlQuery = getQueryUnderCursor(position);
        let relativePosition: vscode.Position = position.translate(-query.getStartLine());
        let relativeFlattenedPosition: vscode.Position = query.flattenPosition(relativePosition, true);
        
        let pointRemoved: boolean = false;
        let commaSanitized: boolean = false;
        let isFakeField: boolean = false;
        
        let filterToken: {} = {};
        let filterOperatorDefined = false;
        let targetOperator: string = null;
        
        let extraSpaces: {} = {};
        let parBalance: {} = {};

        // Input sanitization to allow SOQL Parser to properly build a tree from a (possibly) incomplete query statement
        parBalance = parenthesesBalance(query.prettyPrint());
        if (parBalance['balance'] > 0) {
            let relEndLineIndex = query.getEndLine() - query.getStartLine();
            let lastLine = query.getLine(relEndLineIndex);
            query.setLine(relEndLineIndex, replaceAt(lastLine, lastLine.lastIndexOf(';'), ')'.repeat(parBalance['balance']) + ';')); 
        }
        if (shouldRemoveExtraSpaces(query, relativePosition, extraSpaces)) {
            relativePosition = relativePosition.translate(0, -(extraSpaces['len']));
        }
        if (shouldRemovePoint(query, relativePosition)) {
            query.setLine(relativePosition.line, replaceAt(query.getLine(relativePosition.line), relativePosition.character - 1, ''));
            relativePosition = relativePosition.translate(0, -1);
            relativeFlattenedPosition = relativeFlattenedPosition.translate(0, -1);
            pointRemoved = true;
        }
        if (shouldRemoveComma(query, relativePosition)) {
            let affectedLine = query.getLine(relativePosition.line)
            query.setLine(relativePosition.line, replaceAt(affectedLine, 
                    affectedLine.substring(0, relativePosition.character).lastIndexOf(','), ' '));
            commaSanitized = true;
            relativeFlattenedPosition = relativeFlattenedPosition.translate(0, 
                -(query.prettyPrint().substring(0, relativeFlattenedPosition.character).match(/\s/g).length) + 1);
        }
        if (shouldCompleteFilter(query, relativePosition, filterToken)) {
            let affectedLine = query.getLine(relativePosition.line)
             if ((<any>Object).values(ConditionalOperator).includes(filterToken['token'])) {
                query.setLine(relativePosition.line, splice(affectedLine, relativeFlattenedPosition.character, 0, 'null'));
                filterOperatorDefined = true;
                targetOperator = filterToken['token'];
            } else {
                query.setLine(relativePosition.line, splice(affectedLine, relativeFlattenedPosition.character, 0, '=null'));
            }
        }
        if (shouldAddComma(query, relativePosition)) {
            query.setLine(relativePosition.line, replaceAt(query.getLine(relativePosition.line), relativePosition.character, ','));
            commaSanitized = true;
        }
        if (shouldAddFakeField(query, relativePosition)) {
            query.setLine(relativePosition.line, splice(query.getLine(relativePosition.line), relativePosition.character, 0, 'A'));
            isFakeField = true;
        }

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

        if (filterOperatorDefined && targetOperator && listener.targetField && listener.targetObject) {
            completions.push(...getFilterCompletions(listener));
        } else if (listener.shouldCompleteField()) {
            completions.push(...getFieldCompletions(listener, pointRemoved, commaSanitized, isFakeField));
        } else if (listener.shouldCompleteSObject()) {
            completions.push(...getSObjectCompletions(listener.targetObject));
        } else if (listener.shouldCompleteChildRelationship()) {
            completions.push(...getChildRelationshipCompletions(listener.targetObject, listener.targetRelationshipObject));
        }

        return Promise.resolve(completions);
    }
}

function getFilterCompletions(listener: SoqlTreeListener): vscode.CompletionItem[] {
    let completions: vscode.CompletionItem[] = [];
    let fieldInfo = extractFromJson(listener.targetObject, `fields[name=${listener.targetField}]`);
    if (fieldInfo && fieldInfo.value) {
        if (fieldInfo.value.type === 'date' || fieldInfo.value.type === 'datetime') {
            completions.push(new vscode.CompletionItem(moment().format(fieldInfo.value.type === 'date' ? 'YYYY-MM-DD' : 'YYYY-MM-DDTHH:mm:ss.SSSZ'), vscode.CompletionItemKind.Constant));
            (<any>Object).values(DateLiterals).forEach(element => {
                completions.push(new vscode.CompletionItem(element, vscode.CompletionItemKind.Constant));
            });
        }
    }
    return completions;
}

function getFieldCompletions(listener: SoqlTreeListener, pointRemoved: boolean, commaSanitized: boolean, isFakeField: boolean): vscode.CompletionItem[] {
    let fieldTokens: string[] = listener.targetField.split('.');
    let sObjectName: string = listener.targetObject;
    let completions: vscode.CompletionItem[] = [];
    let additionalQueryFilter: string = '';

    switch (listener.targetFieldCtx) {
        case FieldContext.WHERE: {
            additionalQueryFilter = 'filterable = true';
            break;
        }
        case FieldContext.GROUPBY: {
            additionalQueryFilter = 'groupable = true';
            break;
        }
        case FieldContext.ORDERBY: {
            additionalQueryFilter = 'sortable = true';
            break;
        }
    }

    if (listener.subQueryType === SubQueryType.CHILDRELATIONSHIP && listener.targetRelationshipObject) {
        let query = `childRelationships[relationshipName=${listener.targetRelationshipObject}]`;
        let childRelationship = extractFromJson(sObjectName, query);
        if (childRelationship && childRelationship.value) {
            sObjectName = childRelationship.value.childSObject;
        }
    }
    
    if (!commaSanitized && !isFakeField) {
        for (var i = 0; i < fieldTokens.length; i++) {
            let targetField: string = fieldTokens[i];

            let query;
            let options: {} = {};

            if (i == fieldTokens.length - 1 && !pointRemoved) {
                if (additionalQueryFilter) {
                    additionalQueryFilter = ` & ${additionalQueryFilter}]`;
                }
                query = `fields[*name~/^${targetField}.*/i${additionalQueryFilter}`;
                options['allowRegexp'] = true;
            } else {
                query = `fields[relationshipName=${targetField}]`;
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
    
    if (pointRemoved || commaSanitized || isFakeField) {
        if (additionalQueryFilter) {
            additionalQueryFilter = `[${additionalQueryFilter}]`;
        }
        let results = extractFromJson(sObjectName, `fields${additionalQueryFilter}`);
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

function extractFromJson(sObjectName: string, query: string, jsonQueryOptions?: {}): any {
    let options = { data: null };
    Object.assign(options, jsonQueryOptions);
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
        if (results.value.referenceTo) {
            if (results.value.referenceTo.length == 1) {
                return results.value.referenceTo[0];
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

function shouldAddFakeField(query: SoqlQuery, position: vscode.Position): boolean {
    let res = isCursorInSelectStatement(query, position);
    return res['result'] && res['onlySpacesBeetween'];
}

function isCursorInSelectStatement(query: SoqlQuery, position: vscode.Position): any {
    let flattenedQuery = query.prettyPrint();
    let flattenedPosition = query.flattenPosition(position, true);

    if (isInSubquery(query, position)) {
        let boundaries = computeSubQueryBoundaries(query, position);
        flattenedQuery = flattenedQuery.substring(boundaries['startIndex'], boundaries['endIndex'] + 1);
        flattenedPosition = flattenedPosition.translate(0, -boundaries['startIndex']);
    }

    let startMatch = /\b(SELECT)\b/i.exec(flattenedQuery);
    let endMatch = /\b(FROM)\b/i.exec(flattenedQuery);

    let res = {result: startMatch && endMatch && flattenedPosition.character > startMatch.index && 
        flattenedPosition.character - 1 <= endMatch.index, onlySpacesBeetween: !flattenedQuery.substring(startMatch.index + 6, endMatch.index).trim()};

    return res;
}

function isCursorInWhereStatement(query: SoqlQuery, position: vscode.Position): boolean {
    let flattenedQuery = query.prettyPrint();
    let flattenedPosition = query.flattenPosition(position, true);

    if (isInSubquery(query, position)) {
        let boundaries = computeSubQueryBoundaries(query, position);
        flattenedQuery = flattenedQuery.substring(boundaries['startIndex'], boundaries['endIndex'] + 1);
        flattenedPosition = flattenedPosition.translate(0, -boundaries['startIndex']);
    }
    
    let startMatch = /\b(WHERE)\b/i.exec(flattenedQuery);
    let endMatch = /\b(WITH|GROUP\sBY|ORDER\sBY|LIMIT|OFFSET|FOR)\b|$/i.exec(flattenedQuery);

    return startMatch && endMatch && flattenedPosition.character > startMatch.index && 
            flattenedPosition.character - 1 <= endMatch.index;
}

function shouldRemoveComma(query: SoqlQuery, position: vscode.Position): boolean {
    if (!isCursorInSelectStatement(query, position)['result']) return false;

    let flattenedQuery = query.prettyPrint();
    let flattenedPosition = query.flattenPosition(position, true);

    let lastCommaPosition: number = flattenedQuery.substring(0, flattenedPosition.character).lastIndexOf(',') + 1;

    let querySubstrToEnd = flattenedQuery.substring(flattenedPosition.character);
    var match = querySubstrToEnd.match(/([a-z]\w+\.?)/i);

    return !flattenedQuery.substring(lastCommaPosition, flattenedPosition.character).trim().length && 
            match && match.length && match[0].toLocaleUpperCase() === 'FROM';
}

function shouldCompleteFilter(query: SoqlQuery, position: vscode.Position, token: {}): boolean {
    if (!isCursorInWhereStatement(query, position)) return false;

    token['token'] = extractFilterToken(query, position);

    return token['token'].trim() === token['token'];
}

function extractFilterToken(query: SoqlQuery, position: vscode.Position) {
    let flattenedQuery = query.prettyPrint();
    let flattenedPosition = query.flattenPosition(position, true);

    let startIndex = flattenedQuery.substring(0, flattenedPosition.character).lastIndexOf(' ') + 1;
    let endIndex: number = -1;
    let endMatch = /(\s+|$)/i.exec(flattenedQuery.substring(flattenedPosition.character));
    
    if (endMatch) {
        endIndex = endMatch.index + flattenedPosition.character;
    }
    return flattenedQuery.substring(startIndex, endIndex);
}

function shouldAddComma(query: SoqlQuery, position: vscode.Position): boolean {
    if (!isCursorInSelectStatement(query, position)['result']) return false;

    let flattenedQuery = query.prettyPrint();
    let flattenedPosition = query.flattenPosition(position, true);

    let querySubstrToEnd = flattenedQuery.substring(flattenedPosition.character);

    var match = querySubstrToEnd.match(/([a-z]\w+\.?)/i);
    return match && match.length && match[0].toLocaleUpperCase() !== 'FROM';
}

function shouldRemoveExtraSpaces(query: SoqlQuery, position: vscode.Position, result: {}): boolean {
    let flattenedQuery = query.prettyPrint(false);
    let flattenedPosition = query.flattenPosition(position, true);

    let matches = reverse(flattenedQuery.substring(0, flattenedPosition.character)).match(/(\s+)/);

    result['len'] = matches && matches.length && matches[0].length > 1 ? matches[0].length - 1 : -1;

    return matches && matches.length && matches[0].length > 1;
}

function replaceAt(str, index, replace): string {
    return str.substring(0, index) + replace + str.substring(index + 1);
}

function splice(str: string, idx: number, rem: number, newStr: string): string {
    return str.slice(0, idx) + newStr + str.slice(idx + Math.abs(rem));
}

function parenthesesBalance(str: string, breakOnBalance?: boolean, startIndex?: number, endIndex?: number): any {
    let balance: number = 0;
    let curIndex = startIndex ? startIndex : 0;

    let eIdx = endIndex ? endIndex : str.length;
    do {
        if (str.charAt(curIndex) == '(') { balance++; }
        else if (str.charAt(curIndex) == ')') { balance--; }
        curIndex++;
    } while ((!breakOnBalance || balance) && curIndex < eIdx);
    return { balance: balance, endIndex: curIndex - 1 };
}

function computeSubQueryBoundaries(query: SoqlQuery, position: vscode.Position): any {
    let flattenedQuery = query.prettyPrint(false);
    let flattenedPosition = query.flattenPosition(position, true);

    let querySubStr = flattenedQuery.substring(0, flattenedPosition.character);
    let matches = /TCELES\(/ig.exec(reverse(querySubStr));

    let startMatch = matches && matches.index ? querySubStr.length - matches.index - 7 : 0;

    if (!startMatch) {
        return null;
    }

    let endMatch = parenthesesBalance(flattenedQuery.substring(startMatch), true);
    if (endMatch['balance']) {
        return null;
    }

    return { startIndex: startMatch, endIndex: startMatch + endMatch['endIndex'] };
}

function isInSubquery(query: SoqlQuery, position: vscode.Position) {
    let boundaries = computeSubQueryBoundaries(query, position);
    let flattenedPosition = query.flattenPosition(position, true);

    return boundaries && flattenedPosition.character >= boundaries['startIndex'] && flattenedPosition.character <= boundaries['endIndex'];
}
class SoqlTreeListener implements SoqlListener {
    pos: vscode.Position;
    targetObject: string = null;
    targetRelationshipObject: string = null;
    targetField: string = '';
    targetFieldCtx: FieldContext = FieldContext.UNKNOWN;
    subQueryType: SubQueryType = SubQueryType.UNKNOWN;

    constructor(position: vscode.Position) {
        this.pos = position;
    }

    visitTerminal = () => { };
    visitErrorNode = () => { };
    enterEveryRule = () => { };
    exitEveryRule = () => { };

    enterObjectType = (ctx: SoqlParser.ObjectTypeContext) => {
        let curCtx: ParserRuleContext = ctx;
        while (curCtx && !(curCtx instanceof SoqlParser.WhereSubqueryContext || 
            curCtx instanceof SoqlParser.SoqlStatementContext)) {
            curCtx = curCtx.parent;
        }

        if (curCtx && (curCtx instanceof SoqlParser.WhereSubqueryContext) && 
            this.isInRange(curCtx.start, curCtx.stop) ||
            (curCtx instanceof SoqlParser.SoqlStatementContext && !this.targetObject)) {
            this.targetObject = ctx.text;

            if (curCtx instanceof SoqlParser.WhereSubqueryContext) {
                this.subQueryType = SubQueryType.SEMIJOIN;
            }
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
        let curCtx: ParserRuleContext = ctx;
        while (curCtx && !(curCtx instanceof SoqlParser.ConditionExpressionContext)) {
            curCtx = curCtx.parent;
        }

        if (!curCtx) curCtx = ctx;

        if (this.isInRange(curCtx.start, curCtx.stop, true)) {
            this.targetField = ctx.text;
        }
    }

    enterSelectSubqueryStatement = (ctx: SoqlParser.SelectSubqueryStatementContext) => {
        if (this.isInRange(ctx.start, ctx.stop, true)) {
            this.targetFieldCtx = FieldContext.SELECT;
            this.subQueryType = SubQueryType.CHILDRELATIONSHIP;
        }
    }

    enterFromSubqueryStatement = (ctx: SoqlParser.FromSubqueryStatementContext) => {
        if (this.isInRange(ctx.start, ctx.stop, true)) {
            this.targetFieldCtx = FieldContext.FROM;
            this.subQueryType = SubQueryType.CHILDRELATIONSHIP;
        }
    }

    enterWhereFromSubqueryStatement = (ctx: SoqlParser.WhereFromSubqueryStatementContext) => {
        if (this.isInRange(ctx.start, ctx.stop, true)) {
            this.targetFieldCtx = FieldContext.FROM;
            this.subQueryType = SubQueryType.SEMIJOIN;
        }
    }

    private isInRange(start: Token, end: Token, oneExtraAtEnd?: boolean): boolean {
        return (this.pos.line > start.line && this.pos.line < end.line) || 
            (this.pos.line == start.line && this.pos.line != end.line && this.pos.character >= start.startIndex) ||
            (this.pos.line == end.line && this.pos.line != start.line && this.pos.character <= (oneExtraAtEnd ? end.stopIndex + 1 : end.stopIndex)) ||
            (this.pos.line == start.line && this.pos.line == end.line && this.pos.character >= start.startIndex && this.pos.character <= (oneExtraAtEnd ? end.stopIndex + 1 : end.stopIndex));
    }

    public shouldCompleteField(): boolean {
        return !!this.targetObject && this.targetFieldCtx && this.targetFieldCtx !== FieldContext.FROM;
    }

    public shouldCompleteSObject(): boolean {
        return this.targetFieldCtx === FieldContext.FROM && this.subQueryType !== SubQueryType.CHILDRELATIONSHIP;
    }

    public shouldCompleteChildRelationship(): boolean {
        return !!this.targetObject && this.targetFieldCtx === FieldContext.FROM && this.subQueryType === SubQueryType.CHILDRELATIONSHIP;
    }
}